import { SettingsRepository } from '../database/repositories/settings.repository'
import { WorkspaceMemoryRepository } from '../database/repositories/workspace-memory.repository'
import { MemoryCandidateRepository } from '../database/repositories/memory-candidate.repository'
import { ConversationSummaryRepository } from '../database/repositories/conversation-summary.repository'
import { MessageRepository } from '../database/repositories/message.repository'

const settingsRepo = new SettingsRepository()
const workspaceMemoryRepo = new WorkspaceMemoryRepository()
const memoryCandidateRepo = new MemoryCandidateRepository()
const conversationSummaryRepo = new ConversationSummaryRepository()
const messageRepo = new MessageRepository()

interface ExtractedCandidate {
  scope: 'global' | 'workspace'
  category: 'preference' | 'identity' | 'workspace_rule'
  text: string
  workspaceId?: string | null
}

function uniqueLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index, arr) => arr.indexOf(line) === index)
}

function appendDistinctLine(existing: string, nextLine: string): string {
  const lines = uniqueLines(existing)
  if (!lines.includes(nextLine)) {
    lines.push(nextLine)
  }
  return lines.join('\n')
}

function splitSentences(content: string): string[] {
  return content
    .split(/[\n。！？!?；;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4)
}

function extractCandidates(content: string, workspaceId?: string | null): ExtractedCandidate[] {
  const sentences = splitSentences(content)
  const results: ExtractedCandidate[] = []

  for (const sentence of sentences) {
    const normalized = sentence.replace(/\s+/g, ' ').trim()

    const nameMatch = normalized.match(/(?:请叫我|叫我|称呼我为)(.+)$/)
    if (nameMatch) {
      const name = nameMatch[1].trim().replace(/^["'“”]|["'“”]$/g, '')
      if (name && name.length <= 24) {
        results.push({
          scope: 'global',
          category: 'identity',
          text: `用户希望被称呼为：${name}`,
        })
        continue
      }
    }

    if (/(我喜欢|我更喜欢|我希望|请用|默认用|尽量用|最好用|回答用|回复用)/.test(normalized)) {
      results.push({
        scope: 'global',
        category: 'preference',
        text: normalized,
      })
      continue
    }

    if (
      workspaceId &&
      /(这个项目|当前项目|这个仓库|在这个项目里|这个代码库|本项目|这个工作区|这个模块|提交前|命名统一|目录结构|优先|不要|必须|一律)/.test(normalized)
    ) {
      results.push({
        scope: 'workspace',
        category: 'workspace_rule',
        text: normalized,
        workspaceId,
      })
    }
  }

  return results.filter((item, index, arr) =>
    arr.findIndex((other) => other.scope === item.scope && other.text === item.text && (other.workspaceId ?? null) === (item.workspaceId ?? null)) === index
  )
}

export class MemoryService {
  getUserDisplayName(): string {
    return settingsRepo.get('user_display_name') ?? ''
  }

  setUserDisplayName(content: string): void {
    settingsRepo.set('user_display_name', content)
  }

  getUserPreferences(): string {
    return settingsRepo.get('user_preferences') ?? ''
  }

  setUserPreferences(content: string): void {
    settingsRepo.set('user_preferences', content)
  }

  getGlobalMemory(): string {
    return settingsRepo.get('global_memory') ?? ''
  }

  setGlobalMemory(content: string): void {
    settingsRepo.set('global_memory', content)
  }

  getWorkspaceMemory(workspaceId: string) {
    return workspaceMemoryRepo.getByWorkspaceId(workspaceId)
  }

  setWorkspaceMemory(workspaceId: string, content: string) {
    return workspaceMemoryRepo.upsert(workspaceId, content)
  }

  ingestUserMessage(content: string, sourceMessageId?: string | null, workspaceId?: string | null): void {
    const candidates = extractCandidates(content, workspaceId)
    for (const candidate of candidates) {
      if (memoryCandidateRepo.existsPending(candidate.scope, candidate.text, candidate.workspaceId ?? null)) {
        continue
      }
      memoryCandidateRepo.create({
        scope: candidate.scope,
        category: candidate.category,
        candidate_text: candidate.text,
        source_message_id: sourceMessageId ?? null,
        workspace_id: candidate.workspaceId ?? null,
        status: 'pending',
      })
    }

    if (workspaceId) {
      this.refreshWorkspaceRuleSummary(workspaceId)
    }
  }

  listCandidates(status?: 'pending' | 'approved' | 'rejected') {
    return memoryCandidateRepo.list(status)
  }

  approveCandidate(candidateId: string): void {
    const candidate = memoryCandidateRepo.getById(candidateId)
    if (!candidate || candidate.status !== 'pending') return

    if (candidate.category === 'identity') {
      const name = candidate.candidate_text.replace(/^用户希望被称呼为：/, '').trim()
      this.setUserDisplayName(name)
    } else if (candidate.scope === 'workspace' && candidate.workspace_id) {
      const existing = workspaceMemoryRepo.getByWorkspaceId(candidate.workspace_id)?.content ?? ''
      workspaceMemoryRepo.upsert(candidate.workspace_id, appendDistinctLine(existing, candidate.candidate_text))
      this.refreshWorkspaceRuleSummary(candidate.workspace_id)
    } else {
      const existing = this.getUserPreferences()
      this.setUserPreferences(appendDistinctLine(existing, candidate.candidate_text))
    }

    memoryCandidateRepo.markStatus(candidateId, 'approved')
  }

  rejectCandidate(candidateId: string): void {
    const candidate = memoryCandidateRepo.getById(candidateId)
    memoryCandidateRepo.markStatus(candidateId, 'rejected')
    if (candidate?.workspace_id) {
      this.refreshWorkspaceRuleSummary(candidate.workspace_id)
    }
  }

  getConversationSummary(conversationId: string) {
    return conversationSummaryRepo.getByConversationId(conversationId)
  }

  refreshConversationSummary(conversationId: string): void {
    const messages = messageRepo
      .getByConversationId(conversationId)
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .filter((message) => message.content.trim())

    if (messages.length === 0) {
      return
    }

    const recent = messages.slice(-12)
    const userHighlights = recent
      .filter((message) => message.role === 'user')
      .map((message) => message.content.trim().replace(/\s+/g, ' '))
      .slice(-4)
    const assistantHighlights = recent
      .filter((message) => message.role === 'assistant')
      .map((message) => message.content.trim().replace(/\s+/g, ' '))
      .slice(-4)

    const summaryLines = [
      userHighlights.length ? `用户近期目标：${userHighlights.join('；').slice(0, 280)}` : '',
      assistantHighlights.length ? `已完成或已讨论：${assistantHighlights.join('；').slice(0, 280)}` : '',
    ].filter(Boolean)

    const summary = summaryLines.join('\n')
    if (!summary) return

    conversationSummaryRepo.upsert(conversationId, summary, messages.length)
  }

  refreshWorkspaceRuleSummary(workspaceId: string): void {
    const existing = workspaceMemoryRepo.getByWorkspaceId(workspaceId)?.content ?? ''
    const approvedRules = memoryCandidateRepo
      .list('approved')
      .filter((candidate) => candidate.workspace_id === workspaceId && candidate.category === 'workspace_rule')
      .map((candidate) => candidate.candidate_text)

    const pendingRules = memoryCandidateRepo
      .list('pending')
      .filter((candidate) => candidate.workspace_id === workspaceId && candidate.category === 'workspace_rule')
      .map((candidate) => `待确认：${candidate.candidate_text}`)

    const merged = uniqueLines([existing, ...approvedRules, ...pendingRules].filter(Boolean).join('\n')).join('\n')
    if (merged !== existing) {
      workspaceMemoryRepo.upsert(workspaceId, merged)
    }
  }
}
