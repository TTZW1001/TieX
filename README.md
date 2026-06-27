# TieX

TieX 是一个面向个人使用的 Windows 本地桌面 AI 智能体工作台。

## 当前版本

**V1.x（当前仓库状态）** - 核心桌面 Agent 工作台已可用，后续仍在迭代文档、界面与协作能力

## 功能概览

- **AI 对话**：基于 OpenAI Compatible Provider 的流式对话，当前内置 DeepSeek 与 SiliconFlow
- **Agent 模式**：AI 自主调用工具完成任务，支持多轮工具调用、任务状态追踪与中断
- **多 Agent 协作**：内置 `responder / implementation / research / memory` 四角色顺序协作链路
- **工作区管理**：选择本地项目目录作为工作区，AI 可读取和操作工作区文件
- **安全体系**：路径校验（PathGuard）、命令策略（CommandPolicy）、参数校验（SchemaValidator）、权限审批（PermissionPolicy）
- **文件操作**：读取、搜索、创建、编辑文件，修改前自动备份，支持冲突检测与恢复
- **文档生成**：生成 Markdown、Word（DOCX）、PowerPoint（PPTX）文档
- **命令执行**：安全执行受限命令（npm、git、node 等），实时输出展示
- **权限审批**：写入和执行操作需用户审批，支持一次性/任务级授权
- **记忆系统**：支持用户偏好、全局记忆、工作区记忆、会话摘要与记忆候选审批
- **设置系统**：支持 Provider 管理、权限默认值、多 Agent 绑定、数据目录与本地统计
- **会话能力**：支持消息分页、会话分支、任务活动流与生成物追踪
- **主题适配**：支持浅色 / 深色 / 跟随系统，并带主题切换动效
- **消息分页**：长对话分页加载，流式更新节流优化
- **Diff 折叠**：长内容 Diff 自动折叠，按需展开

## 技术栈

- **Electron** - Windows 桌面应用外壳
- **Vue 3** - 渲染进程 UI 框架
- **TypeScript** - 类型约束
- **Vite** - 前端构建工具
- **Pinia** - 前端状态管理
- **Vue Router** - 页面路由
- **SQLite (better-sqlite3)** - 本地数据库
- **Vitest** - 单元测试与集成测试
- **electron-builder** - 应用打包（NSIS 安装程序）

## 项目目录

```
TieX/
├── electron/          # Electron 主进程和 Preload
│   ├── main/          # 主进程代码
│   │   ├── agent/     # Agent Runtime 核心（runtime、controller、parser 等）
│   │   ├── database/  # SQLite 数据库与仓库
│   │   │   └── migrations/  # 数据库迁移脚本
│   │   ├── providers/ # 模型服务商（DeepSeek、SiliconFlow、OpenAI Compatible 封装）
│   │   ├── security/  # 安全模块（PathGuard、SchemaValidator、PermissionPolicy、CommandPolicy）
│   │   ├── services/  # 业务服务（工作区、备份、权限审批、命令执行、记忆、日志清理）
│   │   ├── shared/    # 主进程事件总线
│   │   ├── tools/     # 工具系统（Registry、Executor、Agent 工具）
│   │   ├── utils/     # 工具函数（节流等）
│   │   └── ipc/       # IPC 通道注册
│   ├── preload/       # Preload 脚本
│   └── shared/        # 主进程/渲染进程共享类型、常量与错误分类
├── src/               # Vue 前端代码
│   ├── components/    # Vue 组件（MessageItem、DiffViewer、ErrorAlert 等）
│   ├── layouts/       # 布局组件
│   ├── views/         # 页面视图
│   ├── stores/        # Pinia 状态管理
│   ├── styles/        # CSS 样式
│   ├── router/        # 路由配置
│   └── types/         # 类型声明
├── tests/             # 测试文件
│   ├── unit/          # 单元测试（安全模块、服务等）
│   └── integration/   # 集成测试（Repository、Agent Loop）
├── resources/         # 应用资源（图标、NSIS 安装脚本）
├── docs/              # 项目文档
└── prompt/            # 开发提示词
```

## 工具系统

| 工具 | 说明 | 权限 |
|------|------|------|
| `list_files` | 列出指定目录下的文件与子目录 | 只读 |
| `read_file` | 读取文本文件内容，支持分段读取 | 只读 |
| `search_files` | 在工作区内搜索文件名或文件内容 | 只读 |
| `create_file` | 创建新文本文件，支持覆盖 | 需审批 |
| `edit_file` | 修改已有文本文件（局部替换） | 需审批 |
| `create_markdown` | 生成 Markdown 文档 | 需审批 |
| `create_docx` | 生成 Word 文档 | 需审批 |
| `create_pptx` | 生成 PowerPoint 演示文件 | 需审批 |
| `run_command` | 在工作区内执行受限命令 | 需审批 |

## 多 Agent 架构

当前仓库已实现基础版多 Agent 顺序协作，而非单一 Agent 直接完成所有任务：

- **responder**：负责决定是否需要协作 Agent，并整理最终对用户的回复
- **implementation**：唯一真正读写文件、执行命令、调用工具的执行 Agent
- **research**：负责整理目标、上下文、风险和推进顺序
- **memory**：负责提炼偏好、工作区规则和长期约束

默认编排链路为：

`route -> research? -> memory? -> implementation? -> respond`

这是一种“内部简报传递”的顺序协作模型，不是并行 swarm，也不是所有 Agent 都能直接调用工具。

## Provider 与模型配置

- 支持保存多条 Provider 配置，并设置默认 Provider
- 当前内置 `deepseek` 与 `siliconflow`
- Provider 调用层统一复用 OpenAI Compatible 接口封装
- API Key 通过 Electron `safeStorage` 加密存储，仅在主进程内解密使用
- 支持为不同 Agent 角色单独绑定 Provider
- 支持连接测试、超时配置、流式开关和基础多模态能力判断

## 记忆与上下文系统

- **全局记忆**：记录长期偏好，如语言、输出风格、常用习惯
- **工作区记忆**：记录某个项目内的约束、命名习惯与规则
- **会话摘要**：自动压缩近期对话，减少上下文冗余
- **记忆候选**：从用户消息中提取候选偏好或规则，等待手动批准

当前记忆提取以规则和启发式匹配为主，不是通用型语义记忆引擎。

## 安全体系

### PathGuard（路径校验）

所有文件工具在执行前必须通过 `PathGuard.validate()` 校验，确保目标路径始终位于工作区根目录之内。支持：
- 路径穿越检测（`..`、符号链接）
- 绝对路径拒绝（Windows 盘符、UNC 路径、Unix 路径）
- 文件扩展名白名单
- 文件大小限制

### CommandPolicy（命令策略）

- 白名单机制：只允许 npm、git、node、python、npx、pip 等命令
- 黑名单机制：禁止 rm、shutdown、regedit、powershell、curl 等危险命令
- 参数检查：禁止 shell 元字符，防止命令注入
- 子命令限制：npm 只允许 test/run/install，git 只允许 status/diff/log/branch 等
- 风险等级评估（medium/high/blocked）

### SchemaValidator（参数校验）

- 验证工具调用参数的类型和格式
- 支持必填字段、类型检查、枚举值、最小值/最大值
- 整数类型校验

### PermissionPolicy（权限策略）

- 定义各工具的审批规则和风险等级
- 支持三种决策：拒绝、允许一次、本次任务内允许
- 审批对话框展示操作详情和风险等级

## 权限模式

| 模式 | 说明 |
|------|------|
| `chat` | 仅普通对话，不可调用文件工具 |
| `read` | 可调用 list_files、read_file、search_files 等只读工具 |
| `execute` | 可读取和修改文件，写入操作需用户审批 |
| `command` | 可执行受限命令，命令执行需用户审批 |

## 错误处理

统一错误分类系统（`electron/shared/errors.ts`）：

| 类别 | 说明 | 示例 |
|------|------|------|
| network | 网络错误 | 连接失败、超时、DNS 解析失败 |
| provider | 模型服务错误 | API 密钥无效、配额耗尽、频率限制 |
| security | 安全限制 | 路径违规、命令阻止、权限拒绝 |
| file | 文件错误 | 文件不存在、读写失败、过大 |
| task | 任务错误 | 超时、轮次限制、工具调用限制 |
| database | 数据库错误 | 数据不存在、约束冲突 |
| general | 通用错误 | 验证失败、未知错误 |

前端通过 `ErrorAlert` 组件按类别展示不同样式的错误提示。

## 性能优化

| 优化项 | 说明 |
|--------|------|
| 消息分页加载 | 默认加载最新 50 条消息，支持向上翻页加载历史 |
| 流式更新节流 | delta 事件 50ms 节流推送，减少 IPC 通信和 DOM 更新频率 |
| 文件树懒加载 | 目录展开时按需加载子目录，避免一次性加载整个文件树 |
| 日志定期清理 | 每 24 小时自动清理 30 天前的已完成任务步骤、工具调用和已删除会话 |
| Diff 长内容折叠 | 超过 20 行的 Diff 自动折叠，显示前后各 5 行，点击展开 |

## 渲染与主题

- Markdown 渲染基于 `markdown-it`
- 代码块目前以样式增强为主，仓库已引入 `shiki` 依赖，但当前主渲染链路未深度接入
- 支持浅色、深色、跟随系统三种主题模式
- 主题状态会写入本地数据库，并与 Electron `nativeTheme` 同步
- 顶栏主题切换带 View Transition 动画

## 测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch
```

当前测试覆盖方向包括：

- **单元测试**：PathGuard、CommandPolicy、SchemaValidator、PermissionPolicy、BackupService、ArtifactService 等
- **集成测试**：Repository CRUD、Agent Loop 状态流转

## 安装与启动

```bash
npm install
npm run dev
```

## 构建与打包

```bash
# 类型检查 + Vite 构建 + electron-builder 打包
npm run build

# 仅打包（不执行类型检查）
npm run dist

# 仅打包目录（不生成安装程序）
npm run pack
```

打包配置（`electron-builder.yml`）：
- Windows：NSIS 安装程序，支持自定义安装目录
- macOS：DMG 镜像（x64 + arm64）
- Linux：AppImage

## 开发阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| 阶段一 | 项目初始化与静态界面 | ✅ 已完成 |
| 阶段二 | SQLite 与本地设置 | ✅ 已完成 |
| 阶段三 | DeepSeek 普通聊天 | ✅ 已完成 |
| 阶段四 | 工作区与只读工具 | ✅ 已完成 |
| 阶段五 | Agent Runtime 与 Tool Calls | ✅ 已完成 |
| 阶段六 | 权限审批与文件修改 | ✅ 已完成 |
| 阶段七 | Markdown、DOCX 与 PPTX | ✅ 已完成 |
| 阶段八 | 受限命令执行 | ✅ 已完成 |
| 阶段九 | 完善、测试与打包 | ✅ 已完成 |

## 未实现功能

以下能力在当前仓库中仍未落地为正式可用功能：

- 插件系统
- 自动化流程
- MCP 协议
