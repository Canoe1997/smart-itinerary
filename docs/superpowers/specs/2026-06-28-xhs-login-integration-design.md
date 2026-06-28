# XHS Login Integration + Error Handling Design

## Problem

XHS MCP cookies expire (~7 days), triggering `NeedVerifyError: Captcha required`. When search fails, the LLM agent fabricates content instead of reporting the failure, misleading users.

## Solution Overview

Three components:
1. **Puppeteer login flow** — Browser popup for automated cookie capture
2. **Cookie health check** — API + startup validation
3. **Agent error transparency** — Three-layer defense against fabricated content

## 1. Puppeteer Login Flow

### API Routes

**`GET /api/xhs/status`**
- Read `cookies.json`, check `saved_at` timestamp
- If cookies exist, call MCP `get_self_info()` to validate
- Return: `{ connected: boolean, valid: boolean, savedAt: string | null, nickname?: string }`

**`POST /api/xhs/login`**
- Singleton lock (prevent concurrent Puppeteer instances)
- Launch Puppeteer (non-headless, `userDataDir` for persistence)
- Navigate to `https://www.xiaohongshu.com`
- Poll `page.cookies()` every 2s for `a1` + `web_session` + `webId`
- On detection: write to `cookies.json` with `saved_at` timestamp
- Validate via `get_self_info()`
- Close browser
- Return success/failure
- Timeout: 5 minutes

**`DELETE /api/xhs/cookies`**
- Delete `cookies.json`
- Return success

### Frontend

**Settings page "小红书连接" card:**
- Status indicator (未连接/已连接/已过期)
- "连接小红书" button → calls POST /api/xhs/login
- After click: show "等待登录..." with polling status every 3s
- "断开连接" button → calls DELETE /api/xhs/cookies

## 2. Cookie Health Check

### Agent Startup Check

In `agent-adapter.ts`, before creating the orchestrator:
- Call XHS MCP `get_self_info()` (lightweight validation)
- If fails: emit SSE `status` event with `{ xhsConnected: false }`
- Agent still runs but with awareness that XHS is unavailable

### Frontend Banner

ChatContainer receives `xhsConnected` status:
- If false: show amber banner "小红书连接已失效，攻略搜索不可用。前往设置页重新连接"
- Banner includes link to settings page

## 3. Agent Error Transparency

### Layer 1: Tool Error Markers

In `src/tools/xhs.ts`, when MCP returns error:
- Return `XHS_SEARCH_FAILED: [具体原因]` instead of generic error string
- Include actionable guidance (e.g., "cookies expired, go to settings to reconnect")

### Layer 2: Agent Prompt Rules

Update `RESEARCHER_SYSTEM`:
```
## 重要规则
- 当 search_xhs_notes 返回包含 "XHS_SEARCH_FAILED" 时，必须直接报告失败
- 绝对不要基于训练数据编造小红书帖子（标题、点赞、作者等）
- 搜索失败时说明原因并建议用户检查小红书连接
```

Update `ORCHESTRATOR_SYSTEM`:
```
- 如果 research_agent 报告小红书搜索失败，告知用户具体原因
- 不要用编造的数据替代真实攻略
```

### Layer 3: Frontend Error Display

In ChatContainer, detect error patterns in agent response:
- If response contains "XHS_SEARCH_FAILED" or "小红书搜索失败"
- Show error card with "重新连接" button

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/api/xhs/status/route.ts` | Create | GET endpoint for cookie status |
| `app/api/xhs/login/route.ts` | Create | POST endpoint for Puppeteer login |
| `app/api/xhs/cookies/route.ts` | Create | DELETE endpoint for clearing cookies |
| `components/settings/xhs-connection.tsx` | Create | XHS connection card component |
| `app/settings/page.tsx` | Modify | Add XHS connection card |
| `src/tools/xhs.ts` | Modify | Add XHS_SEARCH_FAILED error markers |
| `src/agent/prompts.ts` | Modify | Add anti-fabrication rules |
| `lib/agent-adapter.ts` | Modify | Add startup health check |
| `components/chat/chat-container.tsx` | Modify | Add XHS status banner |
| `stores/app-store.ts` | Modify | Add xhsConnected state |

## Dependencies

- `puppeteer-core` (already in project for PDF generation)
- System Chrome (already detected via `findChromePath()`)
