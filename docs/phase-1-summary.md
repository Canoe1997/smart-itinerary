# 🗺️ Smart Itinerary Phase 1 学习总结 — Agent 核心机制

> **项目：** Smart Itinerary — 基于小红书真实经验的 AI 旅行规划 Agent
> **时间：** 2026年6月
> **技术栈：** TypeScript + MiMo v2.5 Pro + XHS MCP + Supabase + 高德地图

---

## 📋 Phase 1 总览

Phase 1 是 Smart Itinerary 项目的核心阶段，从零搭建了完整的 AI Agent 系统。涵盖 4 个子阶段，实现了从 L2（执行型）到 L3（自主型）的认知升级。

| 子阶段 | 名称 | 核心产出 | 状态 |
|--------|------|---------|------|
| 1.1 | Agent 架构设计 | 四组件架构 + 最简行程生成 | ✅ |
| 1.2 | ReAct 推理循环 | 原生 Function Calling + 自主工具调用 | ✅ |
| 1.3 | 记忆系统 + RAG | 用户偏好存储 + 攻略知识库 | ✅ |
| 1.4 | 工具集成 | 小红书 + 记忆 + 高德地图（9个工具） | ✅ |

**认知层级跃迁：**

```
Phase 0  →  L1（纯对话）：MiMo 可以聊天，但无法执行任何动作
Phase 1.1 →  L2（执行型）：Agent 能调用工具生成行程
Phase 1.2 →  L2+（自主推理）：Agent 自主决定调用哪些工具、调用顺序
Phase 1.3-1.4 →  L3（学习型）：Agent 能记住偏好、积累知识、综合多源数据
```

---

## 🏗️ Phase 1.1 — Agent 架构设计

### 学习目标

理解 Agent 的四大核心组件，并将其映射到代码实现。

**参考教材：** 《智能体 AI 权威指南》第1章 1.3~1.5（核心组件、认知层级、工作流）

### 四组件架构

| 组件 | 角色 | 代码实现 |
|------|------|----------|
| **Brain（大脑）** | LLM 推理决策 | MiMo v2.5 Pro via OpenAI SDK |
| **Perception（感知）** | 接收用户输入 | readline CLI 输入 |
| **Action（执行）** | 调用外部工具 | Tool Registry + Function Calling |
| **Memory（记忆）** | 短期+长期记忆 | 对话历史 + Supabase |

### 核心代码结构

```
src/
├── config.ts          # 环境变量集中管理
├── mimo-client.ts     # MiMo API 双端点客户端
├── mcp/
│   └── xiaohongshu.ts # XHS MCP 客户端（JSON-RPC over stdio）
├── tools/
│   ├── registry.ts    # 工具注册表
│   ├── xhs.ts         # 小红书工具
│   ├── memory.ts      # 记忆工具
│   └── amap.ts        # 高德地图工具
├── memory/
│   └── index.ts       # Supabase 记忆操作
├── agent/
│   ├── index.ts       # ReAct 循环核心
│   └── prompts.ts     # System Prompt
└── index.ts           # 入口文件
```

### 关键设计决策

#### 1. 双 SDK 策略

MiMo v2.5 Pro 同时支持 Anthropic 协议和 OpenAI 协议，但功能不同：

| 协议 | SDK | 用途 | 限制 |
|------|-----|------|------|
| Anthropic | `@anthropic-ai/sdk` | 纯文本对话 | 不支持 tools 参数 |
| OpenAI | `openai` | Function Calling | 完整 FC 支持 |

**最终统一使用 OpenAI SDK**，因为它同时支持对话和工具调用。

#### 2. System Prompt 设计

旅行规划师 "小旅" 的 System Prompt 包含：
- 角色定义（热情友好的旅行规划师）
- 能力声明（工具列表）
- 记忆使用规则（何时搜索/保存偏好）
- 效率规则（限制工具调用次数）
- 输出格式规范（Markdown 行程模板）

---

## 🔄 Phase 1.2 — ReAct 推理循环

### 学习目标

理解 ReAct（Reasoning + Acting）模式，实现 LLM 自主调用工具的循环。

**参考教材：** 《智能体 AI 权威指南》第2章 2.1~2.5（CoT、ReAct、Reflexion）

### ReAct 模式图解

```
用户输入 → [Thought: 分析需求] → [Action: 调用工具] → [Observation: 工具结果]
     ↑                                                        ↓
     └──────────────── [Thought: 继续推理/生成回答] ←─────────┘
```

### 核心实现

```typescript
// src/agent/index.ts — ReAct 循环核心
const MAX_ITERATIONS = 15

async function sendMessage(userInput: string): Promise<string> {
  history.push({ role: 'user', content: userInput })

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // 1. 调用 LLM（携带工具定义）
    const response = await chatWithTools({
      system: TRAVEL_PLANNER_SYSTEM,
      messages: history,
      tools: registry?.getToolDefinitions(),
    })

    const message = response.choices[0].message

    // 2. 无工具调用 = 最终回答
    if (!message.tool_calls || message.tool_calls.length === 0) {
      history.push({ role: 'assistant', content: message.content ?? '' })
      return message.content ?? ''
    }

    // 3. 有工具调用 → 执行工具
    history.push(message as OpenAI.ChatCompletionMessageParam)

    for (const toolCall of message.tool_calls) {
      const func = toolCall.function
      const toolArgs = JSON.parse(func.arguments)
      const result = await registry.getTool(func.name)?.execute(toolArgs)

      // 工具结果以 tool 角色回传
      history.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      })
    }
  }
}
```

### 关键技术点

#### OpenAI Function Calling 协议

```typescript
// 工具定义格式（OpenAI 标准）
const tools = [{
  type: 'function',
  function: {
    name: 'search_xhs_notes',
    description: '搜索小红书旅行笔记',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词' }
      },
      required: ['keyword']
    }
  }
}]
```

#### 消息类型体系

| 角色 | 用途 | 示例 |
|------|------|------|
| `system` | System Prompt | 旅行规划师角色定义 |
| `user` | 用户输入 | "帮我规划3天东京游" |
| `assistant` | LLM 回复（可能含 tool_calls） | 文本 + 工具调用请求 |
| `tool` | 工具执行结果 | 搜索结果/天气数据 |

#### 踩坑记录

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| Anthropic SDK 忽略 tools 参数 | MiMo Anthropic 端点不支持 FC | 改用 OpenAI SDK |
| OpenAI 端点 404 | 默认 URL 是 Anthropic 端点 | 新增 `MIMO_OPENAI_BASE_URL` 配置 |
| `toolCall.function` 类型错误 | union 类型需区分 | `if (toolCall.type !== 'function') continue` |
| 消息历史丢失工具上下文 | chatWithTools 把消息转为纯字符串 | 直接传递 `OpenAI.ChatCompletionMessageParam[]` |
| MAX_ITERATIONS=8 不够 | Agent 8 轮工具调用后无法输出回答 | 增加到 15 + System Prompt 效率规则 |

### 实际运行效果

Agent 自主完成 6 轮工具调用生成东京 3 天亲子游行程：

```
第1轮: search_memory("东京 亲子 海鲜")  → 记忆中暂无
第2轮: search_xhs_notes("东京 亲子游 攻略") → 返回 10 篇笔记
第3轮: get_xhs_note("笔记ID-1") → 深入分析攻略
第4轮: get_xhs_note("笔记ID-2") → 对比另一篇
第5轮: save_user_preference("有小孩")  → 保存偏好
第6轮: store_travel_knowledge(...)    → 存入知识库
→ 生成详细行程（引用 4 位小红书真实攻略作者）
```

---

## 🧠 Phase 1.3 — 记忆系统 + RAG

### 学习目标

实现三层记忆架构，让 Agent 具备 "学习" 能力。

**参考教材：** 《智能体 AI 权威指南》第3章 3.2~3.6（短期记忆、向量数据库、RAG、上下文工程）

### 三层记忆架构

| 层级 | 存储 | 生命周期 | 实现 |
|------|------|---------|------|
| **短期记忆** | 对话历史数组 | 单次会话 | `history: OpenAI.ChatCompletionMessageParam[]` |
| **长期记忆** | 用户偏好 | 永久 | Supabase `user_preferences` 表 |
| **知识库** | 旅行攻略 | 永久 | Supabase `travel_knowledge` 表 |

### Supabase 数据库设计

#### user_preferences 表

```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT DEFAULT 'default',
  preference_type TEXT NOT NULL,  -- destination/budget/style/food
  preference_key TEXT NOT NULL,    -- "喜欢吃海鲜"
  preference_value TEXT NOT NULL,  -- "是"
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, preference_type, preference_key)
);
```

#### travel_knowledge 表

```sql
CREATE TABLE travel_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id TEXT UNIQUE,             -- 小红书笔记ID
  title TEXT NOT NULL,
  author TEXT,
  content TEXT NOT NULL,
  destination TEXT,
  liked_count INTEGER DEFAULT 0,
  fts TSVECTOR,                    -- 全文搜索向量
  embedding VECTOR(1536)           -- 预留向量字段
);
```

### RAG 检索策略

由于 MiMo v2.5 Pro 不支持 Embeddings API（返回404），改用 PostgreSQL 全文检索：

```sql
-- 偏好搜索：ILIKE 子串匹配
SELECT * FROM user_preferences
WHERE preference_key ILIKE '%' || search_query || '%'
   OR preference_value ILIKE '%' || search_query || '%';

-- 知识库搜索：tsvector 全文检索
SELECT *, ts_rank(fts, to_tsquery('simple', search_query)) AS rank
FROM travel_knowledge
WHERE fts @@ to_tsquery('simple', search_query)
ORDER BY liked_count DESC, rank DESC;
```

### 记忆工具（3个）

| 工具 | 功能 | 调用时机 |
|------|------|----------|
| `search_memory` | 搜索偏好+知识库 | 每次规划前 |
| `save_user_preference` | 保存用户偏好 | 识别到偏好时 |
| `store_travel_knowledge` | 存储攻略到知识库 | 搜索到优质攻略后 |

### 关键踩坑

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| Supabase Node.js 连接失败 | Node.js 20 无原生 WebSocket | 安装 `ws` 包并传入 transport |
| 数据写入成功但查不到 | Supabase RLS 默认阻止匿名访问 | 添加 anon 角色的 RLS 策略 |
| 知识库写入 0 rows | `note_id` 列缺少 UNIQUE 约束 | 手动 `ALTER TABLE` 添加约束 |
| upsert NULL note_id 失败 | PostgreSQL 对 NULL 的 unique 处理特殊 | 生成默认 ID: `gen-{timestamp}` |
| 全文检索中文效果差 | PostgreSQL `simple` 分词器不支持中文 | 后续可引入 jieba 分词或改用 ILIKE |

### 数据验证

```sql
-- 用户偏好已成功存储
SELECT * FROM user_preferences;
-- 结果: id=1, type=style, key=喜欢吃海鲜, value=是

-- 知识库已存储 3 篇攻略
SELECT title, liked_count FROM travel_knowledge ORDER BY liked_count DESC;
-- 东京最值得预约的隐藏玩法    | 1376
-- 东京唯一值得一来再来的地方  |  991
-- 东京5天4夜自由行旅游攻略    |  398
```

---

## 🔧 Phase 1.4 — 工具集成

### 学习目标

将多个外部数据源封装为统一的工具接口，构建完整的工具生态。

**参考教材：** 《智能体 AI 权威指南》第4章 4.1~4.3（工具使用机制、MCP）

### 工具总览（9个）

#### 小红书工具（2个）

| 工具 | 功能 | 数据源 |
|------|------|--------|
| `search_xhs_notes` | 关键词搜索笔记 | XHS MCP Python 服务 |
| `get_xhs_note` | 获取笔记详情 | XHS MCP Python 服务 |

**实现方式：** JSON-RPC over stdio 与 Python MCP 服务通信

#### 记忆工具（3个）

| 工具 | 功能 | 数据源 |
|------|------|--------|
| `search_memory` | 搜索偏好+知识库 | Supabase PostgreSQL |
| `save_user_preference` | 保存偏好 | Supabase PostgreSQL |
| `store_travel_knowledge` | 存储攻略 | Supabase PostgreSQL |

#### 高德地图工具（4个）

| 工具 | 功能 | API |
|------|------|-----|
| `get_weather` | 城市天气查询（实时+3天预报） | 高德天气 API |
| `plan_transit` | 公交/地铁路线规划 | 高德路线 API |
| `geocode_address` | 地址→坐标转换 | 高德地理编码 API |
| `search_nearby_poi` | 周边兴趣点搜索 | 高德周边搜索 API |

**实现方式：** REST API 直接调用 `https://restapi.amap.com/v3/`

### 工具注册模式

```typescript
// 工具注册表 — 统一接口
interface Tool {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, unknown>; required: string[] }
  execute: (args: Record<string, unknown>) => Promise<string>
}

// 注册到 registry
const registry = createToolRegistry()
registerXHSTools(registry, xhsClient)
registerMemoryTools(registry, memory)
registerAmapTools(registry)
// → registry.getToolDefinitions() 返回 OpenAI FC 格式
```

### 效率约束（System Prompt）

为防止 Agent 无限循环调用工具，在 System Prompt 中设置了硬性限制：

```
## 效率规则（重要！）
- search_memory 只需调用一次
- search_xhs_notes 最多搜索2次不同关键词
- get_xhs_note 最多查看4篇笔记详情
- get_weather 只需调用一次
- 工具调用总数尽量控制在10次以内
```

### 优雅降级策略

| 场景 | 处理方式 |
|------|----------|
| AMAP_KEY 未配置 | 工具不注册，不影响其他功能 |
| 高德 API 不支持日本城市 | 返回错误信息，Agent 继续规划 |
| XHS MCP 触发验证码 | 冷却机制（5s→10s），Agent 使用知识库降级 |
| Supabase 连接失败 | 记忆系统不注册，Agent 仍可对话 |

---

## 📊 Phase 1 成果总结

### 最终技术栈

| 层面 | 技术 | 用途 |
|------|------|------|
| LLM | MiMo v2.5 Pro (OpenAI SDK) | 推理+FC |
| 数据源 | XHS MCP (Python stdio) | 旅行攻略 |
| 地图 | 高德 REST API | 天气/路线/搜索 |
| 数据库 | Supabase PostgreSQL | 偏好+知识库 |
| 运行时 | Node.js 20 + TypeScript | 主程序 |

### 关键数据指标

| 指标 | 数值 |
|------|------|
| 注册工具数 | 9 个 |
| MAX_ITERATIONS | 15 轮 |
| 平均工具调用/对话 | 8-10 次 |
| 知识库攻略 | 3 篇（东京相关） |
| 用户偏好条目 | 1 条（喜欢吃海鲜） |
| TypeScript 编译错误 | 0 |

### 学习成果

通过 Phase 1，掌握了以下 Agent 开发核心知识：

1. **Agent 架构设计** — 四组件模型（Brain/Perception/Action/Memory）的实际落地
2. **ReAct 模式** — Thought → Action → Observation 循环的代码实现
3. **Function Calling 协议** — OpenAI 格式的 tool 定义、tool_calls 解析、tool 角色回传
4. **记忆系统** — 短期（对话历史）+ 长期（Supabase）+ RAG（全文检索）
5. **MCP 协议** — JSON-RPC over stdio 与 Python 子进程通信
6. **工具设计模式** — 统一接口、优雅降级、效率约束
7. **Prompt Engineering** — System Prompt 如何影响 Agent 行为（效率规则、偏好搜索指导）

### 踩坑汇总（14个）

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | XHS MCP socksio 缺失 | Python httpx SOCKS 代理依赖 | `uv pip install "httpx[socks]"` |
| 2 | XHS venv 路径 ENOENT | 空字符串 vs undefined | `optionalEnv` 修复空字符串判断 |
| 3 | Anthropic SDK tools 被忽略 | MiMo Anthropic 端点不支持 FC | 改用 OpenAI SDK |
| 4 | OpenAI 端点 404 | 默认 URL 指向 Anthropic 端点 | 新增 `MIMO_OPENAI_BASE_URL` |
| 5 | `toolCall.function` 类型错误 | union 类型 | `type !== 'function'` 守卫 |
| 6 | 消息历史丢失上下文 | chatWithTools 转纯字符串 | 直接传递 message param |
| 7 | Node.js WebSocket 不支持 | Node.js 20 无原生 WS | 安装 `ws` 包 |
| 8 | Supabase RLS 阻止写入 | 默认阻止匿名访问 | 添加 RLS 策略 |
| 9 | MAX_ITERATIONS 不够 | 8 轮工具调用无最终回答 | 增加到 15 |
| 10 | Agent 重复搜索浪费轮次 | System Prompt 无效率约束 | 添加效率规则 |
| 11 | travel_knowledge UNIQUE 缺失 | 建表时约束未生效 | 手动 ALTER TABLE |
| 12 | null noteId upsert 失败 | NULL unique 处理 | 生成默认 ID |
| 13 | XHS keyword undefined | LLM 未传参数 | 防御性校验 |
| 14 | 偏好搜索词不匹配 | ILIKE 子串匹配限制 | Prompt 指导用具体关键词 |

---

## 🚀 下一步：Phase 2

Phase 2 将进入多 Agent 协作阶段：

- **攻略研究员 Agent** — 专注小红书数据收集
- **行程规划师 Agent** — 综合信息生成行程
- **美食/住宿顾问 Agent** — 专项推荐
- **评估体系** — 质量追踪 + 测试用例

> 每个 Phase 完成后都会撰写类似的学习总结文档，记录知识内化过程。
