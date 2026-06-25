import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'

// Mock getDatabase
let mockDb: Database.Database

vi.mock('@electron/main/database/database', () => ({
  getDatabase: () => mockDb,
}))

// 动态导入所有 Repository
let settingsRepo: any
let conversationRepo: any
let messageRepo: any
let taskRepo: any

beforeEach(async () => {
  mockDb = new Database(':memory:')

  // 创建所有表
  mockDb.exec(`
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      value_type TEXT NOT NULL DEFAULT 'string',
      updated_at TEXT NOT NULL
    );

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

    CREATE TABLE workspaces (
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

    -- 插入默认 provider
    INSERT INTO model_providers (id, name, provider_type, base_url, model_name, timeout_ms, stream_enabled, is_default, is_enabled, is_deleted, created_at, updated_at)
    VALUES ('default-deepseek', 'DeepSeek', 'deepseek', 'https://api.deepseek.com', 'deepseek-chat', 60000, 1, 1, 1, 0, datetime('now'), datetime('now'));

    -- 创建索引
    CREATE INDEX idx_conversations_status ON conversations(status);
    CREATE INDEX idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX idx_tasks_conversation_id ON tasks(conversation_id);
    CREATE INDEX idx_tasks_status ON tasks(status);
  `)

  const settingsMod = await import('@electron/main/database/repositories/settings.repository')
  const convMod = await import('@electron/main/database/repositories/conversation.repository')
  const msgMod = await import('@electron/main/database/repositories/message.repository')
  const taskMod = await import('@electron/main/database/repositories/task.repository')

  settingsRepo = new settingsMod.SettingsRepository()
  conversationRepo = new convMod.ConversationRepository()
  messageRepo = new msgMod.MessageRepository()
  taskRepo = new taskMod.TaskRepository()
})

afterEach(() => {
  mockDb.close()
})

describe('Repository 集成测试', () => {
  describe('数据库初始化与迁移执行', () => {
    it('数据库应成功初始化', () => {
      expect(mockDb).toBeDefined()
      // 验证表存在
      const tables = mockDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
      const tableNames = tables.map((t) => t.name)
      expect(tableNames).toContain('app_settings')
      expect(tableNames).toContain('conversations')
      expect(tableNames).toContain('messages')
      expect(tableNames).toContain('tasks')
      expect(tableNames).toContain('model_providers')
    })
  })

  describe('settings.repository CRUD', () => {
    it('应能设置和获取设置', () => {
      settingsRepo.set('theme', 'dark')
      const value = settingsRepo.get('theme')
      expect(value).toBe('dark')
    })

    it('不存在的 key 应返回 null', () => {
      const value = settingsRepo.get('nonexistent')
      expect(value).toBeNull()
    })

    it('应能更新已有设置', () => {
      settingsRepo.set('theme', 'light')
      settingsRepo.set('theme', 'dark')
      expect(settingsRepo.get('theme')).toBe('dark')
    })

    it('getAll 应返回所有设置', () => {
      settingsRepo.set('theme', 'dark')
      settingsRepo.set('sidebar_collapsed', 'true')
      const all = settingsRepo.getAll()
      expect(all.get('theme')).toBe('dark')
      expect(all.get('sidebar_collapsed')).toBe('true')
    })

    it('getByPrefix 应返回匹配前缀的设置', () => {
      settingsRepo.set('sidebar_collapsed', 'true')
      settingsRepo.set('sidebar_width', '200')
      settingsRepo.set('theme', 'dark')
      const result = settingsRepo.getByPrefix('sidebar')
      expect(result.has('sidebar_collapsed')).toBe(true)
      expect(result.has('sidebar_width')).toBe(true)
      expect(result.has('theme')).toBe(false)
    })
  })

  describe('conversation.repository CRUD 与列表查询', () => {
    it('应能创建会话', () => {
      const conv = conversationRepo.create({ title: '测试对话' })
      expect(conv.id).toBeTruthy()
      expect(conv.title).toBe('测试对话')
      expect(conv.status).toBe('active')
    })

    it('应能获取会话', () => {
      const conv = conversationRepo.create({ title: '测试' })
      const found = conversationRepo.getById(conv.id)
      expect(found).not.toBeNull()
      expect(found!.title).toBe('测试')
    })

    it('应能更新标题', () => {
      const conv = conversationRepo.create({ title: '旧标题' })
      conversationRepo.updateTitle(conv.id, '新标题')
      const found = conversationRepo.getById(conv.id)
      expect(found!.title).toBe('新标题')
    })

    it('应能获取最近会话列表', () => {
      for (let i = 0; i < 5; i++) {
        conversationRepo.create({ title: `对话 ${i}` })
      }
      const recent = conversationRepo.getRecent(3)
      expect(recent.length).toBe(3)
    })

    it('应能删除会话', () => {
      const conv = conversationRepo.create({ title: '待删除' })
      conversationRepo.deleteById(conv.id)
      const found = conversationRepo.getById(conv.id)
      expect(found).toBeNull()
    })
  })

  describe('message.repository 按会话分页查询', () => {
    it('应能创建和获取消息', () => {
      const conv = conversationRepo.create({})
      const msg = messageRepo.create({
        conversation_id: conv.id,
        role: 'user',
        content: '你好',
        sequence_no: 1,
      })
      expect(msg.id).toBeTruthy()
      expect(msg.content).toBe('你好')

      const messages = messageRepo.getByConversationId(conv.id)
      expect(messages.length).toBe(1)
    })

    it('应能获取会话的所有消息', () => {
      const conv = conversationRepo.create({})
      for (let i = 0; i < 10; i++) {
        messageRepo.create({
          conversation_id: conv.id,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `消息 ${i}`,
          sequence_no: i + 1,
        })
      }
      const messages = messageRepo.getByConversationId(conv.id)
      expect(messages.length).toBe(10)
      // 按 sequence_no 排序
      expect(messages[0].content).toBe('消息 0')
      expect(messages[9].content).toBe('消息 9')
    })

    it('应能更新消息内容', () => {
      const conv = conversationRepo.create({})
      const msg = messageRepo.create({
        conversation_id: conv.id,
        role: 'assistant',
        content: '',
        sequence_no: 1,
      })
      messageRepo.updateContent(msg.id, '更新后的内容')
      const messages = messageRepo.getByConversationId(conv.id)
      expect(messages[0].content).toBe('更新后的内容')
    })

    it('应能设置流式状态', () => {
      const conv = conversationRepo.create({})
      const msg = messageRepo.create({
        conversation_id: conv.id,
        role: 'assistant',
        content: '',
        sequence_no: 1,
      })
      messageRepo.setStreaming(msg.id, 1)
      const messages = messageRepo.getByConversationId(conv.id)
      expect(messages[0].is_streaming).toBe(1)
    })

    it('应能获取最新消息', () => {
      const conv = conversationRepo.create({})
      messageRepo.create({
        conversation_id: conv.id,
        role: 'user',
        content: '第一条',
        sequence_no: 1,
      })
      messageRepo.create({
        conversation_id: conv.id,
        role: 'assistant',
        content: '第二条',
        sequence_no: 2,
      })
      const latest = messageRepo.getLatestByConversationId(conv.id)
      expect(latest).not.toBeNull()
      expect(latest!.content).toBe('第二条')
    })
  })

  describe('task.repository CRUD 与状态更新', () => {
    it('应能创建任务', () => {
      const conv = conversationRepo.create({})
      const task = taskRepo.create({
        id: 'task-001',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
        permission_mode: 'read',
      })
      expect(task.id).toBe('task-001')
      expect(task.status).toBe('pending')
    })

    it('应能更新任务状态', () => {
      const conv = conversationRepo.create({})
      const task = taskRepo.create({
        id: 'task-002',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
      })

      taskRepo.updateStatus(task.id, 'running', { started_at: new Date().toISOString() })
      const found = taskRepo.getById(task.id)
      expect(found!.status).toBe('running')
      expect(found!.started_at).toBeTruthy()
    })

    it('应能完成任务', () => {
      const conv = conversationRepo.create({})
      const task = taskRepo.create({
        id: 'task-003',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
      })

      taskRepo.updateStatus(task.id, 'running', { started_at: new Date().toISOString() })
      taskRepo.updateStatus(task.id, 'completed', { completed_at: new Date().toISOString() })
      const found = taskRepo.getById(task.id)
      expect(found!.status).toBe('completed')
    })

    it('应能停止任务', () => {
      const conv = conversationRepo.create({})
      const task = taskRepo.create({
        id: 'task-004',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
      })

      taskRepo.updateStatus(task.id, 'running', { started_at: new Date().toISOString() })
      taskRepo.updateStatus(task.id, 'stopped')
      const found = taskRepo.getById(task.id)
      expect(found!.status).toBe('stopped')
    })

    it('应能增加轮次计数', () => {
      const conv = conversationRepo.create({})
      const task = taskRepo.create({
        id: 'task-005',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
      })

      taskRepo.incrementRound(task.id)
      taskRepo.incrementRound(task.id)
      const found = taskRepo.getById(task.id)
      expect(found!.round_count).toBe(2)
    })

    it('应能增加工具调用计数', () => {
      const conv = conversationRepo.create({})
      const task = taskRepo.create({
        id: 'task-006',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
      })

      taskRepo.incrementToolCallCount(task.id)
      const found = taskRepo.getById(task.id)
      expect(found!.tool_call_count).toBe(1)
    })

    it('应能获取会话的任务列表', () => {
      const conv = conversationRepo.create({})
      taskRepo.create({
        id: 'task-007',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
      })
      taskRepo.create({
        id: 'task-008',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
      })

      const tasks = taskRepo.getByConversationId(conv.id)
      expect(tasks.length).toBe(2)
    })

    it('任务状态流转: pending → running → completed', () => {
      const conv = conversationRepo.create({})
      const task = taskRepo.create({
        id: 'task-flow',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
      })
      expect(taskRepo.getById('task-flow')!.status).toBe('pending')

      taskRepo.updateStatus('task-flow', 'running', { started_at: new Date().toISOString() })
      expect(taskRepo.getById('task-flow')!.status).toBe('running')

      taskRepo.updateStatus('task-flow', 'completed', { completed_at: new Date().toISOString() })
      expect(taskRepo.getById('task-flow')!.status).toBe('completed')
    })

    it('任务状态流转: running → stopped', () => {
      const conv = conversationRepo.create({})
      const task = taskRepo.create({
        id: 'task-stop',
        conversation_id: conv.id,
        provider_id: 'default-deepseek',
      })

      taskRepo.updateStatus('task-stop', 'running', { started_at: new Date().toISOString() })
      taskRepo.updateStatus('task-stop', 'stopped')
      expect(taskRepo.getById('task-stop')!.status).toBe('stopped')
    })
  })
})
