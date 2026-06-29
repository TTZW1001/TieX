# TieX 会话节点分支设计

> 日期：2026-06-29  
> 状态：设计稿  
> 目标：把当前“复制整段会话分支”逐步升级为“同一轮多版本候选”，同时保护 Agent 任务、文件变更和权限审计的一致性。

## 1. 背景

TieX 当前已支持：

- `conversations.parent_conversation_id`
- `conversations.branch_from_message_id`
- 从某条消息复制出新会话

这个模型适合“从这里另开一条任务线”，但不适合轻量场景：

- 编辑上一条用户消息后重试
- 同一轮回答生成多个候选
- 在同一个位置比较多个 assistant 回复
- 不希望侧边栏出现大量分支会话

RikkaHub 的 MessageNode / selectIndex 思路值得借鉴：同一个逻辑轮次可以有多个候选消息版本，用户切换当前版本即可。

## 2. TieX 不能直接照搬的原因

TieX 的 assistant 消息经常不是纯文本，它可能绑定：

- `tasks`
- `task_steps`
- `tool_calls`
- `permission_requests`
- `file_changes`
- `artifacts`
- `command_sessions`

如果像普通聊天客户端一样随意切换 assistant 候选，就可能出现：

- UI 显示“版本 B 的回复”，但文件系统已经被“版本 A 的任务”修改
- 用户回看任务结果时，不知道当前文件变更属于哪个候选
- 回滚、权限审计、命令 session 与当前消息版本不一致

因此，TieX 的节点分支必须区分“纯对话候选”和“执行型候选”。

## 3. 推荐数据模型

短期保留现有 conversations 分支模型，中期新增：

```sql
CREATE TABLE message_nodes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  parent_node_id TEXT,
  role TEXT NOT NULL,
  active_variant_id TEXT,
  sequence_no INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE message_variants (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  task_id TEXT,
  variant_no INTEGER NOT NULL,
  variant_kind TEXT NOT NULL DEFAULT 'chat',
  execution_state TEXT NOT NULL DEFAULT 'none',
  created_from_message_id TEXT,
  created_at TEXT NOT NULL
);
```

字段说明：

- `variant_kind`
  - `chat`：纯文本对话候选
  - `agent_task`：绑定 Agent 任务的候选
- `execution_state`
  - `none`：没有本地执行
  - `read_only`：只读工具
  - `mutated_workspace`：产生文件变更、生成物或命令副作用
- `active_variant_id`：当前展示版本

## 4. 切换规则

### 4.1 可直接切换

满足以下条件时可直接切换：

- 没有关联 task
- 或 task 没有文件变更、生成物、命令 session
- 或 task 只有只读工具调用

### 4.2 需要明确提示

如果候选关联任务产生了本地副作用：

- 文件变更
- 生成物
- 命令 session
- 权限审批记录

切换时必须提示：

> 这个回复版本绑定过本地执行记录。切换显示不会自动改变你的文件系统；如需恢复对应状态，请在任务详情中使用回滚或重新执行。

### 4.3 不建议自动做的事

- 切换消息版本时自动回滚文件
- 切换消息版本时自动重放命令
- 在没有审计提示的情况下隐藏旧任务
- 让多个候选共用同一个 task_id

## 5. 最小可执行路线

### 阶段 A：纯 UI 与元数据准备

- 在消息菜单中增加“复制为候选回复”的内部能力
- 对没有 task 的 assistant 消息允许版本切换
- 只影响普通对话，不影响 Agent 任务

### 阶段 B：用户消息编辑后重试

- 编辑用户消息时，从该消息之后创建新 variant
- 旧路径保留为历史候选
- 如果后续已有执行型任务，默认建议“另开分支会话”

### 阶段 C：Agent 任务候选

- 允许同一用户节点下存在多个 assistant task variant
- 每个 variant 绑定独立 task
- 结果概览和任务详情始终跟随当前 variant
- 有本地副作用的 variant 切换必须显示审计提示

## 6. 与现有功能的关系

保留现有整会话分支：

- 适合长线探索
- 适合执行型任务
- 适合用户明确要“从这里另起一条线”

新增节点分支：

- 适合同一轮回答比较
- 适合编辑重试
- 适合纯聊天候选
- 对执行型任务保持谨慎

## 7. 验收标准

- 普通消息可以在同一位置切换多个回复版本
- 有本地执行副作用的任务不会被静默切换事实
- 当前版本对应的任务详情、文件变更、生成物始终可追踪
- 旧版本不污染侧边栏，但仍可从消息节点找回

## 8. 暂不实施的内容

当前阶段不直接改数据库与消息流，原因：

- 任务结果结构化、权限审计、上下文快照刚完成，仍需要稳定
- 节点分支会触碰消息排序、任务绑定、历史加载和 UI 状态
- 最安全的下一步是先补 IPC 类型和测试，再进入消息模型迁移
