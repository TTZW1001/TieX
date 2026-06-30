import { Boxes, Bug, Database, FileText, GitBranch, Layers, Palette, Wrench } from 'lucide-vue-next'
import type { SkillMarketItemInfo } from '@/types/global'

export type SkillMarketCategoryId =
  | 'all'
  | 'installed'
  | 'engineering'
  | 'ui'
  | 'docs'
  | 'debug'
  | 'git-data'
  | 'tiex'

export const SKILL_MARKET_CATEGORIES = [
  { id: 'all', label: '所有 Skills', icon: Boxes },
  { id: 'installed', label: '已安装', icon: Layers },
  { id: 'engineering', label: '项目工程', icon: Wrench },
  { id: 'ui', label: 'UI 设计', icon: Palette },
  { id: 'docs', label: '文档增强', icon: FileText },
  { id: 'debug', label: '调试排障', icon: Bug },
  { id: 'git-data', label: 'Git / 数据', icon: Database },
  { id: 'tiex', label: 'TieX 工作流', icon: GitBranch },
] as const

export function normalizeSkillMarketCategory(raw: unknown): SkillMarketCategoryId {
  const value = String(raw ?? 'all')
  return SKILL_MARKET_CATEGORIES.some((item) => item.id === value) ? (value as SkillMarketCategoryId) : 'all'
}

export function skillMatchesCategory(item: SkillMarketItemInfo, categoryId: SkillMarketCategoryId): boolean {
  if (categoryId === 'all') return true
  if (categoryId === 'installed') return Boolean(item.installedSkillId)

  const tags = new Set(item.tags.map((tag) => tag.toLowerCase()))
  const name = item.name.toLowerCase()

  if (categoryId === 'engineering') {
    return tags.has('code') || tags.has('architecture') || name.includes('project')
  }
  if (categoryId === 'ui') {
    return tags.has('frontend') || tags.has('ui') || tags.has('design') || tags.has('image') || tags.has('interaction') || name.includes('ui')
  }
  if (categoryId === 'docs') {
    return tags.has('docs') || tags.has('artifacts') || tags.has('pdf') || tags.has('presentation') || tags.has('skill') || name.includes('document')
  }
  if (categoryId === 'debug') {
    return tags.has('debug') || tags.has('command') || tags.has('electron') || tags.has('performance') || name.includes('debug')
  }
  if (categoryId === 'git-data') {
    return tags.has('git') || tags.has('sqlite') || tags.has('database') || tags.has('data') || tags.has('spreadsheet')
  }
  if (categoryId === 'tiex') {
    return tags.has('tiex') || tags.has('agent') || name.includes('tiex')
  }
  return true
}
