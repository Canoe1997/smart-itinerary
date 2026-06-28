# 三面板 UI 重设计 — Claude 风格

> Smart Itinerary 三面板布局重设计，参照 Claude/GPT 的对话界面设计，实现持久化存储、左右可折叠侧栏、Claude 风格视觉系统。

## 目标

1. **三面板布局**：左侧历史对话列表（260px，可折叠）、中间对话区（flex）、右侧行程预览（340px，可折叠）
2. **对话持久化**：Supabase 存储 conversations + messages，支持跨设备恢复
3. **Claude 风格视觉**：暖灰色系、无背景助手消息、深色用户气泡、暖棕强调色
4. **响应式**：Desktop 三面板 / Tablet 抽屉互斥 / Mobile 底部 tab

---

## 1. 整体架构

### 1.1 路由结构

```
/chat/[id]     三面板主界面（id = conversation UUID）
/settings      设置页（保留现有）
/              重定向到新创建的对话 /chat/new-uuid
```

### 1.2 面板布局

```
┌──────────┬────────────────────────┬──────────┐
│ Sidebar  │      Chat Area         │ Preview  │
│ 260px    │      flex-1            │ 340px    │
│ collaps. │                        │ collaps. │
│          │ ┌────────────────────┐ │          │
│ 新对话    │ │   Messages         │ │ Markdown │
│ ──────── │ │   (scrollable)     │ │ Preview  │
│ 对话 1 ✓ │ │                    │ │          │
│ 对话 2   │ │                    │ │ ──────── │
│ 对话 3   │ ├────────────────────┤ │ [PDF下载]│
│ ...      │ │   Input Bar        │ │          │
│          │ └────────────────────┘ │          │
└──────────┴────────────────────────┴──────────┘
```

### 1.3 页面组件树

```
app/
  layout.tsx              # 根 layout（ThemeProvider）
  page.tsx                # 重定向到 /chat/[new-uuid]
  chat/
    layout.tsx            # 三面板 layout（Sidebar + Preview 包裹）
    [id]/
      page.tsx            # ChatContainer（消息区 + 输入栏）
  settings/
    page.tsx              # 设置页（保留）
  api/
    chat/route.ts         # SSE 聊天 API（保留，加 conversationId）
    pdf/route.ts          # PDF 导出 API（保留）

components/
  layout/
    sidebar.tsx           # 左侧历史对话列表（新建）
    preview-panel.tsx     # 右侧行程预览（新建）
  chat/
    chat-container.tsx    # 重构：消息区 + 输入栏
    message-bubble.tsx    # 重构：Claude 风格气泡
    input-bar.tsx         # 重构：Claude 风格底部输入
    tool-call-detail.tsx  # 保留
  itinerary/
    timeline.tsx          # 保留
    day-card.tsx          # 保留

stores/
  app-store.ts            # 扩展：sidebar/preview 折叠状态
  conversation-store.ts   # 新建：对话 CRUD + 消息管理

lib/
  agent-adapter.ts        # 保留，加 conversationId 参数
  supabase.ts             # 新建：Supabase 客户端（@supabase/supabase-js v2）
```

### 1.4 Supabase 客户端配置

**依赖：** `@supabase/supabase-js@^2`

**环境变量：**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**客户端（lib/supabase.ts）：**
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)
```

MVP 阶段使用 anon key 直连，后续加 auth 后切换到 service role。

---

## 2. Supabase 数据模型

### 2.1 conversations 表

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '新对话',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_updated_at ON conversations (updated_at DESC);
```

### 2.2 messages 表

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);
```

### 2.3 RLS 策略（MVP 单用户，后续扩展）

```sql
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- MVP: 允许所有操作（后续加 auth 后限制到 user_id）
CREATE POLICY "Allow all" ON conversations FOR ALL USING (true);
CREATE POLICY "Allow all" ON messages FOR ALL USING (true);
```

### 2.4 自动更新 updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 3. 视觉设计系统

### 3.1 设计风格

**Soft UI Evolution** — 既有微妙深度感，又有现代简洁性。参照 Claude 的暖灰色系、Inter 字体、无装饰界面。

### 3.2 色彩系统 — 光模式

```css
/* Surface */
--bg-page:       #FAFAF8;   /* 页面底色，暖灰非纯白 */
--bg-sidebar:    #F5F4F2;   /* 侧栏底色 */
--bg-card:       #FFFFFF;   /* 卡片/输入框底色 */
--bg-hover:      #F0EFED;   /* 悬停态 */

/* Text */
--text-primary:  #1B1B1B;   /* 正文，近黑非纯黑 */
--text-secondary:#6B6B6B;   /* 次要文字 */
--text-muted:    #9B9B9B;   /* 占位符/时间戳 */

/* Brand */
--accent:        #DA7756;   /* 暖棕琥珀（Claude 色） */
--accent-hover:  #C4673F;   /* 深一度 */
--bubble-user:   #1B1B1B;   /* 用户气泡底色 */
--bubble-user-text: #FFFFFF;/* 用户气泡文字 */

/* Border */
--border:        #E8E7E5;   /* 默认边框 */
--border-subtle: #F0EFED;   /* 极淡边框 */

/* Semantic */
--success:       #16A34A;
--warning:       #CA8A04;
--error:         #DC2626;
--info:          #2563EB;
```

### 3.3 色彩系统 — 暗模式

```css
--bg-page:       #1A1A1A;
--bg-sidebar:    #141414;
--bg-card:       #242424;
--bg-hover:      #2A2A2A;

--text-primary:  #ECECEC;
--text-secondary:#8E8E8E;
--text-muted:    #5C5C5C;

--accent:        #E8956F;   /* 暗模式提亮 */
--bubble-user:   #ECECEC;
--bubble-user-text: #1A1A1A;

--border:        #333333;
--border-subtle: #2A2A2A;
```

### 3.4 排版

字体：**Inter**（单字体，权重 300-700）

```
--text-xs:   12px / 16px   标签、时间戳
--text-sm:   14px / 20px   次要文字、工具详情
--text-base: 14px / 22px   正文消息（Claude 标准）
--text-lg:   16px / 24px   子标题
--text-xl:   18px / 28px   面板标题
--text-2xl:  24px / 32px   欢迎标题

权重：正文 400，标签/导航 500，标题 600，强调 700
```

### 3.5 间距（8px 网格）

```
space-1: 4px     space-2: 8px     space-3: 12px
space-4: 16px    space-5: 20px    space-6: 24px
space-8: 32px    space-10: 40px
```

### 3.6 阴影

```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.04);     /* 卡片、输入框 */
--shadow-md: 0 2px 8px rgba(0,0,0,0.06);     /* 弹出面板、下拉 */
--shadow-lg: 0 8px 24px rgba(0,0,0,0.08);    /* 模态框、浮动侧栏 */
```

### 3.7 圆角

```
--radius-sm:  6px    工具标签、badge
--radius-md:  8px    侧栏项、工具卡片
--radius-lg:  12px   卡片、面板
--radius-xl:  16px   消息气泡
--radius-full: 9999px 发送按钮
```

---

## 4. 组件设计规范

### 4.1 Sidebar（左侧栏 · 新建）

**结构：**
```
┌────────────────────┐
│ [+ 新对话]          │  固定顶部
│────────────────────│
│ 📅 今天             │  分组标题
│   东京亲子游3天  ✓  │  当前高亮
│   大阪美食攻略      │
│ 📅 昨天             │
│   伊豆温泉之旅      │
│ 📅 更早             │
│   北海道滑雪行      │
│                    │
│────────────────────│
│ ⚙️ 设置             │  固定底部
└────────────────────┘
```

**样式：**
- 宽度 260px，底色 `--bg-sidebar`
- 对话项：padding 8px 12px，8px 圆角，hover `--bg-hover`
- 当前对话：`--bg-hover` 背景 + 左侧 3px `--accent` 竖线
- 标题 `text-sm font-medium truncate`，时间 `text-xs text-muted`
- hover 显示 `⋯` 菜单（重命名、删除）
- 删除需 inline 二次确认（"确认删除？ 取消 | 删除"）

**交互：**
- `⌘+B` 切换折叠/展开
- 状态持久化 localStorage `sidebar-collapsed`
- 折叠后仅剩悬浮 `☰` 按钮

### 4.2 MessageBubble（消息气泡 · 重构）

**用户消息：**
- `--bubble-user` 底色 + `--bubble-user-text` 白字
- 右对齐，`--radius-xl`（16px）圆角，右下 4px
- max-width 70%

**助手消息：**
- **无背景、无边框**（Claude 风格核心特征）
- 纯文本左对齐，`text-primary` 色
- 工具调用：可折叠卡片，`--bg-sidebar` 底色，8px 圆角
- 行程检测：消息上方渲染 Timeline 组件

**通用：**
- 消息出现动画：`translateY(8px) → 0` + opacity，150ms ease-out
- hover 右上角显示复制图标
- `prefers-reduced-motion`：仅 opacity 变化

### 4.3 InputBar（输入栏 · 重构）

**Claude 风格底部横条：**
```
┌──────────────────────────────────────┐
│  ┌──────────────────────────┐  [↑]  │
│  │ 告诉小旅你的旅行需求...    │       │
│  └──────────────────────────┘       │
│  小旅可能会犯错，请核实重要信息       │
└──────────────────────────────────────┘
```

**样式：**
- 固定底部，`--bg-card` 底色 + `--border` 上边框
- 输入框：无边框，`--bg-sidebar` 底色，16px 圆角
- 发送按钮：圆形 36px，`--text-primary` 底（光模式），`--accent` hover
- disabled 状态：opacity 0.38 + cursor not-allowed
- 最小触摸高度 44px

**交互：**
- Enter 发送，Shift+Enter 换行
- 发送中：按钮显示 Loader2 spinner，disabled
- 底部提示文字 `text-xs text-muted`

### 4.4 PreviewPanel（右侧面板 · 新建）

**结构：**
```
┌────────────────────┐
│ 📋 行程预览    [▶]  │  标题 + 折叠按钮
│────────────────────│
│ # Day 1 — 东京      │  Markdown 渲染
│ 上午：浅草寺        │
│ 午餐：抹茶甜品      │
│ 下午：teamLab       │
│                    │
│ # Day 2 — 箱根      │
│ ...                │
│                    │
│────────────────────│
│ [📄 导出 PDF]       │  固定底部按钮
└────────────────────┘
```

**样式：**
- 宽度 340px，白底，`--border` 左边框
- 标题 `text-lg font-semibold`
- Markdown 渲染：`react-markdown` + `remark-gfm`
- 代码块 `--bg-sidebar` 底色，14px
- PDF 按钮：`--accent` 底色白字，8px 圆角，full width

**交互：**
- 有行程消息时自动展开
- `⌘+.` 或点击按钮手动折叠/展开
- 状态持久化 localStorage `preview-collapsed`
- 内容区域独立滚动
- PDF 按钮：点击 → loading spinner → 下载

---

## 5. 响应式策略

### 5.1 断点

```
≥1280px  Desktop   三面板同时可见
≥768px   Tablet    聊天为主，侧栏/预览抽屉互斥
<768px   Mobile    单面板 + 底部 tab
```

### 5.2 Desktop（≥1280px）

- 三面板并排
- 侧栏和预览可独立折叠
- 折叠后面板宽度为 0，聊天区扩展

### 5.3 Tablet（768px - 1279px）

- 默认只显示聊天区
- 侧栏 → 左侧滑入抽屉（overlay + 遮罩）
- 预览 → 右侧滑入抽屉（overlay + 遮罩）
- 互斥：打开一个自动关闭另一个
- 点遮罩关闭

### 5.4 Mobile（<768px）

- 纯聊天界面
- 底部 tab：`对话` | `行程` | `设置`（≤3 项）
- 侧栏：`☰` → 全屏 overlay
- 行程 tab = 原右面板内容
- 输入框使用 `min-h-dvh`（非 100vh）
- 底部 safe area padding（iPhone 手势条）
- 字体最小 16px（避免 iOS 自动缩放）

---

## 6. 数据流

### 6.1 创建对话

```
用户点击 [+ 新对话]
  → POST /api/conversations → 返回 { id, title }
  → router.push(`/chat/${id}`)
  → 侧栏列表自动刷新
```

### 6.2 发送消息

```
用户输入 → Enter
  → POST /api/chat { message, conversationId, preferences }
  → 立即显示用户气泡（乐观更新）
  → SSE 流式接收助手回复
  → 写入 Supabase（user message + assistant message）
  → 更新 conversation.updated_at
  → 侧栏列表自动重排
```

### 6.3 加载对话

```
用户点击侧栏对话项
  → router.push(`/chat/${id}`)
  → 页面组件加载：GET /api/conversations/[id]/messages
  → 渲染消息列表
  → 检测最后一条助手消息是否有行程 → 展开/折叠预览面板
```

### 6.4 删除对话

```
用户点击 [⋯] → 删除 → 确认
  → DELETE /api/conversations/[id]
  → 级联删除 messages
  → 侧栏列表刷新
  → 如果删除的是当前对话，跳转到新对话
```

---

## 7. API 扩展

### 7.1 新增 API Routes

```
POST   /api/conversations              创建对话
GET    /api/conversations              列表对话（分页）
DELETE /api/conversations/[id]         删除对话
GET    /api/conversations/[id]/messages 获取消息列表
```

### 7.2 修改现有 API

**POST /api/chat** — 增加 `conversationId` 参数：

```typescript
// 请求体扩展
interface ChatRequest {
  message: string
  conversationId: string    // 新增
  preferences?: string
}
```

流式回复完成后，写入 Supabase：

```typescript
// 流式结束后
await supabase.from('messages').insert([
  { conversation_id, role: 'user', content: userMessage },
  { conversation_id, role: 'assistant', content: fullResponse, tool_calls: toolCalls },
])
```

---

## 8. 动画规范

| 动作 | 持久 | 缓动 | 属性 |
|------|------|------|------|
| 侧栏展开/收起 | 200ms | ease-out | transform + opacity |
| 消息出现 | 150ms | ease-out | translateY(8px)→0 + opacity |
| 气泡 hover | 150ms | ease | background |
| 按钮按压 | 100ms | ease-out | scale(0.97) |
| 面板切换 | 200ms | ease-out | width + opacity |
| 滚动到底部 | 300ms | smooth | scrollIntoView |
| 抽屉打开（Tablet） | 250ms | ease-out | translateX |
| 遮罩淡入 | 200ms | ease | opacity |

**Reduced Motion：** `prefers-reduced-motion: reduce` 时，所有动画禁用，仅 instant opacity 变化。

---

## 9. 无障碍（Accessibility）

- 所有交互元素带 `aria-label`
- 聊天区域 `role="log" aria-live="polite"`
- 侧栏 `role="navigation"`
- 预览面板 `role="complementary"`
- Focus ring：`2px solid --accent`，offset 2px
- 颜色对比度：正文 ≥ 4.5:1，次要文字 ≥ 3:1
- 触摸目标 ≥ 44px
- heading 层级顺序（h1 → h2 → h3）
- 键盘导航：Tab 顺序匹配视觉顺序

---

## 10. 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘+B` | 切换侧栏 |
| `⌘+.` | 切换预览面板 |
| `⌘+Shift+N` | 新建对话 |
| `Enter` | 发送消息 |
| `Shift+Enter` | 换行 |
| `Escape` | 关闭抽屉（Tablet/Mobile） |

---

## 11. 加载与空状态

### 首次加载（无对话）

- 聊天区：欢迎界面（Logo + "你好，我是小旅" + 3 快捷提示）
- 侧栏：空态文字 "还没有对话，开始第一次旅行规划吧"

### 加载中

- 侧栏列表：skeleton 条 × 5（shimmer 动画，300ms 后显示）
- 聊天区：typing indicator（3 跳动点）
- 预览面板：skeleton 块

### 错误状态

- 网络错误：气泡内红色提示 + 重试按钮
- Supabase 不可用：降级 localStorage，标题显示 "离线模式"

---

## 12. 实现优先级

| 优先级 | 内容 | 说明 |
|--------|------|------|
| P0 | Supabase 客户端 + 表创建 | 数据基础 |
| P0 | Sidebar 组件 | 核心布局 |
| P0 | 对话 CRUD API | 数据操作 |
| P0 | ChatContainer 重构 | Claude 风格消息 |
| P1 | PreviewPanel | 行程预览 |
| P1 | 响应式适配 | Tablet/Mobile |
| P1 | CSS 变量 + 主题 | 视觉系统 |
| P2 | 快捷键 | 效率提升 |
| P2 | Skeleton 加载态 | 体验完善 |
| P2 | 离线降级 | 容错 |
