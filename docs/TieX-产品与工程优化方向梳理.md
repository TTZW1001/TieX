# TieX 产品与工程优化方向梳理

> 文档类型：产品与工程优化建议  
> 分析对象：TieX 当前仓库状态  
> 对照项目：RikkaHub（https://github.com/rikkahub/rikkahub）  
> 日期：2026-06-29  
> 说明：本文只做方向梳理，不包含代码改动方案。

---

## 1. 分析范围

本次分析基于 TieX 当前代码结构和已有功能：

- Electron + Vue 3 + Pinia + SQLite 桌面应用
- conversations / messages 会话系统
- tasks / task_steps / tool_calls / permission_requests / file_changes / artifacts / operation_logs Agent 任务系统
- responder / research / memory / implementation 多 Agent 顺序编排
- 本地文件读写、命令执行、权限审批、路径与命令安全策略
- Markdown 渲染、会话分支、工作区记忆、设置系统
- Agent 执行过程展示、任务历史重建、命令 session 持久化、首页随机文案等近期能力

重点阅读的 TieX 模块包括：

- `electron/main/agent/*`
- `electron/main/database/migrations/*`
- `electron/main/database/repositories/*`
- `electron/main/ipc/*`
- `electron/main/providers/*`
- `electron/main/security/*`
- `electron/main/services/*`
- `electron/main/tools/*`
- `electron/preload/index.ts`
- `electron/shared/types.ts`
- `src/views/ConversationView.vue`
- `src/views/SettingsView.vue`
- `src/components/TaskDrawer.vue`
- `src/components/MessageItem.vue`
- `src/components/ToolCallCard.vue`
- `src/stores/chat.store.ts`
- `src/stores/task.store.ts`
- `src/stores/settings.store.ts`

对照阅读的 RikkaHub 内容包括：

- README / README_ZH_CN
- `settings.gradle.kts`
- `app/src/main/java/.../data/*`
- `app/src/main/java/.../data/ai/*`
- `app/src/main/java/.../data/db/*`
- `app/src/main/java/.../ui/pages/*`
- `ai/src/main/java/.../provider/*`
- `ai/src/main/java/.../ui/*`
- `workspace/src/main/java/*`
- `search`、`document`、`highlight` 等独立模块

---

## 2. TieX 与 RikkaHub 的定位差异

RikkaHub 是成熟的 Android LLM 聊天客户端，强项是多供应商、多模型、移动端聊天体验、消息分支、MCP、搜索、多模态、提示词变量、记忆、设置导入导出和模块化架构。

TieX 是 Windows 本地桌面 AI Agent 工作台，强项是工作区文件读写、命令执行、权限审批、任务过程追踪、文件变更恢复和本地 SQLite 审计。

因此，TieX 不应该照搬 RikkaHub 的移动端 UI 或泛聊天功能堆叠。更适合借鉴的是：

1. Provider / model registry 的抽象方式
2. 消息节点与分支体验
3. 工具调用在消息中的状态表达
4. metadata 驱动的富消息展示
5. 设置系统的信息组织
6. 模块边界与测试策略

不适合直接照搬的是：

1. Material You 移动端布局
2. proot Linux workspace 作为默认执行环境
3. 搜索、MCP、Web 多端在当前阶段的大规模铺开
4. 偏聊天客户端的功能优先级

TieX 当前更应该优先把「本地 Agent 执行过程」做得可信、可理解、可恢复、可复用。

---

## 3. 当前最值得继续优化的 10 个方向

### 1. 任务结果表达标准化

**类型：小修小补 + 局部设计**

TieX 已经有完整的任务表、步骤表、工具调用表、权限表、文件变更表和生成物表，但最终给用户的任务结果仍偏自然语言总结，任务过程也偏日志化。用户需要的是稳定的结果结构：做了什么、改了什么、失败了什么、下一步建议是什么。

RikkaHub 中 `UIMessagePart` 和 metadata 的设计值得参考：消息不只是纯文本，而是可携带工具、diff、reasoning、文件等结构化信息。TieX 不一定要重构成消息部件模型，但可以先在任务完成时生成统一结果摘要。

**用户感知：**

- 每次 Agent 任务结束都有清晰结论
- 能看到文件清单、命令清单、生成物、失败项和下一步建议
- 不需要打开抽屉翻日志才能知道任务是否真的完成

**涉及模块：**

- `electron/main/agent/agent-runtime-core.ts`
- `electron/main/agent/langgraph-orchestrator.ts`
- `electron/main/agent/execution-facts.ts`
- `src/components/TaskMessageBlock.vue`
- `src/components/TaskDrawer.vue`
- `src/stores/task.store.ts`

**建议做法：**

- 定义 `TaskResultSummary` 结构
- 由 Agent 最终回复前统一读取 execution facts / file changes / artifacts / command sessions
- 最终回复按固定区块输出：结论、变更、验证、风险、下一步
- UI 中将结构化摘要渲染为任务结果卡片

---

### 2. 工具调用卡片产品化

**类型：小修小补**

当前 `ToolCallCard` 和 `TaskDrawer` 对工具调用的展示主要是 JSON 参数和 JSON 结果。这对开发者可追踪，但对普通用户理解成本较高。

TieX 的工具集已经非常明确：`list_files`、`read_file`、`search_files`、`create_file`、`edit_file`、`create_markdown`、`create_docx`、`create_pptx`、`run_command`。这很适合做工具专属摘要。

RikkaHub 的工具调用体验可借鉴点是：工具状态直接在消息流里表达，而不是只作为调试信息存在。

**用户感知：**

- 看到“读取了哪个文件”“搜索了什么”“修改了几处”“执行了什么命令”
- 默认展示摘要，原始 JSON 收进详情
- 失败原因更容易理解

**涉及模块：**

- `src/components/ToolCallCard.vue`
- `src/components/TaskDrawer.vue`
- `src/components/CommandOutput.vue`
- `src/components/DiffViewer.vue`
- `electron/main/tools/*`
- `electron/main/database/repositories/tool-call.repository.ts`

**建议做法：**

- 增加 `formatToolTitle(toolName, args, result)` 和 `formatToolSummary(...)`
- 为 `run_command`、`edit_file`、`search_files`、`read_file` 做专属展示
- 将参数、结果、错误统一分为“摘要 / 详情 / 原始数据”
- 对长输出默认折叠，保留复制、打开文件、定位文件夹等动作

---

### 3. 权限审批体验升级

**类型：需要系统设计**

TieX 已有权限审批链路和 `permission_requests` 表，但用户体验仍可从“弹窗确认”升级为“决策面板”。权限审批不是简单 yes/no，它应该告诉用户为什么需要、影响范围、是否可恢复、拒绝后会怎样。

RikkaHub 的工具审批状态值得借鉴：Pending / Denied / Answered / Approved 作为消息状态的一部分，能让工具调用自然停在会话流里等待用户处理。

**用户感知：**

- 审批时能看懂风险和影响
- 可以清楚选择“允许一次”或“本任务允许”
- 拒绝后 Agent 能继续解释或换方案
- 历史任务里能复盘当时批准了什么

**涉及模块：**

- `electron/main/services/permission.service.ts`
- `electron/main/security/permission-policy.ts`
- `electron/main/database/repositories/permission-request.repository.ts`
- `src/components/InlinePermissionCard.vue`
- `src/components/ConfirmDialog.vue`
- `src/stores/task.store.ts`
- `src/stores/ui.store.ts`

**建议做法：**

- 将审批信息分为操作、目标、理由、影响、恢复能力、风险等级
- 审批卡片嵌入任务块，同时保留弹窗兜底
- 拒绝时允许用户输入简短原因
- 将拒绝原因回传给 Agent，避免重复请求同一操作
- 区分“本任务允许同类读取/同一文件修改/同一命令前缀”等 scope

---

### 4. 会话分支从“复制分支”升级为“节点分支”

**类型：需要系统设计**

TieX 目前已经支持 `parent_conversation_id` 和 `branch_from_message_id`，这适合从某条消息复制出新会话。但当用户只想编辑上一条消息、重试某个回答、比较多个候选回复时，整会话分支会让侧边栏变重。

RikkaHub 的 `message_node` 模型值得参考：每个节点里有候选消息列表和 `selectIndex`，天然支持同一个位置多个回复版本。

**用户感知：**

- 可以在同一会话内编辑消息并重试
- 可以切换同一轮的多个回答版本
- 分支不再污染会话列表
- 复杂任务仍可显式“另开分支会话”

**涉及模块：**

- `electron/main/database/migrations/*`
- `electron/main/database/repositories/message.repository.ts`
- `electron/main/database/repositories/conversation.repository.ts`
- `electron/shared/types.ts`
- `src/views/ConversationView.vue`
- `src/components/MessageItem.vue`
- `src/stores/chat.store.ts`

**建议做法：**

- 短期保留当前会话复制分支
- 中期增加 `message_branches` 或 `message_nodes` 表
- UI 增加“上一版 / 下一版 / 设为当前”
- 编辑用户消息时，从该节点之后生成新路径
- 对 Agent 任务谨慎处理：涉及文件修改的任务不应无提示地在节点间切换事实

---

### 5. 上下文管理可视化

**类型：小修小补 + 局部设计**

TieX 已经有很多上下文能力：最近历史、会话摘要、全局记忆、工作区记忆、协作 Agent brief、附件、工具结果事实纠偏。但用户目前不知道每次任务到底带入了什么。

RikkaHub 的 prompt variables、transformers、conversation system prompt 思路值得借鉴：上下文构建是可组合的，也应该可观察。

**用户感知：**

- 知道 TieX 为什么记得某些偏好
- 能确认本次任务是否带入工作区规则
- 长对话时知道旧消息是否被摘要
- 更容易排查“为什么它这样回答”

**涉及模块：**

- `electron/main/agent/context-builder.ts`
- `electron/main/services/memory.service.ts`
- `electron/main/agent/conversation-corrections.ts`
- `electron/main/agent/execution-facts.ts`
- `src/components/TaskDrawer.vue`
- `src/views/SettingsView.vue`

**建议做法：**

- 增加“上下文”任务详情页
- 展示会话摘要、工作区记忆、全局记忆、附件、最近消息数量
- 展示协作 Agent brief 是否被带入
- 增加“本次上下文裁剪说明”
- 先只展示摘要，不展示完整 prompt，避免泄露或干扰

---

### 6. Provider 与模型能力模型细化

**类型：需要系统设计**

TieX 已有 `ProviderService`、DeepSeek、SiliconFlow、OpenAI Compatible 封装，也支持多 Agent 绑定 Provider。但模型能力表达还偏轻，用户配置模型时无法清楚知道支持什么。

RikkaHub 的 `ProviderManager`、`ModelRegistry`、custom headers、custom body、ProviderSetting 设计值得参考。TieX 不必一次性支持所有模型，但可以把能力模型先抽清楚。

**用户感知：**

- 设置模型时知道是否支持工具、图片、流式、长上下文
- 给不同 Agent 绑定模型时更有把握
- 连接测试能返回更具体的失败原因

**涉及模块：**

- `electron/main/providers/*`
- `electron/main/services/provider.service.ts`
- `electron/main/database/repositories/provider.repository.ts`
- `src/utils/provider-capabilities.ts`
- `src/views/SettingsView.vue`
- `src/stores/settings.store.ts`

**建议做法：**

- 为 provider/model 增加 capability 字段
- 支持自定义 header/body 的安全白名单
- 将“模型名称选项”从前端硬编码逐步迁到能力配置
- 测试连接返回 provider、model、tool calling、vision、stream 状态
- Agent 绑定页显示能力提示

---

### 7. 本地工作区资产中心

**类型：小修小补**

TieX 已有工作区文件树、文件变更、生成物、命令 session、工作区记忆，但这些能力主要分布在任务抽屉不同 tab 中。对本地桌面 Agent 来说，工作区资产是核心价值，值得成为更清晰的信息中心。

RikkaHub 有文件管理、文档解析、workspace、managed files 等模块。TieX 不需要照搬，但可以强化“任务产物与工作区文件”的组织。

**用户感知：**

- 能按任务查看产生了哪些文件
- 能按文件查看被哪些任务改过
- 能快速打开、定位、回滚、复用产物
- 生成物不再像一次性附件

**涉及模块：**

- `src/components/TaskDrawer.vue`
- `src/components/FileTree.vue`
- `src/components/ArtifactCard.vue`
- `src/components/DiffViewer.vue`
- `electron/main/services/artifact.service.ts`
- `electron/main/database/repositories/file-change.repository.ts`
- `electron/main/database/repositories/artifact.repository.ts`

**建议做法：**

- 在工作区 tab 增加“最近变更 / 最近生成物”
- 文件预览增加“相关任务”入口
- 生成物卡片支持打开、定位、删除、复制路径
- 文件变更按 operation / status / path 聚合

---

### 8. 命令执行失败恢复

**类型：需要系统设计**

TieX 已有 `command_sessions`、实时输出、停止命令和历史恢复，这是很好的基础。下一步可以把命令失败从“输出文本”变成可恢复动作。

RikkaHub 的工具执行循环中对失败、审批拒绝、工具输出截断都有明确处理。TieX 可以借鉴这种“失败可继续”的状态设计。

**用户感知：**

- 命令失败后能看到退出码和关键错误
- 能一键重跑或复制命令
- 超时、停止、非零退出码有不同提示
- Agent 能基于失败结果继续调整方案

**涉及模块：**

- `electron/main/services/command-runner.ts`
- `electron/main/services/command.service.ts`
- `electron/main/tools/run-command.tool.ts`
- `src/components/CommandOutput.vue`
- `src/stores/task.store.ts`

**建议做法：**

- 给命令 session 增加 failure summary
- 对常见错误做轻量分类：dependency missing、script missing、timeout、permission denied
- UI 增加重跑、复制命令、停止、展开完整输出
- 将失败摘要写入工具结果，帮助 Agent 下一轮修正

---

### 9. IPC 契约类型化与边界收紧

**类型：小修小补 + 系统设计**

`electron/preload/index.ts` 暴露了大量 `any` 和 `Record<string, unknown>`。这在快速迭代阶段很方便，但随着任务、权限、文件、设置越来越复杂，IPC 字段错配会变成隐性 bug。

RikkaHub 的模块化 Kotlin 类型系统天然更强。TieX 可以通过 shared types 和 IPC contract 弥补 Electron 项目的边界松散问题。

**用户感知：**

- 用户不直接感知
- 但能减少设置保存异常、任务事件丢字段、UI 状态不同步等问题

**涉及模块：**

- `electron/shared/ipc.ts`
- `electron/shared/types.ts`
- `electron/preload/index.ts`
- `electron/main/ipc/*`
- `src/types/global.d.ts`

**建议做法：**

- 为每个 IPC channel 定义 request/response 类型
- Preload API 从 `any` 收敛为明确类型
- 任务事件类型保持单一来源
- IPC handler 入口统一做 zod 校验
- 前端 store 不再手写重复 VO 映射

---

### 10. 测试从核心安全扩展到体验回归

**类型：小修小补**

TieX 当前测试覆盖了 PathGuard、CommandPolicy、SchemaValidator、PermissionPolicy、BackupService、ArtifactService、Repository、Agent Loop 等关键底层能力。下一阶段应该补 UI 与任务体验回归。

RikkaHub 有 provider message、prompt injection transformer、migration、diff 等测试，说明复杂 AI 客户端必须测试协议转换和历史数据兼容。

**用户感知：**

- 后续迭代更稳定
- 不容易出现“修了展示，坏了审批”或“改了设置，坏了任务启动”

**涉及模块：**

- `tests/unit/*`
- `tests/integration/*`
- 后续可加入 Electron / Playwright E2E
- `src/stores/*`
- `electron/main/ipc/*`

**建议做法：**

- 增加 task event reducer 测试
- 增加权限拒绝后任务继续测试
- 增加工具调用展示 formatter 单测
- 增加设置保存和 Provider 切换测试
- 增加文件变更恢复集成测试

---

## 4. 分领域对照总结

### 4.1 对话体验

TieX 已有消息分页、流式输出、会话分支和 Markdown 渲染。短板是编辑、重试、候选回答切换还不够自然，分支目前更像整会话复制。

RikkaHub 的可借鉴点：

- MessageNode / selectIndex 适合做同一轮多版本回复
- 多模型切换和模型选择器成熟
- Markdown 能力更完整，如代码高亮、公式、表格、Mermaid

对 TieX 的适配判断：

- 消息节点模型适合中期演进
- 移动端聊天 UI 不适合直接照搬
- Markdown 增强适合小步补齐，尤其是 Shiki 深度接入和 Mermaid

### 4.2 Agent / 工具体验

TieX 的 Agent 工具链强于 RikkaHub 的普通聊天工具：文件读写、命令、审批、回滚、生成物都已经落地。短板是用户看到的过程仍然偏工程日志。

RikkaHub 的可借鉴点：

- 工具调用作为消息部件展示
- 工具审批状态进入消息状态
- 工具输出过长时截断并保存完整输出
- Denied / Answered 也作为可继续的工具结果

对 TieX 的适配判断：

- 非常适合借鉴到任务块和审批卡片
- 不建议照搬 RikkaHub 的工具集合，TieX 应继续围绕本地工作区工具深挖

### 4.3 设置系统

TieX 已有 Provider、权限、多 Agent、记忆、本地数据、统计等设置页，结构已经比较完整。短板是 provider capability、自定义请求配置、导入导出和模型能力提示。

RikkaHub 的可借鉴点：

- 多 provider 类型与 model registry
- 自定义 header/body
- Provider 导入导出
- Prompt variables
- Agent / assistant 自定义

对 TieX 的适配判断：

- Provider 能力模型和导入导出适合做
- 太自由的 custom body 需要安全约束，不宜直接放开
- Agent 自定义应受 TieX 多 Agent 架构约束，不宜做角色市场

### 4.4 本地工作区

TieX 的 Windows 本地工作区是核心差异化能力。当前工作区、文件树、命令、变更、产物已经具备基础闭环。下一步应做资产管理和任务复盘。

RikkaHub 的可借鉴点：

- workspace 模块独立
- managed files 概念
- 文档解析模块独立
- web / file routes 的边界清楚

对 TieX 的适配判断：

- 适合抽象“工作区资产中心”
- 不适合改为 proot Linux 环境
- 后续可以考虑专门的 Git 工具和项目索引

### 4.5 UI / 交互

TieX 当前桌面布局已经有侧边栏、顶部栏、会话主区、任务抽屉。近期任务过程展示已有很好的基础。下一步是提升信息密度和可理解性。

RikkaHub 的可借鉴点：

- 空状态文案清晰
- 模型选择和设置入口成熟
- 消息内工具状态丰富

对 TieX 的适配判断：

- 适合借鉴信息组织，不适合借鉴移动端视觉结构
- TieX 应保持桌面工作台的信息密度

### 4.6 架构与可维护性

TieX 当前主进程分层已经比较清楚：agent / database / ipc / providers / security / services / tools。短板主要在 IPC 类型、前端 store 与 shared types 重复、数据库迁移历史中早期表结构与后续表结构的演进痕迹较明显。

RikkaHub 的可借鉴点：

- `ai`、`search`、`document`、`highlight`、`workspace` 等独立模块
- ProviderManager / ModelRegistry
- Room migration 和测试
- FTS 搜索

对 TieX 的适配判断：

- 适合逐步把 Provider 能力、工具展示 formatter、上下文构建说明抽成明确模块
- 暂不建议大规模目录重构

---

## 5. 两周可执行迭代路线图

### 第 1-2 天：任务结果标准设计

目标：

- 定义任务结束时的统一结果结构
- 明确文件变更、命令、生成物、失败项如何进入最终回复

产出：

- `TaskResultSummary` 草案
- 工具结果摘要字段约定
- 任务最终回复模板

建议验收：

- 一个有文件修改的任务能展示变更清单
- 一个命令失败的任务能展示失败原因
- 一个生成文档的任务能展示生成物路径

### 第 3-5 天：工具调用卡片产品化

目标：

- 让工具调用默认展示人话摘要
- 原始 JSON 只作为详情

产出：

- 工具展示 formatter
- `run_command` 专属展示
- `read_file` / `search_files` / `edit_file` 专属摘要

建议验收：

- 用户不展开详情也能理解工具在做什么
- 长结果不会撑爆布局
- 失败工具有清楚错误提示

### 第 6-7 天：权限审批卡片升级

目标：

- 把审批从简单确认升级为决策信息
- 拒绝后能回传原因

产出：

- 权限卡片字段重排
- 风险与影响文案
- 历史审批状态展示

建议验收：

- 修改文件前能看到目标文件和影响
- 执行命令前能看到命令、参数和风险
- 拒绝后任务不会重复无意义请求

### 第 8-10 天：上下文可视化最小版

目标：

- 让用户知道本次任务带入了哪些上下文

产出：

- 任务抽屉新增“上下文”页
- 展示会话摘要、工作区记忆、全局记忆、附件、最近消息数量
- 展示协作 Agent brief 是否参与

建议验收：

- 长对话中能看到摘要是否被使用
- 工作区记忆更新后能在任务详情看到
- 不暴露完整敏感 prompt

### 第 11-12 天：命令失败恢复

目标：

- 让命令失败可理解、可复用、可恢复

产出：

- 命令 session 失败摘要
- 复制命令、重跑命令、停止命令入口
- 超时 / 停止 / 非零退出码区分展示

建议验收：

- `npm test` 失败后能看到退出码与关键错误
- 超时任务能明确显示 timeout
- 历史命令输出刷新后仍可查看

### 第 13-14 天：测试与验收

目标：

- 保护任务体验迭代成果

产出：

- 工具 formatter 单测
- task event reducer 测试
- 权限拒绝流程测试
- 文件变更恢复集成测试补充

建议验收：

- `npm test` 通过
- 手工跑通一次读文件、改文件、命令失败、回滚、生成物打开流程

---

## 6. 最推荐马上开始的 3 个任务

### 任务 1：工具调用卡片产品化

优先级最高，成本最低，收益直接。

原因：

- 不需要大改数据库
- 不影响 Agent 核心执行逻辑
- 能立即提升用户对执行过程的理解和信任

建议第一步：

- 新增工具展示 formatter
- 先覆盖 `read_file`、`search_files`、`edit_file`、`run_command`

### 任务 2：任务最终结果模板

这是 TieX 从“能执行”走向“执行得让人放心”的关键。

原因：

- TieX 已有 execution facts、file changes、artifacts、command sessions
- 只需要把这些事实组织成稳定结果
- 能减少 Agent 最终答复中的模糊表达

建议第一步：

- 在最终回复前构造任务事实摘要
- 强制包含“已完成 / 文件变更 / 验证 / 风险或失败 / 下一步”

### 任务 3：上下文可视化最小版

这能把 TieX 已有的记忆、摘要、多 Agent brief 价值显性化。

原因：

- 功能底座已经存在
- 用户会更理解 Agent 为什么这样做
- 后续优化上下文裁剪时有观察入口

建议第一步：

- 在任务抽屉新增“上下文”tab
- 只展示摘要级信息，不展示完整系统 prompt

---

## 7. 阶段性结论

TieX 当前已经不是“缺基础功能”的阶段，而是进入了“把 Agent 工作过程产品化”的阶段。

短期最值得做的不是继续堆新工具，而是把已有工具、权限、任务、文件变更和生成物组织成用户能理解的闭环：

```text
用户提出目标
→ TieX 说明将使用哪些上下文
→ Agent 执行工具
→ 用户清楚看到每一步在做什么
→ 高风险操作被明确审批
→ 任务完成后给出结构化结果
→ 文件、命令、产物都能复盘和恢复
```

RikkaHub 最值得 TieX 学习的不是具体 UI，而是它在聊天客户端中对模型、消息、工具、设置和模块边界的长期化设计。TieX 应该把这些思想转译到桌面 Agent 场景里，继续强化自己的核心差异化：本地工作区、安全执行、可追踪任务和可恢复产物。

---

## 8. 迭代记录

### 2026-06-29：完成工具调用卡片产品化第一步

对应方向：

- 方向 2：工具调用卡片产品化
- 两周路线图第 3-5 天：工具调用卡片产品化
- 推荐马上开始的任务 1：工具调用卡片产品化

本次完成：

- 新增统一工具展示 formatter：`src/utils/tool-call-format.ts`
- 覆盖 `list_files`、`read_file`、`search_files`、`create_file`、`create_markdown`、`create_docx`、`create_pptx`、`edit_file`、`run_command`
- `ToolCallCard.vue` 从原始 JSON 展示升级为“标题 + 动作 + 状态 + 摘要 + 关键字段 + 原始详情”
- `TaskDrawer.vue` 的“工具调用”页同步使用同一套摘要展示
- 原始参数和原始结果仍保留在折叠详情中，便于调试和复盘

用户可感知变化：

- 不展开 JSON 也能看懂工具做了什么
- 读取、搜索、编辑、创建、命令执行都有更贴近动作语义的标题和摘要
- 任务抽屉的工具调用历史更适合复盘

后续衔接：

- 下一步适合继续做“任务最终结果模板”，把工具摘要、文件变更、命令结果和生成物汇总到任务完成回复中
- 命令失败恢复仍需要后续补充退出码分类、重跑命令、复制命令等动作

### 2026-06-29：完成任务最终结果模板第一步

对应方向：

- 方向 1：任务结果表达标准化
- 两周路线图第 1-2 天：任务结果标准设计
- 推荐马上开始的任务 2：任务最终结果模板

本次完成：

- 新增任务结果摘要构建器：`electron/main/agent/task-result-summary.ts`
- 从现有事实表读取任务结果，不新增数据库结构：
  - `file_changes`
  - `artifacts`
  - `tool_calls`
  - `permission_requests`
  - `command_sessions`
- 固定输出以下 Markdown 区块：
  - `结果`
  - `文件变更`
  - `生成物`
  - `验证与命令`
  - `未完成与风险`
- `runResponderPass` 会把结构化摘要作为最终回复格式约束传给主对话 Agent
- 如果主对话 Agent 没按模板输出，系统会自动把结构化摘要追加到最终回复中
- 对绕过主对话 Agent 的快速路径也接入了同样的摘要兜底

用户可感知变化：

- Agent 任务结束后会更稳定地给出交付清单
- 文件变更、生成物、命令验证、失败项会集中出现在最终回复里
- 即使模型自由发挥，最终回复也会保留结构化事实摘要

后续衔接：

- 可以继续把 `TaskResultSummary` 做成前端任务结果卡片，而不仅是 Markdown 文本
- 后续命令失败恢复可以把错误分类补进 `未完成与风险` 区块
- 权限审批升级后，可把拒绝原因也并入最终交付摘要

### 2026-06-29：完成上下文可视化最小版

对应方向：

- 方向 5：上下文管理可视化
- 两周路线图第 8-10 天：上下文可视化最小版
- 推荐马上开始的任务 3：上下文可视化最小版

本次完成：

- `TaskDrawer.vue` 新增“上下文”页
- `ui.store.ts` 的任务抽屉 tab 类型新增 `context`
- 上下文页展示以下现有信息：
  - 会话摘要
  - 工作区记忆
  - 全局记忆
  - 协作 Agent 简报
  - 固定上下文裁剪策略
- 复用现有 IPC，不新增后端接口：
  - `memory.getGlobal`
  - `memory.getWorkspace`
  - `memory.getConversationSummary`
- 协作 Agent 简报直接来自任务步骤中的 `agent_route` / `agent_brief`

用户可感知变化：

- 用户可以在任务详情里看到 TieX 本轮可能参考了哪些长期记忆和会话摘要
- 多 Agent 的内部简报不再只散落在步骤里，也能从“上下文”页集中查看
- 长对话和工作区规则的来源更透明，便于排查“为什么 Agent 这么回答”

后续衔接：

- 可以在后端记录每次 `context-builder` 实际拼入的上下文快照
- 可以展示附件、最近消息数量、工具结果回传摘要等更精确的上下文来源
- 可以给记忆项增加“编辑 / 删除 / 不再使用”入口

### 2026-06-29：修正上下文入口可见性

对应方向：

- 方向 5：上下文管理可视化
- 类型：小修小补即可完成

本次完成：

- 用户反馈点击消息里的“查看上下文”后，右侧任务抽屉没有明显显示“上下文”页
- `TaskDrawer.vue` 的任务概览区新增“上下文”快捷按钮，直接切换到上下文页
- 任务抽屉 tab 区从固定三列改为自适应列宽，避免新增 tab 后被挤出或显得缺失
- 当前上下文页激活时，任务概览里的“上下文”按钮会同步高亮

用户可感知变化：

- 点击“查看上下文”后，右侧抽屉顶部也能看到明确的“上下文”入口
- tab 数量增加后布局更稳定，不会只露出部分入口
- 用户不需要猜“上下文页在哪里”

### 2026-06-29：完成命令失败恢复体验第一步

对应方向：

- 方向 2：工具调用卡片产品化
- 方向 1：任务结果表达标准化
- 类型：小修小补即可完成

本次完成：

- `CommandOutput.vue` 增加命令参数转义展示，带空格的参数会以更接近可复制命令的形式显示
- 命令卡片新增快捷操作：
  - 复制命令
  - 复制输出
  - 复制诊断
- 命令失败、超时、被停止时显示解释条，包含退出码和下一步建议
- 对常见退出码做轻量提示：
  - `127`：命令不存在或不在 PATH 中
  - `126`：文件不可执行或权限不足
  - `1`：命令自身校验失败，优先查看输出末尾

用户可感知变化：

- 命令失败后不再只有一段日志，能看到更明确的失败含义
- 用户可以一键复制命令、输出或诊断信息，让 Agent 基于真实错误继续修复
- 任务历史里的命令记录更适合复盘和排障

后续衔接：

- 可以增加“让 Agent 基于该错误继续处理”的快捷动作
- 可以把失败分类同步写入最终任务摘要的“未完成与风险”
- 可以在后端记录命令执行环境摘要，例如 cwd、shell、权限模式和超时配置

### 2026-06-29：完成失败命令继续处理快捷动作

对应方向：

- 方向 2：工具调用卡片产品化
- 方向 3：权限审批体验升级（失败后的继续协作）
- 类型：小修小补即可完成

本次完成：

- `CommandOutput.vue` 的失败 / 超时 / 停止命令卡片新增“继续处理”按钮
- 点击后会把命令诊断自动填入底部输入框，内容包含：
  - 命令
  - 状态
  - 退出码
  - 耗时
  - 输出
- 复用现有 `uiStore.composerDraft` 机制，不新增 IPC 和数据库结构

用户可感知变化：

- 失败命令不再需要手动复制粘贴给 Agent
- 用户可以先检查并编辑诊断内容，再点击发送继续让 Agent 修复
- Agent 后续处理更容易基于真实错误，而不是重新猜测问题

后续衔接：

- 可以把“继续处理”升级为直接启动下一轮任务，并带上 taskId / commandSessionId
- 可以让 Agent 收到结构化命令失败上下文，而不是纯文本诊断
- 可以在最终任务摘要里标记“已基于失败命令继续处理”

### 2026-06-29：命令失败信息进入最终任务摘要

对应方向：

- 方向 1：任务结果表达标准化
- 方向 2：工具调用卡片产品化
- 类型：小修小补即可完成

本次完成：

- `task-result-summary.ts` 的最终摘要会把失败命令计入“未完整完成”的判断
- “验证与命令”区块里的命令展示改为更接近可复制命令的参数格式
- “未完成与风险”区块新增失败命令细节：
  - 命令
  - 状态 / 退出码
  - 轻量原因提示
  - 输出末尾摘要
- 对常见退出码提示与前端命令卡片保持一致：
  - `127`：命令不存在或不在 PATH 中
  - `126`：文件不可执行或权限不足
  - `1`：命令自身校验失败，优先查看输出末尾

用户可感知变化：

- 任务最终回复会更明确地告诉用户哪条命令失败了，以及大概为什么失败
- 不打开任务抽屉也能看到关键失败线索
- 后续点击命令卡片“继续处理”时，前端诊断和最终摘要表达一致

后续衔接：

- 可以把失败命令结构化存入独立 `TaskResultSummary` 对象，前端渲染为结果卡片
- 可以在继续处理后标记“该失败已被后续任务处理”
- 可以把命令 cwd、shell、权限模式也纳入最终摘要

### 2026-06-29：完成权限审批信息展示升级

对应方向：

- 方向 3：权限审批体验升级
- 类型：小修小补即可完成

本次完成：

- 新增 `src/utils/permission-display.ts`，统一权限审批展示文案
- `InlinePermissionCard.vue` 从单行摘要升级为结构化审批卡片，展示：
  - 原因
  - 目标
  - 影响
  - 工具 / 权限类型
  - 风险等级
- 审批卡片新增授权范围说明：
  - 允许一次
  - 本次会话内允许
- `ActivityFeedItem.vue` 的任务过程审批面板同步展示同样的风险、影响和授权范围说明
- “我来手动处理 / 改成人工方案”的草稿内容会带上影响摘要，便于 Agent 给出替代方案

用户可感知变化：

- 审批时不再只看到一句混合说明，而是能快速判断“为什么要做、动哪里、影响什么”
- 用户能更清楚地区分“允许一次”和“本次会话内允许”
- 历史任务里也能复盘当时审批请求的关键信息

后续衔接：

- 可以增加拒绝原因输入框，并把拒绝原因回传给 Agent
- 可以按工具类型显示更具体的风险提示，例如命令执行、文件覆盖、批量替换
- 可以把会话级授权范围展示为可撤销的设置项

### 2026-06-29：完成权限拒绝说明的轻量闭环

对应方向：

- 方向 3：权限审批体验升级
- 类型：小修小补即可完成

本次完成：

- `InlinePermissionCard.vue` 新增“拒绝说明（可选）”
- `ActivityFeedItem.vue` 的等待确认面板同步新增“拒绝说明（可选）”
- 用户填写拒绝说明后点击“拒绝”，TieX 会把以下内容写入底部输入框：
  - 原审批目标
  - 原审批原因
  - 原影响摘要
  - 用户拒绝原因
- “我来手动处理 / 改成人工方案”也会携带用户填写的拒绝说明
- 本次不改数据库 schema，先通过现有 `composerDraft` 机制形成可用闭环

用户可感知变化：

- 拒绝权限后不再只是中断，用户可以顺手告诉 Agent 为什么拒绝
- Agent 下一轮可以基于拒绝原因改成更安全的方案
- 对高风险命令、文件覆盖、批量修改等场景更容易表达边界

后续衔接：

- 可以新增 `permission_requests.decision_reason` 字段，把拒绝原因写入审计历史
- 可以将拒绝原因作为结构化事件回传给正在等待的 Agent，而不是只写入输入框
- 可以增加“拒绝并自动继续”按钮，跳过手动发送草稿这一步

### 2026-06-29：完成继续处理草稿的输入框聚焦

对应方向：

- 方向 2：工具调用卡片产品化
- 方向 3：权限审批体验升级
- 类型：小修小补即可完成

本次完成：

- `ChatComposer.vue` 监听到 `composerDraft` 后会自动聚焦输入框
- 光标会移动到草稿末尾，用户可以直接检查和补充
- 输入框上方新增短提示：“已填入继续处理草稿，可检查后发送”
- 提示会自动消失，不影响正常输入

用户可感知变化：

- 点击命令卡片“继续处理”或权限卡片“拒绝 / 改成人工方案”后，不需要再手动找输入框
- 草稿填入后有明确反馈，用户知道下一步是检查并发送
- 失败恢复和权限拒绝后的继续协作更顺滑

后续衔接：

- 可以给 `composerDraft` 增加来源类型，例如命令失败、权限拒绝、人工方案
- 可以在提示里显示来源，并提供撤销草稿按钮
- 可以对长草稿自动折叠诊断块，减少输入框视觉压力

### 2026-06-29：完成继续处理草稿来源提示

对应方向：

- 方向 2：工具调用卡片产品化
- 方向 3：权限审批体验升级
- 类型：小修小补即可完成

本次完成：

- `ui.store.ts` 为 `composerDraft` 增加来源类型：
  - `command_failure`
  - `permission_rejection`
  - `manual_plan`
  - `generic`
- 命令失败的“继续处理”会标记为命令诊断来源
- 权限拒绝说明会标记为权限拒绝来源
- 改成人工方案会标记为人工方案来源
- `ChatComposer.vue` 根据来源显示不同提示文案
- 旧的 `WorkflowActivity.vue` 调用点同步改为复用权限草稿文案

用户可感知变化：

- 草稿填入输入框后，用户能知道它来自命令失败、权限拒绝还是人工方案
- 多种“继续处理”入口的反馈更一致
- 后续可基于来源扩展撤销、自动继续、结构化上下文等能力

后续衔接：

- 可以给草稿提示增加“撤销”按钮
- 可以在草稿元数据里携带 taskId、commandSessionId、permissionRequestId
- 可以将来源类型传给 Agent，使下一轮任务更明确地识别用户意图

### 2026-06-29：完成任务结果卡片化最小版

对应方向：

- 方向 1：任务结果表达标准化
- 方向 5：UI / 交互信息密度
- 类型：小修小补即可完成

本次完成：

- `TaskMessageBlock.vue` 在最终回复上方新增“任务结果概览”
- 结果概览基于现有 `processItems` 汇总，不新增后端接口：
  - 工具调用成功 / 总数
  - 命令失败 / 总数
  - 生成物数量
  - 权限待处理 / 拒绝数量
- 概览会按状态显示：
  - 任务正在执行
  - 任务需要关注
  - 任务完成概览
- 新增“查看明细”入口，直接打开任务详情抽屉
- 窄屏下结果概览自动从四列变两列

用户可感知变化：

- 不展开过程详情，也能快速判断任务有没有失败命令、生成物、权限阻塞
- 最终 Markdown 摘要之外，多了一层稳定、可扫读的任务状态表达
- 历史任务回看时能更快定位需要关注的地方

后续衔接：

- 可以改为读取后端结构化 `TaskResultSummary`，而不是从过程流反推
- 可以把文件变更数量也接入概览
- 可以给失败命令、拒绝权限等概览项增加点击定位到对应过程项

### 2026-06-29：文件变更接入任务结果概览

对应方向：

- 方向 1：任务结果表达标准化
- 方向 4：本地工作区 / 产物管理增强
- 类型：小修小补即可完成

本次完成：

- `task.store.ts` 新增文件变更缓存：
  - `fileChanges`
  - `fileChangesByTaskId`
  - `loadFileChanges(taskId)`
- 当前任务详情加载、历史任务预加载、任务完成 / 失败 / 停止后都会刷新文件变更
- `TaskMessageBlock.vue` 的任务结果概览新增“文件”指标
- 文件指标会展示：
  - 生效中的文件变更数量
  - 已回滚的文件变更数量
  - 无文件变更状态
- 结果概览从四项扩展为五项：工具、命令、文件、产物、确认

用户可感知变化：

- 任务最终回复旁边能直接看到本轮是否修改了文件
- 回看历史任务时，文件变更不会只藏在任务抽屉里
- 文件变更、产物和命令结果可以在同一个概览里一起扫读

后续衔接：

- 可以点击“文件”指标直接打开任务详情的“文件变更”页
- 可以显示创建 / 修改 / 删除的分类数量
- 可以把文件变更接入真正的结构化 `TaskResultSummary` 前端卡片

### 2026-06-29：任务结果概览支持点击定位详情

对应方向：

- 方向 1：任务结果表达标准化
- 方向 5：UI / 交互信息密度
- 类型：小修小补即可完成

本次完成：

- `TaskMessageBlock.vue` 的结果概览项从静态块改为可点击按钮
- 新增 `inspectTab` 事件，用于打开指定任务详情 tab
- `ConversationView.vue` 新增 `inspectTaskTab`
- 点击概览项会打开对应详情页：
  - 工具：工具调用
  - 命令：工具调用
  - 文件：文件变更
  - 产物：生成物
  - 确认：步骤

用户可感知变化：

- 从最终回复的概览项可以直接跳到对应详情，不必再手动打开抽屉后找 tab
- 文件变更和生成物的入口更明确
- 命令失败、工具失败等问题更容易追踪

后续衔接：

- 可以进一步定位到具体失败命令或具体文件变更
- 可以给概览项增加 hover tooltip，说明会打开哪个详情页
- 可以把权限确认单独做成任务详情 tab，而不是暂时落到“步骤”

### 2026-06-29：任务详情新增确认记录页

对应方向：

- 方向 3：权限审批体验升级
- 方向 5：UI / 交互信息密度
- 类型：小修小补即可完成

本次完成：

- `TaskDrawer.vue` 新增“确认”tab
- `ui.store.ts` 的任务抽屉 tab 类型新增 `permissions`
- 确认页展示每条权限请求的：
  - 状态
  - 风险等级
  - 请求时间
  - 工具 / 权限类型
  - 原因
  - 目标
  - 影响
  - 授权范围
  - 处理时间
- `TaskMessageBlock.vue` 的结果概览“确认”项改为跳转到“确认”tab
- `ConversationView.vue` 的概览跳转类型同步支持 `permissions`

用户可感知变化：

- 权限审批历史不再散落在步骤里，可以从独立页面复盘
- 点击任务结果概览里的“确认”会直接进入确认记录
- 允许一次 / 本次会话允许 / 拒绝 / 取消等状态更容易理解

后续衔接：

- 可以在确认页对 pending 请求提供审批动作
- 可以新增拒绝原因持久化字段，显示用户为什么拒绝
- 可以把会话级授权做成可撤销列表

### 2026-06-29：确认记录页支持处理待审批请求

对应方向：

- 方向 3：权限审批体验升级
- 方向 5：UI / 交互信息密度
- 类型：小修小补即可完成

本次完成：

- `TaskDrawer.vue` 的“确认”tab 对 pending 权限请求新增直接处理动作：
  - 允许一次
  - 本次会话内允许
  - 我来手动处理
  - 拒绝
- 待审批记录新增“拒绝说明（可选）”输入框
- “我来手动处理 / 拒绝”会复用现有 `composerDraft` 闭环，将目标、原因、影响和用户说明填入底部输入框
- 审批成功后会刷新当前任务的权限请求列表
- 本次不新增数据库字段，仍复用现有 `permission.decide` IPC 和任务事件链路

用户可感知变化：

- 任务卡在等待确认时，用户可以直接在任务详情里处理，不必只依赖弹窗
- 历史复盘页和实时处理页的边界更自然：pending 是可操作状态，已处理记录是审计状态
- 拒绝或改成人工方案后，用户仍能顺手给 Agent 留下一段可编辑说明

后续衔接：

- 可以新增 `permission_requests.decision_reason` 字段，把拒绝说明写入审计历史
- 可以将拒绝原因结构化回传给正在等待的 Agent，而不是只填入输入框
- 可以在确认页增加“只允许读取同一路径 / 只允许同一命令前缀”等更细粒度 scope

### 2026-06-29：任务结果概览补充跳转提示与键盘焦点

对应方向：

- 方向 1：任务结果表达标准化
- 方向 5：UI / 交互信息密度
- 类型：小修小补即可完成

本次完成：

- `TaskMessageBlock.vue` 的任务结果概览项补充 `title` 与 `aria-label`
- 每个概览项都明确对应的跳转目标：
  - 工具：工具调用页
  - 命令：工具调用页中的命令输出
  - 文件：文件变更页
  - 产物：生成物页
  - 确认：确认页
- 概览按钮新增键盘 `focus-visible` 状态
- 本次不增加可见说明文字，保持概览卡片的信息密度

用户可感知变化：

- 鼠标悬停概览项时，可以知道点击后会打开哪里
- 键盘导航时，当前聚焦的概览项更清楚
- 任务结果概览从“能点”进一步变成“知道为什么点、点了去哪”

后续衔接：

- 可以继续定位到具体失败命令、具体文件变更或具体待处理权限
- 可以把概览项的跳转目标与任务详情内部筛选状态联动
- 可以为屏幕阅读器补充任务整体状态摘要

### 2026-06-29：Provider 与模型能力模型最小版

对应方向：

- 方向 6：Provider 与模型能力模型细化
- 类型：小修小补即可完成

本次完成：

- `src/utils/provider-capabilities.ts` 从单一 `supportsMultimodal` 扩展为统一能力对象：
  - 工具
  - 视觉
  - 附件
  - 流式
  - 上下文标签
  - 模型适用提示
- `SettingsView.vue` 的 Provider 列表新增能力标签
- 模型编辑区新增当前模型能力面板，展示能力摘要、能力标签和使用提示
- 多 Agent Provider 绑定下拉项新增能力摘要，选择模型时能直接看到差异
- `ChatComposer.vue` 的附件判断改为复用同一能力模型
- 会话设置弹层新增当前模型能力摘要和能力标签

用户可感知变化：

- 配置 Provider 时能直接判断模型是否适合附件、多模态和工具任务
- 多 Agent 绑定模型时不再只看到模型名，也能看到能力差异
- 输入区“当前模型不支持附件”的原因与设置页的能力判断保持一致

后续衔接：

- 可以把能力模型下沉到后端 Provider registry，避免前后端各维护一份判断
- 可以新增自定义 OpenAI Compatible Provider 的能力开关
- 测试连接可以返回模型能力探测结果，而不仅是连通性结果

### 2026-06-29：本地工作区资产中心最小版

对应方向：

- 方向 7：本地工作区资产中心
- 类型：小修小补即可完成

本次完成：

- `TaskDrawer.vue` 的“工作区”页新增“最近资产”区域
- 最近资产复用当前会话任务历史缓存，不新增后端接口
- 展示最近 5 个文件变更：
  - 路径
  - 操作类型
  - 当前状态
- 展示最近 5 个生成物：
  - 名称
  - 类型
  - 相对路径
- 点击文件变更会切换到对应任务并打开“文件变更”页
- 点击生成物会直接打开文件

用户可感知变化：

- 文件树、工作区记忆之外，工作区页开始承担“资产入口”的职责
- 不必进入每个任务详情，也能快速看到最近改过什么、产出了什么
- 历史任务里的生成物更容易再次打开和复用

后续衔接：

- 可以新增工作区级 `fileChange.getByWorkspace` / `artifact.getByWorkspace` 接口，脱离当前会话限制
- 可以支持按文件查看相关任务
- 可以给生成物补充定位目录、复制路径、删除等操作

### 2026-06-29：权限拒绝原因持久化

对应方向：

- 方向 3：权限审批体验升级
- 方向 9：IPC 契约类型化与边界收紧
- 类型：需要系统设计

本次完成：

- 新增数据库迁移：`electron/main/database/migrations/012_add_permission_decision_reason.sql`
- `permission_requests` 新增 `decision_reason` 字段
- 内联迁移表同步新增 `012_add_permission_decision_reason`
- `PermissionRequestRepository.updateDecision` 支持写入拒绝 / 人工处理说明
- `PermissionService.handleDecision` 支持接收可选说明
- `permission.decide(requestId, decision, decisionReason?)` IPC 增加可选第三参
- `InlinePermissionCard.vue`、`ActivityFeedItem.vue`、`TaskDrawer.vue` 的拒绝 / 人工处理入口会把用户说明写入数据库
- `TaskDrawer.vue` 的“确认”页会展示已保存的处理说明

用户可感知变化：

- 权限拒绝不再只是一次性草稿，历史任务里也能复盘当时为什么拒绝
- 确认页更接近审计记录：请求内容、授权范围、处理时间和处理说明可以一起看
- 未来排查“为什么 Agent 没继续执行某个操作”时，有明确原因可查

后续衔接：

- 可以把拒绝原因结构化回传给正在等待的 Agent，让它自动改方案继续
- 可以在最终任务摘要里列出关键拒绝原因
- 可以给会话级授权增加撤销记录与授权说明

### 2026-06-29：上下文快照记录最小版

对应方向：

- 方向 5：上下文管理可视化
- 类型：需要系统设计

本次完成：

- `context-builder.ts` 新增 `buildContextSnapshotSummary`
- 实现 Agent 每轮构建模型请求上下文后，会写入一条 `task_steps.step_type = context_snapshot`
- 快照只保存摘要，不保存完整系统 prompt：
  - system / user / assistant / tool 消息数量
  - 可用工具列表
  - 是否带入上一轮工具历史
  - 会话摘要、协作简报、纠正提醒、工具事实等来源标记
  - 最近用户信号的短片段
- `TaskDrawer.vue` 的“上下文”页新增“实际上下文快照”区域
- 每轮快照可展开查看，和已有会话摘要、工作区记忆、协作 Agent 简报放在同一页

用户可感知变化：

- 用户不再只能看到“当前记忆”，还能看到任务执行当时每轮模型请求前的上下文构成
- 排查 Agent 为什么忽略某条信息、是否带入简报、是否带入工具结果更直观
- 快照不暴露完整系统提示词，降低审计信息过载和敏感规则泄露风险

后续衔接：

- 可以将快照拆成结构化表，而不是存在 task step 文本里
- 可以为快照增加 token 估算、附件数量和被裁剪消息数量
- 可以在最终任务摘要里链接到关键上下文快照

### 2026-06-29：任务结果结构化对象最小版

对应方向：

- 方向 1：任务结果表达标准化
- 类型：小修小补 + 局部设计

本次完成：

- `task-result-summary.ts` 新增 `StructuredTaskResultSummary`
- 后端现在同时生成两种结果摘要：
  - 结构化对象：供前端稳定渲染
  - Markdown 文本：继续用于最终回复
- 结构化对象包含：
  - 总体结果
  - 工具 / 命令 / 文件变更 / 生成物 / 权限统计
  - 文件变更清单
  - 生成物清单
  - 验证与命令清单
  - 未完成与风险清单
- 结构化对象保存为 `task_steps.step_type = task_result_summary`
- responder 正常路径和 bypass responder 快速路径都会记录结构化摘要
- `TaskMessageBlock.vue` 的任务结果概览会优先读取结构化摘要；旧任务没有该步骤时继续回退到过程流推断

用户可感知变化：

- 任务结果概览不再完全依赖前端从活动流反推，数据来源更稳定
- 历史任务复盘时，结果对象可以随任务一起保存
- Markdown 最终回复和前端概览开始共享同一份事实来源

后续衔接：

- 可以将结构化结果从 task step 迁移到独立 `task_result_summaries` 表
- 可以让任务详情新增“结果”tab，直接渲染结构化对象
- 可以在结果对象里标记失败项是否已被后续任务处理

### 2026-06-29：会话节点分支设计与安全边界

对应方向：

- 方向 4：会话分支从“复制分支”升级为“节点分支”
- 类型：需要系统设计

本次完成：

- 新增设计文档：`docs/TieX-会话节点分支设计.md`
- 明确 TieX 不应直接照搬普通聊天客户端节点分支，因为 assistant 消息可能绑定：
  - Agent 任务
  - 文件变更
  - 权限审批
  - 命令 session
  - 生成物
- 给出推荐中期模型：
  - `message_nodes`
  - `message_variants`
  - `variant_kind`
  - `execution_state`
- 明确切换规则：
  - 纯聊天 / 只读任务可直接切换
  - 有本地副作用的执行型任务必须提示
  - 不允许静默回滚、静默重放命令或多个候选共用同一 task
- 给出三阶段路线：
  - 纯 UI 与元数据准备
  - 用户消息编辑后重试
  - Agent 任务候选

用户可感知变化：

- 当前阶段没有直接改变消息模型，避免破坏任务历史和文件事实
- 后续做编辑重试和候选回答时，有清晰安全边界
- “同一轮多版本回复”和“本地执行审计”不会互相打架

后续衔接：

- 可以先实现纯聊天消息候选，不触碰 Agent 任务
- 可以在消息菜单里增加“从这里生成另一个回复”
- 等 IPC 类型和测试补齐后，再做数据库迁移

### 2026-06-29：IPC 契约收紧第一步

对应方向：

- 方向 9：IPC 契约类型化与边界收紧
- 类型：小修小补 + 系统设计

本次完成：

- `electron/preload/index.ts` 对高频关键通道补充明确类型
- Provider 通道从 `any` 收紧为：
  - `ProviderInfo[]`
  - `ProviderInfo | null`
  - `ProviderInfo`
- Task 通道从 `any` 收紧为：
  - `TaskInfo`
  - `TaskStepEntity`
  - `ToolCallEntity`
  - `OperationLogEntity`
  - `TaskEvent`
- Permission 通道收紧为：
  - `PermissionDecision`
  - `PermissionRequestInfo`
- FileChange / Artifact / Command / Stats 通道补充返回类型
- 本次使用 type-only import，不改变运行时代码

用户可感知变化：

- 用户不直接感知 UI 变化
- 后续修改任务、权限、Provider、生成物等通道时，类型检查能更早发现字段错配
- 刚新增的权限拒绝原因、结构化任务结果等能力更不容易在 IPC 边界丢字段

后续衔接：

- 可以继续收紧 conversation / chat / workspace / memory 通道
- 可以在 IPC handler 入口增加 zod 校验
- 可以把 shared types 与前端 global types 合并为单一来源

### 2026-06-29：体验回归测试补齐

对应方向：

- 方向 10：测试从核心安全扩展到体验回归
- 类型：小修小补即可完成

本次完成：

- 新增 `tests/unit/provider-capabilities.test.ts`
- 覆盖 Provider 能力推导：
  - SiliconFlow VL 模型支持视觉 / 附件
  - DeepSeek 文本模型不支持附件
  - 能力标签顺序和摘要文本稳定
- 新增 `tests/unit/permission-display.test.ts`
- 覆盖权限展示与拒绝草稿：
  - 风险等级文案与样式 class
  - 权限字段过滤空值
  - 人工方案草稿包含用户拒绝原因
- 修正 `tests/unit/stats-service.test.ts` 的小时桶测试夹具，使用 `+08:00` 时间以匹配本地小时桶语义
- 完整测试通过：12 个测试文件，178 个测试

用户可感知变化：

- Provider 能力标签、附件支持判断、权限拒绝草稿这些体验逻辑有了回归保护
- 后续改设置页、输入区或权限卡片时，更容易发现文案和判断逻辑被改坏
- 统计图小时桶测试恢复稳定，避免环境时区导致误报

后续衔接：

- 可以继续补 `TaskMessageBlock` 结构化结果解析测试
- 可以补 `task.store` 对任务事件和历史缓存的 reducer 测试
- 可以补权限拒绝原因持久化的 repository 集成测试
