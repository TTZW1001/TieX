import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'path'
import { tmpdir } from 'os'

// Mock getDatabase
let mockDb: Database.Database

vi.mock('@electron/main/database/database', () => ({
  getDatabase: () => mockDb,
}))

let artifactRepo: any

beforeEach(async () => {
  mockDb = new Database(':memory:')
  mockDb.exec(`
    CREATE TABLE artifacts (
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
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_artifacts_task ON artifacts(task_id);
    CREATE INDEX idx_artifacts_type ON artifacts(artifact_type);
    CREATE INDEX idx_artifacts_status ON artifacts(status);
  `)

  const mod = await import('@electron/main/database/repositories/artifact.repository')
  artifactRepo = new mod.ArtifactRepository()
})

afterEach(() => {
  mockDb.close()
})

describe('ArtifactService / ArtifactRepository', () => {
  describe('生成物记录创建成功', () => {
    it('应成功创建生成物记录', () => {
      const input = {
        task_id: 'task-001',
        tool_call_id: 'tc-001',
        artifact_type: 'markdown',
        name: 'README.md',
        relative_path: '.tiex/artifacts/README.md',
        absolute_path: 'C:\\workspace\\.tiex\\artifacts\\README.md',
        size_bytes: 1024,
      }

      const artifact = artifactRepo.create(input)
      expect(artifact.id).toBeTruthy()
      expect(artifact.task_id).toBe('task-001')
      expect(artifact.artifact_type).toBe('markdown')
      expect(artifact.name).toBe('README.md')
      expect(artifact.status).toBe('created')
    })

    it('应支持不同类型的生成物', () => {
      const types = ['markdown', 'docx', 'pptx']
      for (const type of types) {
        const input = {
          task_id: 'task-002',
          artifact_type: type,
          name: `output.${type === 'markdown' ? 'md' : type}`,
          relative_path: `.tiex/artifacts/output.${type === 'markdown' ? 'md' : type}`,
          absolute_path: `C:\\workspace\\.tiex\\artifacts\\output.${type === 'markdown' ? 'md' : type}`,
          size_bytes: 2048,
        }
        const artifact = artifactRepo.create(input)
        expect(artifact.artifact_type).toBe(type)
      }
    })
  })

  describe('按任务 ID 查询生成物列表', () => {
    it('应返回指定任务的生成物列表', () => {
      for (let i = 0; i < 3; i++) {
        artifactRepo.create({
          task_id: 'task-003',
          artifact_type: 'markdown',
          name: `doc-${i}.md`,
          relative_path: `.tiex/artifacts/doc-${i}.md`,
          absolute_path: `C:\\workspace\\.tiex\\artifacts\\doc-${i}.md`,
          size_bytes: 100,
        })
      }

      const artifacts = artifactRepo.getByTaskId('task-003')
      expect(artifacts.length).toBe(3)
    })

    it('不存在的任务应返回空列表', () => {
      const artifacts = artifactRepo.getByTaskId('nonexistent')
      expect(artifacts.length).toBe(0)
    })
  })

  describe('删除生成物记录', () => {
    it('应逻辑删除生成物', () => {
      const artifact = artifactRepo.create({
        task_id: 'task-004',
        artifact_type: 'docx',
        name: 'report.docx',
        relative_path: '.tiex/artifacts/report.docx',
        absolute_path: 'C:\\workspace\\.tiex\\artifacts\\report.docx',
        size_bytes: 5000,
      })

      artifactRepo.markDeleted(artifact.id)

      const found = artifactRepo.getById(artifact.id)
      expect(found?.status).toBe('deleted')
    })
  })

  describe('getById', () => {
    it('应返回正确的生成物', () => {
      const artifact = artifactRepo.create({
        task_id: 'task-005',
        artifact_type: 'pptx',
        name: 'slides.pptx',
        relative_path: '.tiex/artifacts/slides.pptx',
        absolute_path: 'C:\\workspace\\.tiex\\artifacts\\slides.pptx',
        size_bytes: 10000,
      })

      const found = artifactRepo.getById(artifact.id)
      expect(found).not.toBeNull()
      expect(found!.name).toBe('slides.pptx')
    })

    it('不存在的 ID 应返回 null', () => {
      const found = artifactRepo.getById('nonexistent')
      expect(found).toBeNull()
    })
  })
})
