/**
 * 高德地图工具定义
 *
 * 通过高德 Web 服务 API 为 Agent 提供：
 * - 天气查询（出行规划必备）
 * - 公交路线规划（行程交通安排）
 * - 周边搜索（找餐厅/景点）
 *
 * API 文档: https://lbs.amap.com/api/webservice/guide/api/weather
 */
import type { Tool } from './registry.js'
import { loadConfig } from '../config.js'

const BASE_URL = 'https://restapi.amap.com/v3'

/** 高德 API 通用响应 */
interface AmapResponse {
  status: string
  info: string
  infocode: string
  [key: string]: unknown
}

/** 通用请求封装 */
async function amapGet<T extends AmapResponse>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const { amapKey } = loadConfig()
  if (!amapKey) throw new Error('高德 API Key 未配置，请在 .env 中设置 AMAP_KEY')

  const url = new URL(`${BASE_URL}/${path}`)
  url.searchParams.set('key', amapKey)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`高德 API 请求失败: ${res.status}`)

  const data = (await res.json()) as T
  if (data.status !== '1') {
    throw new Error(`高德 API 错误: ${data.info} (${data.infocode})`)
  }
  return data
}

// ─── 天气查询 ───

interface WeatherLive {
  province: string
  city: string
  weather: string
  temperature: string
  winddirection: string
  windpower: string
  humidity: string
  reporttime: string
}

interface WeatherForecast {
  date: string
  dayweather: string
  nightweather: string
  daytemp: string
  nighttemp: string
  daywind: string
  nightwind: string
}

interface WeatherResponse extends AmapResponse {
  lives: WeatherLive[]
  forecasts: Array<{
    city: string
    casts: WeatherForecast[]
  }>
}

/**
 * 天气查询工具
 *
 * 查询指定城市的实时天气和未来3天预报。
 * 行程规划核心工具 — 根据天气调整室内/室外活动安排。
 */
export function createWeatherTool(): Tool {
  return {
    name: 'get_weather',
    description:
      '查询城市天气（实时+未来3天预报）。用于行程规划时了解天气情况，根据天气调整活动安排。支持中国城市名（如"东京"、"北京"）。',
    parameters: {
      type: 'object' as const,
      properties: {
        city: {
          type: 'string',
          description: '城市名称或 adcode，如 "东京"、"北京"、"上海"',
        },
        forecast: {
          type: 'boolean',
          description: '是否查询未来3天预报（默认 true）。false 仅返回实时天气。',
        },
      },
      required: ['city'],
    },
    async execute(args) {
      const city = args.city as string
      const forecast = (args.forecast as boolean) ?? true

      try {
        const data = await amapGet<WeatherResponse>('weatherInfo', {
          city,
          extensions: forecast ? 'all' : 'base',
          output: 'JSON',
        })

        if (forecast && data.forecasts?.length > 0) {
          const f = data.forecasts[0]
          const lines = [`📍 ${f.city} 未来天气预报:`]
          for (const c of f.casts) {
            lines.push(
              `  ${c.date}: ${c.dayweather}/${c.nightweather} ${c.daytemp}~${c.nighttemp}°C`,
            )
          }
          return lines.join('\n')
        }

        if (data.lives?.length > 0) {
          const l = data.lives[0]
          return `📍 ${l.city} 实时天气: ${l.weather} ${l.temperature}°C 湿度${l.humidity}% ${l.winddirection}风${l.windpower}级 (${l.reporttime})`
        }

        return '未找到该城市天气信息'
      } catch (error) {
        return `天气查询失败: ${(error as Error).message}`
      }
    },
  }
}

// ─── 公交路线规划 ───

interface TransitRoute {
  distance: string
  duration: string
  transit?: {
    segments: Array<{
      bus?: {
        buslines: Array<{ name: string }>
      }
      railway?: {
        name: string
      }
      walking?: {
        distance: string
      }
    }>
  }
}

interface TransitResponse extends AmapResponse {
  route: {
    origin: string
    destination: string
    transits: TransitRoute[]
  }
}

/**
 * 公交路线规划工具
 *
 * 规划两地之间的公共交通路线（地铁/公交/步行）。
 * 帮 Agent 计算景点之间的交通方式和时间。
 */
export function createTransitTool(): Tool {
  return {
    name: 'plan_transit',
    description:
      '规划两地之间的公共交通路线（地铁/公交/步行）。输入起点和终点的经纬度坐标，返回推荐路线。用于行程中景点之间的交通安排。',
    parameters: {
      type: 'object' as const,
      properties: {
        origin: {
          type: 'string',
          description: '起点经纬度，格式 "经度,纬度"（如 "116.481028,39.989643"）',
        },
        destination: {
          type: 'string',
          description: '终点经纬度，格式 "经度,纬度"',
        },
        city: {
          type: 'string',
          description: '起点城市（如 "北京"、"东京"）',
        },
      },
      required: ['origin', 'destination', 'city'],
    },
    async execute(args) {
      try {
        const data = await amapGet<TransitResponse>('direction/transit/integrated', {
          origin: args.origin as string,
          destination: args.destination as string,
          city: args.city as string,
          strategy: '0', // 综合最优
          output: 'JSON',
        })

        const transits = data.route.transits?.slice(0, 3) ?? []
        if (transits.length === 0) return '未找到可用的公共交通路线'

        const lines = ['🚌 推荐路线:']
        for (let i = 0; i < transits.length; i++) {
          const t = transits[i]
          const segments: string[] = []
          for (const seg of t.transit?.segments ?? []) {
            if (seg.bus?.buslines?.[0]) segments.push(seg.bus.buslines[0].name)
            else if (seg.railway) segments.push(seg.railway.name)
            else if (seg.walking) segments.push(`步行${seg.walking.distance}米`)
          }
          lines.push(
            `  方案${i + 1}: ${segments.join(' → ')} (${(Number(t.duration) / 60).toFixed(0)}分钟, ${t.distance}米)`,
          )
        }
        return lines.join('\n')
      } catch (error) {
        return `路线规划失败: ${(error as Error).message}`
      }
    },
  }
}

// ─── 地理编码（地址→坐标）───

interface GeocodeResponse extends AmapResponse {
  geocodes: Array<{
    formatted_address: string
    location: string // "经度,纬度"
    city: string
    district: string
  }>
}

/**
 * 地理编码工具
 *
 * 将地址文本转为经纬度坐标。
 * 其他工具（如路线规划）的前置步骤。
 */
export function createGeocodeTool(): Tool {
  return {
    name: 'geocode_address',
    description:
      '将地址或地名转为经纬度坐标。用于获取景点/餐厅的精确位置，为路线规划提供坐标。',
    parameters: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: '地址或地名，如 "浅草寺"、"北京天安门"',
        },
        city: {
          type: 'string',
          description: '所在城市（可选，提高精度）',
        },
      },
      required: ['address'],
    },
    async execute(args) {
      try {
        const params: Record<string, string> = {
          address: args.address as string,
          output: 'JSON',
        }
        if (args.city) params.city = args.city as string

        const data = await amapGet<GeocodeResponse>('geocode/geo', params)

        if (data.geocodes?.length === 0) return '未找到该地址'

        const geo = data.geocodes[0]
        return `${geo.formatted_address} → 坐标: ${geo.location} (${geo.city}${geo.district})`
      } catch (error) {
        return `地址解析失败: ${(error as Error).message}`
      }
    },
  }
}

// ─── 周边搜索 ───

interface PoiSearchResponse extends AmapResponse {
  pois: Array<{
    name: string
    address: string
    location: string
    type: string
    tel?: string
  }>
}

/**
 * 周边搜索工具
 *
 * 搜索指定位置附近的餐厅/景点/酒店等。
 */
export function createPoiSearchTool(): Tool {
  return {
    name: 'search_nearby_poi',
    description:
      '搜索指定坐标附近的兴趣点（餐厅、景点、酒店等）。输入坐标和关键词，返回附近地点列表。用于查找特定区域的餐厅或景点。',
    parameters: {
      type: 'object' as const,
      properties: {
        location: {
          type: 'string',
          description: '中心点经纬度，格式 "经度,纬度"',
        },
        keyword: {
          type: 'string',
          description: '搜索关键词，如 "海鲜餐厅"、"温泉酒店"',
        },
        radius: {
          type: 'string',
          description: '搜索半径（米），默认 1000',
        },
      },
      required: ['location', 'keyword'],
    },
    async execute(args) {
      try {
        const data = await amapGet<PoiSearchResponse>('place/around', {
          location: args.location as string,
          keywords: args.keyword as string,
          radius: ((args.radius as string) ?? '1000'),
          output: 'JSON',
        })

        const pois = data.pois?.slice(0, 5) ?? []
        if (pois.length === 0) return '未找到相关地点'

        const lines = [`🔍 附近 "${args.keyword}" 搜索结果:`]
        for (const p of pois) {
          lines.push(`  • ${p.name} — ${p.address} (坐标: ${p.location})`)
        }
        return lines.join('\n')
      } catch (error) {
        return `周边搜索失败: ${(error as Error).message}`
      }
    },
  }
}

/**
 * 注册所有高德工具
 */
export function registerAmapTools(
  registry: { register: (tool: Tool) => void },
): void {
  const { amapKey } = loadConfig()
  if (!amapKey) {
    console.warn('⚠️  高德 API Key 未配置，天气/路线/搜索工具不可用')
    return
  }
  registry.register(createWeatherTool())
  registry.register(createTransitTool())
  registry.register(createGeocodeTool())
  registry.register(createPoiSearchTool())
  console.log('🗺️  高德地图工具已注册 (天气/路线/地理编码/周边搜索)')
}
