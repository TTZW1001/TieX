-- 003_create_workspace_indexes.sql
-- TieX 工作区相关索引
-- 为工作区列表查询和切换提供性能优化

-- 工作区规范化路径索引（用于去重查询）
CREATE INDEX IF NOT EXISTS idx_workspaces_normalized_path ON workspaces(normalized_path);

-- 工作区最后打开时间索引（用于按最近使用排序）
CREATE INDEX IF NOT EXISTS idx_workspaces_last_opened ON workspaces(last_opened_at);

-- 工作区收藏状态索引（用于按收藏排序）
CREATE INDEX IF NOT EXISTS idx_workspaces_favorite ON workspaces(is_favorite);

-- 工作区可用性索引（用于过滤可用工作区）
CREATE INDEX IF NOT EXISTS idx_workspaces_available ON workspaces(is_available);
