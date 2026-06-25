# TieX 技术架构与概要设计

> 产品名称：TieX  
> 文档类型：技术架构与概要设计  
> 对应版本：V1.0 MVP  
> 产品形态：Windows 桌面 AI 智能体工作台  
> 核心技术：Electron + Vue 3 + TypeScript + SQLite + DeepSeek API

---

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | TieX 技术架构与概要设计 |
| 产品名称 | TieX |
| 对应版本 | V1.0 MVP |
| 目标平台 | Windows 11 |
| 文档状态 | 初稿 |
| 主要读者 | 开发者、Trae、Codex、测试人员 |
| 关联文档 | TieX-PRD.md、TieX-原型设计说明.md、TieX-Prototype.html |

---

## 2. 文档目的

本文档用于说明 TieX V1.0 的整体技术架构、模块划分、进程职责、数据流、接口边界、安全边界和关键技术方案。

本文档重点解决以下问题：

1. TieX 使用什么技术栈；
2. Electron 主进程、Preload 和 Vue 渲染进程分别负责什么；
3. DeepSeek API 如何接入；
4. Agent Runtime 如何运行；
5. 工具如何注册、调用和校验；
6. 工作区受限沙箱如何实现；
7. SQLite 保存哪些数据；
8. 文件修改、权限审批和撤销如何串联；
9. 任务如何启动、暂停、停止和恢复；
10. V1.0 各模块的开发边界是什么。

---

## 3. 系统范围

### 3.1 V1.0 建设范围

TieX V1.0 包含：

- Windows 桌面应用；
- DeepSeek API 配置；
- 多轮聊天；
- 本地会话记录；
- 本地工作区选择；
- 文件读取与搜索；
- Agent Tool Calls；
- 文件创建与修改；
- 权限审批；
- 文件备份与恢复；
- Markdown、DOCX、PPTX 生成；
- 基础受限命令执行；
- 操作日志；
- 深浅色主题。

### 3.2 V1.0 不建设内容

- 用户注册与登录；
- 云端服务器；
- 云同步；
- 多用户协作；
- 插件系统；
- MCP；
- 自动化定时任务；
- 多智能体并行；
- 浏览器控制；
- 屏幕识别；
- 系统级鼠标键盘操作；
- 远程容器；
- 完整虚拟机沙箱；
- 移动端。

---

## 4. 架构设计目标

### 4.1 安全性

- 渲染进程不直接拥有 Node.js 权限；
- 文件系统、数据库、命令和 API Key 仅由主进程访问；
- 所有文件路径必须经过工作区边界校验；
- 所有工具参数必须经过 Schema 校验；
- 高风险操作必须经过用户审批；
- 文件修改必须可追踪和恢复；
- API Key 不以明文保存。

### 4.2 可维护性

- UI、业务状态、Agent Runtime、工具和本地服务分层；
- 各工具独立实现；
- 模型接入通过统一 Provider 接口；
- IPC 通道统一定义；
- 数据访问集中封装；
- 不在 Vue 组件中直接编写系统级业务。

### 4.3 可扩展性

虽然 V1.0 只接入 DeepSeek，但架构应允许后续增加：

- OpenAI 兼容模型；
- 本地模型；
- 自定义工具；
- Git 能力；
- Docker 或 Windows Sandbox；
- 多智能体；
- MCP。

V1.0 不提前实现这些功能，只保留合理接口。

### 4.4 稳定性

- 模型请求支持取消和超时；
- 工具调用支持失败处理；
- 子进程支持终止；
- 任务执行有最大步数限制；
- 应用退出时清理任务和进程；
- 数据库写入采用事务；
- 关键操作记录日志。

---

## 5. 技术栈

### 5.1 桌面应用

| 技术 | 用途 |
|---|---|
| Electron | Windows 桌面应用外壳 |
| Vue 3 | 渲染进程 UI |
| TypeScript | 类型约束 |
| Vite | 前端构建 |
| Pinia | 前端状态管理 |
| Vue Router | 页面路由 |
| Lucide Icons | 图标 |
| CSS Variables | 主题和视觉变量 |

### 5.2 本地能力

| 技术 | 用途 |
|---|---|
| Electron Main Process | 系统能力与业务核心 |
| Electron Preload | 安全暴露 IPC |
| SQLite | 本地数据存储 |
| better-sqlite3 或 sqlite3 | SQLite 驱动 |
| Electron safeStorage | API Key 加密 |
| Node.js fs/path | 文件操作 |
| child_process | 受限命令执行 |
| AbortController | 请求取消 |

### 5.3 内容处理

| 技术 | 用途 |
|---|---|
| markdown-it | Markdown 渲染 |
| Shiki | 代码高亮 |
| Monaco Editor 或 Diff2Html | 文件差异展示 |
| docx | DOCX 生成 |
| PptxGenJS | PPTX 生成 |

### 5.4 打包与分发

| 技术 | 用途 |
|---|---|
| electron-builder | 桌面应用打包 |
| NSIS | Windows 安装包 |
| ESLint | 代码检查 |
| Prettier | 代码格式化 |
| Vitest | 单元测试 |
| Playwright | 核心 UI / E2E 测试 |

---

## 6. 总体架构

```text
┌────────────────────────────────────────────────────┐
│                Renderer Process                    │
│                                                    │
│ Vue 3 / Pinia / Router / Components                │
│ 首页、会话、任务状态、设置、审批、Diff、抽屉         │
└──────────────────────┬─────────────────────────────┘
                       │ window.tiex API
┌──────────────────────▼─────────────────────────────┐
│                  Preload Layer                     │
│                                                    │
│ contextBridge + IPC 白名单 + 参数基础校验            │
└──────────────────────┬─────────────────────────────┘
                       │ ipcRenderer / ipcMain
┌──────────────────────▼─────────────────────────────┐
│                 Electron Main Process              │
│                                                    │
│ ┌──────────────┐  ┌──────────────┐                │
│ │ App Service  │  │ IPC Router   │                │
│ └──────────────┘  └──────────────┘                │
│                                                    │
│ ┌──────────────┐  ┌──────────────┐                │
│ │ Agent Runtime│  │ Provider Hub │                │
│ └──────────────┘  └──────────────┘                │
│                                                    │
│ ┌──────────────┐  ┌──────────────┐                │
│ │ Tool Registry│  │ Permission   │                │
│ └──────────────┘  └──────────────┘                │
│                                                    │
│ ┌──────────────┐  ┌──────────────┐                │
│ │ Workspace    │  │ Command      │                │
│ │ Sandbox      │  │ Runner       │                │
│ └──────────────┘  └──────────────┘                │
│                                                    │
│ ┌──────────────┐  ┌──────────────┐                │
│ │ Artifact     │  │ Backup       │                │
│ │ Generator    │  │ Service      │                │
│ └──────────────┘  └──────────────┘                │
│                                                    │
│ ┌──────────────┐  ┌──────────────┐                │
│ │ SQLite       │  │ Log Service  │                │
│ └──────────────┘  └──────────────┘                │
└───────────────┬───────────┬───────────┬────────────┘
                │           │           │
          DeepSeek API   File System  Child Process
```

---

## 7. 进程划分

## 7.1 Electron 主进程

主进程是 TieX 的核心业务与安全边界。

负责：

- 创建和管理窗口；
- 处理应用生命周期；
- 保存和读取 SQLite；
- 调用 DeepSeek API；
- 运行 Agent Runtime；
- 注册和执行工具；
- 访问文件系统；
- 执行受限命令；
- 保存 API Key；
- 权限审批；
- 文件备份；
- 生成 DOCX 和 PPTX；
- 写入日志；
- 清理子进程。

主进程不得直接包含 UI 代码。

## 7.2 Preload

Preload 只负责向渲染进程暴露有限、安全、可类型化的 API。

负责：

- 使用 `contextBridge` 暴露接口；
- 调用白名单 IPC；
- 接收主进程事件；
- 进行基础参数检查；
- 隐藏 Electron 和 Node.js 原始对象。

Preload 不负责：

- 业务逻辑；
- 数据库操作；
- 文件读取；
- 命令执行；
- 保存 API Key。

## 7.3 渲染进程

渲染进程负责界面和用户交互。

负责：

- 页面展示；
- 会话展示；
- 任务状态展示；
- 用户输入；
- 权限审批交互；
- 文件 Diff 展示；
- 设置表单；
- 深浅色主题；
- 前端状态管理。

渲染进程不得：

- 直接调用 `fs`；
- 直接调用 `child_process`；
- 直接连接 SQLite；
- 直接读取加密 API Key；
- 直接执行工具。

---

## 8. 分层设计

### 8.1 表现层

位于 Renderer。

主要组件：

- `AppLayout`
- `AppSidebar`
- `AppTopbar`
- `HomeView`
- `ConversationView`
- `SettingsView`
- `ChatComposer`
- `MessageList`
- `ToolCallCard`
- `PermissionDialog`
- `TaskDrawer`
- `DiffViewer`
- `ArtifactCard`

### 8.2 应用服务层

位于 Main Process。

主要服务：

- `ConversationService`
- `TaskService`
- `WorkspaceService`
- `SettingsService`
- `ProviderService`
- `PermissionService`
- `ArtifactService`
- `BackupService`
- `CommandService`

应用服务负责组织业务流程，不直接承担底层文件和数据库细节。

### 8.3 领域核心层

核心模块：

- Agent Runtime；
- Tool Registry；
- Permission Engine；
- Workspace Sandbox；
- Task State Machine。

### 8.4 基础设施层

包括：

- SQLite Repository；
- DeepSeek Provider；
- File System Adapter；
- Command Runner；
- DOCX Generator；
- PPTX Generator；
- Safe Storage；
- Log Service。

---

## 9. 前端页面与组件设计

### 9.1 页面

```text
/
├── /home
├── /conversation/:id
└── /settings
```

### 9.2 Pinia Store

建议：

```text
stores/
├── app.store.ts
├── conversation.store.ts
├── task.store.ts
├── workspace.store.ts
├── settings.store.ts
└── ui.store.ts
```

#### app.store

保存：

- 应用初始化状态；
- 当前主题；
- 当前页面；
- 全局错误。

#### conversation.store

保存：

- 当前会话；
- 会话列表；
- 消息列表；
- 流式回复状态。

#### task.store

保存：

- 当前任务；
- 工具调用；
- 等待审批项；
- 任务步骤；
- 任务错误。

#### workspace.store

保存：

- 当前工作区；
- 工作区列表；
- 文件树；
- 最近访问。

#### settings.store

保存：

- 模型配置；
- 权限设置；
- 外观设置；
- 数据设置。

#### ui.store

保存：

- 侧边栏状态；
- 右侧抽屉状态；
- 弹窗状态；
- Toast。

---

## 10. IPC 设计

### 10.1 设计原则

- IPC 名称统一；
- 请求和响应均定义 TypeScript 类型；
- 渲染进程不传递任意函数；
- 主进程再次校验所有参数；
- 流式事件使用独立事件通道；
- 不暴露原始 Electron API。

### 10.2 IPC 命名规范

```text
模块:动作
```

示例：

```text
conversation:list
conversation:create
conversation:delete

workspace:select
workspace:list
workspace:read-tree

task:start
task:stop
task:approve
task:reject

settings:get
settings:update
settings:test-provider
```

### 10.3 Preload 暴露接口

示例：

```ts
interface TieXDesktopAPI {
  conversation: {
    list(): Promise<ConversationSummary[]>;
    create(input: CreateConversationInput): Promise<Conversation>;
    remove(id: string): Promise<void>;
  };

  workspace: {
    select(): Promise<Workspace | null>;
    list(): Promise<Workspace[]>;
    getTree(workspaceId: string): Promise<FileNode[]>;
  };

  task: {
    start(input: StartTaskInput): Promise<Task>;
    stop(taskId: string): Promise<void>;
    approve(input: ApprovePermissionInput): Promise<void>;
    reject(requestId: string): Promise<void>;
    onEvent(callback: (event: TaskEvent) => void): () => void;
  };

  settings: {
    get(): Promise<AppSettings>;
    update(input: UpdateSettingsInput): Promise<void>;
    testProvider(input: ProviderTestInput): Promise<ProviderTestResult>;
  };
}
```

### 10.4 事件类型

主进程向渲染进程推送：

- `task.started`
- `task.status_changed`
- `message.delta`
- `message.completed`
- `tool.requested`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `permission.required`
- `file.changed`
- `artifact.created`
- `task.completed`
- `task.failed`
- `task.stopped`

---

## 11. DeepSeek Provider 设计

### 11.1 Provider 抽象

虽然 V1.0 只接入 DeepSeek，但模型调用应通过统一接口。

```ts
interface ModelProvider {
  testConnection(config: ProviderConfig): Promise<ProviderTestResult>;

  streamChat(
    request: ModelRequest,
    signal: AbortSignal
  ): AsyncIterable<ModelStreamEvent>;
}
```

### 11.2 ProviderConfig

```ts
interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  encryptedApiKey: Buffer;
  temperature?: number;
  maxTokens?: number;
  timeoutMs: number;
}
```

### 11.3 模型请求内容

请求包含：

- 系统提示词；
- 对话消息；
- 当前工作区摘要；
- 工具定义；
- 当前权限模式；
- 当前任务限制；
- 工具调用历史。

### 11.4 请求取消

每个任务创建独立的 `AbortController`。

当用户停止任务或关闭应用时：

```text
AbortController.abort()
```

并停止后续工具执行。

### 11.5 错误分类

建议统一错误类型：

- `PROVIDER_AUTH_ERROR`
- `PROVIDER_RATE_LIMIT`
- `PROVIDER_BALANCE_ERROR`
- `PROVIDER_TIMEOUT`
- `PROVIDER_NETWORK_ERROR`
- `PROVIDER_RESPONSE_INVALID`
- `PROVIDER_TOOL_CALL_INVALID`

---

## 12. Agent Runtime 设计

### 12.1 核心职责

Agent Runtime 负责：

1. 接收用户任务；
2. 构建上下文；
3. 调用模型；
4. 解析模型输出；
5. 处理 Tool Calls；
6. 校验工具参数；
7. 判断权限；
8. 等待用户审批；
9. 执行工具；
10. 回传工具结果；
11. 继续任务循环；
12. 完成、失败或停止任务。

### 12.2 Agent Loop

```text
创建任务
  ↓
构建上下文
  ↓
请求模型
  ↓
模型返回
  ├─ 普通文本
  ├─ Tool Call
  └─ 非法结果
  ↓
Tool Call 参数校验
  ↓
权限判断
  ├─ 自动允许
  ├─ 等待审批
  └─ 拒绝执行
  ↓
执行工具
  ↓
保存工具结果
  ↓
回传模型
  ↓
是否继续
  ├─ 是：进入下一轮
  └─ 否：完成任务
```

### 12.3 任务限制

每个任务拥有：

```ts
interface TaskLimits {
  maxModelRounds: number;
  maxToolCalls: number;
  maxFailures: number;
  maxDurationMs: number;
  maxFilesRead: number;
  maxFileSizeBytes: number;
  maxChangedFiles: number;
}
```

### 12.4 停止条件

- 模型输出最终答案；
- 达到最大模型轮数；
- 达到最大工具调用次数；
- 连续失败超过上限；
- 用户停止；
- 应用退出；
- 请求超时；
- 权限被拒绝且无法继续；
- 出现不可恢复错误。

### 12.5 上下文控制

Agent Runtime 不应把整个工作区一次性发送给模型。

采用：

- 用户消息；
- 最近会话；
- 当前任务步骤；
- 必要文件片段；
- 工具执行结果；
- 文件摘要。

超长内容需要截断或摘要。

---

## 13. Tool Registry 设计

### 13.1 工具接口

```ts
interface AgentTool<TInput, TOutput> {
  name: string;
  description: string;
  schema: JSONSchema;
  minimumPermission: PermissionMode;
  riskLevel: ToolRiskLevel;

  validate(input: unknown): TInput;
  execute(
    context: ToolExecutionContext,
    input: TInput
  ): Promise<TOutput>;
}
```

### 13.2 V1.0 工具

- `list_files`
- `read_file`
- `search_files`
- `create_file`
- `edit_file`
- `create_markdown`
- `create_docx`
- `create_pptx`
- `run_command`

### 13.3 风险级别

```text
LOW
MEDIUM
HIGH
BLOCKED
```

#### LOW

- 查看目录；
- 读取文本文件；
- 搜索内容。

#### MEDIUM

- 创建新文件；
- 生成 Markdown；
- 生成新 DOCX；
- 生成新 PPTX。

#### HIGH

- 覆盖文件；
- 修改已有文件；
- 删除、移动、批量重命名；
- 执行命令；
- 安装依赖；
- 联网操作。

#### BLOCKED

- 工作区外文件访问；
- 管理员操作；
- 修改注册表；
- 格式化磁盘；
- 删除系统目录；
- 隐藏或编码的危险命令。

### 13.4 工具执行上下文

```ts
interface ToolExecutionContext {
  taskId: string;
  conversationId: string;
  workspaceId?: string;
  workspaceRoot?: string;
  permissionMode: PermissionMode;
  abortSignal: AbortSignal;
  logger: TaskLogger;
}
```

---

## 14. 工作区受限沙箱设计

### 14.1 安全边界

工作区受限沙箱由以下部分组成：

- 工作区根目录；
- 路径解析器；
- 符号链接检查；
- 工具白名单；
- 文件类型限制；
- 文件大小限制；
- 权限审批；
- 操作日志；
- 文件备份；
- 命令限制。

### 14.2 路径解析流程

```text
接收相对路径
  ↓
拒绝空路径和非法字符
  ↓
拒绝绝对路径
  ↓
拒绝 UNC 网络路径
  ↓
path.resolve(workspaceRoot, relativePath)
  ↓
获取真实路径 realpath
  ↓
检查真实路径是否仍在工作区内
  ↓
检查符号链接绕过
  ↓
允许访问
```

### 14.3 路径判断

禁止仅使用简单字符串前缀判断。

必须：

- 对根目录和目标路径进行规范化；
- 使用 `path.relative` 判断；
- 拒绝结果以 `..` 开头；
- 拒绝绝对结果；
- 检查真实路径；
- 对不存在的新文件校验其父目录真实路径。

### 14.4 文件读取限制

- 默认仅读取文本文件；
- 单文件大小设定上限；
- 超大文件分段读取；
- 二进制文件默认拒绝；
- 敏感文件名可配置拒绝；
- 不读取工作区外链接目标。

### 14.5 文件写入限制

- 新文件必须写入工作区；
- 覆盖已有文件前审批；
- 修改前备份；
- 写入采用临时文件 + 原子替换；
- 写入完成后计算哈希；
- 记录任务和工具来源。

---

## 15. 权限模型

### 15.1 权限模式

```ts
type PermissionMode =
  | "chat"
  | "read"
  | "execute";
```

### 15.2 仅对话模式

允许：

- 普通模型对话；
- 使用用户主动添加的附件；
- 生成文本。

禁止：

- 浏览工作区；
- 调用文件工具；
- 执行命令。

### 15.3 读取模式

允许：

- `list_files`
- `read_file`
- `search_files`

禁止：

- 写入；
- 修改；
- 删除；
- 命令执行。

### 15.4 执行模式

允许执行写入和命令工具，但高风险操作仍需审批。

### 15.5 权限审批状态

```text
PENDING
APPROVED_ONCE
APPROVED_FOR_TASK
REJECTED
EXPIRED
```

### 15.6 审批流程

```text
工具请求
  ↓
权限引擎评估
  ├─ 自动允许
  ├─ 自动拒绝
  └─ 请求审批
          ↓
      UI 展示
          ↓
      用户选择
          ├─ 允许一次
          ├─ 本任务允许
          └─ 拒绝
```

---

## 16. 文件修改与恢复设计

### 16.1 修改流程

```text
生成修改内容
  ↓
校验路径
  ↓
读取原文件
  ↓
创建备份
  ↓
计算 Diff
  ↓
请求审批
  ↓
写入临时文件
  ↓
替换原文件
  ↓
记录 file_change
  ↓
通知渲染进程
```

### 16.2 备份目录

建议：

```text
%APPDATA%/TieX/backups/{taskId}/
```

备份文件应保持相对目录结构。

### 16.3 FileChange

```ts
interface FileChange {
  id: string;
  taskId: string;
  workspaceId: string;
  relativePath: string;
  operation: "create" | "modify" | "delete" | "move";
  backupPath?: string;
  beforeHash?: string;
  afterHash?: string;
  createdAt: string;
  revertedAt?: string;
}
```

### 16.4 恢复

恢复时：

- 检查目标文件当前哈希；
- 如果文件已被用户再次修改，提示冲突；
- 用户确认后再覆盖；
- 记录恢复日志；
- 更新 `revertedAt`。

---

## 17. 命令执行设计

### 17.1 V1.0 定位

V1.0 仅提供受限命令执行，不提供完整终端。

### 17.2 CommandRequest

```ts
interface CommandRequest {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}
```

推荐使用命令和参数分离方式，避免直接拼接 Shell 字符串。

### 17.3 执行规则

- `cwd` 必须为当前工作区；
- 默认不启用 `shell: true`；
- 命令必须审批；
- 限制执行时长；
- 限制输出长度；
- 支持终止进程树；
- 不继承全部系统环境变量；
- 禁止管理员权限；
- 禁止长期交互式命令。

### 17.4 初期允许的命令类别

可配置允许：

- `npm test`
- `npm run build`
- `npm run lint`
- `git status`
- `git diff`
- `node`
- 项目已有脚本

安装依赖仍需单独审批。

### 17.5 禁止内容

- `rm -rf`
- `del /s`
- `format`
- `shutdown`
- `reg`
- `net user`
- `powershell -EncodedCommand`
- 修改工作区外文件的命令
- 下载并直接执行未知文件

---

## 18. 文档与 PPT 生成设计

### 18.1 Artifact 统一模型

```ts
interface Artifact {
  id: string;
  taskId: string;
  type: "markdown" | "docx" | "pptx";
  name: string;
  relativePath: string;
  size: number;
  createdAt: string;
}
```

### 18.2 Markdown

由模型生成文本内容，工具负责：

- 校验文件名；
- 写入工作区或 artifacts；
- 防止覆盖；
- 返回文件信息。

### 18.3 DOCX

模型先输出结构化文档：

```ts
interface DocumentSpec {
  title: string;
  sections: DocumentSection[];
  metadata?: Record<string, string>;
}
```

生成器负责：

- 标题层级；
- 正文；
- 列表；
- 表格；
- 页码；
- 基础样式。

### 18.4 PPTX

模型先输出结构化演示：

```ts
interface PresentationSpec {
  title: string;
  subtitle?: string;
  slides: SlideSpec[];
}
```

每页使用预设版式，不允许模型直接控制任意坐标。

### 18.5 生成位置

默认生成到：

```text
工作区/.tiex/artifacts/
```

如果用户未选择工作区，则保存到：

```text
%APPDATA%/TieX/artifacts/
```

---

## 19. 数据库概要设计

### 19.1 数据库

使用 SQLite。

数据库文件：

```text
%APPDATA%/TieX/tiex.db
```

### 19.2 主要表

```text
app_settings
model_providers
workspaces
conversations
messages
tasks
task_steps
tool_calls
permission_requests
file_changes
artifacts
operation_logs
```

### 19.3 Repository 模式

建议：

```text
repositories/
├── settings.repository.ts
├── provider.repository.ts
├── workspace.repository.ts
├── conversation.repository.ts
├── message.repository.ts
├── task.repository.ts
├── tool-call.repository.ts
├── permission.repository.ts
├── file-change.repository.ts
└── artifact.repository.ts
```

UI 和 Agent Runtime 不直接执行 SQL。

### 19.4 事务

以下操作使用事务：

- 创建任务与初始步骤；
- 保存模型消息与工具调用；
- 文件修改与 file_change 记录；
- 权限审批更新；
- 撤销修改；
- 删除会话及关联记录。

---

## 20. 日志设计

### 20.1 日志分类

- 应用日志；
- 模型请求日志；
- Agent 任务日志；
- 工具执行日志；
- 权限审批日志；
- 命令执行日志；
- 文件修改日志；
- 错误日志。

### 20.2 日志脱敏

必须过滤：

- API Key；
- Authorization Header；
- Cookie；
- Token；
- 用户配置的敏感字段；
- 文件中的疑似密钥内容。

### 20.3 日志保存

建议：

```text
%APPDATA%/TieX/logs/
```

按日期滚动，限制文件数量和总大小。

---

## 21. 应用生命周期

### 21.1 启动流程

```text
应用启动
  ↓
创建数据目录
  ↓
初始化日志
  ↓
初始化 SQLite
  ↓
执行数据库迁移
  ↓
读取设置
  ↓
注册 IPC
  ↓
创建主窗口
  ↓
恢复最近会话摘要
```

### 21.2 退出流程

```text
收到退出事件
  ↓
停止模型请求
  ↓
停止 Agent 任务
  ↓
终止子进程
  ↓
保存任务状态
  ↓
关闭数据库
  ↓
退出应用
```

### 21.3 异常退出

下次启动时：

- 查询状态为 `RUNNING` 的任务；
- 标记为 `INTERRUPTED`；
- 提示用户上次任务被中断；
- 不自动继续执行。

---

## 22. 状态机设计

### 22.1 TaskStatus

```text
PENDING
RUNNING
WAITING_PERMISSION
EXECUTING_TOOL
COMPLETED
FAILED
STOPPED
INTERRUPTED
```

### 22.2 状态转换

```text
PENDING → RUNNING
RUNNING → WAITING_PERMISSION
RUNNING → EXECUTING_TOOL
RUNNING → COMPLETED
RUNNING → FAILED
RUNNING → STOPPED

WAITING_PERMISSION → EXECUTING_TOOL
WAITING_PERMISSION → RUNNING
WAITING_PERMISSION → STOPPED

EXECUTING_TOOL → RUNNING
EXECUTING_TOOL → FAILED
EXECUTING_TOOL → STOPPED
```

非法状态转换必须拒绝并记录日志。

---

## 23. 目录结构建议

```text
TieX/
├── README.md
├── package.json
├── electron-builder.yml
├── docs/
│   ├── TieX-PRD.md
│   ├── TieX-原型设计说明.md
│   └── TieX-技术架构与概要设计.md
├── prototype/
│   └── TieX-Prototype.html
├── electron/
│   ├── main/
│   │   ├── index.ts
│   │   ├── app/
│   │   │   ├── lifecycle.ts
│   │   │   └── window.ts
│   │   ├── ipc/
│   │   │   ├── conversation.ipc.ts
│   │   │   ├── workspace.ipc.ts
│   │   │   ├── task.ipc.ts
│   │   │   └── settings.ipc.ts
│   │   ├── agent/
│   │   │   ├── agent-runtime.ts
│   │   │   ├── context-builder.ts
│   │   │   ├── task-state.ts
│   │   │   └── task-controller.ts
│   │   ├── providers/
│   │   │   ├── model-provider.ts
│   │   │   └── deepseek-provider.ts
│   │   ├── tools/
│   │   │   ├── tool-registry.ts
│   │   │   ├── list-files.tool.ts
│   │   │   ├── read-file.tool.ts
│   │   │   ├── search-files.tool.ts
│   │   │   ├── create-file.tool.ts
│   │   │   ├── edit-file.tool.ts
│   │   │   ├── create-markdown.tool.ts
│   │   │   ├── create-docx.tool.ts
│   │   │   ├── create-pptx.tool.ts
│   │   │   └── run-command.tool.ts
│   │   ├── services/
│   │   │   ├── conversation.service.ts
│   │   │   ├── workspace.service.ts
│   │   │   ├── permission.service.ts
│   │   │   ├── backup.service.ts
│   │   │   ├── artifact.service.ts
│   │   │   ├── command.service.ts
│   │   │   └── settings.service.ts
│   │   ├── security/
│   │   │   ├── path-guard.ts
│   │   │   ├── command-policy.ts
│   │   │   ├── secret-filter.ts
│   │   │   └── schema-validator.ts
│   │   ├── database/
│   │   │   ├── database.ts
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   └── shared/
│   │       ├── errors.ts
│   │       └── constants.ts
│   ├── preload/
│   │   ├── index.ts
│   │   └── api.ts
│   └── shared/
│       ├── ipc.ts
│       ├── types.ts
│       ├── task.ts
│       └── tools.ts
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── router/
│   ├── stores/
│   ├── views/
│   ├── components/
│   ├── composables/
│   ├── styles/
│   └── types/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── resources/
    ├── icons/
    └── templates/
```

---

## 24. 错误处理

### 24.1 统一错误结构

```ts
interface AppError {
  code: string;
  message: string;
  userMessage: string;
  details?: unknown;
  recoverable: boolean;
}
```

### 24.2 错误分类

- 配置错误；
- API 错误；
- 数据库错误；
- 文件错误；
- 权限错误；
- 路径安全错误；
- 工具参数错误；
- 命令错误；
- 任务超时；
- 用户取消。

### 24.3 用户提示

界面提示需要包含：

- 出错步骤；
- 是否产生修改；
- 是否可重试；
- 是否需要重新配置；
- 是否可撤销。

不向普通用户直接显示完整堆栈。

---

## 25. 性能设计

### 25.1 UI

- 大量消息使用虚拟列表；
- 流式文本节流更新；
- 文件树按需加载；
- Diff 超长时分页或折叠；
- 右侧抽屉按需渲染。

### 25.2 文件

- 文件分段读取；
- 限制最大文件大小；
- 搜索支持数量上限；
- 不扫描 `.git`、`node_modules`、构建目录等默认忽略目录。

### 25.3 数据库

- 常用字段加索引；
- 消息分页加载；
- 日志定期清理；
- 避免每个流式 token 都写数据库。

---

## 26. 安全要求

### 26.1 Electron

必须设置：

```ts
contextIsolation: true
nodeIntegration: false
sandbox: true
```

同时：

- 禁止任意导航；
- 禁止打开未知窗口；
- 限制外部链接；
- 配置 CSP；
- 不加载远程页面作为主界面。

### 26.2 IPC

- 所有 IPC 参数再次校验；
- 不提供通用 `execute` 接口；
- 不暴露文件系统原始能力；
- 不允许渲染进程自定义命令执行；
- 事件监听支持注销。

### 26.3 模型输出

模型输出始终视为不可信输入。

必须：

- 校验工具名称；
- 校验参数；
- 校验路径；
- 校验权限；
- 校验命令；
- 限制执行次数；
- 记录结果。

---

## 27. 测试概要

### 27.1 单元测试

重点测试：

- 路径边界；
- 符号链接绕过；
- 工具 Schema 校验；
- 权限判断；
- Task 状态机；
- 命令策略；
- API Key 脱敏；
- 文件恢复。

### 27.2 集成测试

重点测试：

- Renderer → Preload → Main；
- Agent → Tool → Result；
- 权限审批流程；
- 文件备份和恢复；
- DeepSeek Mock；
- SQLite 事务。

### 27.3 E2E

重点流程：

1. 配置 DeepSeek；
2. 新建会话；
3. 选择工作区；
4. 读取项目；
5. 请求文件修改；
6. 用户审批；
7. 查看 Diff；
8. 恢复文件；
9. 停止任务。

---

## 28. 开发阶段建议

### 阶段一：基础应用

- Electron + Vue 3；
- 主窗口；
- 原型界面；
- 路由；
- Pinia；
- SQLite 初始化；
- 设置保存。

### 阶段二：DeepSeek 聊天

- Provider；
- API Key safeStorage；
- 流式消息；
- 会话保存；
- 停止请求。

### 阶段三：工作区读取

- 文件夹选择；
- 工作区表；
- 路径校验；
- 文件树；
- 读取工具；
- 搜索工具。

### 阶段四：Agent Runtime

- Tool Calls；
- 工具注册；
- Task 状态机；
- 事件推送；
- 最大步骤限制。

### 阶段五：权限与文件修改

- 审批；
- 备份；
- 编辑工具；
- Diff；
- 恢复。

### 阶段六：Artifact

- Markdown；
- DOCX；
- PPTX；
- 生成物卡片。

### 阶段七：受限命令

- Command Runner；
- 命令审批；
- 超时；
- 终止；
- 输出限制。

---

## 29. 关键技术决策

### 29.1 使用 Electron

原因：

- 与 Vue 和 Node.js 技术栈一致；
- 方便访问文件和子进程；
- 方便使用 docx、PptxGenJS；
- 适合快速实现 Windows 桌面工具。

### 29.2 不建设后端服务器

原因：

- TieX V1.0 仅个人使用；
- 数据本地保存；
- 用户直接配置 DeepSeek API；
- 降低部署和隐私复杂度。

### 29.3 Agent Runtime 位于主进程

原因：

- 需要访问工具、数据库和本地文件；
- 便于统一权限控制；
- 避免渲染进程拥有系统权限。

后续若任务复杂，可迁移到 Worker Thread 或独立 Utility Process。

### 29.4 V1.0 使用应用层沙箱

V1.0 不使用完整虚拟机或容器。

通过：

- 工作区限制；
- 路径校验；
- 工具白名单；
- 权限审批；
- 命令限制；
- 文件备份；

建立基础安全边界。

### 29.5 文档和 PPT 使用结构化规格

不允许模型直接控制任意排版代码。

模型只输出 `DocumentSpec` 或 `PresentationSpec`，由固定生成器负责输出文件。

---

## 30. 风险与应对

| 风险 | 应对 |
|---|---|
| DeepSeek Tool Calls 不稳定 | 参数 Schema、失败重试、最大次数 |
| 模型尝试访问工作区外 | 路径守卫强制拒绝 |
| 模型生成危险命令 | 命令策略 + 人工审批 |
| 文件修改错误 | 自动备份 + Diff + 恢复 |
| 上下文过长 | 文件分段、摘要、限制读取 |
| 流式响应卡顿 | 节流 UI 更新 |
| 任务失控循环 | 最大轮数、最大工具次数、超时 |
| 应用退出遗留进程 | 统一 TaskController 清理 |
| API Key 泄露 | safeStorage + 日志脱敏 |
| Trae 擅自新增功能 | 以 PRD 和本文档为范围边界 |

---

## 31. 概要验收标准

技术架构实现应满足：

1. Renderer 无直接 Node.js 权限；
2. 所有系统能力通过 Preload 和 IPC；
3. API Key 使用安全存储；
4. DeepSeek 请求支持流式和取消；
5. Agent Runtime 支持多轮工具调用；
6. 工具参数经过 Schema 校验；
7. 文件访问限制在工作区；
8. 高风险工具需要审批；
9. 文件修改前备份；
10. 修改可展示 Diff 并恢复；
11. 任务状态可持久化；
12. 应用退出时终止请求和子进程；
13. 日志不记录敏感信息；
14. V1.0 不实现 PRD 明确排除的功能。

---

## 32. 后续设计文档

完成本文档后，建议继续编写：

1. 《TieX 数据库设计》
2. 《TieX Agent 与工具调用详细设计》
3. 《TieX 沙箱与权限详细设计》
4. 《TieX 开发实施方案》
5. 《TieX 测试方案》

---

## 33. 总结

TieX V1.0 采用 Electron 三层进程架构，以 Electron 主进程作为系统能力和安全边界，以 Vue 3 渲染进程承担交互展示，以 Preload 提供受限 IPC。

Agent Runtime、Tool Registry、Workspace Sandbox 和 Permission Service 构成 TieX 的核心。所有模型输出均视为不可信输入，必须经过工具注册、参数校验、路径校验和权限判断后才能执行。

V1.0 优先保证：

- 能稳定聊天；
- 能安全读取工作区；
- 能执行受控工具；
- 能展示任务过程；
- 能确认、追踪和撤销文件修改；
- 能生成基础文档和 PPT。

不以功能堆叠作为第一版目标。
