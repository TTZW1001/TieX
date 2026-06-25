-- 002_add_indexes.sql
-- TieX 数据库索引

-- 会话相关索引
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);

-- 消息相关索引
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- 任务相关索引
CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);

-- 任务步骤索引
CREATE INDEX IF NOT EXISTS idx_task_steps_task ON task_steps(task_id);

-- 工具调用索引
CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);

-- 权限审批索引
CREATE INDEX IF NOT EXISTS idx_permission_requests_task ON permission_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_permission_requests_status ON permission_requests(status);

-- 文件修改索引
CREATE INDEX IF NOT EXISTS idx_file_changes_task ON file_changes(task_id);
CREATE INDEX IF NOT EXISTS idx_file_changes_workspace ON file_changes(workspace_id);

-- 生成物索引
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type);

-- 操作日志索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_task ON operation_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON operation_logs(created_at);

-- 工作区索引
CREATE INDEX IF NOT EXISTS idx_workspaces_deleted ON workspaces(is_deleted);
