/**
 * 小红书 MCP 客户端
 *
 * 通过 MCP 协议（stdio）与 Python 小红书 MCP 服务通信。
 * 实现了 MCP 协议的核心：初始化、工具列表、工具调用。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve as resolvePath } from 'node:path'

export interface MCPToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 创建小红书 MCP 客户端
 * 通过 stdio 与 Python MCP 服务通信
 */
export function createXHSClient(mcpProjectPath: string) {
  const absolutePath = resolvePath(process.cwd(), mcpProjectPath)
  let mcpProcess: ChildProcess | null = null
  let requestId = 0
  const pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >()

  /**
   * 启动 MCP 服务进程
   */
  function start(): Promise<void> {
    return new Promise((resolvePromise, rejectPromise) => {
      const venvPython = resolvePath(absolutePath, '.venv/bin/python')

      mcpProcess = spawn(venvPython, ['-m', 'xiaohongshu_mcp.server'], {
        cwd: absolutePath,
        env: {
          ...process.env,
          PYTHONPATH: absolutePath,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let buffer = ''

      mcpProcess.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString()
        // MCP 使用 JSON-RPC，每条消息以换行分隔
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // 最后一个可能是不完整的行

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line)
              handleMessage(message)
            } catch {
              // 忽略非 JSON 输出（如 Python 的 print）
            }
          }
        }
      })

      mcpProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim()
        if (text) {
          console.log('[XHS MCP]', text)
        }
      })

      mcpProcess.on('error', (err) => {
        rejectPromise(new Error(`小红书 MCP 启动失败: ${err.message}`))
      })

      mcpProcess.on('exit', (code) => {
        console.log(`[XHS MCP] 进程退出，code: ${code}`)
        mcpProcess = null
      })

      // 发送初始化请求
      sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'smart-itinerary', version: '0.1.0' },
      })
        .then(() => {
          // 发送 initialized 通知
          sendNotification('notifications/initialized', {})
          resolvePromise()
        })
        .catch(rejectPromise)
    })
  }

  /**
   * 处理来自 MCP 服务的响应
   */
  function handleMessage(message: Record<string, unknown>) {
    if ('id' in message && typeof message.id === 'number') {
      const pending = pendingRequests.get(message.id)
      if (pending) {
        pendingRequests.delete(message.id)
        if ('error' in message) {
          pending.reject(
            new Error(
              (message.error as Record<string, string>)?.message ?? 'Unknown error',
            ),
          )
        } else {
          pending.resolve(message.result)
        }
      }
    }
  }

  /**
   * 发送 JSON-RPC 请求
   */
  function sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolvePromise, rejectPromise) => {
      if (!mcpProcess?.stdin) {
        rejectPromise(new Error('MCP 进程未启动'))
        return
      }

      const id = ++requestId
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params })

      pendingRequests.set(id, { resolve: resolvePromise, reject: rejectPromise })
      mcpProcess.stdin.write(message + '\n')

      // 超时处理
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id)
          rejectPromise(new Error(`请求超时: ${method}`))
        }
      }, 30000)
    })
  }

  /**
   * 发送 JSON-RPC 通知（无响应）
   */
  function sendNotification(method: string, params: unknown) {
    if (!mcpProcess?.stdin) return
    const message = JSON.stringify({ jsonrpc: '2.0', method, params })
    mcpProcess.stdin.write(message + '\n')
  }

  /**
   * 获取可用工具列表
   */
  async function listTools(): Promise<MCPTool[]> {
    const result = (await sendRequest('tools/list', {})) as {
      tools: MCPTool[]
    }
    return result.tools
  }

  /**
   * 调用指定工具
   */
  async function callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    return (await sendRequest('tools/call', {
      name,
      arguments: args,
    })) as MCPToolResult
  }

  /**
   * 搜索小红书笔记
   */
  async function searchNotes(
    keyword: string,
    options?: { page?: number; sort?: string; noteType?: string },
  ): Promise<MCPToolResult> {
    return callTool('search_notes', {
      keyword,
      ...(options?.page ? { page: options.page } : {}),
      ...(options?.sort ? { sort: options.sort } : {}),
      ...(options?.noteType ? { note_type: options.noteType } : {}),
    })
  }

  /**
   * 获取笔记详情
   */
  async function getNote(noteId: string): Promise<MCPToolResult> {
    return callTool('get_note', { note_id: noteId })
  }

  /**
   * 获取笔记评论
   */
  async function getNoteComments(noteId: string): Promise<MCPToolResult> {
    return callTool('get_note_comments', { note_id: noteId })
  }

  /**
   * 关闭 MCP 服务
   */
  function stop() {
    if (mcpProcess) {
      mcpProcess.kill()
      mcpProcess = null
    }
  }

  return {
    start,
    stop,
    listTools,
    callTool,
    searchNotes,
    getNote,
    getNoteComments,
  }
}
