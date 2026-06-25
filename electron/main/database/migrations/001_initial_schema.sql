-- 001_initial_schema.sql
-- TieX 初始数据库表结构
-- 注意：messages 表必须在 tasks 表之前创建，因为 tasks 引用 messages

-- 迁移记录表
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- 应用设置表
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string',
  updated_at TEXT NOT NULL
);

-- 模型服务商配置表
CREATE TABLE IF NOT EXISTS model_providers (
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

-- 工作区表
CREATE TABLE IF NOT EXISTS workspaces (
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

-- 会话表
CREATE TABLE IF NOT EXISTS conversations (
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

-- 消息表（在 tasks 之前创建）
CREATE TABLE IF NOT EXISTS messages (
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

-- 任务表
CREATE TABLE IF NOT EXISTS tasks (
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

-- 任务步骤表
CREATE TABLE IF NOT EXISTS task_steps (
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

-- 工具调用表
CREATE TABLE IF NOT EXISTS tool_calls (
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

-- 权限审批表
CREATE TABLE IF NOT EXISTS permission_requests (
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

-- 文件修改记录表
CREATE TABLE IF NOT EXISTS file_changes (
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

-- 生成物表
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tool_call_id TEXT,
  workspace_id TEXT,
  file_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  file_size INTEGER,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_id TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES task_steps(id) ON DELETE SET NULL
);

-- 默认设置数据
INSERT OR IGNORE INTO app_settings (key, value, value_type, updated_at) VALUES
  ('theme', 'system', 'string', datetime('now')),
  ('sidebar_collapsed', 'false', 'boolean', datetime('now')),
  ('default_permission_mode', 'read', 'string', datetime('now')),
  ('max_task_steps', '20', 'number', datetime('now')),
  ('auto_backup', 'true', 'boolean', datetime('now')),
  ('confirm_before_modify', 'true', 'boolean', datetime('now')),
  ('confirm_before_command', 'true', 'boolean', datetime('now')),
  ('allow_outside_workspace', 'false', 'boolean', datetime('now'));

-- 默认 DeepSeek 配置
INSERT OR IGNORE INTO model_providers (id, name, provider_type, base_url, model_name, encrypted_api_key, timeout_ms, stream_enabled, is_default, is_enabled, is_deleted, created_at, updated_at) VALUES
  ('default-deepseek', 'DeepSeek', 'deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash', NULL, 60000, 1, 1, 1, 0, datetime('now'), datetime('now'));
