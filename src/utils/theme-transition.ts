/**
 * 主题切换 View Transition 工具
 *
 * 使用浏览器原生 View Transition API 实现圆形 clip-path 扩散动画：
 * - 点击主题切换按钮时，从按钮位置以圆形展开新主题
 * - 不支持 startViewTransition 的浏览器（Firefox）自动降级为即时切换
 *
 * 用法：
 *   import { runThemeTransition } from '@/utils/theme-transition'
 *   button.addEventListener('click', (e) => runThemeTransition(e, nextTheme, applyFn))
 */

export type ThemeTransitionOptions = {
  /** 扩散圆心 X 坐标（默认按钮中心） */
  clientX?: number
  /** 扩散圆心 Y 坐标（默认按钮中心） */
  clientY?: number
  /** 动画时长（ms） */
  duration?: number
  /** 缓动函数 */
  easing?: 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'
  /** 是否使用平方根缓动（更自然） */
  useSqrtEasing?: boolean
}

/**
 * 使用 View Transition API 在指定位置以圆形扩散方式切换主题
 *
 * @param eventOrRect 触发事件或 DOMRect（用于确定扩散中心）
 * @param applyThemeFn 真正切换主题的回调（修改 data-theme、class 等）
 * @param options 动画参数
 */
export function runThemeTransition(
  eventOrRect: MouseEvent | DOMRect | { clientX: number; clientY: number } | null | undefined,
  applyThemeFn: () => void,
  options: ThemeTransitionOptions = {}
) {
  const {
    duration = 700,
    easing = 'ease-in-out',
    useSqrtEasing = true,
  } = options

  // 计算扩散中心
  let clientX: number
  let clientY: number

  if (eventOrRect && 'clientX' in eventOrRect && 'clientY' in eventOrRect) {
    clientX = eventOrRect.clientX
    clientY = eventOrRect.clientY
  } else if (eventOrRect && 'left' in eventOrRect) {
    const rect = eventOrRect as DOMRect
    clientX = rect.left + rect.width / 2
    clientY = rect.top + rect.height / 2
  } else {
    // 默认右上角（图标按钮位置）
    clientX = window.innerWidth - 60
    clientY = 36
  }

  // 兼容性降级：不支持 startViewTransition 时直接切换
  if (
    typeof document === 'undefined' ||
    typeof (document as any).startViewTransition !== 'function'
  ) {
    applyThemeFn()
    return
  }

  const transition = (document as any).startViewTransition(() => {
    applyThemeFn()
  })

  // 计算覆盖整个视口所需的最大半径
  const endRadius = Math.hypot(
    Math.max(clientX, window.innerWidth - clientX),
    Math.max(clientY, window.innerHeight - clientY)
  )

  transition.ready.then(() => {
    // 只动画 new 层（圆形从 0 扩散到全屏），old 层保持静态不动
    // 这样视觉上只有"新主题从点击位置揭开"的效果，不会有双层错位
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${clientX}px ${clientY}px)`,
          `circle(${endRadius}px at ${clientX}px ${clientY}px)`,
        ],
      },
      {
        duration,
        easing: useSqrtEasing ? 'ease-out' : easing,
        fill: 'both',
        pseudoElement: '::view-transition-new(root)',
      }
    )
  })
}

/**
 * 检查浏览器是否支持 View Transition API
 */
export function supportsViewTransition(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof (document as any).startViewTransition === 'function'
  )
}
