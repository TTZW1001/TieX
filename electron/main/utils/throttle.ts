/**
 * 节流函数：限制函数在指定时间间隔内最多执行一次
 * 用于流式更新等高频场景，避免过多的 IPC 通信和 DOM 更新
 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  intervalMs: number
): T & { flush: () => void } {
  let lastCallTime = 0
  let pendingArgs: any[] | null = null
  let timerId: ReturnType<typeof setTimeout> | null = null

  function throttled(this: any, ...args: any[]) {
    pendingArgs = args
    const now = Date.now()
    const elapsed = now - lastCallTime

    if (elapsed >= intervalMs) {
      // 可以立即执行
      lastCallTime = now
      fn.apply(this, args)
      pendingArgs = null
    } else if (!timerId) {
      // 设置定时器，在剩余时间后执行
      timerId = setTimeout(() => {
        lastCallTime = Date.now()
        timerId = null
        if (pendingArgs) {
          fn.apply(this, pendingArgs)
          pendingArgs = null
        }
      }, intervalMs - elapsed)
    }
  }

  // 刷新：立即执行待处理的调用
  throttled.flush = () => {
    if (timerId) {
      clearTimeout(timerId)
      timerId = null
    }
    if (pendingArgs) {
      lastCallTime = Date.now()
      fn.apply(null, pendingArgs)
      pendingArgs = null
    }
  }

  return throttled as T & { flush: () => void }
}
