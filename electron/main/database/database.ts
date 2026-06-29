import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { AGENT_PROFILES, MULTI_AGENT_ENABLED_KEY } from '../agent/agent-profiles'

let db: Database.Database | null = null

const DEFAULT_SETTINGS: Array<{ key: string; value: string; valueType: string }> = [
  { key: 'theme', value: 'system', valueType: 'string' },
  { key: 'sidebar_collapsed', value: 'false', valueType: 'boolean' },
  { key: 'default_permission_mode', value: 'read', valueType: 'string' },
  { key: 'max_task_steps', value: '20', valueType: 'number' },
  { key: 'default_command_timeout_ms', value: '60000', valueType: 'number' },
  { key: 'auto_backup', value: 'true', valueType: 'boolean' },
  { key: 'confirm_before_modify', value: 'true', valueType: 'boolean' },
  { key: 'confirm_before_command', value: 'true', valueType: 'boolean' },
  { key: 'allow_outside_workspace', value: 'false', valueType: 'boolean' },
  { key: 'global_memory', value: '', valueType: 'string' },
  { key: 'custom_system_prompt', value: '', valueType: 'string' },
  { key: 'user_display_name', value: '', valueType: 'string' },
  { key: 'user_preferences', value: '', valueType: 'string' },
  { key: MULTI_AGENT_ENABLED_KEY, value: 'true', valueType: 'boolean' },
  ...AGENT_PROFILES.flatMap((profile) => ([
    { key: profile.providerKey, value: '', valueType: 'string' },
    { key: profile.promptKey, value: profile.defaultPrompt, valueType: 'string' },
  ])),
]

const DEFAULT_PROVIDER = {
  id: 'default-deepseek',
  name: 'DeepSeek',
  providerType: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-v4-flash',
  timeoutMs: 60000,
}

const SILICONFLOW_PROVIDER = {
  id: 'preset-siliconflow-qwen3-vl',
  name: 'SiliconFlow · Qwen3-VL',
  providerType: 'siliconflow',
  baseUrl: 'https://api.siliconflow.cn/v1',
  modelName: 'Qwen/Qwen3-VL-8B-Thinking',
  timeoutMs: 60000,
}

function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'tiex.db')
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath)
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      console.log('Created database directory:', dir)
    }
  } catch (err) {
    console.error('Failed to create database directory:', dir, err)
    throw err
  }
}

// 内联迁移 SQL，避免运行时文件路径问题
const migrations: Record<string, string> = {
  '001_initial_schema': `
-- 001_initial_schema.sql
-- TieX 初始数据库表结构

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string',
  updated_at TEXT NOT NULL
);

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
  ('default_command_timeout_ms', '60000', 'number', datetime('now')),
  ('auto_backup', 'true', 'boolean', datetime('now')),
  ('confirm_before_modify', 'true', 'boolean', datetime('now')),
  ('confirm_before_command', 'true', 'boolean', datetime('now')),
  ('allow_outside_workspace', 'false', 'boolean', datetime('now'));

-- 默认 DeepSeek 配置
INSERT OR IGNORE INTO model_providers (id, name, provider_type, base_url, model_name, encrypted_api_key, timeout_ms, stream_enabled, is_default, is_enabled, is_deleted, created_at, updated_at) VALUES
  ('default-deepseek', 'DeepSeek', 'deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash', NULL, 60000, 1, 1, 1, 0, datetime('now'), datetime('now'));
`,

  '002_add_indexes': `
-- 002_add_indexes.sql
-- TieX 数据库索引

CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);

CREATE INDEX IF NOT EXISTS idx_task_steps_task ON task_steps(task_id);

CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);

CREATE INDEX IF NOT EXISTS idx_permission_requests_task ON permission_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_permission_requests_status ON permission_requests(status);

CREATE INDEX IF NOT EXISTS idx_file_changes_task ON file_changes(task_id);
CREATE INDEX IF NOT EXISTS idx_file_changes_workspace ON file_changes(workspace_id);

CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type);

CREATE INDEX IF NOT EXISTS idx_operation_logs_task ON operation_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON operation_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_workspaces_deleted ON workspaces(is_deleted);
`,

  '003_create_workspace_indexes': `
-- 003_create_workspace_indexes.sql
-- TieX 工作区相关索引

CREATE INDEX IF NOT EXISTS idx_workspaces_normalized_path ON workspaces(normalized_path);
CREATE INDEX IF NOT EXISTS idx_workspaces_last_opened ON workspaces(last_opened_at);
CREATE INDEX IF NOT EXISTS idx_workspaces_favorite ON workspaces(is_favorite);
CREATE INDEX IF NOT EXISTS idx_workspaces_available ON workspaces(is_available);
`,

  '004_create_task_tables': `
-- 004_create_task_tables.sql
-- TieX 阶段五：重建任务相关表以匹配 Agent Runtime 需求
-- 阶段一至阶段四未使用这些表，可安全重建

-- 临时关闭外键约束以安全 DROP 被引用的表
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS permission_requests;
DROP TABLE IF EXISTS file_changes;
DROP TABLE IF EXISTS artifacts;
DROP TABLE IF EXISTS operation_logs;
DROP TABLE IF EXISTS tool_calls;
DROP TABLE IF EXISTS task_steps;
DROP TABLE IF EXISTS tasks;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_message_id TEXT,
  provider_id TEXT NOT NULL,
  workspace_id TEXT,
  permission_mode TEXT NOT NULL DEFAULT 'read',
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT,
  error_code TEXT,
  error_message TEXT,
  round_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_message_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE TABLE task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  content TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_id TEXT,
  tool_name TEXT NOT NULL,
  arguments TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  error_code TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (step_id) REFERENCES task_steps(id)
);

CREATE TABLE operation_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  conversation_id TEXT,
  log_type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_tasks_conversation_id ON tasks(conversation_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX idx_tool_calls_task_id ON tool_calls(task_id);
CREATE INDEX idx_operation_logs_task_id ON operation_logs(task_id);

-- 恢复外键约束
PRAGMA foreign_keys = ON;
`,
  '005_create_permission_and_file_changes': `
-- 005_create_permission_and_file_changes.sql
-- TieX 阶段六：权限审批与文件变更记录表

CREATE TABLE IF NOT EXISTS permission_requests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  permission_type TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT,
  target TEXT,
  impact_summary TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  decision_scope TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id)
);

CREATE TABLE IF NOT EXISTS file_changes (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tool_call_id TEXT,
  workspace_id TEXT,
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
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id)
);

CREATE INDEX IF NOT EXISTS idx_permission_requests_task ON permission_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_permission_requests_status ON permission_requests(status);
CREATE INDEX IF NOT EXISTS idx_permission_requests_tool_call ON permission_requests(tool_call_id);

CREATE INDEX IF NOT EXISTS idx_file_changes_task ON file_changes(task_id);
CREATE INDEX IF NOT EXISTS idx_file_changes_workspace ON file_changes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_file_changes_status ON file_changes(status);
`,
  '006_create_artifacts': `
-- 006_create_artifacts.sql
-- TieX 阶段七：生成物记录表

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tool_call_id TEXT,
  workspace_id TEXT,
  artifact_type TEXT NOT NULL,
  name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
`,
  '007_add_branching_attachments_and_memory': `
ALTER TABLE conversations ADD COLUMN parent_conversation_id TEXT;
ALTER TABLE conversations ADD COLUMN branch_from_message_id TEXT;

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  original_path TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_conversation ON message_attachments(conversation_id);

CREATE TABLE IF NOT EXISTS workspace_memories (
  workspace_id TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
`,
  '008_add_memory_candidates_and_preferences': `
CREATE TABLE IF NOT EXISTS memory_candidates (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  category TEXT NOT NULL,
  candidate_text TEXT NOT NULL,
  source_message_id TEXT,
  workspace_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_candidates_status ON memory_candidates(status);
CREATE INDEX IF NOT EXISTS idx_memory_candidates_scope ON memory_candidates(scope);
`,
  '009_add_conversation_summaries': `
CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_role_created ON messages(role, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_token_count ON messages(token_count);
`,
  '010_link_tasks_with_messages': `
ALTER TABLE tasks ADD COLUMN assistant_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_user_message_id ON tasks(user_message_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assistant_message_id ON tasks(assistant_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sequence ON messages(conversation_id, sequence_no);

UPDATE messages
SET task_id = (
  SELECT t.id
  FROM tasks t
  WHERE t.user_message_id = messages.id
)
WHERE task_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM tasks t
    WHERE t.user_message_id = messages.id
  );

UPDATE tasks
SET assistant_message_id = (
  SELECT m.id
  FROM messages m
  WHERE m.conversation_id = tasks.conversation_id
    AND m.role = 'assistant'
    AND m.sequence_no > COALESCE((
      SELECT um.sequence_no
      FROM messages um
      WHERE um.id = tasks.user_message_id
    ), -1)
    AND m.sequence_no < COALESCE((
      SELECT MIN(next_um.sequence_no)
      FROM tasks next_t
      JOIN messages next_um ON next_um.id = next_t.user_message_id
      WHERE next_t.conversation_id = tasks.conversation_id
        AND next_um.sequence_no > COALESCE((
          SELECT current_um.sequence_no
          FROM messages current_um
          WHERE current_um.id = tasks.user_message_id
        ), -1)
    ), 9223372036854775807)
  ORDER BY m.sequence_no DESC
  LIMIT 1
)
WHERE assistant_message_id IS NULL;
`,
  '011_create_command_sessions': `
CREATE TABLE IF NOT EXISTS command_sessions (
  session_id TEXT PRIMARY KEY,
  task_id TEXT,
  command TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'running',
  exit_code INTEGER,
  output TEXT NOT NULL DEFAULT '',
  truncated INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_command_sessions_task ON command_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_command_sessions_status ON command_sessions(status);
`,
  '012_add_permission_decision_reason': `
ALTER TABLE permission_requests ADD COLUMN decision_reason TEXT;
`,
}

function runMigrations(database: Database.Database): void {
  // 创建迁移记录表
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map((r: any) => r.version)
  )

  const versions = Object.keys(migrations).sort()

  for (const version of versions) {
    if (applied.has(version)) continue

    const sql = migrations[version]
    const transaction = database.transaction(() => {
      database.exec(sql)
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        new Date().toISOString()
      )
    })

    try {
      transaction()
      console.log(`Migration ${version} applied successfully`)
    } catch (err) {
      console.error(`Migration ${version} failed:`, err)
      throw err
    }
  }
}

function ensureSeedData(database: Database.Database): void {
  const now = new Date().toISOString()

  const insertSetting = database.prepare(
    `INSERT OR IGNORE INTO app_settings (key, value, value_type, updated_at) VALUES (?, ?, ?, ?)`
  )
  for (const setting of DEFAULT_SETTINGS) {
    insertSetting.run(setting.key, setting.value, setting.valueType, now)
  }

  const providerCountRow = database
    .prepare('SELECT COUNT(*) as count FROM model_providers WHERE is_deleted = 0')
    .get() as { count: number } | undefined
  const providerCount = providerCountRow?.count ?? 0

  const defaultProvider = database
    .prepare('SELECT id, model_name FROM model_providers WHERE id = ?')
    .get(DEFAULT_PROVIDER.id) as { id: string; model_name: string } | undefined

  if (!defaultProvider) {
    database.prepare(
      `INSERT INTO model_providers (
        id, name, provider_type, base_url, model_name, encrypted_api_key, timeout_ms,
        stream_enabled, is_default, is_enabled, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, 1, 1, 1, 0, ?, ?)`
    ).run(
      DEFAULT_PROVIDER.id,
      DEFAULT_PROVIDER.name,
      DEFAULT_PROVIDER.providerType,
      DEFAULT_PROVIDER.baseUrl,
      DEFAULT_PROVIDER.modelName,
      DEFAULT_PROVIDER.timeoutMs,
      now,
      now
    )
  } else if (defaultProvider.model_name === 'deepseek-chat' || defaultProvider.model_name === 'deepseek-reasoner') {
    database.prepare(
      'UPDATE model_providers SET model_name = ?, updated_at = ? WHERE id = ?'
    ).run(DEFAULT_PROVIDER.modelName, now, DEFAULT_PROVIDER.id)
  }

  const siliconflowProvider = database
    .prepare('SELECT id FROM model_providers WHERE id = ?')
    .get(SILICONFLOW_PROVIDER.id) as { id: string } | undefined

  if (!siliconflowProvider) {
    database.prepare(
      `INSERT INTO model_providers (
        id, name, provider_type, base_url, model_name, encrypted_api_key, timeout_ms,
        stream_enabled, is_default, is_enabled, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, 1, 0, 1, 0, ?, ?)`
    ).run(
      SILICONFLOW_PROVIDER.id,
      SILICONFLOW_PROVIDER.name,
      SILICONFLOW_PROVIDER.providerType,
      SILICONFLOW_PROVIDER.baseUrl,
      SILICONFLOW_PROVIDER.modelName,
      SILICONFLOW_PROVIDER.timeoutMs,
      now,
      now,
    )
  }

  if (providerCount === 0) {
    database.prepare(
      'UPDATE model_providers SET is_default = 1, is_enabled = 1, is_deleted = 0, updated_at = ? WHERE id = ?'
    ).run(now, DEFAULT_PROVIDER.id)
  } else {
    database.prepare(
      `UPDATE model_providers
       SET is_default = CASE WHEN id = ? THEN 1 ELSE is_default END,
           is_enabled = CASE WHEN id = ? THEN 1 ELSE is_enabled END,
           is_deleted = CASE WHEN id = ? THEN 0 ELSE is_deleted END,
           updated_at = ?
       WHERE id = ?`
    ).run(
      DEFAULT_PROVIDER.id,
      DEFAULT_PROVIDER.id,
      DEFAULT_PROVIDER.id,
      now,
      DEFAULT_PROVIDER.id
    )
  }
}

export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  console.log('Database path:', dbPath)

  // 确保数据库文件所在目录存在
  ensureDir(dbPath)

  try {
    db = new Database(dbPath)
  } catch (err) {
    console.error('Failed to open database:', err)
    throw err
  }

  // 尝试启用 WAL 模式（如果失败则回退到 DELETE 模式）
  try {
    db.pragma('journal_mode = WAL')
  } catch (err) {
    console.warn('Failed to enable WAL mode, trying DELETE mode:', err)
    try {
      db.pragma('journal_mode = DELETE')
    } catch (err2) {
      console.warn('Failed to set journal mode:', err2)
    }
  }

  // 启用外键
  try {
    db.pragma('foreign_keys = ON')
  } catch (err) {
    console.warn('Failed to enable foreign keys:', err)
  }

  // 执行迁移
  try {
    runMigrations(db)
  } catch (err) {
    console.error('Failed to run migrations:', err)
    // 迁移失败可能导致 schema 不一致，关闭数据库并抛出错误
    try { db.close() } catch {}
    db = null
    throw new Error(`数据库迁移失败，应用无法正常启动: ${(err as Error).message}`)
  }

  try {
    ensureSeedData(db)
  } catch (err) {
    console.error('Failed to ensure seed data:', err)
    try { db.close() } catch {}
    db = null
    throw new Error(`数据库初始化默认数据失败: ${(err as Error).message}`)
  }

  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
