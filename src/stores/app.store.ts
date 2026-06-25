import { defineStore } from 'pinia'
import { ref } from 'vue'
import { runThemeTransition } from '@/utils/theme-transition'

export type ThemeMode = 'light' | 'dark' | 'system'

export const useAppStore = defineStore('app', () => {
  const initialized = ref(false)
  const currentTheme = ref<ThemeMode>('system')
  const isDark = ref(false)

  function setTheme(theme: ThemeMode) {
    currentTheme.value = theme
    if (window.tiex) {
      window.tiex.theme.set(theme)
    }
    // 持久化主题到数据库
    if (window.tiex?.settings) {
      window.tiex.settings.update('theme', theme).catch((err) => {
        console.error('Failed to persist theme:', err)
      })
    }
    applyTheme()
  }

  /**
   * 带 View Transition 动画的主题切换
   * 从事件发生位置以圆形扩散方式过渡
   */
  function toggleThemeWithTransition(event?: MouseEvent) {
    // 计算 next theme（仅支持 light / dark 之间的循环，system 时按当前实际判断）
    let nextIsDark: boolean
    if (currentTheme.value === 'system') {
      nextIsDark = !isDark.value
    } else {
      nextIsDark = currentTheme.value !== 'dark'
    }
    const nextMode: ThemeMode = nextIsDark ? 'dark' : 'light'

    runThemeTransition(event ?? null, () => {
      currentTheme.value = nextMode
      isDark.value = nextIsDark
      if (window.tiex) {
        window.tiex.theme.set(nextMode)
      }
      if (window.tiex?.settings) {
        window.tiex.settings.update('theme', nextMode).catch(() => {})
      }
      applyTheme()
    })
  }

  function applyTheme() {
    if (currentTheme.value === 'dark') {
      isDark.value = true
    } else if (currentTheme.value === 'light') {
      isDark.value = false
    }
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
    document.documentElement.style.colorScheme = isDark.value ? 'dark' : 'light'
  }

  function setIsDark(value: boolean) {
    isDark.value = value
    applyTheme()
  }

  async function initTheme() {
    if (window.tiex) {
      // 从数据库读取主题设置
      if (window.tiex.settings) {
        try {
          const savedTheme = await window.tiex.settings.get('theme')
          if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
            currentTheme.value = savedTheme as ThemeMode
            window.tiex.theme.set(savedTheme as ThemeMode)
          }
        } catch (err) {
          console.error('Failed to load theme from database:', err)
        }
      }

      const systemDark = await window.tiex.theme.getSystem()
      if (currentTheme.value === 'system') {
        isDark.value = systemDark
      }
      window.tiex.theme.onChanged((dark: boolean) => {
        if (currentTheme.value === 'system') {
          setIsDark(dark)
        }
      })
    }
    applyTheme()
  }

  return {
    initialized,
    currentTheme,
    isDark,
    setTheme,
    toggleThemeWithTransition,
    setIsDark,
    initTheme,
    applyTheme,
  }
})
