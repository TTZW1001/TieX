# TieX Agent 与工具调用设计

> 产品名称：TieX  
> 文档类型：Agent 与工具调用设计  
> 对应版本：V1.0 MVP  
> 核心模型：DeepSeek API  
> 核心模块：Agent Runtime、Tool Registry、Task Controller、Permission Service

---

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | TieX Agent 与工具调用设计 |
| 产品名称 | TieX |
| 对应版本 | V1.0 MVP |
| 文档状态 | 初稿 |
| 主要读者 | 开发者、Trae、Codex、测试人员 |
| 关联文档 | TieX-PRD.md、TieX-技术架构与概要设计.md、TieX-数据库设计.md |

---

## 2. 文档目的

本文档用于定义 TieX V1.0 的 Agent 运行机制、模型调用流程、工具注册方式、工具参数规范、权限判断、任务状态、错误处理和执行限制。

本文档重点解决：

1. Agent 如何接收并执行用户任务；
2. DeepSeek 如何发起 Tool Calls；
3. 工具如何注册与发现；
4. 工具参数如何校验；
5. 什么操作可以自动执行；
6. 什么操作必须等待用户审批；
7. 模型、工具与任务状态如何衔接；
8. Agent 如何停止、失败与恢复；
9. 工具结果如何回传给模型；
10. 如何避免 Agent 无限循环或危险执行。

---

## 3. 设计原则

### 3.1 模型输出不可信

模型返回的以下内容均视为不可信输入：

- 工具名称；
- 工具参数；
- 文件路径；
- 命令；
- 文件内容；
- 输出格式；
- 任务完成判断。

任何模型输出必须经过：

1. 工具名称校验；
2. JSON Schema 校验；
3. 权限校验；
4. 路径校验；
5. 风险评估；
6. 执行限制。

### 3.2 最小工具集

V1.0 只提供完成核心任务所需的工具，不提供任意系统操作能力。

### 3.3 单任务单 Agent

V1.0 每个任务只运行一个 Agent。

不实现：

- 多 Agent 并行；
- Agent 间转交；
- 多角色协作；
- 自定义 Agent 市场。

### 3.4 用户保留最终控制权

以下操作不得由 Agent 静默执行：

- 覆盖文件；
- 删除文件；
- 批量修改；
- 命令执行；
- 安装依赖；
- 联网下载；
- 访问工作区外路径。

### 3.5 可追踪

每次模型调用、工具调用、权限审批、文件修改和失败都必须有记录。

---

## 4. 核心模块

TieX Agent 系统包含：

```text
Agent Runtime
├── Task Controller
├── Context Builder
├── Model Provider
├── Tool Registry
├── Tool Executor
├── Permission Service
├── Workspace Sandbox
├── Task Event Bus
└── Task Logger
```

### 4.1 Agent Runtime

负责 Agent 主循环。

### 4.2 Task Controller

负责：

- 创建任务；
- 保存任务状态；
- 管理 AbortController；
- 停止任务；
- 清理子进程；
- 防止重复执行。

### 4.3 Context Builder

负责构建发送给模型的上下文。

### 4.4 Model Provider

负责调用 DeepSeek API。

### 4.5 Tool Registry

负责注册和查找工具。

### 4.6 Tool Executor

负责统一校验与执行工具。

### 4.7 Permission Service

负责权限评估和审批等待。

### 4.8 Workspace Sandbox

负责路径和工作区边界。

### 4.9 Task Event Bus

负责向渲染进程推送任务事件。

### 4.10 Task Logger

负责记录任务全过程。

---

## 5. Agent 总体流程

```text
用户提交任务
  ↓
创建用户消息
  ↓
创建 Task
  ↓
初始化 Agent Runtime
  ↓
构建上下文
  ↓
调用 DeepSeek
  ↓
模型返回
  ├─ 普通文本
  ├─ Tool Call
  └─ 非法内容
  ↓
处理 Tool Call
  ↓
校验工具与参数
  ↓
判断权限和风险
  ├─ 自动执行
  ├─ 等待用户授权
  └─ 拒绝
  ↓
执行工具
  ↓
保存工具结果
  ↓
将结果回传模型
  ↓
继续下一轮
  ↓
完成 / 失败 / 停止
```

---

## 6. Agent Runtime

### 6.1 接口定义

```ts
interface AgentRuntime {
  run(input: StartAgentTaskInput): Promise<void>;
  stop(taskId: string): Promise<void>;
  resumeAfterPermission(
    taskId: string,
    decision: PermissionDecision
  ): Promise<void>;
}
```

### 6.2 启动输入

```ts
interface StartAgentTaskInput {
  taskId: string;
  conversationId: string;
  userMessageId: string;
  providerId: string;
  workspaceId?: string;
  permissionMode: PermissionMode;
}
```

### 6.3 RuntimeContext

```ts
interface RuntimeContext {
  taskId: string;
  conversationId: string;
  providerId: string;
  workspaceId?: string;
  workspaceRoot?: string;
  permissionMode: PermissionMode;

  round: number;
  toolCallCount: number;
  failureCount: number;

  limits: TaskLimits;
  abortController: AbortController;
}
```

---

## 7. Agent Loop

### 7.1 伪代码

```ts
async function runAgent(context: RuntimeContext): Promise<void> {
  updateTaskStatus(context.taskId, "running");

  while (true) {
    assertTaskNotStopped(context);
    assertWithinLimits(context);

    const modelRequest = await contextBuilder.build(context);

    const modelResult = await provider.streamChat(
      modelRequest,
      context.abortController.signal
    );

    context.round += 1;

    if (modelResult.type === "final_text") {
      await saveAssistantMessage(modelResult.content);
      await completeTask(context.taskId);
      return;
    }

    if (modelResult.type === "tool_calls") {
      for (const toolCall of modelResult.toolCalls) {
        assertTaskNotStopped(context);
        await handleToolCall(context, toolCall);
      }

      continue;
    }

    throw new AgentError("MODEL_RESPONSE_INVALID");
  }
}
```

### 7.2 一轮定义

一次完整模型请求记为一轮。

一轮可能返回：

- 最终文本；
- 一个工具调用；
- 多个工具调用；
- 非法响应；
- 空响应。

### 7.3 多工具调用

V1.0 默认按顺序执行多个工具调用，不并行执行。

原因：

- 更容易控制权限；
- 更容易保证文件顺序；
- 更容易停止；
- 更容易记录。

---

## 8. 任务限制

```ts
interface TaskLimits {
  maxModelRounds: number;
  maxToolCalls: number;
  maxFailures: number;
  maxDurationMs: number;
  maxFilesRead: number;
  maxFileSizeBytes: number;
  maxChangedFiles: number;
  maxToolOutputChars: number;
}
```

建议默认值：

| 限制 | 默认值 |
|---|---:|
| 最大模型轮数 | 20 |
| 最大工具调用数 | 30 |
| 最大连续失败数 | 3 |
| 最大任务时间 | 30 分钟 |
| 最大读取文件数 | 100 |
| 最大单文件大小 | 2 MB |
| 最大修改文件数 | 20 |
| 最大工具输出字符数 | 50000 |

超过限制后：

- 停止当前任务；
- 保存错误代码；
- 向用户显示原因；
- 不再调用后续工具。

---

## 9. 任务状态

### 9.1 TaskStatus

```ts
type TaskStatus =
  | "pending"
  | "running"
  | "waiting_permission"
  | "executing_tool"
  | "completed"
  | "failed"
  | "stopped"
  | "interrupted";
```

### 9.2 状态说明

| 状态 | 说明 |
|---|---|
| pending | 已创建，尚未执行 |
| running | 正在调用模型或处理结果 |
| waiting_permission | 等待用户审批 |
| executing_tool | 正在执行工具 |
| completed | 正常完成 |
| failed | 执行失败 |
| stopped | 用户主动停止 |
| interrupted | 应用异常退出或进程中断 |

### 9.3 状态转换

```text
pending → running

running → waiting_permission
running → executing_tool
running → completed
running → failed
running → stopped

waiting_permission → executing_tool
waiting_permission → running
waiting_permission → stopped
waiting_permission → failed

executing_tool → running
executing_tool → failed
executing_tool → stopped
```

---

## 10. 上下文构建

### 10.1 上下文组成

模型请求上下文包含：

1. 系统提示词；
2. 当前会话历史；
3. 当前任务用户请求；
4. 当前工作区信息；
5. 当前权限模式；
6. 工具列表；
7. 工具调用历史；
8. 当前任务限制；
9. 必要文件片段；
10. 上一轮工具结果。

### 10.2 系统提示词要求

系统提示词必须明确：

- TieX 是本地桌面 Agent；
- 只能通过已注册工具操作本地资源；
- 不得编造工具执行结果；
- 不得请求未注册工具；
- 不得访问工作区外路径；
- 高风险操作会被审批；
- 工具失败后应分析错误；
- 达到任务目标后应输出最终答复；
- 不应无限重复同一工具。

### 10.3 工作区摘要

仅包含：

- 工作区名称；
- 根目录名称；
- 权限模式；
- 已知项目类型；
- 必要目录结构摘要。

不发送绝对路径，除非工具执行所需。

### 10.4 会话历史裁剪

建议策略：

1. 保留系统提示；
2. 保留当前任务用户消息；
3. 保留最近若干轮；
4. 保留未完成工具调用；
5. 旧内容进行摘要；
6. 超出上下文时移除低优先级内容。

---

## 11. 模型响应类型

### 11.1 最终文本

```ts
interface FinalTextResult {
  type: "final_text";
  content: string;
}
```

### 11.2 工具调用

```ts
interface ToolCallResult {
  type: "tool_calls";
  toolCalls: ModelToolCall[];
}
```

### 11.3 ModelToolCall

```ts
interface ModelToolCall {
  id: string;
  name: string;
  arguments: unknown;
}
```

### 11.4 非法响应

包括：

- 工具名称为空；
- 参数不是 JSON；
- 未注册工具；
- 同一调用 ID 重复；
- 最终文本和工具调用格式冲突；
- 模型返回空内容。

非法响应不得执行。

---

## 12. Tool Registry

### 12.1 工具定义

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

### 12.2 工具名称规范

使用小写下划线：

```text
list_files
read_file
search_files
create_file
edit_file
create_markdown
create_docx
create_pptx
run_command
```

### 12.3 注册方式

```ts
toolRegistry.register(listFilesTool);
toolRegistry.register(readFileTool);
```

### 12.4 查找

模型请求工具时：

```ts
const tool = toolRegistry.get(toolCall.name);
```

未注册工具：

- 不执行；
- 保存失败记录；
- 将错误返回模型；
- 增加失败计数。

---

## 13. 工具风险等级

```ts
type ToolRiskLevel =
  | "low"
  | "medium"
  | "high"
  | "blocked";
```

### 13.1 low

- 查看目录；
- 读取文本；
- 搜索文件。

### 13.2 medium

- 创建新文件；
- 生成新 Markdown；
- 生成新 DOCX；
- 生成新 PPTX。

### 13.3 high

- 覆盖文件；
- 修改已有文件；
- 删除或移动；
- 执行命令；
- 安装依赖；
- 联网操作。

### 13.4 blocked

- 工作区外访问；
- 管理员权限；
- 系统目录修改；
- 注册表；
- 格式化磁盘；
- 删除系统目录；
- 绕过审批。

---

## 14. 工具执行流程

```text
接收 ModelToolCall
  ↓
查找工具
  ↓
创建 tool_call 记录
  ↓
Schema 校验
  ↓
权限模式校验
  ↓
风险评估
  ↓
工作区与路径校验
  ↓
是否需要审批
  ├─ 是：创建审批并等待
  └─ 否：继续
  ↓
更新为 executing_tool
  ↓
执行工具
  ↓
截断和脱敏结果
  ↓
保存结果
  ↓
回传模型
```

---

## 15. 工具参数校验

### 15.1 校验要求

所有工具参数必须通过 JSON Schema。

禁止：

- 接受额外未知字段；
- 依赖模型自行保证类型；
- 自动纠正危险路径；
- 忽略必填字段；
- 使用 `any` 直接执行。

### 15.2 校验失败

返回结构：

```ts
interface ToolValidationError {
  code: "TOOL_ARGUMENT_INVALID";
  toolName: string;
  issues: Array<{
    path: string;
    message: string;
  }>;
}
```

处理：

1. 不执行工具；
2. 保存失败状态；
3. 将简化错误返回模型；
4. 允许模型修正；
5. 超过失败限制后停止任务。

---

# 16. V1.0 工具详细设计

## 16.1 list_files

### 用途

查看工作区目录。

### 输入

```ts
interface ListFilesInput {
  path?: string;
  depth?: number;
  includeHidden?: boolean;
}
```

### Schema

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "相对于工作区根目录的路径"
    },
    "depth": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5
    },
    "includeHidden": {
      "type": "boolean"
    }
  },
  "additionalProperties": false
}
```

### 默认规则

- `path` 默认根目录；
- `depth` 默认 2；
- 默认排除隐藏文件；
- 默认排除 `.git`、`node_modules`、构建目录。

### 输出

```ts
interface ListFilesOutput {
  root: string;
  entries: FileEntry[];
  truncated: boolean;
}
```

### 风险

low。

---

## 16.2 read_file

### 用途

读取工作区文本文件。

### 输入

```ts
interface ReadFileInput {
  path: string;
  startLine?: number;
  endLine?: number;
}
```

### Schema

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string"
    },
    "startLine": {
      "type": "integer",
      "minimum": 1
    },
    "endLine": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": ["path"],
  "additionalProperties": false
}
```

### 规则

- 只能读取文本；
- 单次读取行数应有限制；
- 文件过大时要求分段读取；
- 禁止工作区外路径；
- 禁止符号链接绕过。

### 输出

```ts
interface ReadFileOutput {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}
```

### 风险

low。

---

## 16.3 search_files

### 用途

搜索文件名或文本内容。

### 输入

```ts
interface SearchFilesInput {
  query: string;
  path?: string;
  mode?: "filename" | "content";
  filePattern?: string;
  maxResults?: number;
}
```

### 规则

- 最大结果数量限制；
- 超时限制；
- 跳过二进制文件；
- 跳过忽略目录；
- 不允许正则表达式造成高复杂度搜索。

### 输出

```ts
interface SearchFilesOutput {
  query: string;
  results: SearchMatch[];
  truncated: boolean;
}
```

### 风险

low。

---

## 16.4 create_file

### 用途

创建新文本文件。

### 输入

```ts
interface CreateFileInput {
  path: string;
  content: string;
  overwrite?: boolean;
}
```

### 规则

- 目标必须在工作区；
- 默认 `overwrite = false`；
- 父目录不存在时，可按配置创建；
- 如果文件已存在，转为高风险；
- 写入采用临时文件和原子替换。

### 输出

```ts
interface CreateFileOutput {
  path: string;
  sizeBytes: number;
  created: boolean;
}
```

### 风险

- 新文件：medium；
- 覆盖文件：high。

---

## 16.5 edit_file

### 用途

修改已有文本文件。

### 输入

V1.0 推荐使用基于原文匹配的局部替换，不允许模型直接提交任意补丁脚本。

```ts
interface EditFileInput {
  path: string;
  edits: Array<{
    oldText: string;
    newText: string;
    replaceAll?: boolean;
  }>;
}
```

### 规则

- 文件必须存在；
- `oldText` 必须匹配；
- 匹配数量异常时拒绝；
- 修改前备份；
- 修改前计算 Diff；
- 修改文件数受任务上限限制；
- 必须审批。

### 输出

```ts
interface EditFileOutput {
  path: string;
  replacements: number;
  beforeHash: string;
  afterHash: string;
  diffSummary: string;
}
```

### 风险

high。

---

## 16.6 create_markdown

### 用途

生成 Markdown 文档。

### 输入

```ts
interface CreateMarkdownInput {
  path: string;
  title?: string;
  content: string;
  overwrite?: boolean;
}
```

### 规则

- 后缀必须为 `.md`；
- 默认保存到 artifacts 或工作区指定目录；
- 已存在文件不得静默覆盖。

### 风险

- 新文件：medium；
- 覆盖：high。

---

## 16.7 create_docx

### 用途

根据结构化规格生成 DOCX。

### 输入

```ts
interface CreateDocxInput {
  path: string;
  document: DocumentSpec;
  overwrite?: boolean;
}
```

### DocumentSpec

```ts
interface DocumentSpec {
  title: string;
  subtitle?: string;
  sections: Array<{
    heading?: string;
    level?: 1 | 2 | 3;
    paragraphs?: string[];
    bullets?: string[];
    table?: {
      headers: string[];
      rows: string[][];
    };
  }>;
}
```

### 规则

- 模型不直接生成 XML；
- 使用固定模板；
- 限制段落和表格数量；
- 内容必须在生成前完成校验。

### 风险

- 新文件：medium；
- 覆盖：high。

---

## 16.8 create_pptx

### 用途

根据结构化规格生成 PPTX。

### 输入

```ts
interface CreatePptxInput {
  path: string;
  presentation: PresentationSpec;
  overwrite?: boolean;
}
```

### PresentationSpec

```ts
interface PresentationSpec {
  title: string;
  subtitle?: string;
  slides: Array<{
    layout:
      | "cover"
      | "agenda"
      | "title_content"
      | "two_column"
      | "image_text"
      | "table"
      | "summary";
    title: string;
    bullets?: string[];
    leftContent?: string[];
    rightContent?: string[];
    table?: {
      headers: string[];
      rows: string[][];
    };
  }>;
}
```

### 规则

- 限制总页数；
- 限制每页字数；
- 限制项目符号数量；
- 不允许模型传任意坐标；
- 使用预设模板。

### 风险

- 新文件：medium；
- 覆盖：high。

---

## 16.9 run_command

### 用途

执行受限项目命令。

### 输入

```ts
interface RunCommandInput {
  command: string;
  args?: string[];
  timeoutMs?: number;
}
```

### 规则

- `cwd` 强制为工作区；
- 不允许模型指定任意工作目录；
- 默认不使用 Shell；
- 命令和参数分离；
- 命令必须审批；
- 超时后终止；
- 限制输出；
- 过滤环境变量；
- 禁止管理员权限。

### 输出

```ts
interface RunCommandOutput {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}
```

### 风险

high。

---

## 17. 权限判断

### 17.1 权限模式

```ts
type PermissionMode = "chat" | "read" | "execute";
```

### 17.2 判断顺序

```text
工具是否存在
  ↓
当前权限模式是否满足
  ↓
工具风险等级
  ↓
工具参数具体风险
  ↓
是否命中任务内授权
  ↓
自动允许 / 请求审批 / 拒绝
```

### 17.3 自动允许

读取模式下可自动允许：

- `list_files`
- `read_file`
- `search_files`

执行模式下可自动允许：

- 创建全新文件；
- 生成全新 Markdown；
- 生成全新 DOCX；
- 生成全新 PPTX。

是否自动允许可由设置控制。

### 17.4 必须审批

- 修改已有文件；
- 覆盖文件；
- 删除文件；
- 批量操作；
- 命令执行；
- 安装依赖；
- 联网下载；
- 修改项目配置；
- 修改超过阈值的文件。

---

## 18. 审批等待机制

### 18.1 创建审批

当需要审批时：

1. 创建 `permission_requests`；
2. 更新 Tool Call 状态；
3. 更新 Task 状态为 `waiting_permission`；
4. 推送 `permission.required`；
5. 暂停工具执行。

### 18.2 审批结果

```ts
type PermissionDecision =
  | "approve_once"
  | "approve_for_task"
  | "reject";
```

### 18.3 本任务授权

`approve_for_task` 只适用于：

- 同一任务；
- 同一工具；
- 同一风险类型；
- 同一工作区。

不得扩展为永久授权。

### 18.4 拒绝

拒绝后：

- 工具调用标记为 rejected；
- 工具不执行；
- 将拒绝结果返回模型；
- 模型可调整方案；
- 不应反复请求同一操作。

---

## 19. 工具结果回传

### 19.1 回传内容

工具结果回传模型时，应包含：

- 工具名称；
- 是否成功；
- 简化结果；
- 错误代码；
- 是否截断；
- 可继续执行的信息。

### 19.2 成功格式

```json
{
  "ok": true,
  "tool": "read_file",
  "result": {
    "path": "src/main.ts",
    "content": "...",
    "truncated": false
  }
}
```

### 19.3 失败格式

```json
{
  "ok": false,
  "tool": "read_file",
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "目标文件不存在"
  }
}
```

### 19.4 截断

超大结果：

- 截断内容；
- 明确 `truncated = true`；
- 告诉模型如何继续读取；
- 不因截断假装完整成功。

---

## 20. 失败处理

### 20.1 可恢复错误

- 文件不存在；
- 参数格式错误；
- 搜索无结果；
- oldText 不匹配；
- 命令返回非零；
- 用户拒绝。

Agent 可调整后继续。

### 20.2 不可恢复错误

- API Key 无效；
- 工作区不可用；
- 数据库损坏；
- 安全校验异常；
- 达到任务上限；
- 应用正在退出；
- 子进程无法终止。

任务直接失败或停止。

### 20.3 重复失败

同一工具以相同参数连续失败时：

- 第二次失败后提示模型改变方案；
- 第三次失败停止任务；
- 防止无限重试。

---

## 21. 停止任务

### 21.1 用户停止

用户点击停止后：

1. 标记 Task 为 stopped；
2. Abort 模型请求；
3. 停止当前工具；
4. 终止子进程；
5. 取消待审批；
6. 不再执行后续工具；
7. 保存当前状态；
8. 推送 `task.stopped`。

### 21.2 应用退出

退出时统一调用：

```ts
taskController.stopAll("application_exit");
```

### 21.3 停止后的文件

已经成功写入的文件不自动回滚。

用户可在任务详情中选择撤销。

---

## 22. 任务事件

### 22.1 TaskEvent

```ts
type TaskEvent =
  | TaskStartedEvent
  | TaskStatusChangedEvent
  | MessageDeltaEvent
  | MessageCompletedEvent
  | ToolRequestedEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | ToolFailedEvent
  | PermissionRequiredEvent
  | FileChangedEvent
  | ArtifactCreatedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskStoppedEvent;
```

### 22.2 事件示例

```ts
interface ToolStartedEvent {
  type: "tool.started";
  taskId: string;
  toolCallId: string;
  toolName: string;
  timestamp: string;
}
```

### 22.3 推送规则

- 所有事件带 `taskId`；
- 工具事件带 `toolCallId`；
- UI 按 taskId 过滤；
- 监听器必须支持取消注册；
- 页面刷新后可从数据库恢复。

---

## 23. Agent 消息保存

### 23.1 保存内容

保存：

- 用户消息；
- 最终 assistant 消息；
- 工具结果摘要；
- 错误消息；
- 任务状态消息。

### 23.2 不保存内容

不保存：

- 模型隐藏推理；
- 冗长内部草稿；
- 完整工具原始大输出；
- API Key；
- Authorization Header。

### 23.3 流式消息

流式输出处理：

1. UI 实时更新；
2. 不每个 token 写数据库；
3. 定时合并或结束后一次保存；
4. 中断时保存已有内容并标记未完成。

---

## 24. System Prompt 建议

V1.0 System Prompt 应包含以下约束：

```text
你是 TieX 的本地桌面任务智能体。

你只能通过系统提供的工具访问本地资源。
不得编造工具执行结果。
不得请求未注册工具。
不得访问当前工作区以外的路径。
必须遵守当前权限模式。
高风险操作需要用户审批。
工具调用失败后，应根据错误调整方案。
不要反复调用相同工具和相同参数。
任务完成后，输出清晰的最终结果。
不得声称已完成实际未执行的操作。
```

具体提示词可放入独立配置文件。

---

## 25. 安全规则

### 25.1 工具调用安全

- 工具名白名单；
- 参数 Schema；
- 额外字段禁止；
- 路径守卫；
- 权限引擎；
- 风险评估；
- 审批；
- 执行限制。

### 25.2 Prompt Injection

工作区文件内容可能包含恶意提示。

系统应：

- 将文件内容标记为数据；
- 不把文件中的指令当作系统指令；
- System Prompt 明确忽略文件内越权要求；
- 文件内容不能改变权限模式；
- 文件内容不能注册新工具。

### 25.3 命令输出

命令输出也视为不可信数据。

不得根据命令输出自动：

- 提权；
- 下载文件；
- 访问外部路径；
- 执行第二条危险命令。

---

## 26. 日志与审计

每次 Agent 任务记录：

- 开始时间；
- 模型轮次；
- 工具调用；
- 参数摘要；
- 权限结果；
- 工具结果；
- 错误；
- 停止原因；
- 最终状态。

日志不得保存：

- API Key；
- 完整敏感文件；
- 用户密码；
- Token。

---

## 27. 目录结构建议

```text
electron/main/agent/
├── agent-runtime.ts
├── task-controller.ts
├── context-builder.ts
├── response-parser.ts
├── task-limits.ts
├── task-state.ts
└── system-prompt.ts

electron/main/tools/
├── tool-registry.ts
├── tool-executor.ts
├── tool.types.ts
├── list-files.tool.ts
├── read-file.tool.ts
├── search-files.tool.ts
├── create-file.tool.ts
├── edit-file.tool.ts
├── create-markdown.tool.ts
├── create-docx.tool.ts
├── create-pptx.tool.ts
└── run-command.tool.ts

electron/main/security/
├── schema-validator.ts
├── path-guard.ts
├── permission-policy.ts
├── command-policy.ts
└── secret-filter.ts
```

---

## 28. 测试设计

### 28.1 Agent Loop

测试：

- 模型直接返回最终文本；
- 模型返回一个工具调用；
- 模型返回多个工具调用；
- 工具完成后继续模型；
- 最大轮数停止；
- 用户停止；
- 模型空响应；
- 模型非法工具。

### 28.2 Tool Registry

测试：

- 注册工具；
- 重复注册；
- 查找不存在工具；
- Schema 输出；
- 权限等级。

### 28.3 参数校验

测试：

- 缺少必填字段；
- 字段类型错误；
- 额外字段；
- 非法路径；
- 超长文本；
- 非法枚举。

### 28.4 权限

测试：

- chat 模式调用读取；
- read 模式调用写入；
- execute 模式新建文件；
- 修改文件审批；
- 拒绝后不执行；
- 本任务授权不跨任务。

### 28.5 停止

测试：

- 停止模型请求；
- 停止文件工具；
- 停止命令；
- 等待审批时停止；
- 应用退出停止。

### 28.6 安全

测试：

- 未注册工具；
- 路径穿越；
- 符号链接；
- Prompt Injection；
- 危险命令；
- 重复失败循环。

---

## 29. V1.0 验收标准

Agent 与工具调用模块满足：

1. 用户任务可创建 Task；
2. Agent 可调用 DeepSeek；
3. 支持流式文本；
4. 支持 Tool Calls；
5. 工具通过 Registry 管理；
6. 工具参数经过 Schema 校验；
7. 未注册工具不会执行；
8. 文件工具受工作区限制；
9. 高风险操作进入审批；
10. 用户拒绝后工具不执行；
11. 工具结果可回传模型；
12. Agent 支持多轮继续；
13. 支持最大轮数和最大工具数；
14. 支持用户停止；
15. 支持错误重试但不会无限循环；
16. 支持记录工具调用和任务状态；
17. 模型不得直接获得系统权限；
18. 文件内容中的指令不得改变系统权限；
19. 命令工具默认不使用任意 Shell；
20. 任务完成后生成最终答复。

---

## 30. 后续扩展

V1.0 之后可考虑：

- 并行工具调用；
- 多 Agent；
- Agent 转交；
- MCP；
- 工具插件；
- Git 专用工具；
- 浏览器工具；
- Windows Sandbox；
- Docker；
- 本地模型；
- 自动化任务。

以上不进入 V1.0。

---

## 31. 总结

TieX V1.0 的 Agent 采用单任务单 Agent、顺序工具调用和严格权限控制。

核心执行链路为：

```text
用户任务
→ 模型判断
→ 工具调用
→ 参数校验
→ 权限判断
→ 安全执行
→ 结果回传
→ 模型继续
→ 最终完成
```

TieX 不信任模型输出，也不允许模型直接操作本地系统。所有实际操作必须通过已注册工具、工作区沙箱、权限引擎和任务限制。

V1.0 的重点不是让 Agent 看起来无所不能，而是让它能够可靠完成少量真实任务，并且用户始终知道它正在做什么。
