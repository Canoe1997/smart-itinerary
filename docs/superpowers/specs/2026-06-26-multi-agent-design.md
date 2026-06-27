# Phase 2.1 — Agent-as-Tool 多 Agent 协作系统设计

> **项目**：Smart Itinerary — 基于小红书真实经验的 AI 旅行规划 Agent
> **日期**：2026-06-26
> **状态**：设计完成，待实现

---

## 1. 背景与目标

### 当前状态（Phase 1）

单 Agent 系统，1 个 LLM 实例拥有全部 9 个工具，通过 ReAct 循环（MAX_ITERATIONS=15）自主完成旅行规划。

**问题**：
- 所有职责集中在一个 Agent，System Prompt 膨胀（67 行）
- 工具选择范围太大，LLM 容易「选择困难」
- 无法体现 Agent 间通信与协作的学习目标

### Phase 2.1 目标

将单 Agent 拆分为 4 个专家 Agent，通过 Agent-as-Tool 模式协作。

**学习目标**：
- Agent-as-Tool 模式（子 Agent 封装为 FC 工具）
- Agent 间通信协议（输入/输出约定）
- 子 Agent 上下文隔离
- 编排器模式（Orchestrator Pattern）

---

## 2. 架构设计

### 2.1 核心概念

**Agent-as-Tool**：每个专家 Agent 被封装为标准 `Tool` 接口，编排器 Agent 通过 Function Calling 调用它们。

```
用户请求 → 编排器 Agent (行程规划师，ReAct 循环)
              ├── tool_call: research_agent(query)
              │     └─ 攻略研究员 [独立 Agent，有 XHS 工具]
              ├── tool_call: advisor_agent(context)
              │     └─ 美食住宿顾问 [独立 Agent，有高德+记忆工具]
              ├── tool_call: doc_agent(data)
              │     └─ 文档 Agent [纯 LLM，无工具]
              └── 最终回复
```

### 2.2 Agent 职责分配

| Agent | 角色 | 拥有的工具 | 输入 | 输出 |
|-------|------|-----------|------|------|
| **编排器** | 总指挥 | 3 个 Agent 工具（无直接业务工具） | 用户原始请求 | 最终行程回复 |
| **研究员** | 数据收集 | `search_xhs_notes` + `get_xhs_note` | 搜索词 + 目的地 | 结构化攻略摘要 |
| **顾问** | 推荐专家 | `search_nearby_poi` + `get_weather` + `plan_transit` + `geocode_address` + 3 个记忆工具 | 目的地 + 偏好 + 研究上下文 | 推荐列表 + 实用信息 |
| **文档** | 输出美化 | 无工具（纯 LLM） | 原始行程数据 | Markdown 文档 |

### 2.3 工具分配明细

| 工具 | 原归属 | 新归属 | 理由 |
|------|--------|--------|------|
| `search_xhs_notes` | 全局 | 研究员 | 攻略搜索是研究员的专属职责 |
| `get_xhs_note` | 全局 | 研究员 | 深入分析也是研究员的职责 |
| `get_weather` | 全局 | 顾问 | 天气影响餐饮和出行建议 |
| `plan_transit` | 全局 | 顾问 | 路线规划属于出行建议 |
| `geocode_address` | 全局 | 顾问 | 为路线规划提供坐标支持 |
| `search_nearby_poi` | 全局 | 顾问 | 周边搜索是推荐的核心能力 |
| `search_memory` | 全局 | 顾问 | 读取用户偏好，影响推荐 |
| `save_user_preference` | 全局 | 顾问 | 识别并保存新偏好 |
| `store_travel_knowledge` | 全局 | 顾问 | 存储优质攻略到知识库 |

---

## 3. 通信协议

### 3.1 Agent-as-Tool 实现

子 Agent 封装为标准 `Tool` 接口：

```typescript
// 研究员 Agent 作为 Tool
const researchAgentTool: Tool = {
  name: 'research_agent',
  description: '调用攻略研究员搜索小红书旅行攻略，返回结构化研究摘要',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词，如"东京亲子游攻略"' },
      destination: { type: 'string', description: '目的地城市' },
    },
    required: ['query', 'destination'],
  },
  execute: async (args) => {
    const subAgent = createAgent({
      systemPrompt: RESEARCHER_SYSTEM,
      registry: researchRegistry,
      maxIterations: 6,
    })
    return subAgent.sendMessage(
      `搜索并深度分析关于"${args.destination} ${args.query}"的旅行攻略。返回：1) 找到的高质量攻略列表 2) 关键发现（景点、餐厅、交通建议）3) 特别适合用户偏好的内容`,
    )
  },
}
```

### 3.2 通信数据流

```
编排器 LLM ←→ FC ←→ research_agent.execute()
  subAgent LLM ←→ FC ←→ search_xhs_notes
  subAgent LLM ←→ FC ←→ get_xhs_note
  → returns: "研究摘要文本..."
编排器 LLM ←→ FC ←→ advisor_agent.execute()
  subAgent LLM ←→ FC ←→ search_memory
  subAgent LLM ←→ FC ←→ get_weather
  subAgent LLM ←→ FC ←→ search_nearby_poi
  → returns: "推荐列表文本..."
编排器 LLM ←→ FC ←→ doc_agent.execute()
  subAgent LLM（无工具）→ format prompt
  → returns: "Markdown 文档..."
编排器 LLM → 最终回复
```

### 3.3 轮次控制

| Agent | MAX_ITERATIONS | 理由 |
|-------|---------------|------|
| 编排器 | 10 | 调用 3 个子 Agent + 汇总，不需要太多轮 |
| 研究员 | 6 | 搜 2 次 + 查 2-3 篇详情，足够 |
| 顾问 | 8 | 查天气 + 搜周边 + 可能存记忆 |
| 文档 | 1 | 纯格式化，无需工具调用 |

### 3.4 子 Agent 上下文隔离

每个子 Agent 有独立的对话历史，一次性使用，用完即弃。

```typescript
// 子 Agent 无状态设计
const subAgent = createAgent({ systemPrompt, registry, maxIterations })
const result = await subAgent.sendMessage(taskInstruction)
// subAgent 在此作用域外被 GC，历史不会污染编排器
```

---

## 4. System Prompt 设计

### 4.1 编排器 Prompt（~40行）

角色：旅行规划总指挥"小旅"
- 不直接搜索或查询，协调专家团队
- 分析需求 → 调用研究员 → 调用顾问 → 调用文档 → 汇总
- 效率规则：合理安排调用顺序，避免重复

### 4.2 研究员 Prompt（~25行）

角色：攻略研究员
- 专注搜索和分析小红书攻略
- 返回结构化摘要：高质量攻略列表 + 关键发现 + 来源
- 效率规则：最多搜2次、最多看4篇

### 4.3 顾问 Prompt（~30行）

角色：美食住宿顾问
- 根据目的地、偏好、研究上下文提供建议
- 查天气、搜周边、读写记忆
- 效率规则：天气一次、按需搜周边

### 4.4 文档 Prompt（~25行）

角色：文档格式化专家
- 将行程数据转为美观 Markdown
- 使用标准模板：概览 → 每日行程表格 → 贴士 → 来源
- 无工具，纯格式化

---

## 5. 文件结构变更

```
src/
├── agent/
│   ├── index.ts           # 🔄 重构：通用 Agent 工厂
│   ├── orchestrator.ts    # ✨ 新：编排器 + Agent 工具注册
│   └── prompts.ts         # 🔄 扩展：4 个 System Prompt
├── tools/                 # （不变）
│   ├── registry.ts
│   ├── xhs.ts
│   ├── memory.ts
│   └── amap.ts
├── mcp/                   # （不变）
│   └── xiaohongshu.ts
├── memory/                # （不变）
│   └── index.ts
├── config.ts              # （不变）
├── mimo-client.ts         # （不变）
└── index.ts               # 🔄 入口改为启动编排器
```

### 变更说明

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `agent/index.ts` | 重构 | `createItineraryAgent()` → `createAgent(options)` 通用工厂 |
| `agent/orchestrator.ts` | 新增 | 创建编排器，注册 3 个 Agent 工具 |
| `agent/prompts.ts` | 扩展 | 1 个 Prompt → 4 个 Prompt（编排器/研究员/顾问/文档） |
| `index.ts` | 修改 | 入口改为创建编排器 Agent 并启动对话 |

---

## 6. 不变的部分

以下模块保持不变，体现「高内聚低耦合」：

- `tools/registry.ts` — Tool 接口和注册表，Agent-as-Tool 直接复用
- `tools/xhs.ts` — XHS 工具，分配给研究员
- `tools/memory.ts` — 记忆工具，分配给顾问
- `tools/amap.ts` — 高德工具，分配给顾问
- `mcp/xiaohongshu.ts` — XHS MCP 客户端
- `memory/index.ts` — Supabase 记忆模块
- `config.ts` — 配置
- `mimo-client.ts` — MiMo API 客户端

---

## 7. 验收标准

- [ ] `npm run build` 编译无错误
- [ ] `npm run dev` 启动正常，显示4个Agent信息
- [ ] 输入"帮我规划3天东京亲子游" → 编排器依次调用研究员、顾问、文档
- [ ] 终端显示每个子 Agent 的工具调用过程
- [ ] 最终输出格式化行程文档
- [ ] 研究员失败时编排器能降级（跳过攻略，直接规划）
- [ ] 子 Agent 上下文不互相污染

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 嵌套 LLM 调用延迟高 | 每个子 Agent 都要调 LLM，总延迟 ×3-4 | 子 Agent 轮次限制（6-8轮）；编排器不需要太多轮 |
| 子 Agent 结果质量不可控 | 研究员可能返回无用信息 | System Prompt 明确输出格式要求 |
| 编排器可能跳过子 Agent | 用户简单问题不需要全部调用 | 这是合理行为，编排器有权决策 |
| 总 token 消耗增加 | 多个 Agent 各自消耗 token | 子 Agent 限制轮次；文档 Agent 无工具不消耗工具调用 token |
