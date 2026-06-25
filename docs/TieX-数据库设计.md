# TieX 数据库设计

> 产品名称：TieX  
> 文档类型：数据库设计  
> 对应版本：V1.0 MVP  
> 数据库：SQLite  
> 数据库文件：`%APPDATA%/TieX/tiex.db`

---

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | TieX 数据库设计 |
| 产品名称 | TieX |
| 对应版本 | V1.0 MVP |
| 数据库类型 | SQLite |
| 文档状态 | 初稿 |
| 主要读者 | 开发者、Trae、Codex、测试人员 |
| 关联文档 | TieX-PRD.md、TieX-原型设计说明.md、TieX-技术架构与概要设计.md |

---

## 2. 设计目标

TieX V1.0 使用 SQLite 作为本地数据库，用于保存：

- 应用设置；
- 模型服务商配置；
- 工作区信息；
- 会话；
- 消息；
- 智能体任务；
- 任务步骤；
- 工具调用；
- 权限审批；
- 文件修改记录；
- 生成物；
- 操作日志。

数据库设计目标：

1. 支持本地优先，不依赖云端服务；
2. 支持会话、任务和工具调用全过程追踪；
3. 支持文件修改记录与恢复；
4. 支持权限审批历史；
5. 支持任务中断后的状态恢复；
6. 支持后续扩展更多模型服务商；
7. 避免将所有业务数据堆入单个 JSON 字段；
8. 保持 V1.0 结构清晰，避免过度设计。

---

## 3. 数据库选型

### 3.1 选型结果

TieX V1.0 使用 SQLite。

建议驱动：

- `better-sqlite3`

### 3.2 选型原因

- 无需单独安装数据库服务；
- 适合个人本地桌面应用；
- 单文件便于备份；
- 支持事务；
- 支持索引；
- Node.js 生态成熟；
- 与 Electron 主进程集成方便。

### 3.3 数据库位置

```text
%APPDATA%/TieX/tiex.db
```

不建议将数据库放在项目安装目录中，避免应用升级或卸载导致数据丢失。

---

## 4. 设计规范

### 4.1 命名规范

- 表名：小写复数形式，使用下划线；
- 字段名：小写下划线；
- 主键：统一使用 `id`；
- 外键：使用 `{实体名}_id`；
- 时间字段：使用 ISO 8601 字符串或 Unix 毫秒时间戳；
- 布尔值：SQLite 中使用 `INTEGER`，`0` 表示 false，`1` 表示 true；
- 枚举：使用 `TEXT` 并通过应用层校验；
- JSON：仅用于不固定结构或扩展字段，不替代关系设计。

### 4.2 主键策略

统一使用 UUID 字符串：

```text
TEXT PRIMARY KEY
```

建议使用：

- `crypto.randomUUID()`

### 4.3 时间字段

统一使用 UTC ISO 8601：

```text
2026-06-23T10:30:00.000Z
```

字段类型：

```sql
TEXT NOT NULL
```

### 4.4 删除策略

V1.0 采用两类删除：

#### 物理删除

适用于：

- 用户主动删除会话；
- 清空日志；
- 清除缓存；
- 删除失效配置。

#### 逻辑删除

建议用于：

- 工作区；
- 模型服务商。

逻辑删除字段：

```sql
is_deleted INTEGER NOT NULL DEFAULT 0
```

---

## 5. 表清单

TieX V1.0 包含以下数据表：

1. `app_settings`
2. `model_providers`
3. `workspaces`
4. `conversations`
5. `messages`
6. `tasks`
7. `task_steps`
8. `tool_calls`
9. `permission_requests`
10. `file_changes`
11. `artifacts`
12. `operation_logs`
13. `schema_migrations`

---

## 6. 实体关系概览

```text
model_providers
      │
      └── conversations
              │
              ├── messages
              └── tasks
                    │
                    ├── task_steps
                    ├── tool_calls
                    ├── permission_requests
                    ├── file_changes
                    ├── artifacts
                    └── operation_logs

workspaces
      │
      ├── conversations
      ├── tasks
      ├── file_changes
      └── artifacts
```

主要关系：

- 一个模型服务商可被多个会话使用；
- 一个工作区可关联多个会话；
- 一个会话可包含多条消息；
- 一个会话可产生多个任务；
- 一个任务可包含多个步骤；
- 一个任务可包含多个工具调用；
- 一个工具调用可产生一个权限审批；
- 一个任务可产生多个文件变更；
- 一个任务可生成多个文件生成物；
- 一个任务可产生多条操作日志。

---

# 7. 表结构设计

## 7.1 app_settings

### 7.1.1 用途

保存应用级设置。

采用键值形式，避免每增加一个简单设置就修改表结构。

### 7.1.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| key | TEXT | 是 | - | 设置键，主键 |
| value | TEXT | 是 | - | 设置值 |
| value_type | TEXT | 是 | `string` | 数据类型 |
| updated_at | TEXT | 是 | - | 更新时间 |

### 7.1.3 建表 SQL

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string',
  updated_at TEXT NOT NULL
);
```

### 7.1.4 示例数据

```text
theme = system
sidebar_collapsed = false
default_permission_mode = read
max_task_steps = 20
auto_backup = true
```

---

## 7.2 model_providers

### 7.2.1 用途

保存模型服务商配置。

V1.0 默认支持 DeepSeek，但表结构应允许以后增加其他模型服务商。

### 7.2.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| name | TEXT | 是 | - | 配置名称 |
| provider_type | TEXT | 是 | `deepseek` | 服务商类型 |
| base_url | TEXT | 是 | - | API 地址 |
| model_name | TEXT | 是 | - | 模型名称 |
| encrypted_api_key | BLOB | 否 | NULL | 加密后的 API Key |
| temperature | REAL | 否 | NULL | 温度参数 |
| max_tokens | INTEGER | 否 | NULL | 最大输出 Token |
| timeout_ms | INTEGER | 是 | 60000 | 请求超时 |
| stream_enabled | INTEGER | 是 | 1 | 是否流式输出 |
| is_default | INTEGER | 是 | 0 | 是否默认配置 |
| is_enabled | INTEGER | 是 | 1 | 是否启用 |
| is_deleted | INTEGER | 是 | 0 | 是否逻辑删除 |
| created_at | TEXT | 是 | - | 创建时间 |
| updated_at | TEXT | 是 | - | 更新时间 |

### 7.2.3 建表 SQL

```sql
CREATE TABLE model_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'deepseek',
  base_url TEXT NOT NULL,
  model_name TEXT NOT NULL,
  encrypted_api_key BLOB,
  temperature REAL,
  max_tokens INTEGER,
  timeout_ms INTEGER NOT NULL DEFAULT 60000,
  stream_enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 7.2.4 约束建议

- 同一时间只允许一个默认服务商；
- `base_url` 必须为合法 URL；
- `timeout_ms` 必须大于 0；
- API Key 必须使用 Electron `safeStorage` 加密后保存。

---

## 7.3 workspaces

### 7.3.1 用途

保存用户授权的本地工作区。

### 7.3.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| name | TEXT | 是 | - | 工作区名称 |
| root_path | TEXT | 是 | - | 工作区根路径 |
| normalized_path | TEXT | 是 | - | 规范化路径 |
| default_permission_mode | TEXT | 是 | `read` | 默认权限模式 |
| is_favorite | INTEGER | 是 | 0 | 是否置顶 |
| is_available | INTEGER | 是 | 1 | 路径当前是否可用 |
| is_deleted | INTEGER | 是 | 0 | 是否逻辑删除 |
| last_opened_at | TEXT | 否 | NULL | 最近打开时间 |
| created_at | TEXT | 是 | - | 创建时间 |
| updated_at | TEXT | 是 | - | 更新时间 |

### 7.3.3 建表 SQL

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  normalized_path TEXT NOT NULL UNIQUE,
  default_permission_mode TEXT NOT NULL DEFAULT 'read',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_available INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 7.3.4 注意事项

- `root_path` 用于展示；
- `normalized_path` 用于去重；
- 不保存目录内容；
- 工作区文件变化不写入数据库，只在访问时读取；
- 工作区删除后，会话可保留，但解除绑定或显示路径失效。

---

## 7.4 conversations

### 7.4.1 用途

保存会话信息。

### 7.4.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| title | TEXT | 是 | `新对话` | 会话标题 |
| provider_id | TEXT | 否 | NULL | 模型配置 |
| workspace_id | TEXT | 否 | NULL | 关联工作区 |
| permission_mode | TEXT | 是 | `chat` | 权限模式 |
| status | TEXT | 是 | `active` | 会话状态 |
| is_pinned | INTEGER | 是 | 0 | 是否置顶 |
| last_message_at | TEXT | 否 | NULL | 最近消息时间 |
| created_at | TEXT | 是 | - | 创建时间 |
| updated_at | TEXT | 是 | - | 更新时间 |

### 7.4.3 建表 SQL

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '新对话',
  provider_id TEXT,
  workspace_id TEXT,
  permission_mode TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'active',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES model_providers(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
```

### 7.4.4 枚举建议

`permission_mode`：

```text
chat
read
execute
```

`status`：

```text
active
archived
```

---

## 7.5 messages

### 7.5.1 用途

保存会话中的消息。

### 7.5.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| conversation_id | TEXT | 是 | - | 所属会话 |
| task_id | TEXT | 否 | NULL | 所属任务 |
| role | TEXT | 是 | - | 消息角色 |
| content | TEXT | 是 | - | 消息内容 |
| content_type | TEXT | 是 | `text` | 内容类型 |
| tool_call_id | TEXT | 否 | NULL | 关联工具调用 |
| sequence_no | INTEGER | 是 | - | 会话内顺序 |
| token_count | INTEGER | 否 | NULL | 估算 Token |
| is_streaming | INTEGER | 是 | 0 | 是否仍在流式生成 |
| created_at | TEXT | 是 | - | 创建时间 |
| updated_at | TEXT | 是 | - | 更新时间 |

### 7.5.3 建表 SQL

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  task_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  tool_call_id TEXT,
  sequence_no INTEGER NOT NULL,
  token_count INTEGER,
  is_streaming INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  UNIQUE (conversation_id, sequence_no)
);
```

### 7.5.4 role 枚举

```text
system
user
assistant
tool
```

### 7.5.5 content_type 枚举

```text
text
markdown
error
status
```

说明：

- 工具调用具体参数不放在 messages；
- 工具调用信息保存到 `tool_calls`；
- `messages` 只保存会话可见内容。

---

## 7.6 tasks

### 7.6.1 用途

保存智能体任务。

一次用户请求可对应一个任务。

### 7.6.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| conversation_id | TEXT | 是 | - | 所属会话 |
| workspace_id | TEXT | 否 | NULL | 使用的工作区 |
| provider_id | TEXT | 是 | - | 使用的模型配置 |
| user_message_id | TEXT | 否 | NULL | 触发任务的消息 |
| status | TEXT | 是 | `pending` | 任务状态 |
| permission_mode | TEXT | 是 | `chat` | 权限模式 |
| current_round | INTEGER | 是 | 0 | 当前模型轮次 |
| max_rounds | INTEGER | 是 | 20 | 最大模型轮次 |
| tool_call_count | INTEGER | 是 | 0 | 工具调用数量 |
| max_tool_calls | INTEGER | 是 | 30 | 最大工具调用数 |
| failure_count | INTEGER | 是 | 0 | 连续失败数 |
| max_failures | INTEGER | 是 | 3 | 最大失败数 |
| started_at | TEXT | 否 | NULL | 开始时间 |
| completed_at | TEXT | 否 | NULL | 完成时间 |
| stopped_at | TEXT | 否 | NULL | 停止时间 |
| error_code | TEXT | 否 | NULL | 错误代码 |
| error_message | TEXT | 否 | NULL | 错误摘要 |
| created_at | TEXT | 是 | - | 创建时间 |
| updated_at | TEXT | 是 | - | 更新时间 |

### 7.6.3 建表 SQL

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  workspace_id TEXT,
  provider_id TEXT NOT NULL,
  user_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  permission_mode TEXT NOT NULL DEFAULT 'chat',
  current_round INTEGER NOT NULL DEFAULT 0,
  max_rounds INTEGER NOT NULL DEFAULT 20,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  max_tool_calls INTEGER NOT NULL DEFAULT 30,
  failure_count INTEGER NOT NULL DEFAULT 0,
  max_failures INTEGER NOT NULL DEFAULT 3,
  started_at TEXT,
  completed_at TEXT,
  stopped_at TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (provider_id) REFERENCES model_providers(id),
  FOREIGN KEY (user_message_id) REFERENCES messages(id)
);
```

### 7.6.4 status 枚举

```text
pending
running
waiting_permission
executing_tool
completed
failed
stopped
interrupted
```

---

## 7.7 task_steps

### 7.7.1 用途

保存任务步骤，用于右侧任务详情抽屉。

### 7.7.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| task_id | TEXT | 是 | - | 所属任务 |
| step_no | INTEGER | 是 | - | 步骤序号 |
| step_type | TEXT | 是 | - | 步骤类型 |
| title | TEXT | 是 | - | 步骤标题 |
| description | TEXT | 否 | NULL | 步骤描述 |
| status | TEXT | 是 | `pending` | 状态 |
| started_at | TEXT | 否 | NULL | 开始时间 |
| completed_at | TEXT | 否 | NULL | 完成时间 |
| error_message | TEXT | 否 | NULL | 错误摘要 |
| created_at | TEXT | 是 | - | 创建时间 |

### 7.7.3 建表 SQL

```sql
CREATE TABLE task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE (task_id, step_no)
);
```

### 7.7.4 step_type 枚举

```text
analysis
model_request
tool_call
permission
file_change
artifact
final_response
```

### 7.7.5 status 枚举

```text
pending
running
waiting
completed
failed
stopped
```

---

## 7.8 tool_calls

### 7.8.1 用途

保存模型发起的工具调用及执行结果。

### 7.8.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| task_id | TEXT | 是 | - | 所属任务 |
| step_id | TEXT | 否 | NULL | 关联任务步骤 |
| external_call_id | TEXT | 否 | NULL | 模型返回的调用 ID |
| tool_name | TEXT | 是 | - | 工具名称 |
| input_json | TEXT | 是 | `{}` | 输入参数 JSON |
| output_json | TEXT | 否 | NULL | 输出 JSON |
| risk_level | TEXT | 是 | `low` | 风险级别 |
| status | TEXT | 是 | `requested` | 状态 |
| requires_permission | INTEGER | 是 | 0 | 是否需要审批 |
| started_at | TEXT | 否 | NULL | 开始时间 |
| completed_at | TEXT | 否 | NULL | 完成时间 |
| duration_ms | INTEGER | 否 | NULL | 执行耗时 |
| error_code | TEXT | 否 | NULL | 错误代码 |
| error_message | TEXT | 否 | NULL | 错误摘要 |
| created_at | TEXT | 是 | - | 创建时间 |

### 7.8.3 建表 SQL

```sql
CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_id TEXT,
  external_call_id TEXT,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'requested',
  requires_permission INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES task_steps(id) ON DELETE SET NULL
);
```

### 7.8.4 status 枚举

```text
requested
validating
waiting_permission
running
completed
failed
rejected
stopped
```

### 7.8.5 注意事项

- `input_json` 和 `output_json` 必须脱敏；
- 不允许保存 API Key；
- 超大工具输出应截断；
- 文件完整内容不应重复写入日志字段。

---

## 7.9 permission_requests

### 7.9.1 用途

保存高风险操作的权限审批记录。

### 7.9.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| task_id | TEXT | 是 | - | 所属任务 |
| tool_call_id | TEXT | 是 | - | 关联工具调用 |
| permission_type | TEXT | 是 | - | 权限类型 |
| title | TEXT | 是 | - | 审批标题 |
| reason | TEXT | 否 | NULL | 操作原因 |
| target | TEXT | 否 | NULL | 目标文件或命令 |
| impact_summary | TEXT | 否 | NULL | 影响说明 |
| status | TEXT | 是 | `pending` | 审批状态 |
| decision_scope | TEXT | 否 | NULL | 授权范围 |
| requested_at | TEXT | 是 | - | 请求时间 |
| decided_at | TEXT | 否 | NULL | 决策时间 |
| expires_at | TEXT | 否 | NULL | 过期时间 |

### 7.9.3 建表 SQL

```sql
CREATE TABLE permission_requests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  permission_type TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT,
  target TEXT,
  impact_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decision_scope TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  expires_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id) ON DELETE CASCADE
);
```

### 7.9.4 status 枚举

```text
pending
approved
rejected
expired
cancelled
```

### 7.9.5 decision_scope 枚举

```text
once
task
```

V1.0 不支持永久授权。

---

## 7.10 file_changes

### 7.10.1 用途

保存文件修改记录，用于 Diff 和恢复。

### 7.10.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| task_id | TEXT | 是 | - | 所属任务 |
| tool_call_id | TEXT | 否 | NULL | 来源工具调用 |
| workspace_id | TEXT | 是 | - | 所属工作区 |
| relative_path | TEXT | 是 | - | 相对路径 |
| operation | TEXT | 是 | - | 操作类型 |
| backup_path | TEXT | 否 | NULL | 备份路径 |
| before_hash | TEXT | 否 | NULL | 修改前哈希 |
| after_hash | TEXT | 否 | NULL | 修改后哈希 |
| before_size | INTEGER | 否 | NULL | 修改前大小 |
| after_size | INTEGER | 否 | NULL | 修改后大小 |
| diff_summary | TEXT | 否 | NULL | 差异摘要 |
| status | TEXT | 是 | `applied` | 状态 |
| changed_at | TEXT | 是 | - | 修改时间 |
| reverted_at | TEXT | 否 | NULL | 恢复时间 |

### 7.10.3 建表 SQL

```sql
CREATE TABLE file_changes (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tool_call_id TEXT,
  workspace_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  operation TEXT NOT NULL,
  backup_path TEXT,
  before_hash TEXT,
  after_hash TEXT,
  before_size INTEGER,
  after_size INTEGER,
  diff_summary TEXT,
  status TEXT NOT NULL DEFAULT 'applied',
  changed_at TEXT NOT NULL,
  reverted_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
```

### 7.10.4 operation 枚举

```text
create
modify
delete
move
rename
```

### 7.10.5 status 枚举

```text
applied
reverted
conflicted
failed
```

### 7.10.6 注意事项

- 不在数据库保存完整文件内容；
- 完整原文件保存到备份目录；
- 数据库只保存路径、哈希、大小和摘要；
- 恢复前检查当前文件哈希，避免覆盖用户后续修改。

---

## 7.11 artifacts

### 7.11.1 用途

保存由 TieX 生成的 Markdown、DOCX、PPTX 文件信息。

### 7.11.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| task_id | TEXT | 是 | - | 所属任务 |
| workspace_id | TEXT | 否 | NULL | 所属工作区 |
| artifact_type | TEXT | 是 | - | 生成物类型 |
| name | TEXT | 是 | - | 文件名 |
| relative_path | TEXT | 否 | NULL | 工作区相对路径 |
| absolute_path | TEXT | 是 | - | 实际路径 |
| mime_type | TEXT | 否 | NULL | MIME 类型 |
| size_bytes | INTEGER | 是 | 0 | 文件大小 |
| file_hash | TEXT | 否 | NULL | 文件哈希 |
| status | TEXT | 是 | `created` | 状态 |
| created_at | TEXT | 是 | - | 创建时间 |
| deleted_at | TEXT | 否 | NULL | 删除时间 |

### 7.11.3 建表 SQL

```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  workspace_id TEXT,
  artifact_type TEXT NOT NULL,
  name TEXT NOT NULL,
  relative_path TEXT,
  absolute_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
```

### 7.11.4 artifact_type 枚举

```text
markdown
docx
pptx
```

### 7.11.5 status 枚举

```text
created
missing
deleted
```

---

## 7.12 operation_logs

### 7.12.1 用途

保存关键操作日志。

### 7.12.2 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| id | TEXT | 是 | - | 主键 |
| task_id | TEXT | 否 | NULL | 关联任务 |
| conversation_id | TEXT | 否 | NULL | 关联会话 |
| level | TEXT | 是 | `info` | 日志级别 |
| category | TEXT | 是 | - | 日志分类 |
| action | TEXT | 是 | - | 操作名称 |
| message | TEXT | 是 | - | 日志摘要 |
| details_json | TEXT | 否 | NULL | 扩展信息 |
| created_at | TEXT | 是 | - | 创建时间 |

### 7.12.3 建表 SQL

```sql
CREATE TABLE operation_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  conversation_id TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);
```

### 7.12.4 level 枚举

```text
debug
info
warn
error
```

### 7.12.5 category 枚举

```text
app
provider
agent
tool
permission
workspace
file
command
artifact
database
```

### 7.12.6 日志脱敏

必须过滤：

- API Key；
- Authorization；
- Token；
- Cookie；
- 密钥文件内容；
- 完整用户隐私内容；
- 完整文件内容。

---

## 7.13 schema_migrations

### 7.13.1 用途

记录数据库迁移版本。

### 7.13.2 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| version | INTEGER | 是 | 迁移版本 |
| name | TEXT | 是 | 迁移名称 |
| applied_at | TEXT | 是 | 执行时间 |

### 7.13.3 建表 SQL

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

---

# 8. 外键关系

| 主表 | 子表 | 关系 |
|---|---|---|
| model_providers | conversations | 一对多 |
| model_providers | tasks | 一对多 |
| workspaces | conversations | 一对多 |
| workspaces | tasks | 一对多 |
| workspaces | file_changes | 一对多 |
| workspaces | artifacts | 一对多 |
| conversations | messages | 一对多 |
| conversations | tasks | 一对多 |
| tasks | task_steps | 一对多 |
| tasks | tool_calls | 一对多 |
| tasks | permission_requests | 一对多 |
| tasks | file_changes | 一对多 |
| tasks | artifacts | 一对多 |
| tasks | operation_logs | 一对多 |
| tool_calls | permission_requests | 一对一或一对多 |
| tool_calls | file_changes | 一对多 |

---

# 9. 索引设计

## 9.1 conversations

```sql
CREATE INDEX idx_conversations_updated_at
ON conversations(updated_at DESC);

CREATE INDEX idx_conversations_workspace_id
ON conversations(workspace_id);

CREATE INDEX idx_conversations_provider_id
ON conversations(provider_id);
```

## 9.2 messages

```sql
CREATE INDEX idx_messages_conversation_sequence
ON messages(conversation_id, sequence_no);

CREATE INDEX idx_messages_task_id
ON messages(task_id);
```

## 9.3 tasks

```sql
CREATE INDEX idx_tasks_conversation_id
ON tasks(conversation_id);

CREATE INDEX idx_tasks_status
ON tasks(status);

CREATE INDEX idx_tasks_created_at
ON tasks(created_at DESC);
```

## 9.4 task_steps

```sql
CREATE INDEX idx_task_steps_task_no
ON task_steps(task_id, step_no);
```

## 9.5 tool_calls

```sql
CREATE INDEX idx_tool_calls_task_id
ON tool_calls(task_id);

CREATE INDEX idx_tool_calls_status
ON tool_calls(status);
```

## 9.6 permission_requests

```sql
CREATE INDEX idx_permission_requests_task_id
ON permission_requests(task_id);

CREATE INDEX idx_permission_requests_status
ON permission_requests(status);
```

## 9.7 file_changes

```sql
CREATE INDEX idx_file_changes_task_id
ON file_changes(task_id);

CREATE INDEX idx_file_changes_workspace_path
ON file_changes(workspace_id, relative_path);
```

## 9.8 artifacts

```sql
CREATE INDEX idx_artifacts_task_id
ON artifacts(task_id);

CREATE INDEX idx_artifacts_created_at
ON artifacts(created_at DESC);
```

## 9.9 operation_logs

```sql
CREATE INDEX idx_operation_logs_task_id
ON operation_logs(task_id);

CREATE INDEX idx_operation_logs_created_at
ON operation_logs(created_at DESC);

CREATE INDEX idx_operation_logs_category
ON operation_logs(category);
```

---

# 10. 初始化数据

## 10.1 app_settings 默认值

```sql
INSERT INTO app_settings (key, value, value_type, updated_at) VALUES
('theme', 'system', 'string', CURRENT_TIMESTAMP),
('sidebar_collapsed', 'false', 'boolean', CURRENT_TIMESTAMP),
('default_permission_mode', 'read', 'string', CURRENT_TIMESTAMP),
('max_task_steps', '20', 'number', CURRENT_TIMESTAMP),
('max_tool_calls', '30', 'number', CURRENT_TIMESTAMP),
('auto_backup', 'true', 'boolean', CURRENT_TIMESTAMP),
('confirm_before_file_modify', 'true', 'boolean', CURRENT_TIMESTAMP),
('confirm_before_command', 'true', 'boolean', CURRENT_TIMESTAMP),
('allow_workspace_external_access', 'false', 'boolean', CURRENT_TIMESTAMP);
```

## 10.2 默认 DeepSeek 配置

```sql
INSERT INTO model_providers (
  id,
  name,
  provider_type,
  base_url,
  model_name,
  encrypted_api_key,
  timeout_ms,
  stream_enabled,
  is_default,
  is_enabled,
  created_at,
  updated_at
) VALUES (
  'default-deepseek',
  'DeepSeek',
  'deepseek',
  'https://api.deepseek.com',
  'deepseek-chat',
  NULL,
  60000,
  1,
  1,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
```

说明：

- API Key 默认为空；
- 模型名称允许用户修改；
- 不将真实 API Key 写入种子数据。

---

# 11. 事务设计

以下业务必须使用事务。

## 11.1 创建任务

事务内容：

1. 创建用户消息；
2. 创建任务；
3. 创建第一条任务步骤；
4. 更新会话时间。

## 11.2 保存模型回复

事务内容：

1. 保存 assistant 消息；
2. 更新任务轮次；
3. 更新会话最近消息时间；
4. 更新会话标题或更新时间。

## 11.3 工具调用

事务内容：

1. 创建 tool_call；
2. 创建 task_step；
3. 更新任务状态；
4. 写入操作日志。

## 11.4 文件修改

事务内容：

1. 创建 file_change；
2. 更新 tool_call；
3. 更新 task_step；
4. 写入 operation_log。

注意：

文件系统写入无法完全包含在 SQLite 事务中。

建议流程：

```text
先创建备份
→ 写入临时文件
→ 原子替换
→ 数据库事务记录成功
```

如果数据库记录失败：

- 尝试恢复备份；
- 写入错误日志；
- 将任务标记为失败。

## 11.5 权限审批

事务内容：

1. 更新 permission_request；
2. 更新 tool_call；
3. 更新 task；
4. 写入 operation_log。

---

# 12. 数据访问层设计

## 12.1 Repository 划分

```text
repositories/
├── settings.repository.ts
├── provider.repository.ts
├── workspace.repository.ts
├── conversation.repository.ts
├── message.repository.ts
├── task.repository.ts
├── task-step.repository.ts
├── tool-call.repository.ts
├── permission.repository.ts
├── file-change.repository.ts
├── artifact.repository.ts
└── operation-log.repository.ts
```

## 12.2 Repository 原则

- 不在 Vue 组件中写 SQL；
- 不在 Agent Runtime 中直接写 SQL；
- SQL 统一集中管理；
- 所有参数使用预编译语句；
- 禁止字符串拼接 SQL；
- Repository 返回领域对象；
- Service 负责事务和业务流程。

---

# 13. 迁移设计

## 13.1 迁移目录

```text
electron/main/database/migrations/
├── 001_initial_schema.sql
├── 002_add_indexes.sql
└── ...
```

## 13.2 启动迁移流程

```text
应用启动
  ↓
打开数据库
  ↓
读取 schema_migrations
  ↓
按版本执行未执行迁移
  ↓
记录迁移版本
  ↓
进入应用
```

## 13.3 迁移规则

- 每个版本只执行一次；
- 已执行迁移不允许修改；
- 新变更新增迁移文件；
- 迁移失败时阻止应用继续进入主界面；
- 迁移前建议创建数据库备份。

---

# 14. 数据清理策略

## 14.1 会话删除

删除会话时：

- 删除 messages；
- 删除 tasks；
- 级联删除 task_steps；
- 级联删除 tool_calls；
- 级联删除 permission_requests；
- 级联删除 file_changes；
- 级联删除 artifacts 记录；
- 生成文件和备份文件是否删除，需要二次确认。

## 14.2 日志清理

建议默认保留：

- 30 天操作日志；
- 最多 100 MB 日志文件；
- 超出后按时间删除最旧日志。

## 14.3 临时数据

临时目录：

```text
%APPDATA%/TieX/temp/
```

应用启动时清理超过 24 小时的临时文件。

## 14.4 备份清理

建议：

- 保留最近 30 天；
- 用户可手动清理；
- 文件仍有关联未撤销修改时，不自动删除；
- 删除会话时询问是否同时删除备份。

---

# 15. 数据安全

## 15.1 API Key

- 使用 Electron `safeStorage` 加密；
- 保存到 `encrypted_api_key`；
- 不在前端返回明文；
- 不在日志中记录；
- 测试连接时只在主进程解密使用。

## 15.2 文件路径

- 数据库保存路径仅用于本地使用；
- 不上传 TieX 自有服务器；
- UI 展示路径时可进行折叠；
- 日志中避免输出过多个人目录信息。

## 15.3 日志

- 输入参数先脱敏；
- 工具输出截断；
- 不保存完整敏感文件内容；
- 错误堆栈仅存本地。

---

# 16. 数据一致性规则

1. 会话删除时，相关消息和任务必须删除；
2. 任务完成后不得继续新增工具调用；
3. `waiting_permission` 任务必须存在待审批记录；
4. `executing_tool` 任务必须存在运行中的工具调用；
5. 文件恢复后，`file_changes.status` 更新为 `reverted`；
6. 同一模型服务商配置中只有一个 `is_default = 1`；
7. 同一工作区规范化路径不可重复；
8. 同一会话消息序号不可重复；
9. 同一任务步骤序号不可重复；
10. 应用启动时将遗留 `running` 任务标记为 `interrupted`。

---

# 17. 查询场景

## 17.1 最近会话

```sql
SELECT *
FROM conversations
WHERE status = 'active'
ORDER BY is_pinned DESC, updated_at DESC
LIMIT ?;
```

## 17.2 加载会话消息

```sql
SELECT *
FROM messages
WHERE conversation_id = ?
ORDER BY sequence_no ASC;
```

## 17.3 查询当前任务

```sql
SELECT *
FROM tasks
WHERE conversation_id = ?
ORDER BY created_at DESC
LIMIT 1;
```

## 17.4 查询待审批项

```sql
SELECT *
FROM permission_requests
WHERE task_id = ?
  AND status = 'pending'
ORDER BY requested_at ASC;
```

## 17.5 查询文件修改

```sql
SELECT *
FROM file_changes
WHERE task_id = ?
ORDER BY changed_at ASC;
```

## 17.6 查询任务生成物

```sql
SELECT *
FROM artifacts
WHERE task_id = ?
  AND status = 'created'
ORDER BY created_at ASC;
```

---

# 18. 数据库初始化建议

## 18.1 初始化流程

```text
创建 TieX 数据目录
  ↓
创建或打开 tiex.db
  ↓
启用外键
  ↓
设置 WAL
  ↓
设置 busy_timeout
  ↓
执行迁移
  ↓
插入默认设置
  ↓
插入默认 DeepSeek 配置
```

## 18.2 推荐 PRAGMA

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

---

# 19. TypeScript 类型建议

## 19.1 Conversation

```ts
interface Conversation {
  id: string;
  title: string;
  providerId?: string;
  workspaceId?: string;
  permissionMode: "chat" | "read" | "execute";
  status: "active" | "archived";
  isPinned: boolean;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

## 19.2 Message

```ts
interface Message {
  id: string;
  conversationId: string;
  taskId?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  contentType: "text" | "markdown" | "error" | "status";
  sequenceNo: number;
  isStreaming: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## 19.3 Task

```ts
interface Task {
  id: string;
  conversationId: string;
  workspaceId?: string;
  providerId: string;
  status:
    | "pending"
    | "running"
    | "waiting_permission"
    | "executing_tool"
    | "completed"
    | "failed"
    | "stopped"
    | "interrupted";
  permissionMode: "chat" | "read" | "execute";
  currentRound: number;
  maxRounds: number;
  toolCallCount: number;
  maxToolCalls: number;
  failureCount: number;
  maxFailures: number;
  createdAt: string;
  updatedAt: string;
}
```

---

# 20. 测试要点

## 20.1 表结构

- 所有表成功创建；
- 外键生效；
- 唯一索引生效；
- 默认值正确；
- 迁移重复执行不会重复建表。

## 20.2 会话与消息

- 新建会话；
- 自动命名；
- 消息顺序正确；
- 删除会话级联删除消息；
- 流式消息状态正确更新。

## 20.3 任务

- 状态合法转换；
- 应用重启后运行任务标记为 interrupted；
- 最大轮次正确保存；
- 错误信息正确记录。

## 20.4 权限审批

- 待审批记录创建；
- 允许一次；
- 本任务允许；
- 拒绝；
- 过期状态。

## 20.5 文件恢复

- 文件修改记录创建；
- 备份路径保存；
- 哈希冲突检测；
- 恢复后状态更新。

## 20.6 安全

- API Key 不明文保存；
- 日志脱敏；
- SQL 参数化；
- 路径数据不用于绕过工作区校验。

---

# 21. V1.0 数据库验收标准

数据库实现应满足：

1. 应用首次启动自动创建数据库；
2. 自动执行迁移；
3. 默认 DeepSeek 配置自动创建；
4. API Key 加密保存；
5. 会话和消息可以持久化；
6. 任务和步骤可以持久化；
7. 工具调用可以追踪；
8. 权限审批有完整记录；
9. 文件修改可关联任务和工具；
10. 生成物可查询；
11. 应用异常退出后任务可标记为 interrupted；
12. 会话删除能正确处理关联数据；
13. 所有 SQL 使用参数化查询；
14. 启用 SQLite 外键；
15. 日志不保存敏感信息。

---

# 22. 后续扩展方向

未来可增加：

- `attachments`：会话附件；
- `agent_profiles`：自定义智能体配置；
- `mcp_servers`：MCP 服务配置；
- `automations`：自动化任务；
- `git_changes`：Git 修改记录；
- `remote_tasks`：远程任务；
- `usage_statistics`：模型调用统计；
- `prompt_templates`：提示词模板。

以上不进入 V1.0。

---

# 23. 总结

TieX V1.0 使用 SQLite 作为本地数据存储。

数据库围绕以下核心链路设计：

```text
会话
→ 消息
→ 任务
→ 任务步骤
→ 工具调用
→ 权限审批
→ 文件修改 / 生成物
→ 操作日志
```

设计重点是：

- 本地优先；
- 任务全过程可追踪；
- 权限审批可审计；
- 文件修改可恢复；
- 模型配置可扩展；
- 不将所有数据粗暴塞进 JSON；
- 不提前引入 V1.0 不需要的复杂模块。
