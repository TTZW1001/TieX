import { getDatabase } from '../database'
import type { AiConfig, AiPresetEntity, ConversationAiSettingsEntity } from '../../../shared/types'

const AI_CONFIG_FIELDS = [
  'providerId',
  'modelName',
  'temperature',
  'topP',
  'maxTokens',
  'contextMessageLimit',
  'contextTokenLimit',
  'streamEnabled',
  'toolsEnabled',
  'attachmentsEnabled',
] as const

export type AiConfigKey = typeof AI_CONFIG_FIELDS[number]
export type AiOverrideMask = Partial<Record<AiConfigKey, boolean>>

function boolToDb(value: boolean | null | undefined): number | null {
  if (value === undefined || value === null) return null
  return value ? 1 : 0
}

function dbToBool(value: number | null | undefined): boolean | null {
  if (value === undefined || value === null) return null
  return value !== 0
}

export function rowToAiConfig(row: AiPresetEntity | ConversationAiSettingsEntity | null): AiConfig {
  return {
    providerId: row?.provider_id ?? null,
    modelName: row?.model_name ?? null,
    temperature: row?.temperature ?? null,
    topP: row?.top_p ?? null,
    maxTokens: row?.max_tokens ?? null,
    contextMessageLimit: row?.context_message_limit ?? null,
    contextTokenLimit: row?.context_token_limit ?? null,
    streamEnabled: dbToBool(row?.stream_enabled),
    toolsEnabled: dbToBool(row?.tools_enabled),
    attachmentsEnabled: dbToBool(row?.attachments_enabled),
  }
}

function parseOverrideMask(raw: string | null | undefined): AiOverrideMask {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      AI_CONFIG_FIELDS.map((field) => [field, Boolean((parsed as any)[field])]).filter(([, value]) => value)
    ) as AiOverrideMask
  } catch {
    return {}
  }
}

function serializeOverrideMask(mask: AiOverrideMask): string {
  return JSON.stringify(
    Object.fromEntries(AI_CONFIG_FIELDS.map((field) => [field, Boolean(mask[field])]).filter(([, value]) => value))
  )
}

export class AiSettingsRepository {
  getDefaultPreset(): AiPresetEntity | null {
    const db = getDatabase()
    const row = db
      .prepare("SELECT * FROM ai_presets WHERE scope = 'global' AND is_default = 1 ORDER BY updated_at DESC LIMIT 1")
      .get() as AiPresetEntity | undefined
    return row ?? null
  }

  upsertDefaultPreset(config: Partial<AiConfig>): AiPresetEntity {
    const db = getDatabase()
    const now = new Date().toISOString()
    const current = this.getDefaultPreset()
    const id = current?.id ?? 'default-ai-config'
    const existing = current ? rowToAiConfig(current) : {}
    const next: AiConfig = {
      providerId: config.providerId !== undefined ? config.providerId : (existing as AiConfig).providerId ?? null,
      modelName: config.modelName !== undefined ? config.modelName : (existing as AiConfig).modelName ?? null,
      temperature: config.temperature !== undefined ? config.temperature : (existing as AiConfig).temperature ?? null,
      topP: config.topP !== undefined ? config.topP : (existing as AiConfig).topP ?? null,
      maxTokens: config.maxTokens !== undefined ? config.maxTokens : (existing as AiConfig).maxTokens ?? null,
      contextMessageLimit: config.contextMessageLimit !== undefined ? config.contextMessageLimit : (existing as AiConfig).contextMessageLimit ?? 20,
      contextTokenLimit: config.contextTokenLimit !== undefined ? config.contextTokenLimit : (existing as AiConfig).contextTokenLimit ?? null,
      streamEnabled: config.streamEnabled !== undefined ? config.streamEnabled : (existing as AiConfig).streamEnabled ?? true,
      toolsEnabled: config.toolsEnabled !== undefined ? config.toolsEnabled : (existing as AiConfig).toolsEnabled ?? true,
      attachmentsEnabled: config.attachmentsEnabled !== undefined ? config.attachmentsEnabled : (existing as AiConfig).attachmentsEnabled ?? null,
    }

    db.prepare(
      `INSERT INTO ai_presets (
        id, name, scope, provider_id, model_name, temperature, top_p, max_tokens,
        context_message_limit, context_token_limit, stream_enabled, tools_enabled,
        attachments_enabled, custom_params_json, is_default, created_at, updated_at
      ) VALUES (?, '默认 AI 配置', 'global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider_id = excluded.provider_id,
        model_name = excluded.model_name,
        temperature = excluded.temperature,
        top_p = excluded.top_p,
        max_tokens = excluded.max_tokens,
        context_message_limit = excluded.context_message_limit,
        context_token_limit = excluded.context_token_limit,
        stream_enabled = excluded.stream_enabled,
        tools_enabled = excluded.tools_enabled,
        attachments_enabled = excluded.attachments_enabled,
        updated_at = excluded.updated_at`
    ).run(
      id,
      next.providerId,
      next.modelName,
      next.temperature,
      next.topP,
      next.maxTokens,
      next.contextMessageLimit,
      next.contextTokenLimit,
      boolToDb(next.streamEnabled),
      boolToDb(next.toolsEnabled),
      boolToDb(next.attachmentsEnabled),
      now,
      now
    )

    return this.getDefaultPreset()!
  }

  getConversationSettings(conversationId: string): { row: ConversationAiSettingsEntity | null; mask: AiOverrideMask } {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM conversation_ai_settings WHERE conversation_id = ?')
      .get(conversationId) as ConversationAiSettingsEntity | undefined
    return {
      row: row ?? null,
      mask: parseOverrideMask(row?.override_mask_json),
    }
  }

  upsertConversationSettings(conversationId: string, config: Partial<AiConfig>, maskPatch: AiOverrideMask): ConversationAiSettingsEntity {
    const db = getDatabase()
    const current = this.getConversationSettings(conversationId)
    const currentConfig = rowToAiConfig(current.row)
    const mask = { ...current.mask, ...maskPatch }
    for (const field of AI_CONFIG_FIELDS) {
      if (maskPatch[field] === false) {
        delete mask[field]
      }
    }

    const valueFor = <K extends AiConfigKey>(field: K): AiConfig[K] | null => {
      if (config[field] !== undefined) return config[field] as AiConfig[K]
      return currentConfig[field] as AiConfig[K]
    }

    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO conversation_ai_settings (
        conversation_id, provider_id, model_name, temperature, top_p, max_tokens,
        context_message_limit, context_token_limit, stream_enabled, tools_enabled,
        attachments_enabled, override_mask_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        provider_id = excluded.provider_id,
        model_name = excluded.model_name,
        temperature = excluded.temperature,
        top_p = excluded.top_p,
        max_tokens = excluded.max_tokens,
        context_message_limit = excluded.context_message_limit,
        context_token_limit = excluded.context_token_limit,
        stream_enabled = excluded.stream_enabled,
        tools_enabled = excluded.tools_enabled,
        attachments_enabled = excluded.attachments_enabled,
        override_mask_json = excluded.override_mask_json,
        updated_at = excluded.updated_at`
    ).run(
      conversationId,
      valueFor('providerId'),
      valueFor('modelName'),
      valueFor('temperature'),
      valueFor('topP'),
      valueFor('maxTokens'),
      valueFor('contextMessageLimit'),
      valueFor('contextTokenLimit'),
      boolToDb(valueFor('streamEnabled') as boolean | null),
      boolToDb(valueFor('toolsEnabled') as boolean | null),
      boolToDb(valueFor('attachmentsEnabled') as boolean | null),
      serializeOverrideMask(mask),
      now
    )

    return this.getConversationSettings(conversationId).row!
  }

  resetConversationSettings(conversationId: string): void {
    const db = getDatabase()
    db.prepare('DELETE FROM conversation_ai_settings WHERE conversation_id = ?').run(conversationId)
  }
}

export const AI_CONFIG_KEYS = AI_CONFIG_FIELDS
