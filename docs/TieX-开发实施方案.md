# TieX 开发实施方案

> 产品名称：TieX  
> 文档类型：开发实施方案  
> 对应版本：V1.0 MVP  
> 目标平台：Windows 11  
> 技术栈：Electron + Vue 3 + TypeScript + SQLite + DeepSeek API

---

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | TieX 开发实施方案 |
| 产品名称 | TieX |
| 对应版本 | V1.0 MVP |
| 文档状态 | 初稿 |
| 主要读者 | 开发者、Trae、Codex、测试人员 |
| 关联文档 | TieX-PRD.md、TieX-原型设计说明.md、TieX-技术架构与概要设计.md、TieX-数据库设计.md、TieX-Agent与工具调用设计.md |

---

## 2. 文档目的

本文档用于指导 TieX V1.0 的实际开发实施。

本文档重点明确：

1. 项目目录如何建立；
2. 前端、Electron 主进程和公共类型如何划分；
3. 各阶段开发顺序；
4. 每个阶段要完成哪些任务；
5. 每个阶段的验收标准；
6. Trae 或其他 AI 编程工具应按什么顺序执行；
7. 哪些功能暂时禁止开发；
8. 每个阶段如何提交代码；
9. 如何避免一次性开发造成架构混乱；
10. 如何保证项目始终处于可运行状态。

---

## 3. 开发目标

TieX V1.0 的开发目标不是一次性实现完整 Codex，而是逐步完成一个稳定、可控、可扩展的本地桌面 AI 智能体工作台。

V1.0 最终应具备：

- Windows 桌面应用；
- Codex 风格界面；
- 可收起侧边栏；
- DeepSeek API 配置；
- 多轮聊天；
- 本地会话存储；
- 工作区选择；
- 文件读取和搜索；
- Agent Tool Calls；
- 权限审批；
- 文件创建和修改；
- Diff 和恢复；
- Markdown、DOCX、PPTX 生成；
- 基础受限命令执行；
- 日志和错误处理。

---

## 4. 开发原则

### 4.1 分阶段开发

每个阶段完成后必须：

- 项目可以启动；
- 核心功能可手工验证；
- 不遗留阻塞性报错；
- 通过当前阶段验收；
- 提交 Git。

禁止一次性要求 AI 完成全部功能。

### 4.2 先静态界面，后真实能力

开发顺序：

```text
界面骨架
→ 本地数据
→ 模型聊天
→ 工作区读取
→ Agent Runtime
→ 权限与修改
→ 文档/PPT
→ 命令执行
```

### 4.3 先读后写

在智能体工具开发中：

```text
list_files
→ read_file
→ search_files
→ create_file
→ edit_file
→ run_command
```

先完成读取工具，再开放写入和命令。

### 4.4 始终保持安全边界

任何阶段不得为了“先跑起来”而：

- 开启 `nodeIntegration`；
- 在 Vue 中直接使用 `fs`；
- 暴露通用命令执行 IPC；
- 跳过路径校验；
- 明文保存 API Key；
- 静默覆盖文件。

### 4.5 不新增功能

开发必须严格依据现有文档。

V1.0 不允许擅自加入：

- 登录注册；
- 云同步；
- 插件；
- MCP；
- 自动化；
- 多智能体；
- 浏览器控制；
- 团队协作；
- 会员系统；
- 移动端；
- 远程任务。

---

## 5. 项目目录结构

```text
TieX/
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml
├── .gitignore
├── .env.example
│
├── docs/
│   ├── TieX-PRD.md
│   ├── TieX-原型设计说明.md
│   ├── TieX-技术架构与概要设计.md
│   ├── TieX-数据库设计.md
│   ├── TieX-Agent与工具调用设计.md
│   └── TieX-开发实施方案.md
│
├── prototype/
│   └── TieX-Prototype.html
│
├── electron/
│   ├── main/
│   │   ├── index.ts
│   │   │
│   │   ├── app/
│   │   │   ├── lifecycle.ts
│   │   │   ├── window.ts
│   │   │   └── menu.ts
│   │   │
│   │   ├── ipc/
│   │   │   ├── index.ts
│   │   │   ├── conversation.ipc.ts
│   │   │   ├── workspace.ipc.ts
│   │   │   ├── task.ipc.ts
│   │   │   └── settings.ipc.ts
│   │   │
│   │   ├── agent/
│   │   │   ├── agent-runtime.ts
│   │   │   ├── task-controller.ts
│   │   │   ├── context-builder.ts
│   │   │   ├── response-parser.ts
│   │   │   ├── task-limits.ts
│   │   │   ├── task-state.ts
│   │   │   └── system-prompt.ts
│   │   │
│   │   ├── providers/
│   │   │   ├── model-provider.ts
│   │   │   └── deepseek-provider.ts
│   │   │
│   │   ├── tools/
│   │   │   ├── tool-registry.ts
│   │   │   ├── tool-executor.ts
│   │   │   ├── tool.types.ts
│   │   │   ├── list-files.tool.ts
│   │   │   ├── read-file.tool.ts
│   │   │   ├── search-files.tool.ts
│   │   │   ├── create-file.tool.ts
│   │   │   ├── edit-file.tool.ts
│   │   │   ├── create-markdown.tool.ts
│   │   │   ├── create-docx.tool.ts
│   │   │   ├── create-pptx.tool.ts
│   │   │   └── run-command.tool.ts
│   │   │
│   │   ├── services/
│   │   │   ├── conversation.service.ts
│   │   │   ├── workspace.service.ts
│   │   │   ├── settings.service.ts
│   │   │   ├── permission.service.ts
│   │   │   ├── backup.service.ts
│   │   │   ├── artifact.service.ts
│   │   │   └── command.service.ts
│   │   │
│   │   ├── security/
│   │   │   ├── path-guard.ts
│   │   │   ├── permission-policy.ts
│   │   │   ├── command-policy.ts
│   │   │   ├── schema-validator.ts
│   │   │   └── secret-filter.ts
│   │   │
│   │   ├── database/
│   │   │   ├── database.ts
│   │   │   ├── migrations/
│   │   │   │   ├── 001_initial_schema.sql
│   │   │   │   └── 002_add_indexes.sql
│   │   │   └── repositories/
│   │   │       ├── settings.repository.ts
│   │   │       ├── provider.repository.ts
│   │   │       ├── workspace.repository.ts
│   │   │       ├── conversation.repository.ts
│   │   │       ├── message.repository.ts
│   │   │       ├── task.repository.ts
│   │   │       ├── task-step.repository.ts
│   │   │       ├── tool-call.repository.ts
│   │   │       ├── permission.repository.ts
│   │   │       ├── file-change.repository.ts
│   │   │       ├── artifact.repository.ts
│   │   │       └── operation-log.repository.ts
│   │   │
│   │   └── shared/
│   │       ├── errors.ts
│   │       ├── constants.ts
│   │       └── logger.ts
│   │
│   ├── preload/
│   │   ├── index.ts
│   │   └── api.ts
│   │
│   └── shared/
│       ├── ipc.ts
│       ├── types.ts
│       ├── task.types.ts
│       ├── tool.types.ts
│       └── settings.types.ts
│
├── src/
│   ├── main.ts
│   ├── App.vue
│   │
│   ├── router/
│   │   └── index.ts
│   │
│   ├── layouts/
│   │   └── AppLayout.vue
│   │
│   ├── views/
│   │   ├── HomeView.vue
│   │   ├── ConversationView.vue
│   │   └── SettingsView.vue
│   │
│   ├── components/
│   │   ├── AppSidebar.vue
│   │   ├── AppTopbar.vue
│   │   ├── ChatComposer.vue
│   │   ├── MessageList.vue
│   │   ├── MessageItem.vue
│   │   ├── ToolCallCard.vue
│   │   ├── PermissionDialog.vue
│   │   ├── TaskDrawer.vue
│   │   ├── DiffViewer.vue
│   │   ├── ArtifactCard.vue
│   │   └── WorkspaceSelector.vue
│   │
│   ├── stores/
│   │   ├── app.store.ts
│   │   ├── ui.store.ts
│   │   ├── conversation.store.ts
│   │   ├── workspace.store.ts
│   │   ├── task.store.ts
│   │   └── settings.store.ts
│   │
│   ├── composables/
│   │   ├── useTaskEvents.ts
│   │   ├── useTheme.ts
│   │   └── useSidebar.ts
│   │
│   ├── styles/
│   │   ├── variables.css
│   │   ├── base.css
│   │   └── components.css
│   │
│   └── types/
│       └── global.d.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── resources/
    ├── icons/
    └── templates/
        ├── docx/
        └── pptx/
```

---

## 6. 环境准备

### 6.1 开发环境

建议：

- Windows 11；
- Node.js LTS；
- npm 或 pnpm；
- Git；
- VS Code / Trae；
- PowerShell 或 Windows Terminal。

### 6.2 依赖建议

基础依赖：

```text
electron
vue
vue-router
pinia
typescript
vite
```

本地能力：

```text
better-sqlite3
zod 或 ajv
electron-log
```

内容处理：

```text
markdown-it
shiki
diff
docx
pptxgenjs
```

打包和测试：

```text
electron-builder
vitest
playwright
eslint
prettier
```

### 6.3 环境变量

`.env.example` 可包含：

```text
VITE_APP_NAME=TieX
```

真实 API Key 不写入 `.env`。

用户 API Key 应由设置页录入，并使用 Electron `safeStorage` 保存。

---

## 7. Git 与分支策略

### 7.1 分支建议

个人开发可使用：

```text
main
develop
feature/*
fix/*
```

如果希望简化，也可只使用：

```text
main
feature/*
```

### 7.2 提交要求

每个阶段至少提交一次稳定版本。

建议提交格式：

```text
feat: 完成 TieX 基础界面
feat: 接入 DeepSeek 流式聊天
feat: 实现工作区读取工具
fix: 修复路径越界校验
docs: 更新开发实施方案
test: 添加 Agent Runtime 测试
```

### 7.3 开发前备份

在让 Trae 执行较大改动前：

```bash
git status
git add .
git commit -m "chore: backup before AI changes"
```

这是防止 AI 把“优化结构”理解成“重建宇宙”的最便宜保险。

---

# 8. 阶段一：项目初始化与静态界面

## 8.1 阶段目标

建立可运行的 Electron + Vue 3 + TypeScript 项目，并根据 HTML 原型实现静态界面。

## 8.2 开发内容

### 工程初始化

- 初始化 package.json；
- 配置 Electron；
- 配置 Vite；
- 配置 TypeScript；
- 配置 Vue Router；
- 配置 Pinia；
- 配置 ESLint 和 Prettier；
- 配置 electron-builder。

### Electron

- 创建主窗口；
- 使用自定义标题栏；
- 配置安全参数；
- 开发环境加载 Vite；
- 生产环境加载构建文件。

### 前端

- 实现 AppLayout；
- 实现可收起侧边栏；
- 实现顶部栏；
- 实现首页；
- 实现会话页静态状态；
- 实现右侧任务抽屉；
- 实现权限弹窗；
- 实现设置页；
- 实现浅色和深色主题。

### 模拟数据

暂时使用前端 Mock 数据展示：

- 最近会话；
- 工具调用；
- 文件 Diff；
- 任务步骤；
- API 设置。

## 8.3 验收标准

- `npm run dev` 可启动；
- Windows 窗口正常显示；
- 无严重控制台错误；
- 侧边栏可展开和收起；
- 页面可切换；
- 深浅色主题可切换；
- 权限弹窗可打开和关闭；
- 任务抽屉可打开和关闭；
- 页面视觉与原型基本一致；
- 不接入真实 API；
- 不实现文件操作。

## 8.4 阶段交付

- 可运行项目；
- 基础 README；
- 首次 Git 提交；
- 界面截图；
- 阶段验收记录。

---

# 9. 阶段二：SQLite 与本地设置

## 9.1 阶段目标

建立数据库、迁移和本地设置管理。

## 9.2 开发内容

### 数据库

- 初始化 SQLite；
- 启用外键；
- 启用 WAL；
- 创建迁移机制；
- 执行 `001_initial_schema.sql`；
- 执行索引迁移；
- 插入默认设置；
- 插入默认 DeepSeek 配置。

### Repository

优先实现：

- settings.repository；
- provider.repository；
- conversation.repository；
- message.repository。

### 设置功能

- 读取设置；
- 更新设置；
- 保存主题；
- 保存侧边栏状态；
- 保存任务默认配置；
- 保存 DeepSeek 配置；
- API Key 使用 safeStorage。

### IPC

实现：

```text
settings:get
settings:update
provider:get-default
provider:update
```

## 9.3 验收标准

- 首次启动自动创建 tiex.db；
- 迁移执行成功；
- 重复启动不重复建表；
- 主题设置可持久化；
- 侧边栏状态可持久化；
- DeepSeek 配置可保存；
- API Key 不以明文出现在数据库；
- 渲染进程不能直接访问数据库。

## 9.4 阶段交付

- 数据库迁移；
- Repository；
- 设置页真实保存；
- 单元测试；
- Git 提交。

---

# 10. 阶段三：DeepSeek 普通聊天

## 10.1 阶段目标

在不调用本地工具的情况下，完成稳定的 DeepSeek 多轮聊天。

## 10.2 开发内容

### Provider

- 定义 ModelProvider；
- 实现 DeepSeekProvider；
- 连接测试；
- 流式请求；
- AbortController；
- 错误分类。

### 会话

- 新建会话；
- 自动保存消息；
- 加载最近会话；
- 重命名；
- 删除；
- 自动标题可暂时使用首条消息截断。

### 消息

- 用户消息；
- Assistant 流式消息；
- Markdown 渲染；
- 代码高亮；
- 停止生成。

### 权限

此阶段仅支持：

```text
chat
```

不开放工作区和工具。

## 10.3 验收标准

- 用户可测试 DeepSeek 连接；
- 用户可发送消息；
- Assistant 流式输出；
- 支持停止生成；
- 支持多轮聊天；
- 会话和消息可持久化；
- 应用重启后可恢复会话；
- API Key 无效时提示明确；
- 网络错误可重试；
- 不调用任何本地工具。

## 10.4 阶段交付

- DeepSeekProvider；
- 会话与消息功能；
- 错误提示；
- 流式聊天测试；
- Git 提交。

---

# 11. 阶段四：工作区与只读工具

## 11.1 阶段目标

允许用户选择工作区，并安全读取项目文件。

## 11.2 开发内容

### 工作区

- 系统文件夹选择器；
- 保存工作区；
- 最近工作区；
- 工作区可用性检查；
- 工作区切换。

### Path Guard

实现：

- 相对路径校验；
- 绝对路径拒绝；
- `path.relative` 边界判断；
- realpath；
- 符号链接防护；
- UNC 路径拒绝；
- 不存在新文件的父目录校验。

### 只读工具

- `list_files`
- `read_file`
- `search_files`

### UI

- 工作区选择器；
- 文件树；
- 工具调用卡片；
- 任务详情抽屉；
- 读取模式。

## 11.3 验收标准

- 用户可选择工作区；
- 工作区保存成功；
- 文件树可显示；
- list_files 可执行；
- read_file 可分段读取；
- search_files 可搜索；
- 路径穿越被拒绝；
- 工作区外路径被拒绝；
- 符号链接绕过被拒绝；
- 默认忽略 node_modules 和 .git；
- 读取模式无法写入文件。

## 11.4 阶段交付

- WorkspaceService；
- PathGuard；
- 三个只读工具；
- 工作区 UI；
- 安全测试；
- Git 提交。

---

# 12. 阶段五：Agent Runtime 与 Tool Calls

## 12.1 阶段目标

完成真正的单 Agent 多轮工具调用。

## 12.2 开发内容

### Agent Runtime

- 创建任务；
- Task Controller；
- Agent Loop；
- Context Builder；
- Response Parser；
- 最大轮数；
- 最大工具调用数；
- 失败计数；
- 任务停止。

### Tool Registry

- 工具注册；
- 工具查找；
- Schema 输出；
- 参数校验；
- Tool Executor。

### 数据持久化

- tasks；
- task_steps；
- tool_calls；
- operation_logs。

### 事件

- task.started；
- message.delta；
- tool.started；
- tool.completed；
- task.completed；
- task.failed；
- task.stopped。

### UI

- 任务状态；
- 工具执行卡片；
- 步骤列表；
- 停止任务。

## 12.3 验收标准

- 用户输入任务可创建 Task；
- DeepSeek 可返回工具调用；
- 工具可通过 Registry 执行；
- 工具参数非法时拒绝；
- 工具结果可回传模型；
- Agent 可继续下一轮；
- 模型最终输出可保存；
- 最大轮数可停止；
- 最大工具数可停止；
- 用户可停止任务；
- 应用退出时任务标记为 interrupted；
- 未注册工具不执行。

## 12.4 阶段交付

- Agent Runtime；
- Tool Registry；
- 任务事件；
- 任务 UI；
- 集成测试；
- Git 提交。

---

# 13. 阶段六：权限审批与文件修改

## 13.1 阶段目标

支持安全创建和修改文件，并提供 Diff 和恢复。

## 13.2 开发内容

### 工具

- `create_file`
- `edit_file`

### 权限

- PermissionService；
- PermissionPolicy；
- 权限请求记录；
- 允许一次；
- 本任务允许；
- 拒绝；
- 过期和停止。

### 文件修改

- 修改前备份；
- 临时文件写入；
- 原子替换；
- 哈希计算；
- file_changes；
- Diff；
- 恢复。

### UI

- 权限审批弹窗；
- DiffViewer；
- 文件变更列表；
- 恢复按钮。

## 13.3 验收标准

- 新文件可创建；
- 已存在文件不会静默覆盖；
- 修改文件前产生审批；
- 拒绝后不执行；
- 修改前创建备份；
- 修改后显示 Diff；
- file_changes 正确保存；
- 可恢复单个文件；
- 哈希冲突时提示；
- 本任务授权不跨任务；
- 停止任务后不再写入。

## 13.4 阶段交付

- PermissionService；
- BackupService；
- 文件写入工具；
- Diff 和恢复；
- 安全测试；
- Git 提交。

---

# 14. 阶段七：Markdown、DOCX 与 PPTX

## 14.1 阶段目标

支持生成可实际打开的文档和演示文件。

## 14.2 开发内容

### Markdown

- create_markdown；
- 文件名校验；
- 生成物记录。

### DOCX

- DocumentSpec；
- 基础模板；
- 标题；
- 段落；
- 列表；
- 表格；
- 页码；
- 文档保存。

### PPTX

- PresentationSpec；
- 固定版式；
- 封面页；
- 目录页；
- 标题正文页；
- 双栏页；
- 表格页；
- 总结页。

### Artifact

- ArtifactService；
- artifacts 表；
- 文件卡片；
- 打开文件；
- 打开所在目录。

## 14.3 验收标准

- 可生成 Markdown；
- 可生成 DOCX；
- 可生成 PPTX；
- 文件可正常打开；
- 生成物写入 artifacts；
- 文件名非法时拒绝；
- 已存在文件需审批；
- PPT 不出现严重文本溢出；
- DOCX 标题层级正确；
- 用户可定位生成文件。

## 14.4 阶段交付

- 三个生成工具；
- 模板；
- ArtifactService；
- 示例文件；
- Git 提交。

---

# 15. 阶段八：受限命令执行

## 15.1 阶段目标

支持安全执行少量开发命令。

## 15.2 开发内容

### Command Runner

- 命令和参数分离；
- cwd 固定为工作区；
- 默认不启用 shell；
- 超时；
- 输出截断；
- 进程树终止；
- 环境变量过滤；
- 命令日志。

### Command Policy

允许：

- npm test；
- npm run build；
- npm run lint；
- git status；
- git diff；
- 项目已有脚本。

默认禁止：

- 删除目录树；
- 系统命令；
- 注册表；
- 关机重启；
- 编码 PowerShell；
- 工作区外路径。

### UI

- 命令审批；
- 实时输出；
- 退出码；
- 停止命令。

## 15.3 验收标准

- 所有命令执行前审批；
- cwd 无法由模型修改；
- 超时后终止；
- 用户停止后终止；
- 危险命令被拒绝；
- 输出长度有限制；
- 环境变量不泄露；
- 命令结果可回传模型；
- 应用退出不遗留子进程。

## 15.4 阶段交付

- CommandService；
- CommandPolicy；
- run_command；
- 命令 UI；
- 安全测试；
- Git 提交。

---

# 16. 阶段九：完善、测试与打包

## 16.1 阶段目标

完成 V1.0 收尾和 Windows 安装包。

## 16.2 开发内容

### 测试

- 单元测试；
- 集成测试；
- E2E；
- 手工回归；
- 安全测试。

### 性能

- 消息分页；
- 流式更新节流；
- 文件树懒加载；
- 日志清理；
- Diff 长内容折叠。

### 错误处理

- API 错误；
- 文件错误；
- 数据库错误；
- 权限错误；
- 命令错误；
- 应用退出。

### 打包

- 应用图标；
- NSIS；
- 安装目录；
- 应用数据目录；
- 版本号；
- README；
- 发布说明。

## 16.3 验收标准

- Windows 11 安装成功；
- 应用可正常启动；
- 卸载不误删用户数据；
- 数据库迁移正常；
- 核心 E2E 流程通过；
- 无高风险安全缺陷；
- 无阻塞性崩溃；
- README 完整；
- 版本号为 1.0.0 或 0.1.0。

## 16.4 阶段交付

- 安装包；
- 测试报告；
- 发布说明；
- 最终 Git Tag；
- V1.0 归档。

---

## 17. 阶段依赖关系

```text
阶段一 基础界面
  ↓
阶段二 数据库与设置
  ↓
阶段三 DeepSeek 聊天
  ↓
阶段四 工作区只读
  ↓
阶段五 Agent Runtime
  ↓
阶段六 权限与修改
  ↓
阶段七 文档和 PPT
  ↓
阶段八 命令执行
  ↓
阶段九 测试和打包
```

禁止跳过阶段五直接开发文件修改。

原因：

- 写入工具依赖 Agent Runtime；
- 权限审批依赖任务状态；
- Diff 依赖文件变更记录；
- 命令执行依赖权限和停止机制。

---

## 18. 每阶段工作方式

每个阶段建议遵循：

```text
1. 阅读对应文档
2. 列出任务清单
3. 检查现有目录和代码
4. 只修改本阶段需要的文件
5. 完成编码
6. 运行 lint
7. 运行测试
8. 启动应用手工验证
9. 汇总变更
10. 提交 Git
```

---

## 19. Trae 执行顺序

### 19.1 第一次交给 Trae

只要求：

- 阅读全部文档；
- 初始化项目；
- 完成阶段一；
- 不接入 API；
- 不实现 Agent；
- 不实现文件读写。

### 19.2 后续每次任务

每次只给一个阶段或一个小模块。

例如：

```text
本次只完成阶段二：SQLite 与本地设置。

要求：
1. 严格按照数据库设计实现；
2. 不接入 DeepSeek；
3. 不实现工作区；
4. 不新增 PRD 外功能；
5. 完成后运行测试并汇报修改文件。
```

### 19.3 大任务拆分

一个阶段仍应继续拆分。

例如阶段五：

```text
5.1 Task 数据结构
5.2 Task Controller
5.3 Tool Registry
5.4 Agent Loop
5.5 DeepSeek Tool Calls
5.6 Task Event
5.7 UI 联调
```

---

## 20. 推荐给 Trae 的首轮提示词

```text
请先完整阅读项目 docs 目录中的以下文档：

1. TieX-PRD.md
2. TieX-原型设计说明.md
3. TieX-技术架构与概要设计.md
4. TieX-数据库设计.md
5. TieX-Agent与工具调用设计.md
6. TieX-开发实施方案.md

同时阅读 prototype/TieX-Prototype.html。

当前只执行《TieX 开发实施方案》的“阶段一：项目初始化与静态界面”。

要求：

1. 在当前 TieX 目录内初始化 Electron + Vue 3 + TypeScript + Vite 项目；
2. 根据原型实现主窗口、可收起侧边栏、首页、会话页、右侧任务抽屉、权限弹窗和设置页；
3. 使用 Mock 数据，不接入 DeepSeek API；
4. 不实现数据库；
5. 不实现文件读写；
6. 不实现 Agent Runtime；
7. 不实现插件、自动化、多智能体和登录注册；
8. Electron 必须设置 contextIsolation=true、nodeIntegration=false、sandbox=true；
9. 正式页面拆分为 Vue 组件，不直接复制单文件 HTML 作为生产代码；
10. 完成后运行项目，修复构建错误；
11. 输出新增和修改的文件列表；
12. 输出启动方式和当前完成情况；
13. 不得进入第二阶段。

请先检查现有目录，再开始修改。
```

---

## 21. 后续阶段提示词模板

```text
请阅读 docs/TieX-开发实施方案.md，并严格执行“阶段 X”。

同时参考：
- TieX-PRD.md
- TieX-技术架构与概要设计.md
- TieX-数据库设计.md
- TieX-Agent与工具调用设计.md

本次任务边界：
- 只实现：XXX
- 不实现：XXX
- 不重构无关模块
- 不新增需求外功能

执行要求：
1. 先检查现有代码；
2. 列出实施步骤；
3. 按现有架构开发；
4. 为核心逻辑添加测试；
5. 运行 lint、测试和构建；
6. 修复错误；
7. 汇报修改文件和验收结果；
8. 不进入下一阶段。
```

---

## 22. 代码质量要求

### 22.1 TypeScript

- 不滥用 `any`；
- 公共类型集中定义；
- IPC 请求和响应类型明确；
- 错误类型明确；
- 工具输入输出有类型。

### 22.2 Vue

- 页面只负责展示和交互；
- 业务状态进入 Pinia；
- IPC 调用通过 Store 或 Service；
- 避免超大组件；
- 组件职责单一。

### 22.3 Electron

- 主进程不包含 UI 逻辑；
- Preload 不包含复杂业务；
- IPC 通道集中管理；
- 不暴露通用系统 API；
- 主进程负责安全校验。

### 22.4 数据库

- SQL 参数化；
- Repository 模式；
- 迁移不可随意修改；
- 事务边界清晰；
- 外键启用。

### 22.5 Agent

- 模型输出视为不可信；
- 工具 Schema 校验；
- 权限先于执行；
- 路径先于文件操作；
- 停止信号贯穿全流程。

---

## 23. 测试要求

### 23.1 每阶段最低要求

| 阶段 | 最低测试 |
|---|---|
| 阶段一 | 页面与组件手工测试 |
| 阶段二 | Repository 单元测试 |
| 阶段三 | Provider Mock 测试 |
| 阶段四 | PathGuard 安全测试 |
| 阶段五 | Agent Loop 集成测试 |
| 阶段六 | 权限和恢复测试 |
| 阶段七 | 生成文件打开验证 |
| 阶段八 | 命令策略安全测试 |
| 阶段九 | E2E 与回归测试 |

### 23.2 禁止只看“能启动”

每个阶段不仅要启动成功，还要验证：

- 数据是否正确；
- 错误是否可见；
- 停止是否有效；
- 权限是否生效；
- 应用重启后是否保留；
- 安全限制是否真的拦截。

---

## 24. 阶段验收记录模板

```text
阶段名称：
完成时间：

一、完成功能
- 
- 

二、未完成功能
- 
- 

三、修改文件
- 
- 

四、测试结果
- lint：
- unit：
- integration：
- build：
- manual：

五、已知问题
- 
- 

六、是否可以进入下一阶段
- 是 / 否
```

---

## 25. 风险控制

### 25.1 AI 擅自扩大范围

应对：

- 每次任务明确“只做什么”；
- 明确“不得进入下一阶段”；
- 要求先列计划；
- 要求输出修改文件；
- 使用 Git 提交保护。

### 25.2 架构被随意重写

应对：

- 以技术架构文档为准；
- 禁止无关重构；
- 大重构必须先说明；
- 修改目录结构需同步更新文档。

### 25.3 安全功能被简化

应对：

- 路径守卫必须测试；
- API Key 必须加密；
- 文件修改必须备份；
- 命令必须审批；
- 不接受“暂时跳过安全校验”。

### 25.4 DeepSeek 接口变化

应对：

- 模型名称可配置；
- Provider 抽象；
- 错误分类；
- Tool Calls 解析独立；
- 不把 API 格式散落在业务代码中。

### 25.5 功能过多导致无法收尾

应对：

- 阶段七完成后已具备核心价值；
- 阶段八命令执行可作为最后开发项；
- 不加入插件和自动化；
- 不追求完整 Codex。

---

## 26. 里程碑建议

### M1：可运行桌面原型

完成阶段一。

结果：

- TieX 以 Windows 桌面应用运行；
- UI 接近原型；
- 无真实智能体能力。

### M2：可用聊天助手

完成阶段二和阶段三。

结果：

- 可配置 DeepSeek；
- 可多轮聊天；
- 数据本地保存。

### M3：可读工作区智能体

完成阶段四和阶段五。

结果：

- Agent 可读取和分析项目；
- 支持 Tool Calls；
- 支持任务步骤和停止。

### M4：可修改工作区智能体

完成阶段六。

结果：

- 可创建和修改文件；
- 有审批；
- 有 Diff；
- 可恢复。

### M5：多类型任务助手

完成阶段七。

结果：

- 可生成 Markdown、DOCX、PPTX。

### M6：基础编程执行助手

完成阶段八和阶段九。

结果：

- 可运行受限命令；
- 可打包发布。

---

## 27. V1.0 最终验收流程

### 27.1 首次启动

- 安装 TieX；
- 启动应用；
- 自动创建数据库；
- 打开设置页；
- 配置 DeepSeek；
- 测试连接成功。

### 27.2 普通聊天

- 新建会话；
- 发送消息；
- 流式回复；
- 停止生成；
- 重启后恢复。

### 27.3 工作区读取

- 选择项目目录；
- 切换读取模式；
- 要求分析目录；
- 查看工具调用；
- 验证无法读取工作区外文件。

### 27.4 文件修改

- 切换执行模式；
- 要求修改一个文件；
- 弹出审批；
- 允许一次；
- 查看 Diff；
- 恢复文件。

### 27.5 文档生成

- 生成 Markdown；
- 生成 DOCX；
- 生成 PPTX；
- 打开文件；
- 检查生成物记录。

### 27.6 命令执行

- 请求运行测试；
- 弹出审批；
- 执行；
- 查看输出；
- 停止长时间命令。

---

## 28. 开发完成定义

TieX V1.0 只有同时满足以下条件才算完成：

1. Windows 安装包可运行；
2. DeepSeek 可配置；
3. 会话可持久化；
4. 工作区访问受限；
5. Agent Tool Calls 可运行；
6. 高风险操作有审批；
7. 文件修改可恢复；
8. 文档和 PPT 可生成；
9. 命令执行受限；
10. 停止任务有效；
11. 日志无 API Key；
12. 核心测试通过；
13. 无超出 PRD 的额外复杂模块；
14. README 和文档同步更新。

---

## 29. 后续版本规划原则

V1.0 完成后，再根据实际使用情况决定是否增加：

- Git 分支与 Worktree；
- Docker；
- Windows Sandbox；
- 自定义 Agent；
- MCP；
- 插件；
- 自动化；
- 多 Agent；
- 本地模型；
- 云同步。

后续功能不得反向阻塞 V1.0 开发。

---

## 30. 总结

TieX 应采用渐进式开发。

推荐核心顺序：

```text
桌面界面
→ 本地数据库
→ DeepSeek 聊天
→ 工作区只读
→ Agent Tool Calls
→ 权限和文件修改
→ 文档与 PPT
→ 受限命令
→ 测试与打包
```

每个阶段都必须保持项目可启动、可测试、可回退。

给 Trae 的任务必须小而明确，禁止直接要求“根据全部文档完成整个项目”。AI 编程工具最擅长把模糊要求实现得非常完整，完整到连原本没打算要的灾难也一起交付。
