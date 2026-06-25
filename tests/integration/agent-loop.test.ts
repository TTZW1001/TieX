import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'

// Mock getDatabase
let mockDb: Database.Database

vi.mock('@electron/main/database/database', () => ({
  getDatabase: () => mockDb,
}))

let taskRepo: any

beforeEach(async () => {
  mockDb = new Database(':memory:')

  mockDb.exec(`
    CREATE TABLE model_providers (
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

    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '新对话',
      provider_id TEXT,
      workspace_id TEXT,
      permission_mode TEXT NOT NULL DEFAULT 'chat',
      status TEXT NOT NULL DEFAULT 'active',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      last_message_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE messages (
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
      UNIQUE (conversation_id, sequence_no)
    );

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
      updated_at TEXT NOT NULL
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
      created_at TEXT NOT NULL
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
      created_at TEXT NOT NULL
    );

    INSERT INTO model_providers (id, name, provider_type, base_url, model_name, timeout_ms, stream_enabled, is_default, is_enabled, is_deleted, created_at, updated_at)
    VALUES ('default-deepseek', 'DeepSeek', 'deepseek', 'https://api.deepseek.com', 'deepseek-chat', 60000, 1, 1, 1, 0, datetime('now'), datetime('now'));

    CREATE INDEX idx_tasks_conversation_id ON tasks(conversation_id);
    CREATE INDEX idx_tasks_status ON tasks(status);
    CREATE INDEX idx_task_steps_task_id ON task_steps(task_id);
    CREATE INDEX idx_tool_calls_task_id ON tool_calls(task_id);
  `)

  const taskMod = await import('@electron/main/database/repositories/task.repository')
  taskRepo = new taskMod.TaskRepository()
})

afterEach(() => {
  mockDb.close()
})

describe('Agent Loop 集成测试', () => {
  // 辅助函数：创建会话
  function createConversation() {
    const id = `conv-${Date.now()}`
    const now = new Date().toISOString()
    mockDb.prepare(
      `INSERT INTO conversations (id, title, status, permission_mode, is_pinned, created_at, updated_at) VALUES (?, ?, 'active', 'read', 0, ?, ?)`
    ).run(id, '测试对话', now, now)
    return id
  }

  describe('任务创建与状态流转', () => {
    it('pending → running → completed', () => {
      const convId = createConversation()
      const task = taskRepo.create({
        id: 'agent-task-1',
        conversation_id: convId,
        provider_id: 'default-deepseek',
        permission_mode: 'read',
      })

      // pending
      expect(taskRepo.getById('agent-task-1').status).toBe('pending')

      // → running
      taskRepo.updateStatus('agent-task-1', 'running', {
        started_at: new Date().toISOString(),
      })
      expect(taskRepo.getById('agent-task-1').status).toBe('running')

      // → completed
      taskRepo.updateStatus('agent-task-1', 'completed', {
        completed_at: new Date().toISOString(),
      })
      expect(taskRepo.getById('agent-task-1').status).toBe('completed')
    })

    it('pending → running → failed', () => {
      const convId = createConversation()
      taskRepo.create({
        id: 'agent-task-2',
        conversation_id: convId,
        provider_id: 'default-deepseek',
      })

      taskRepo.updateStatus('agent-task-2', 'running', {
        started_at: new Date().toISOString(),
      })
      taskRepo.updateStatus('agent-task-2', 'failed', {
        error_code: 'PROVIDER_NETWORK_ERROR',
        error_message: '网络连接失败',
      })

      const task = taskRepo.getById('agent-task-2')
      expect(task.status).toBe('failed')
      expect(task.error_code).toBe('PROVIDER_NETWORK_ERROR')
    })
  })

  describe('工具调用执行与结果回传', () => {
    it('应能记录工具调用', () => {
      const convId = createConversation()
      taskRepo.create({
        id: 'agent-task-3',
        conversation_id: convId,
        provider_id: 'default-deepseek',
      })

      // 模拟工具调用
      const toolCallId = `tc-${Date.now()}`
      const now = new Date().toISOString()
      mockDb.prepare(
        `INSERT INTO tool_calls (id, task_id, tool_name, arguments, status, started_at, created_at) VALUES (?, ?, ?, ?, 'running', ?, ?)`
      ).run(toolCallId, 'agent-task-3', 'list_files', '{"path": "/src"}', now, now)

      // 更新工具调用结果
      mockDb.prepare(
        `UPDATE tool_calls SET status = 'completed', result = ?, completed_at = ?, duration_ms = ? WHERE id = ?`
      ).run('{"entries": []}', new Date().toISOString(), 150, toolCallId)

      const toolCall = mockDb.prepare('SELECT * FROM tool_calls WHERE id = ?').get(toolCallId) as any
      expect(toolCall.status).toBe('completed')
      expect(toolCall.duration_ms).toBe(150)
    })
  })

  describe('任务停止', () => {
    it('running → stopped', () => {
      const convId = createConversation()
      taskRepo.create({
        id: 'agent-task-4',
        conversation_id: convId,
        provider_id: 'default-deepseek',
      })

      taskRepo.updateStatus('agent-task-4', 'running', {
        started_at: new Date().toISOString(),
      })
      taskRepo.updateStatus('agent-task-4', 'stopped')

      expect(taskRepo.getById('agent-task-4').status).toBe('stopped')
    })
  })

  describe('任务超时终止', () => {
    it('running → failed (timeout)', () => {
      const convId = createConversation()
      taskRepo.create({
        id: 'agent-task-5',
        conversation_id: convId,
        provider_id: 'default-deepseek',
      })

      taskRepo.updateStatus('agent-task-5', 'running', {
        started_at: new Date().toISOString(),
      })
      taskRepo.updateStatus('agent-task-5', 'failed', {
        error_code: 'TASK_TIMEOUT',
        error_message: '任务执行超时',
      })

      const task = taskRepo.getById('agent-task-5')
      expect(task.status).toBe('failed')
      expect(task.error_code).toBe('TASK_TIMEOUT')
    })
  })

  describe('轮次和工具调用计数', () => {
    it('应能正确追踪轮次', () => {
      const convId = createConversation()
      taskRepo.create({
        id: 'agent-task-6',
        conversation_id: convId,
        provider_id: 'default-deepseek',
      })

      for (let i = 0; i < 5; i++) {
        taskRepo.incrementRound('agent-task-6')
      }
      expect(taskRepo.getById('agent-task-6').round_count).toBe(5)
    })

    it('应能正确追踪工具调用数', () => {
      const convId = createConversation()
      taskRepo.create({
        id: 'agent-task-7',
        conversation_id: convId,
        provider_id: 'default-deepseek',
      })

      for (let i = 0; i < 3; i++) {
        taskRepo.incrementToolCallCount('agent-task-7')
      }
      expect(taskRepo.getById('agent-task-7').tool_call_count).toBe(3)
    })

    it('应能正确追踪失败次数', () => {
      const convId = createConversation()
      taskRepo.create({
        id: 'agent-task-8',
        conversation_id: convId,
        provider_id: 'default-deepseek',
      })

      taskRepo.incrementFailureCount('agent-task-8')
      taskRepo.incrementFailureCount('agent-task-8')
      expect(taskRepo.getById('agent-task-8').failure_count).toBe(2)
    })
  })
})
