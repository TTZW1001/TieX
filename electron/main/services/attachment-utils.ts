import { readFileSync, statSync } from 'fs'
import { extname } from 'path'
import type { AttachmentInput, MessageAttachment } from '../../shared/types'
import type { ChatImagePart, ChatTextPart } from '../providers/model-provider'

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.csv',
  '.log',
])

function safeReadTextPreview(filePath: string, mimeType: string | null): string | null {
  try {
    const ext = extname(filePath).toLowerCase()
    const isText = TEXT_EXTENSIONS.has(ext) || (mimeType?.startsWith('text/') ?? false)
    if (!isText) return null
    return readFileSync(filePath, 'utf8').slice(0, 4000)
  } catch {
    return null
  }
}

function attachmentKindFromMime(mimeType?: string | null): 'image' | 'file' {
  return mimeType?.startsWith('image/') ? 'image' : 'file'
}

export function normalizeAttachmentInput(input: AttachmentInput): AttachmentInput & { kind: 'image' | 'file' } {
  return {
    ...input,
    mimeType: input.mimeType ?? null,
    size: input.size ?? null,
    kind: attachmentKindFromMime(input.mimeType),
  }
}

export function toAttachmentContentParts(
  attachments: Array<AttachmentInput | MessageAttachment>,
  providerType: string,
): Array<ChatTextPart | ChatImagePart> {
  const parts: Array<ChatTextPart | ChatImagePart> = []

  for (const attachment of attachments) {
    const mimeType = 'mime_type' in attachment ? attachment.mime_type : (attachment.mimeType ?? null)
    const fileName = 'file_name' in attachment ? attachment.file_name : attachment.name
    const filePath = 'original_path' in attachment ? attachment.original_path : attachment.path
    const kind = 'kind' in attachment ? attachment.kind : attachmentKindFromMime(mimeType)

    if (kind === 'image' && providerType === 'siliconflow') {
      try {
        const bytes = readFileSync(filePath)
        const url = `data:${mimeType || 'image/png'};base64,${bytes.toString('base64')}`
        parts.push({
          type: 'image_url',
          image_url: { url },
        })
        parts.push({
          type: 'text',
          text: `图片附件：${fileName}`,
        })
        continue
      } catch {
        parts.push({
          type: 'text',
          text: `图片附件读取失败：${fileName}`,
        })
        continue
      }
    }

    const preview = safeReadTextPreview(filePath, mimeType)
    if (preview) {
      parts.push({
        type: 'text',
        text: `附件 ${fileName} 内容预览：\n${preview}`,
      })
      continue
    }

    const hint =
      kind === 'image' && providerType !== 'siliconflow'
        ? `图片附件 ${fileName} 已记录。当前 Provider 不支持图像输入，若需视觉理解请切换到 SiliconFlow。`
        : `附件 ${fileName} 已记录。`
    parts.push({
      type: 'text',
      text: hint,
    })
  }

  return parts
}

export function readAttachmentSize(filePath: string): number | null {
  try {
    return statSync(filePath).size
  } catch {
    return null
  }
}
