/**
 * Smart Itinerary — 入口 (多 Agent 协作)
 *
 * Phase 2.1: 编排器 + 3 个专家 Agent（研究员/顾问/文档）
 */
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { loadConfig } from './config.js'
import { createXHSClient } from './mcp/xiaohongshu.js'
import { createMemory } from './memory/index.js'
import { createOrchestrator } from './agent/orchestrator.js'
import { createTraceCollector } from './trace/collector.js'

async function main() {
  console.log('🗺️  Smart Itinerary — AI 旅行规划师 (多 Agent 协作)')
  console.log('─'.repeat(55))

  const config = loadConfig()

  // 1. 启动小红书 MCP 服务
  const xhs = createXHSClient(config.xhsMcpPath)
  console.log('⏳ 正在连接小红书服务...')
  try {
    await xhs.start()
    console.log('✅ 小红书服务就绪')
  } catch (error) {
    console.warn('⚠️  小红书服务启动失败:', (error as Error).message)
  }

  // 2. 初始化记忆系统
  let memory: ReturnType<typeof createMemory> | null = null
  try {
    memory = createMemory()
    console.log('🧠 记忆系统就绪 (Supabase)')
  } catch (error) {
    console.warn('⚠️  记忆系统未启用:', (error as Error).message)
  }

  // 3. 创建追踪收集器
  const trace = createTraceCollector('orchestrator')

  // 4. 创建编排器（内部注册 3 个 Agent 工具）
  const orchestrator = createOrchestrator({ xhs, memory, trace })

  console.log('\n输入你的旅行需求，我来帮你规划行程！')
  console.log('输入 /quit 退出，/new 开始新旅程\n')

  const rl = readline.createInterface({ input, output })

  try {
    while (true) {
      const userInput = await rl.question('🧑 你: ')

      if (!userInput.trim()) continue
      if (userInput.trim() === '/quit') {
        console.log('\n👋 期待下次旅行规划！再见！')
        break
      }
      if (userInput.trim() === '/new') {
        orchestrator.resetHistory()
        console.log('\n✨ 已开启新旅程。\n')
        continue
      }

      console.log('\n🤔 小旅正在规划中...\n')

      try {
        const reply = await orchestrator.sendMessage(userInput, (event) => {
          if (event.status === 'start' && event.tool === 'research_agent') {
            console.log('   🔍 调用攻略研究员...\n')
          } else if (event.status === 'start' && event.tool === 'advisor_agent') {
            console.log('   🍜 调用美食住宿顾问...\n')
          } else if (event.status === 'start' && event.tool === 'doc_agent') {
            console.log('   📝 调用文档专家...\n')
          }
        })

        console.log('🗺️  小旅:')
        console.log('─'.repeat(55))
        console.log(reply)
        console.log('─'.repeat(55))
        console.log()
      } catch (error) {
        console.error('❌ 出错了:', (error as Error).message)
        console.log('请重试或输入 /quit 退出\n')
      }
    }
  } finally {
    rl.close()
    xhs.stop()
    // 保存追踪日志
    try {
      const filePath = await trace.saveToFile('traces')
      console.log(`📊 追踪日志已保存: ${filePath}`)
    } catch (error) {
      console.warn('⚠️  追踪日志保存失败:', (error as Error).message)
    }
  }
}

main().catch((error) => {
  console.error('❌ 启动失败:', error.message)
  process.exit(1)
})
