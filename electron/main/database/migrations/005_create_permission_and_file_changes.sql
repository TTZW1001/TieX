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
