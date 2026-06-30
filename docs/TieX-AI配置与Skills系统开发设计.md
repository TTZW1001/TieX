# TieX AI 配置体系与 Skills 系统开发设计

> 文档类型：产品与工程设计稿  
> 日期：2026-06-29  
> 状态：待确认后实施  
> 范围：AI 默认配置 / 会话覆盖 / 多 Agent 配置演进 / 本地 Skills 管理与上下文注入  
> 对照项目：RikkaHub（https://github.com/rikkahub/rikkahub）

## 1. 总体判断

AI 配置体系升级适合现在做。TieX 当前已经有 `model_providers.temperature`、`model_providers.max_tokens`、`model_providers.stream_enabled`，会话也已有 `conversations.provider_id`，多 Agent 也有按角色绑定 Provider 的设置键。现阶段的问题是：Provider 连接信息和模型请求参数混在一起，后续要做“默认配置 + 会话覆盖 + Agent 覆盖”时会越来越难维护。

推荐引入独立的 AI runtime 配置解析层，把以下几类信息分开：

- Provider 连接配置：API Key、Base URL、Provider type、默认模型名、timeout。
- AI 生成参数：temperature、top_p、max_tokens、上下文限制、stream、工具开关。
- 覆盖规则：全局默认、会话覆盖、Agent 角色绑定。

Skills 系统也适合做，但第一版应控制边界。TieX 已有 `context-builder.ts`、`system-prompt.ts`、任务上下文快照、工具调用、权限审批和工作区体系，Skills 可以先定义成“本地可安装的上下文增强包”，不要一开始变成可执行插件或远程市场。

第一版目标：

- 本地 `skills/` 目录。
- 扫描 `SKILL.md`。
- 设置页管理启用 / 禁用。
- 静态本地市场安装。
- 输入框 `$skillName` 引用。
- Agent 构建上下文时受限注入。

## 2. RikkaHub 对照

### 2.1 可借鉴点

RikkaHub 的 `Assistant` 模型把 `chatModelId`、`temperature`、`topP`、`contextMessageSize`、`streamOutput`、`maxTokens`、`enabledSkills` 放在助手层，适合作为 TieX 会话覆盖和后续 Agent 覆盖的参考。

RikkaHub 的 `TextGenerationParams` 明确把 `temperature`、`topP`、`maxTokens`、`tools`、`customHeaders`、`customBody` 作为请求参数，而不是 Provider 连接字段。这一点适合 TieX 用来拆分 Provider 与 AI runtime 配置。

RikkaHub 的生成链路有 Input Transformer、Output Transformer、Prompt Injection、Skill Tools、MCP Tools 等分层。TieX 不需要照搬实现，但可以借鉴“上下文注入源可组合”的思想，把 Skills 接到 `context-builder.ts`。

RikkaHub 的 `ProviderModel` 有 `inputModalities`、`outputModalities`、`abilities`，可作为 TieX 模型能力标签继续演进的参考。

### 2.2 不适合照搬点

RikkaHub 是 Android LLM 聊天客户端，TieX 是 Windows 本地桌面 AI Agent 工作台，不适合照搬移动端 UI、Assistant 市场或过度自由的角色系统。

RikkaHub 的工具结果更多内联在消息 part 中，TieX 已有 `tasks`、`tool_calls`、`permission_requests`、`file_changes`、`artifacts`、`operation_logs` 审计体系，不应重构成纯消息部件模型。

RikkaHub 允许 Assistant 绑定大量 MCP、Lorebook、Mode Injection。TieX 第一版 Skills 应更克制，避免污染任务上下文和权限模型。

## 3. AI 配置体系产品方案

### 3.1 配置层级

推荐三层配置：

1. 全局默认 AI 配置
   - 设置页管理。
   - 决定新会话默认行为。
   - 可被当前会话继承。

2. 会话 AI 配置覆盖
   - 当前会话默认继承全局默认。
   - 用户可以只覆盖部分字段。
   - 会话覆盖不影响全局默认。
   - UI 必须显示“继承默认”还是“当前会话已覆盖”。
   - 支持一键恢复继承默认。

3. 多 Agent 角色配置
   - 第一阶段只允许每个 Agent 绑定 Provider / 模型。
   - temperature / top_p / max_tokens 等参数跟随会话 effective config。
   - 后续再允许 Agent 绑定 preset，而不是让每个 Agent 手填所有参数。

### 3.2 全局默认 AI 配置字段

第一阶段建议支持：

- `providerId`
- `modelName`
- `temperature`
- `topP`
- `maxTokens`
- `contextMessageLimit`
- `contextTokenLimit`
- `streamEnabled`
- `toolsEnabled`
- `attachmentsEnabled`

其中附件 / 多模态能力第一阶段更推荐作为能力提示，不建议让用户强行打开一个模型不支持的能力。

### 3.3 会话覆盖字段

会话覆盖字段与全局默认保持一致，但数据库只保存被覆盖字段。未覆盖字段实时继承全局默认。

UI 表达建议：

- 字段旁显示 `继承默认：0.7`。
- 覆盖后显示 `当前会话已覆盖：0.3`。
- 每个字段支持恢复继承。
- 会话设置支持一键恢复全部继承。

### 3.4 多 Agent 分阶段策略

阶段 1：

- 保持当前 `responder`、`implementation`、`research`、`memory` 的 Provider 绑定。
- Agent 参数跟随会话 effective config。
- 附件能力、工具能力以 implementation Agent 的 effective provider/model 为准。

阶段 2：

- Agent 可绑定 AI preset。
- 例如 research Agent 使用低温度、较大上下文；responder Agent 使用更自然的温度。

阶段 3：

- Agent 级独立参数覆盖。
- 需要 UI 做清楚继承链：全局默认 -> 会话覆盖 -> Agent 覆盖。
- 不建议第一阶段做，否则设置页会过重。

## 4. AI 配置体系工程方案

### 4.1 当前关键代码现状

当前相关模块：

- `electron/main/providers/*`
- `electron/main/services/provider.service.ts`
- `electron/main/database/repositories/provider.repository.ts`
- `electron/main/agent/context-builder.ts`
- `electron/main/agent/system-prompt.ts`
- `electron/main/agent/task-controller.ts`
- `electron/main/ipc/*`
- `electron/preload/index.ts`
- `electron/shared/types.ts`
- `src/views/SettingsView.vue`
- `src/components/ChatComposer.vue`
- `src/stores/settings.store.ts`
- `src/stores/conversation.store.ts`
- `src/types/global.d.ts`

当前 `model_providers` 同时保存连接信息和生成参数：

- `temperature`
- `max_tokens`
- `stream_enabled`

这可以短期兼容，但不适合作为长期配置模型。

### 4.2 推荐数据库设计

不推荐继续往 `conversations` 加大量 AI 参数列。推荐新增独立表。

```sql
CREATE TABLE ai_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  provider_id TEXT,
  model_name TEXT,
  temperature REAL,
  top_p REAL,
  max_tokens INTEGER,
  context_message_limit INTEGER,
  context_token_limit INTEGER,
  stream_enabled INTEGER,
  tools_enabled INTEGER,
  attachments_enabled INTEGER,
  custom_params_json TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversation_ai_settings (
  conversation_id TEXT PRIMARY KEY,
  provider_id TEXT,
  model_name TEXT,
  temperature REAL,
  top_p REAL,
  max_tokens INTEGER,
  context_message_limit INTEGER,
  context_token_limit INTEGER,
  stream_enabled INTEGER,
  tools_enabled INTEGER,
  attachments_enabled INTEGER,
  override_mask_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
```

字段说明：

- `ai_presets.scope = 'global'`：全局默认配置。
- `ai_presets.scope = 'preset'`：用户后续保存的可复用预设。
- `conversation_ai_settings.override_mask_json`：记录哪些字段是会话覆盖，避免 `NULL` 无法区分“继承”和“显式清空”。
- `custom_params_json`：为未来 Provider 自定义参数保留扩展点。

### 4.3 服务层

新增 `AiSettingsService`：

- `getDefaultConfig()`
- `updateDefaultConfig(input)`
- `getConversationOverrides(conversationId)`
- `updateConversationOverrides(conversationId, patch)`
- `resetConversationOverrides(conversationId)`
- `getEffectiveConfig(conversationId, agentRole?)`

解析顺序：

```text
global default ai config
  -> conversation override mask
  -> agent provider/model binding
  -> provider connection details
  -> model capability hints
```

### 4.4 Provider 请求模型

扩展 `ProviderConfig` / `ModelRequest`：

```ts
export interface ProviderConfig {
  id: string
  name: string
  providerType: string
  baseUrl: string
  model: string
  apiKey: string
  temperature?: number
  topP?: number
  maxTokens?: number
  timeoutMs: number
  streamEnabled?: boolean
  toolsEnabled?: boolean
}

export interface ModelRequest {
  messages: ChatMessage[]
  temperature?: number
  topP?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  toolChoice?: 'auto' | 'none' | 'required'
  config?: ProviderConfig
}
```

`OpenAICompatibleProvider.streamChat()` 需要支持：

- `top_p`
- `toolsEnabled === false` 时不传 tools。
- `streamEnabled === false` 时继续走非流式分支。

### 4.5 上下文构建

当前 `context-builder.ts` 使用固定 `MAX_HISTORY_MESSAGES = 20`。推荐改为：

- `contextMessageLimit` 控制历史消息数量。
- `contextTokenLimit` 第一阶段可先保存和展示，后续再做真实 token 裁剪。
- `buildContextSnapshotSummary()` 增加 AI 配置摘要：模型、历史消息上限、是否流式、是否启用工具。

### 4.6 IPC 与前端状态

新增 IPC：

- `aiSettings:getDefault`
- `aiSettings:updateDefault`
- `aiSettings:getConversation`
- `aiSettings:updateConversation`
- `aiSettings:resetConversation`
- `aiSettings:getEffective`

Preload 暴露：

```ts
aiSettings: {
  getDefault: () => Promise<AiConfig>
  updateDefault: (input: Partial<AiConfig>) => Promise<void>
  getConversation: (conversationId: string) => Promise<ConversationAiSettings | null>
  updateConversation: (conversationId: string, patch: ConversationAiSettingsPatch) => Promise<void>
  resetConversation: (conversationId: string) => Promise<void>
  getEffective: (conversationId: string) => Promise<EffectiveAiConfig>
}
```

前端建议新增 `src/stores/ai-settings.store.ts`，不要继续把所有状态塞进 `settings.store.ts`。

### 4.7 UI 改造

设置页：

- 新增 `默认 AI 配置` 分区。
- Provider 页面继续负责连接配置。
- 默认 AI 配置负责请求行为。

会话设置：

- 扩展 `ChatComposer.vue` 中已有会话设置 popover。
- 当前已有 Provider 和权限模式，适合继续承载 AI 参数覆盖。
- UI 应保持紧凑，复杂参数可折叠到“高级参数”。

## 5. Skills 系统产品方案

### 5.1 第一版定位

Skill 是本地可安装的上下文增强包。

第一版不做：

- 不执行 skill 内脚本。
- 不安装 npm/pip 依赖。
- 不联网拉取市场。
- 不开放远程 registry。
- 不把 skill 自动变成工具。

第一版只做：

- 扫描本地 `SKILL.md`。
- 展示元数据。
- 启用 / 禁用。
- 静态市场安装。
- `$skillName` 显式引用。
- 上下文受限注入。

### 5.2 Skills 管理页

设置页新增 `Skills 管理` 分区：

- 已安装 skills 列表。
- skill 名称、描述、来源、路径、是否启用。
- 刷新扫描。
- 打开 skills 文件夹。
- 启用 / 禁用。
- 删除或卸载。

删除安全规则：

- 如果 skill 位于 TieX skills 根目录下，可以删除文件夹。
- 如果 skill 是外部路径导入，第一版只移除数据库记录，不删除外部文件。
- 所有删除都必须验证 realpath 位于允许目录。

### 5.3 Skills 市场

侧边栏在“新对话”下面新增“Skills 市场”。

第一版市场：

- 使用本地静态 registry。
- 不联网。
- 点击安装后复制内置 skill 模板到 app data skills 目录，或写入 installed 记录。
- 已安装项显示状态。

## 6. Skills 目录、扫描规则与数据库设计

### 6.1 推荐目录结构

```text
{appData}/TieX/
  skills/
    installed/
      code-project-analysis/
        SKILL.md
        skill.json
        references/
      frontend-ui-review/
        SKILL.md
        skill.json
    registry/
      tiex-skills.registry.json
```

每个 skill 至少包含：

```text
<skill-name>/
  SKILL.md
```

可选：

```text
skill.json
references/
assets/
```

### 6.2 扫描规则

- 只扫描 `skills/installed/*/SKILL.md`。
- skill name 默认使用文件夹名。
- 名称必须匹配：`^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$`。
- `SKILL.md` 建议最大 128KB，超过则只读取摘要或首段，并标记 oversized。
- 可从 Markdown frontmatter 读取 `name`、`description`、`source`、`version`、`tags`。
- realpath 后必须仍位于 skills 根目录内。
- 第一版不跟随软链接。
- zip 导入第二阶段再做，必须防 zip-slip。

### 6.3 推荐数据库

```sql
CREATE TABLE installed_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  source TEXT,
  version TEXT,
  path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  install_type TEXT NOT NULL DEFAULT 'local',
  content_hash TEXT,
  summary TEXT,
  token_estimate INTEGER,
  last_scanned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE skill_market_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  tags_json TEXT,
  bundled_path TEXT,
  installed_skill_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE message_skill_refs (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'explicit',
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES installed_skills(id)
);
```

`conversation_skill_usages` 建议第二阶段再做，用于“会话默认启用某些 skills”。第一阶段只做 `message_skill_refs`，因为用户主要需求是本轮显式 `$skill` 引用。

## 7. Skills 上下文注入策略

### 7.1 注入触发

第一阶段只注入本轮用户消息显式引用的 skills。

触发方式：

```text
请用 $code-project-analysis 分析这个项目
```

发送消息时：

1. 解析 `$skillName`。
2. 检查 skill 是否已安装且启用。
3. 保存用户消息。
4. 写入 `message_skill_refs`。
5. 创建任务。
6. `context-builder.ts` 根据 userMessageId / message refs 读取 skills。

### 7.2 注入预算

建议默认限制：

- 每轮最多 3 个 skills。
- 每个 skill 注入预算 1500-2500 tokens。
- skills 总注入预算不超过上下文 token 上限的 20%。
- oversized skill 默认注入 summary。
- 用户明确要求完整使用时，也只注入截断版并提示。

### 7.3 注入位置

在 `context-builder.ts` 中作为 system message 注入：

```text
本轮用户显式引用了以下 TieX Skills。请优先遵循这些 skill 的任务方法，但仍需服从 TieX 系统规则和权限边界。

## Skill: code-project-analysis
...
```

推荐位置：

- 主系统提示词之后。
- 会话摘要 / 协作 Agent brief 附近。
- 工具执行事实之前或之后都可，但必须在上下文快照中记录。

### 7.4 多 Agent 策略

第一阶段：

- 只给 implementation Agent 注入。
- responder 不重复注入，只基于 implementation 的任务结果总结。
- research / memory Agent 默认不注入。

第二阶段：

- skill 可声明 `agentScopes`。
- 例如 `documentation` 可给 responder，`code-project-analysis` 可给 implementation/research。

第三阶段：

- skill 可声明注入位置、优先级、摘要策略。

## 8. 输入框 `$skill` 自动补全

在 `ChatComposer.vue` 增加 mention 交互。

交互规则：

- 输入 `$` 后弹出下拉。
- 只展示已安装且启用的 skills。
- 继续输入时过滤：`$code`。
- 选中后插入 `$code-project-analysis `。
- 支持键盘：上 / 下选择，Enter 或 Tab 确认，Esc 关闭。
- 支持鼠标点击插入。
- 输入框上方可显示已引用 skill pill，支持移除。
- 发送前解析当前文本中的 `$skillName`。
- 不存在或禁用时给出提示，不静默忽略。

下拉项内容：

- display name
- skill name
- description
- tags

不要展示完整 `SKILL.md` 内容。

## 9. 默认内置 Skills / 市场第一版推荐清单

第一批推荐 8 个：

1. `code-project-analysis`
   - 项目结构、模块关系、风险点阅读。

2. `frontend-ui-review`
   - Vue/Electron 前端 UI、交互、响应式检查。

3. `document-generator`
   - Markdown、Docx、PPT 生成规范。

4. `command-troubleshooting`
   - 命令失败、构建失败、日志分析。

5. `git-commit-summary`
   - 变更总结、提交信息、PR 草稿。

6. `sqlite-debugging`
   - SQLite schema、迁移、数据排查。

7. `electron-desktop-debugging`
   - Electron IPC、preload、主进程 / 渲染进程调试。

8. `tiex-agent-workflow`
   - TieX 自身任务、权限、工具调用、上下文快照最佳实践。

第二批可考虑：

- `provider-integration`
- `test-planning`
- `release-packaging`
- `local-file-safety`
- `windows-powershell`

## 10. 分阶段路线图

### 10.1 第 1 阶段：低风险最小可用

AI 配置：

- 新增 `AiSettingsService`。
- 新增 `ai_presets` / `conversation_ai_settings` 迁移。
- 支持全局默认 AI 配置。
- 支持会话局部覆盖。
- 接入 `TaskController` 和 `context-builder`。
- 设置页新增默认 AI 配置。
- 会话设置 popover 展示继承 / 覆盖状态。

Skills：

- 新增 skills 本地目录。
- 新增扫描服务、repository、IPC、preload 类型。
- 设置页新增 Skills 管理。
- 侧边栏新增 Skills 市场入口。
- 静态 registry 安装。
- 输入框 `$skill` 自动补全。
- message refs 保存。
- context-builder 受限注入。

不做：

- zip 导入。
- 远程市场。
- skill 执行代码。
- Agent 独立参数覆盖。

### 10.2 第 2 阶段：体验完善

AI 配置：

- AI presets 保存 / 套用 / 导入导出。
- 会话设置字段级恢复继承。
- Provider capability 下沉到主进程。
- 上下文 token 估算和裁剪说明。

Skills：

- zip 导入。
- skill 内容摘要缓存。
- token 估算。
- 会话默认启用 skills。
- 上下文快照展示 skills 注入详情。
- skill 删除 / 卸载安全确认完善。

### 10.3 第 3 阶段：更完整生态

AI 配置：

- Agent 绑定 preset。
- Agent 级参数覆盖。
- Provider 自定义 headers/body 安全白名单。
- 模型能力 registry。

Skills：

- 远程 registry。
- 版本、哈希、签名校验。
- skill 声明适用 Agent、注入位置、优先级。
- 与 MCP/tools 体系打通，但需要独立安全设计。
- skill 包导出和分享。

## 11. 最推荐马上开始的 3 个任务

### 任务 1：`AiSettingsService + conversation_ai_settings` 最小闭环

目标：

- 跑通全局默认配置。
- 跑通会话覆盖。
- 让任务执行使用 effective config。

涉及：

- `electron/main/database/migrations/*`
- `electron/main/database/repositories/*`
- `electron/main/services/*`
- `electron/main/agent/task-controller.ts`
- `electron/main/agent/context-builder.ts`
- `electron/main/providers/openai-compatible-provider.ts`
- `electron/shared/types.ts`
- `electron/preload/index.ts`

### 任务 2：Skills 本地扫描服务与 IPC

目标：

- 创建 skills 根目录。
- 扫描 installed skills。
- 保存 installed skills。
- 暴露 list / scan / enable / disable / openFolder。

涉及：

- `electron/main/services/skill.service.ts`
- `electron/main/database/repositories/skill.repository.ts`
- `electron/main/ipc/skill.ipc.ts`
- `electron/preload/index.ts`
- `electron/shared/types.ts`
- `src/types/global.d.ts`

### 任务 3：会话设置 popover 扩展 AI 参数

目标：

- 在现有 `ChatComposer.vue` 会话设置里展示 effective config。
- 支持覆盖和恢复继承。
- 不破坏当前 Provider / 权限模式体验。

涉及：

- `src/components/ChatComposer.vue`
- `src/stores/conversation.store.ts`
- `src/stores/ai-settings.store.ts`
- `src/types/global.d.ts`

## 12. 验收标准

AI 配置第一阶段验收：

- 设置页可以保存默认 AI 配置。
- 新会话默认继承该配置。
- 会话可以覆盖部分字段。
- 恢复继承后使用全局默认。
- `task-controller.ts` 实际调用模型时使用 effective config。
- `context-builder.ts` 使用会话上下文消息数量上限。
- 非流式配置能生效。
- 工具关闭后请求不传 tools。

Skills 第一阶段验收：

- TieX 能创建并打开 skills 文件夹。
- 手动放入含 `SKILL.md` 的文件夹后，刷新扫描可识别。
- 设置页能启用 / 禁用 skill。
- 市场能安装静态内置 skill。
- 输入 `$` 能出现启用 skills 下拉。
- 发送含 `$skillName` 的消息后写入 `message_skill_refs`。
- 本轮 Agent 上下文带入 skill 摘要或截断内容。
- 任务上下文快照能显示已带入的 skills。

