import { app, shell } from 'electron'
import { createHash } from 'crypto'
import { homedir } from 'os'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import type { SkillInfo, SkillMarketItem, SkillRefResolution } from '../../shared/types'
import { SkillRepository } from '../database/repositories/skill.repository'

const skillRepo = new SkillRepository()
const SKILL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/
const MAX_SKILL_BYTES = 128 * 1024

const MARKET_SKILLS: Array<SkillMarketItem & { content: string }> = [
  {
    id: 'builtin-code-project-analysis',
    name: 'code-project-analysis',
    displayName: '代码项目分析',
    description: '系统梳理项目结构、关键模块、执行链路、风险点和下一步阅读顺序。',
    version: '1.0.0',
    tags: ['code', 'architecture'],
    installedSkillId: null,
    content: `---
name: code-project-analysis
description: 系统分析代码项目结构、模块边界、关键链路和风险点。
---

# Code Project Analysis

Use this skill when the user asks TieX to understand a repository, explain architecture, identify important files, or plan code changes.

Workflow:
1. Start from package/config files, README, docs, and main entrypoints.
2. Identify runtime boundaries, data flow, persistence, IPC/API surfaces, and UI state.
3. Prefer evidence from local files over guesses.
4. Summarize findings as: current structure, important modules, risks, recommended next steps.
5. When code changes are requested, keep edits scoped to the discovered ownership boundaries.
`,
  },
  {
    id: 'builtin-frontend-ui-review',
    name: 'frontend-ui-review',
    displayName: '前端 UI 优化',
    description: '检查 Vue/Electron 界面的布局、状态、可访问性、响应式和视觉一致性。',
    version: '1.0.0',
    tags: ['frontend', 'ui'],
    installedSkillId: null,
    content: `---
name: frontend-ui-review
description: Review and improve Vue/Electron UI implementation with production-grade interaction details.
---

# Frontend UI Review

Use this skill for UI implementation or review in TieX.

Guidelines:
1. Follow the existing design system and CSS variables before inventing new visual language.
2. Keep operational desktop tools dense, clear, and scannable.
3. Ensure text does not overflow buttons, cards, popovers, or sidebars.
4. Prefer familiar controls: switches for booleans, selects for options, numeric inputs for limits.
5. Verify empty, loading, disabled, error, and narrow viewport states.
`,
  },
  {
    id: 'builtin-document-generator',
    name: 'document-generator',
    displayName: '文档生成',
    description: '生成 Markdown、Word、PPT 等文档时使用结构化规划、长度控制和版式检查。',
    version: '1.0.0',
    tags: ['docs', 'artifacts'],
    installedSkillId: null,
    content: `---
name: document-generator
description: Plan and generate structured documents and presentation artifacts.
---

# Document Generator

Use this skill when creating or improving Markdown, DOCX, PPTX, or project documentation.

Rules:
1. Define audience, goal, structure, and output format first.
2. Keep generated slides and document sections concise.
3. Use headings, tables, and checklists only when they improve scanning.
4. If creating files, record expected artifact path and verify the output exists.
5. Avoid claiming a document was generated unless a file write or artifact record confirms it.
`,
  },
  {
    id: 'builtin-command-troubleshooting',
    name: 'command-troubleshooting',
    displayName: '命令排障',
    description: '分析构建、测试、安装和脚本失败，提取关键错误并设计最小修复。',
    version: '1.0.0',
    tags: ['command', 'debug'],
    installedSkillId: null,
    content: `---
name: command-troubleshooting
description: Diagnose failed commands, builds, tests, installs, and scripts.
---

# Command Troubleshooting

Use this skill when command output, build logs, tests, or package scripts fail.

Workflow:
1. Capture command, args, cwd, exit code, timeout status, and key stderr/stdout lines.
2. Classify likely cause: missing dependency, script mismatch, type error, test failure, permission, path, or timeout.
3. Prefer minimal fixes that match the repo tooling.
4. Re-run the smallest relevant verification command.
5. Report what failed, what changed, and what still needs attention.
`,
  },
  {
    id: 'builtin-git-commit-summary',
    name: 'git-commit-summary',
    displayName: 'Git 提交总结',
    description: '根据变更生成提交摘要、PR 草稿、风险说明和验证记录。',
    version: '1.0.0',
    tags: ['git', 'summary'],
    installedSkillId: null,
    content: `---
name: git-commit-summary
description: Summarize local changes into commit messages, PR notes, risks, and verification.
---

# Git Commit Summary

Use this skill when preparing a commit, changelog, or PR summary.

Checklist:
1. Inspect changed files and separate user changes from current task changes.
2. Summarize behavior changes before implementation details.
3. Include tests or verification commands that were actually run.
4. Call out migrations, data changes, UI changes, and known risks.
5. Keep commit messages concise and imperative.
`,
  },
  {
    id: 'builtin-sqlite-debugging',
    name: 'sqlite-debugging',
    displayName: 'SQLite 数据排查',
    description: '排查 SQLite schema、迁移、索引、数据一致性和 repository 映射问题。',
    version: '1.0.0',
    tags: ['sqlite', 'database'],
    installedSkillId: null,
    content: `---
name: sqlite-debugging
description: Debug SQLite schemas, migrations, repositories, indexes, and data integrity.
---

# SQLite Debugging

Use this skill for TieX database work.

Rules:
1. Check migrations and runtime inline migrations together.
2. Preserve backward compatibility for existing local databases.
3. Keep repository mapping explicit between snake_case rows and frontend VO fields.
4. Add indexes for lookup paths used by IPC or task runtime.
5. Avoid destructive migration steps unless explicitly approved.
`,
  },
  {
    id: 'builtin-electron-desktop-debugging',
    name: 'electron-desktop-debugging',
    displayName: 'Electron 桌面调试',
    description: '排查 Electron 主进程、preload、IPC、渲染进程和本地路径边界。',
    version: '1.0.0',
    tags: ['electron', 'ipc'],
    installedSkillId: null,
    content: `---
name: electron-desktop-debugging
description: Debug Electron main process, preload bridge, IPC contracts, renderer state, and local paths.
---

# Electron Desktop Debugging

Use this skill for Electron app issues.

Checklist:
1. Confirm whether logic belongs in main, preload, renderer, service, or repository layer.
2. Keep preload APIs typed and narrow.
3. Validate IPC inputs in main process.
4. Never expose secrets or encrypted API keys to renderer.
5. Use Electron appData paths for user-managed app files, and guard filesystem boundaries.
`,
  },
  {
    id: 'builtin-tiex-agent-workflow',
    name: 'tiex-agent-workflow',
    displayName: 'TieX Agent 工作流',
    description: '遵循 TieX 的任务、权限、工具调用、上下文快照和结果摘要工作方式。',
    version: '1.0.0',
    tags: ['tiex', 'agent'],
    installedSkillId: null,
    content: `---
name: tiex-agent-workflow
description: Work effectively within TieX task runtime, tool approvals, context snapshots, and result summaries.
---

# TieX Agent Workflow

Use this skill when changing or debugging TieX itself.

Principles:
1. Respect the task audit model: tasks, steps, tool calls, permissions, file changes, artifacts, logs.
2. Do not claim local execution succeeded unless tool facts or records prove it.
3. Keep permission decisions visible and recoverable.
4. Record meaningful context snapshots without leaking full prompts.
5. Prefer incremental migrations and focused tests around changed behavior.
`,
  },
  {
    id: 'builtin-pdf-document-review',
    name: 'pdf-document-review',
    displayName: 'PDF 文档审阅',
    description: '提取、审阅和核对 PDF 内容，关注版式、页码、表格和引用一致性。',
    version: '1.0.0',
    tags: ['pdf', 'docs'],
    installedSkillId: null,
    content: `---
name: pdf-document-review
description: Read, inspect, summarize, and verify PDF documents with layout-aware checks.
---

# PDF Document Review

Use this skill when the user asks TieX to read, summarize, compare, or validate PDF files.

Workflow:
1. Identify the requested pages, sections, tables, figures, or citations.
2. Prefer structured extraction for text and tables; use visual inspection when layout matters.
3. Keep page references in summaries so the user can verify claims.
4. Flag scanned, encrypted, malformed, or layout-heavy PDFs early.
5. When generating follow-up artifacts, preserve source file names and page references.
`,
  },
  {
    id: 'builtin-spreadsheet-analysis',
    name: 'spreadsheet-analysis',
    displayName: '表格分析',
    description: '分析 CSV/XLSX 数据、公式、字段含义、异常值和可视化建议。',
    version: '1.0.0',
    tags: ['spreadsheet', 'data'],
    installedSkillId: null,
    content: `---
name: spreadsheet-analysis
description: Analyze CSV and spreadsheet data, formulas, anomalies, summaries, and chart suggestions.
---

# Spreadsheet Analysis

Use this skill for CSV, TSV, XLSX, or structured tabular data tasks.

Checklist:
1. Inspect sheets, columns, row counts, data types, formulas, and missing values.
2. Separate raw facts from inferred business meaning.
3. Validate totals, joins, filters, and duplicated records before drawing conclusions.
4. Suggest charts only when they clarify comparison, trend, distribution, or composition.
5. Report assumptions and any rows or columns excluded from analysis.
`,
  },
  {
    id: 'builtin-presentation-deck',
    name: 'presentation-deck',
    displayName: '演示文稿制作',
    description: '规划 PPT 结构、页面节奏、讲述顺序和视觉检查清单。',
    version: '1.0.0',
    tags: ['presentation', 'docs', 'artifacts'],
    installedSkillId: null,
    content: `---
name: presentation-deck
description: Plan, draft, and review presentation decks with concise structure and visual QA.
---

# Presentation Deck

Use this skill when the user wants a slide deck, pitch, report presentation, or speaker outline.

Rules:
1. Start with audience, objective, slide count, and desired tone.
2. Keep each slide focused on one point.
3. Use titles that state the message, not just the topic.
4. Balance text, charts, screenshots, and speaker notes.
5. Verify final decks for overflow, contrast, alignment, and missing assets.
`,
  },
  {
    id: 'builtin-image-asset-generation',
    name: 'image-asset-generation',
    displayName: '图片与素材生成',
    description: '为产品页、文档、游戏或 UI 生成图片素材、图标说明和视觉提示词。',
    version: '1.0.0',
    tags: ['image', 'design', 'ui'],
    installedSkillId: null,
    content: `---
name: image-asset-generation
description: Create and refine prompts for product images, UI assets, illustrations, textures, and visual references.
---

# Image Asset Generation

Use this skill when a task needs generated or edited bitmap assets.

Guidelines:
1. Clarify purpose, format, aspect ratio, transparency, and style constraints.
2. Describe concrete subject matter, environment, lighting, material, and composition.
3. Keep assets consistent with the existing app or document visual language.
4. For UI assets, plan how the image will fit the actual layout.
5. Avoid decorative images when a real screenshot, product image, or diagram would communicate better.
`,
  },
  {
    id: 'builtin-interaction-polish',
    name: 'interaction-polish',
    displayName: '交互细节打磨',
    description: '设计加载、空状态、补全、弹层、动效和反馈状态，让界面更顺手。',
    version: '1.0.0',
    tags: ['interaction', 'ui'],
    installedSkillId: null,
    content: `---
name: interaction-polish
description: Improve microinteractions, motion, feedback states, empty states, and ergonomic UI flows.
---

# Interaction Polish

Use this skill for UI interaction design and implementation.

Checklist:
1. Cover hover, active, disabled, loading, empty, error, and success states.
2. Keep motion short and purposeful; never hide state changes behind decoration.
3. Make keyboard, focus, and click-away behavior predictable.
4. Prevent layout shift when labels, badges, or async data change.
5. Prefer familiar controls and visible feedback over explanatory text.
`,
  },
  {
    id: 'builtin-skill-authoring',
    name: 'skill-authoring',
    displayName: 'Skill 编写',
    description: '帮助编写、整理和审查 SKILL.md，让技能边界清楚、触发明确。',
    version: '1.0.0',
    tags: ['skill', 'docs'],
    installedSkillId: null,
    content: `---
name: skill-authoring
description: Author and review local SKILL.md files with clear triggers, workflow, boundaries, and verification.
---

# Skill Authoring

Use this skill when creating or improving a TieX Skill.

Rules:
1. Give the skill a narrow purpose and concrete trigger situations.
2. Put durable workflow instructions in SKILL.md, not task-specific facts.
3. Include what to inspect first, what to avoid, and how to verify results.
4. Keep content compact enough for context injection.
5. Prefer examples and checklists over vague style advice.
`,
  },
  {
    id: 'builtin-log-write-guard',
    name: 'log-write-guard',
    displayName: '日志写入排查',
    description: '排查本地日志、SQLite WAL、缓存和高频写入导致的性能或磁盘问题。',
    version: '1.0.0',
    tags: ['debug', 'sqlite', 'performance'],
    installedSkillId: null,
    content: `---
name: log-write-guard
description: Diagnose excessive local log writes, SQLite WAL churn, cache growth, and desktop app disk pressure.
---

# Log Write Guard

Use this skill when the user reports high disk writes, large logs, slow local DB, or cache growth.

Checklist:
1. Identify which files are growing and which process owns them.
2. Distinguish useful audit logs from low-value noisy telemetry.
3. Check SQLite journal/WAL behavior, retention, indexes, and cleanup jobs.
4. Prefer bounded retention, batching, and selective filtering over deleting all history.
5. Verify before and after sizes or write rates when possible.
`,
  },
]

function skillsRoot(): string {
  return join(app.getPath('userData'), 'skills')
}

function installedRoot(): string {
  return join(skillsRoot(), 'installed')
}

function codexSkillsRoot(): string {
  return join(homedir(), '.codex', 'skills')
}

function ensureSkillsDirs(): void {
  mkdirSync(installedRoot(), { recursive: true })
}

function safeRealPath(path: string): string {
  return realpathSync(path)
}

function isInside(parent: string, child: string): boolean {
  const parentReal = safeRealPath(parent)
  const childReal = safeRealPath(child)
  const rel = relative(parentReal, childReal)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function isTargetInside(parent: string, child: string): boolean {
  const parentReal = safeRealPath(parent)
  const target = resolve(child)
  const rel = relative(parentReal, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function parseFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end < 0) return {}
  const block = content.slice(3, end).trim()
  const meta: Record<string, string> = {}
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/)
    if (match) {
      meta[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  return meta
}

function summarizeSkill(content: string): string {
  const body = content.replace(/^---[\s\S]*?\n---\s*/, '').trim()
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  return lines.join(' ').slice(0, 800)
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4)
}

export class SkillService {
  getSkillsRoot(): string {
    ensureSkillsDirs()
    return installedRoot()
  }

  list(): SkillInfo[] {
    return skillRepo.listAll()
  }

  scan(): SkillInfo[] {
    ensureSkillsDirs()
    const root = installedRoot()
    const entries = readdirSync(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillName = entry.name
      if (!SKILL_NAME_RE.test(skillName)) continue
      const skillDir = join(root, skillName)
      const skillFile = join(skillDir, 'SKILL.md')
      if (!existsSync(skillFile)) continue
      if (!isInside(root, skillFile)) continue

      const content = readFileSync(skillFile, 'utf8')
      const meta = parseFrontmatter(content)
      const hash = createHash('sha256').update(content).digest('hex')
      const oversized = Buffer.byteLength(content, 'utf8') > MAX_SKILL_BYTES
      const summary = oversized
        ? `${summarizeSkill(content).slice(0, 700)}\n\n[内容较长，运行时将优先注入摘要。]`
        : summarizeSkill(content)

      skillRepo.upsert({
        name: meta.name && SKILL_NAME_RE.test(meta.name) ? meta.name : skillName,
        displayName: meta.displayName || meta.name || skillName,
        description: meta.description || summary.slice(0, 160) || null,
        source: meta.source || 'local',
        version: meta.version || null,
        path: safeRealPath(skillDir),
        installType: 'local',
        contentHash: hash,
        summary,
        tokenEstimate: estimateTokens(content),
      })
    }
    return this.list()
  }

  setEnabled(id: string, enabled: boolean): void {
    skillRepo.setEnabled(id, enabled)
  }

  delete(id: string): void {
    ensureSkillsDirs()
    const skill = skillRepo.getById(id)
    if (!skill) return
    const root = installedRoot()
    if (skill.installType !== 'external' && existsSync(skill.path) && isInside(root, skill.path)) {
      rmSync(skill.path, { recursive: true, force: true })
    }
    skillRepo.delete(id)
  }

  getMarket(): SkillMarketItem[] {
    const installedByName = new Map(this.list().map((skill) => [skill.name, skill.id]))
    return MARKET_SKILLS.map(({ content, ...item }) => ({
      ...item,
      installedSkillId: installedByName.get(item.name) ?? null,
    }))
  }

  installMarket(id: string): SkillInfo {
    ensureSkillsDirs()
    const item = MARKET_SKILLS.find((skill) => skill.id === id)
    if (!item) {
      throw new Error('Skill 市场项不存在')
    }
    const targetDir = join(installedRoot(), item.name)
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, 'SKILL.md'), item.content, 'utf8')
    return this.scan().find((skill) => skill.name === item.name) ?? skillRepo.getByName(item.name)!
  }

  importCodexSkills(): SkillInfo[] {
    ensureSkillsDirs()
    const sourceRoot = codexSkillsRoot()
    if (!existsSync(sourceRoot)) {
      throw new Error('未找到本机 Codex skills 目录')
    }

    const root = installedRoot()
    const entries = readdirSync(sourceRoot, { withFileTypes: true })
    let found = 0
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const sourceDir = join(sourceRoot, entry.name)
      const skillFile = join(sourceDir, 'SKILL.md')
      if (!existsSync(skillFile) || !isInside(sourceRoot, sourceDir)) continue
      found += 1

      const content = readFileSync(skillFile, 'utf8')
      const meta = parseFrontmatter(content)
      const skillName = meta.name && SKILL_NAME_RE.test(meta.name) ? meta.name : entry.name
      if (skillRepo.getByName(skillName)) continue

      const targetDir = join(root, entry.name)
      if (!isTargetInside(root, targetDir)) continue
      if (existsSync(targetDir)) continue
      cpSync(sourceDir, targetDir, { recursive: true, force: true })
    }

    if (found === 0) {
      throw new Error('Codex skills 目录中没有可复制的 SKILL.md')
    }
    return this.scan()
  }

  async openFolder(): Promise<string> {
    const root = this.getSkillsRoot()
    await shell.openPath(root)
    return root
  }

  resolveRefs(content: string): SkillRefResolution {
    const names = Array.from(new Set(Array.from(content.matchAll(/\$([a-zA-Z0-9][a-zA-Z0-9_-]{1,63})/g)).map((match) => match[1]))).slice(0, 8)
    const refs: SkillInfo[] = []
    const missing: string[] = []
    const disabled: string[] = []
    for (const name of names) {
      const skill = skillRepo.getByName(name)
      if (!skill) {
        missing.push(name)
      } else if (!skill.enabled) {
        disabled.push(name)
      } else {
        refs.push(skill)
      }
    }
    return { refs, missing, disabled }
  }

  readSkillContent(skill: SkillInfo): string {
    const skillFile = join(skill.path, 'SKILL.md')
    if (!existsSync(skillFile)) return skill.summary ?? ''
    const content = readFileSync(skillFile, 'utf8')
    if (Buffer.byteLength(content, 'utf8') > MAX_SKILL_BYTES) {
      return skill.summary ?? summarizeSkill(content)
    }
    return content
  }
}

export { skillRepo }
