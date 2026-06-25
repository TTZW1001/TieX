/**
 * Task Event Bus - 任务事件总线
 * 主进程内部事件分发，并推送到渲染进程
 */
import { BrowserWindow } from 'electron'
import type { TaskEvent } from '../../shared/types'

type EventListener = (event: TaskEvent) => void

class TaskEventBusImpl {
  private listeners = new Set<EventListener>()
  private windowListeners = new Set<(event: TaskEvent) => void>()

  /**
   * 订阅事件（主进程内部）
   */
  on(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 订阅事件（渲染进程窗口）
   */
  onWindow(listener: (event: TaskEvent) => void): () => void {
    this.windowListeners.add(listener)
    return () => this.windowListeners.delete(listener)
  }

  /**
   * 发布事件
   */
  emit(event: TaskEvent): void {
    // 通知主进程内部监听器
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('Task event listener error:', err)
      }
    }

    // 推送到所有渲染进程窗口
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('task:event', event)
        }
      } catch (err) {
        // 窗口可能已关闭
      }
    }

    // 通知窗口监听器
    for (const listener of this.windowListeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('Task window event listener error:', err)
      }
    }
  }

  /**
   * 清除所有监听器
   */
  clear(): void {
    this.listeners.clear()
    this.windowListeners.clear()
  }
}

/** 全局任务事件总线单例 */
export const taskEventBus = new TaskEventBusImpl()
