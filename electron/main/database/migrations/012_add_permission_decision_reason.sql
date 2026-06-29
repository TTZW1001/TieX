-- 012_add_permission_decision_reason.sql
-- 持久化权限拒绝 / 人工处理说明，便于任务审计复盘

ALTER TABLE permission_requests ADD COLUMN decision_reason TEXT;
