-- 004_create_task_tables.sql
-- TieX 阶段五：任务相关表结构
-- 重建 tasks、task_steps、tool_calls、operation_logs 表以匹配 Agent Runtime 需求
-- 注意：阶段一至阶段四未使用这些表，可安全重建

-- 重建 tasks 表
DROP TABLE IF EXISTS tool_calls;
DROP TABLE IF EXISTS task_steps;
DROP TABLE IF EXISTS operation_logs;
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
