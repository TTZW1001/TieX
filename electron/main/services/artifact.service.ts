/**
 * ArtifactService - 生成物管理服务
 * 负责生成物记录、列表、删除、打开文件/目录
 */
import { shell } from 'electron'
import { ArtifactRepository, type ArtifactEntity, type CreateArtifactInput } from '../database/repositories/artifact.repository'
import { taskEventBus } from '../shared/event-bus'

const artifactRepo = new ArtifactRepository()

class ArtifactServiceImpl {
  /**
   * 记录生成物
   */
  recordArtifact(input: CreateArtifactInput): ArtifactEntity {
    const artifact = artifactRepo.create(input)

    // 推送生成物创建事件
    taskEventBus.emit({
      type: 'artifact:created',
      taskId: artifact.task_id,
      artifactId: artifact.id,
      artifactType: artifact.artifact_type,
      name: artifact.name,
    } as any)

    return artifact
  }

  /**
   * 获取任务的生成物列表
   */
  getByTaskId(taskId: string): ArtifactEntity[] {
    return artifactRepo.getByTaskId(taskId)
  }

  /**
   * 获取生成物详情
   */
  getById(artifactId: string): ArtifactEntity | null {
    return artifactRepo.getById(artifactId)
  }

  /**
   * 打开生成文件（使用系统默认程序）
   */
  async openFile(artifactId: string): Promise<boolean> {
    const artifact = artifactRepo.getById(artifactId)
    if (!artifact) {
      throw new Error('生成物不存在')
    }

    try {
      const result = await shell.openPath(artifact.absolute_path)
      return result === ''
    } catch {
      return false
    }
  }

  /**
   * 打开所在目录
   */
  async openFolder(artifactId: string): Promise<void> {
    const artifact = artifactRepo.getById(artifactId)
    if (!artifact) {
      throw new Error('生成物不存在')
    }

    shell.showItemInFolder(artifact.absolute_path)
  }

  /**
   * 删除生成物记录（逻辑删除）
   */
  delete(artifactId: string): void {
    artifactRepo.markDeleted(artifactId)
  }
}

/** 全局生成物服务单例 */
export const artifactService = new ArtifactServiceImpl()
