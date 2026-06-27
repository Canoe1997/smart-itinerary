# 🗺️ Smart Itinerary

基于小红书真实经验的 AI 旅行规划 Agent

> 不是通用行程生成器，而是帮你在小红书上做攻略调研 + 制定个性化行程的 AI 助手。

## 功能

- 🔍 小红书攻略搜索与深度分析
- 📋 基于真实经验的智能行程规划
- 💬 多轮对话调整行程
- 🌤️ 天气/交通等实时数据集成
- 🧠 个人偏好记忆
- 📄 PDF / Notion 行程导出

## 技术栈

| 层面 | 选择 |
|------|------|
| 主项目 | TypeScript / Node.js |
| LLM | 小米 MiMo v2.5 Pro |
| 小红书数据 | xiaohongshu-mcp (Python) |
| 地图/天气 | 高德地图 API |
| 向量数据库 | Supabase pgvector |
| 前端 | Next.js + Tailwind CSS |
| 部署 | Vercel |

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 MiMo API Key

# 运行
npm run dev
```

## 学习路径

本项目基于《智能体 AI 权威指南》边学边做：

- Phase 0: 项目骨架 + API 连通
- Phase 1: Agent 核心机制（ReAct、记忆、RAG、工具）
- Phase 2: 多 Agent 协作 + 评估
- Phase 3: Web UI + 工程化
- Phase 4: 上线

## License

MIT
