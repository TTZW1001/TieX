/**
 * create_pptx Agent 工具 - 在工作区内生成 PPTX 演示文稿
 */
import type { AgentTool, ToolExecutionContext } from './agent-tool.types'
import { pathGuard } from '../security/path-guard'
import { computeContentHash } from '../services/backup.service'
import { artifactService } from '../services/artifact.service'
import { existsSync, writeFileSync, renameSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'
import PptxGenJS from 'pptxgenjs'

/** create_pptx 输入 */
export interface CreatePptxInput {
  path: string
  presentation: PresentationSpec
  overwrite?: boolean
}

/** PresentationSpec 结构化规格 */
export interface PresentationSpec {
  title: string
  subtitle?: string
  slides: Array<{
    layout: 'cover' | 'agenda' | 'title_content' | 'two_column' | 'image_text' | 'table' | 'summary'
    title: string
    bullets?: string[]
    leftContent?: string[]
    rightContent?: string[]
    table?: {
      headers: string[]
      rows: string[][]
    }
  }>
}

/** create_pptx 输出 */
export interface CreatePptxOutput {
  path: string
  sizeBytes: number
  created: boolean
  artifactId: string
  slideCount: number
}

/**
 * 校验文件名合法性
 */
function validateFileName(fileName: string): { valid: boolean; reason?: string } {
  if (!fileName || fileName.trim() === '') {
    return { valid: false, reason: '文件名不能为空' }
  }
  if (fileName.includes('\0')) {
    return { valid: false, reason: '文件名包含非法字符（null 字节）' }
  }
  if (/[\\/:]/.test(fileName)) {
    return { valid: false, reason: '文件名不能包含路径分隔符' }
  }
  return { valid: true }
}

/**
 * 原子写入二进制文件
 */
function atomicWriteBuffer(filePath: string, buffer: Buffer): void {
  const tmpPath = filePath + '.tiex.tmp'
  try {
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      const { mkdirSync } = require('fs')
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(tmpPath, buffer)
    renameSync(tmpPath, filePath)
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {}
    throw err
  }
}

// 配色方案
const THEME = {
  primary: '1F3864',    // 深蓝
  secondary: '2E5090',  // 中蓝
  accent: '4472C4',     // 亮蓝
  text: '333333',       // 深灰
  textLight: '666666',  // 浅灰
  white: 'FFFFFF',
  lightBg: 'F2F2F2',    // 浅灰背景
}

/**
 * 构建 PPTX 演示文稿
 */
async function buildPptxPresentation(spec: PresentationSpec): Promise<Buffer> {
  const pptx = new PptxGenJS()

  // 设置演示属性
  pptx.author = 'TieX'
  pptx.subject = spec.title

  // 定义版式
  pptx.defineSlideMaster({
    title: 'TITLE_SLIDE',
    background: { fill: THEME.primary },
  })

  pptx.defineSlideMaster({
    title: 'CONTENT_SLIDE',
    background: { fill: THEME.white },
  })

  for (const slide of spec.slides) {
    switch (slide.layout) {
      case 'cover': {
        const pptSlide = pptx.addSlide({ masterName: 'TITLE_SLIDE' })
        pptSlide.addText(spec.title, {
          x: 1.0,
          y: 2.0,
          w: 8.0,
          h: 1.5,
          fontSize: 36,
          fontFace: 'Calibri',
          color: THEME.white,
          bold: true,
          align: 'center',
        })
        if (spec.subtitle || slide.title !== spec.title) {
          pptSlide.addText(spec.subtitle || slide.title, {
            x: 1.0,
            y: 3.6,
            w: 8.0,
            h: 0.8,
            fontSize: 20,
            fontFace: 'Calibri',
            color: 'B4C7E7',
            align: 'center',
          })
        }
        break
      }

      case 'agenda': {
        const pptSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' })
        // 标题栏
        pptSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10,
          h: 1.0,
          fill: { color: THEME.primary },
        })
        pptSlide.addText(slide.title, {
          x: 0.5,
          y: 0.15,
          w: 9.0,
          h: 0.7,
          fontSize: 28,
          fontFace: 'Calibri',
          color: THEME.white,
          bold: true,
        })
        // 项目列表
        if (slide.bullets && slide.bullets.length > 0) {
          const bulletRows = slide.bullets.slice(0, 6).map((b, i) => ({
            text: `${i + 1}. ${b.slice(0, 40)}`,
            options: {
              fontSize: 20,
              fontFace: 'Calibri',
              color: THEME.text,
              bullet: false,
              paraSpaceAfter: 8,
            },
          }))
          pptSlide.addText(bulletRows, {
            x: 1.0,
            y: 1.3,
            w: 8.0,
            h: 4.5,
            valign: 'top',
          })
        }
        break
      }

      case 'title_content': {
        const pptSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' })
        // 标题栏
        pptSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10,
          h: 1.0,
          fill: { color: THEME.primary },
        })
        pptSlide.addText(slide.title, {
          x: 0.5,
          y: 0.15,
          w: 9.0,
          h: 0.7,
          fontSize: 28,
          fontFace: 'Calibri',
          color: THEME.white,
          bold: true,
        })
        // 内容
        if (slide.bullets && slide.bullets.length > 0) {
          const bulletRows = slide.bullets.slice(0, 6).map((b) => ({
            text: b.slice(0, 40),
            options: {
              fontSize: 20,
              fontFace: 'Calibri',
              color: THEME.text,
              bullet: { type: 'bullet' },
              paraSpaceAfter: 8,
            },
          }))
          pptSlide.addText(bulletRows, {
            x: 0.8,
            y: 1.3,
            w: 8.4,
            h: 4.2,
            valign: 'top',
          })
        }
        break
      }

      case 'two_column': {
        const pptSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' })
        // 标题栏
        pptSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10,
          h: 1.0,
          fill: { color: THEME.primary },
        })
        pptSlide.addText(slide.title, {
          x: 0.5,
          y: 0.15,
          w: 9.0,
          h: 0.7,
          fontSize: 28,
          fontFace: 'Calibri',
          color: THEME.white,
          bold: true,
        })
        // 左栏
        if (slide.leftContent && slide.leftContent.length > 0) {
          const leftRows = slide.leftContent.slice(0, 6).map((b) => ({
            text: b.slice(0, 40),
            options: {
              fontSize: 18,
              fontFace: 'Calibri',
              color: THEME.text,
              bullet: { type: 'bullet' },
              paraSpaceAfter: 6,
            },
          }))
          pptSlide.addText(leftRows, {
            x: 0.5,
            y: 1.3,
            w: 4.3,
            h: 4.2,
            valign: 'top',
          })
        }
        // 右栏
        if (slide.rightContent && slide.rightContent.length > 0) {
          const rightRows = slide.rightContent.slice(0, 6).map((b) => ({
            text: b.slice(0, 40),
            options: {
              fontSize: 18,
              fontFace: 'Calibri',
              color: THEME.text,
              bullet: { type: 'bullet' },
              paraSpaceAfter: 6,
            },
          }))
          pptSlide.addText(rightRows, {
            x: 5.2,
            y: 1.3,
            w: 4.3,
            h: 4.2,
            valign: 'top',
          })
        }
        break
      }

      case 'image_text': {
        const pptSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' })
        // 标题栏
        pptSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10,
          h: 1.0,
          fill: { color: THEME.primary },
        })
        pptSlide.addText(slide.title, {
          x: 0.5,
          y: 0.15,
          w: 9.0,
          h: 0.7,
          fontSize: 28,
          fontFace: 'Calibri',
          color: THEME.white,
          bold: true,
        })
        // 图片占位区域
        pptSlide.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 1.3,
          w: 4.0,
          h: 3.5,
          fill: { color: THEME.lightBg },
          line: { color: THEME.accent, width: 1 },
        })
        pptSlide.addText('[图片占位]', {
          x: 0.5,
          y: 2.6,
          w: 4.0,
          h: 0.6,
          fontSize: 14,
          fontFace: 'Calibri',
          color: THEME.textLight,
          align: 'center',
        })
        // 右侧文本
        if (slide.bullets && slide.bullets.length > 0) {
          const bulletRows = slide.bullets.slice(0, 6).map((b) => ({
            text: b.slice(0, 40),
            options: {
              fontSize: 18,
              fontFace: 'Calibri',
              color: THEME.text,
              bullet: { type: 'bullet' },
              paraSpaceAfter: 6,
            },
          }))
          pptSlide.addText(bulletRows, {
            x: 5.0,
            y: 1.3,
            w: 4.5,
            h: 4.2,
            valign: 'top',
          })
        }
        break
      }

      case 'table': {
        const pptSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' })
        // 标题栏
        pptSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10,
          h: 1.0,
          fill: { color: THEME.primary },
        })
        pptSlide.addText(slide.title, {
          x: 0.5,
          y: 0.15,
          w: 9.0,
          h: 0.7,
          fontSize: 28,
          fontFace: 'Calibri',
          color: THEME.white,
          bold: true,
        })
        // 表格
        if (slide.table) {
          const { headers, rows } = slide.table
          const colCount = Math.min(headers.length, 6)
          const rowCount = Math.min(rows.length + 1, 11) // +1 for header, max 10 data rows

          const tableRows: Array<Array<{ text: string; options?: Record<string, unknown> }>> = []

          // 表头
          tableRows.push(
            headers.slice(0, 6).map((h) => ({
              text: h,
              options: {
                bold: true,
                fontSize: 14,
                fontFace: 'Calibri',
                color: THEME.white,
                fill: { color: THEME.primary },
                align: 'center',
                valign: 'middle',
              },
            }))
          )

          // 数据行
          for (let i = 0; i < Math.min(rows.length, 10); i++) {
            tableRows.push(
              headers.slice(0, 6).map((_, idx) => ({
                text: (rows[i] && rows[i][idx]) || '',
                options: {
                  fontSize: 12,
                  fontFace: 'Calibri',
                  color: THEME.text,
                  fill: { color: i % 2 === 0 ? THEME.white : THEME.lightBg },
                  align: 'center',
                  valign: 'middle',
                },
              }))
            )
          }

          pptSlide.addTable(tableRows, {
            x: 0.5,
            y: 1.3,
            w: 9.0,
            colW: Array(colCount).fill(9.0 / colCount),
            border: { type: 'solid', pt: 0.5, color: 'CCCCCC' },
            autoPage: false,
          })
        }
        break
      }

      case 'summary': {
        const pptSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' })
        // 标题栏
        pptSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10,
          h: 1.0,
          fill: { color: THEME.primary },
        })
        pptSlide.addText(slide.title, {
          x: 0.5,
          y: 0.15,
          w: 9.0,
          h: 0.7,
          fontSize: 28,
          fontFace: 'Calibri',
          color: THEME.white,
          bold: true,
        })
        // 总结要点
        if (slide.bullets && slide.bullets.length > 0) {
          const bulletRows = slide.bullets.slice(0, 6).map((b) => ({
            text: b.slice(0, 40),
            options: {
              fontSize: 20,
              fontFace: 'Calibri',
              color: THEME.text,
              bullet: { type: 'bullet' },
              paraSpaceAfter: 8,
            },
          }))
          pptSlide.addText(bulletRows, {
            x: 0.8,
            y: 1.3,
            w: 8.4,
            h: 4.2,
            valign: 'top',
          })
        }
        break
      }
    }
  }

  // 导出为 Buffer
  const result = await pptx.write({ outputType: 'nodebuffer' })
  return Buffer.from(result as ArrayBuffer)
}

/** create_pptx Agent 工具 */
export const createPptxTool: AgentTool<CreatePptxInput, CreatePptxOutput> = {
  name: 'create_pptx',
  description:
    '根据结构化规格生成 PPTX 演示文稿。支持封面、目录、标题+内容、双栏、图文、表格、总结等版式。文件默认保存到 .tiex/artifacts/ 目录。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '工作区内的相对路径，必须以 .pptx 结尾',
      },
      presentation: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '演示标题' },
          subtitle: { type: 'string', description: '副标题（可选）' },
          slides: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                layout: {
                  type: 'string',
                  enum: ['cover', 'agenda', 'title_content', 'two_column', 'image_text', 'table', 'summary'],
                  description: '幻灯片版式',
                },
                title: { type: 'string', description: '页面标题' },
                bullets: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '项目符号列表，每项最多 40 字符',
                },
                leftContent: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '左栏内容（适用 two_column 版式）',
                },
                rightContent: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '右栏内容（适用 two_column 版式）',
                },
                table: {
                  type: 'object',
                  properties: {
                    headers: { type: 'array', items: { type: 'string' } },
                    rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                  },
                  required: ['headers', 'rows'],
                },
              },
              required: ['layout', 'title'],
              additionalProperties: false,
            },
            maxItems: 20,
            description: '幻灯片列表，最多 20 页',
          },
        },
        required: ['title', 'slides'],
        additionalProperties: false,
      },
      overwrite: {
        type: 'boolean',
        description: '是否允许覆盖已有文件，默认 false',
      },
    },
    required: ['path', 'presentation'],
    additionalProperties: false,
  },
  minimumPermission: 'execute',
  riskLevel: 'medium',

  validate(input: unknown): CreatePptxInput {
    const result: CreatePptxInput = {
      path: String((input as any)?.path ?? ''),
      presentation: (input as any)?.presentation ?? { title: '', slides: [] },
    }
    if (typeof (input as any)?.overwrite === 'boolean') {
      result.overwrite = (input as any).overwrite
    }
    return result
  },

  async execute(context: ToolExecutionContext, input: CreatePptxInput): Promise<CreatePptxOutput> {
    // 校验后缀
    if (!input.path.endsWith('.pptx')) {
      throw new Error('文件路径必须以 .pptx 结尾')
    }

    // 校验文件名
    const fileName = input.path.split(/[\\/]/).pop() || ''
    const nameCheck = validateFileName(fileName)
    if (!nameCheck.valid) {
      throw new Error(`文件名校验失败: ${nameCheck.reason}`)
    }

    // 校验页数
    if (input.presentation.slides.length > 20) {
      throw new Error('幻灯片页数超过限制（最多 20 页）')
    }

    // 校验每页 bullet 数量和长度
    for (const slide of input.presentation.slides) {
      if (slide.bullets && slide.bullets.length > 6) {
        throw new Error(`页面 "${slide.title}" 的项目符号超过限制（最多 6 项）`)
      }
      if (slide.table) {
        if (slide.table.headers.length > 6) {
          throw new Error(`页面 "${slide.title}" 的表格列数超过限制（最多 6 列）`)
        }
        if (slide.table.rows.length > 10) {
          throw new Error(`页面 "${slide.title}" 的表格行数超过限制（最多 10 行）`)
        }
      }
    }

    // 确定实际写入路径
    let absolutePath: string
    let relativePath: string

    if (context.workspaceRoot) {
      const validation = pathGuard.validate(context.workspaceRoot, input.path)
      if (!validation.allowed) {
        throw new Error(`路径校验失败: ${validation.reason}`)
      }
      absolutePath = validation.resolvedPath!
      relativePath = input.path
    } else {
      const artifactDir = join(app.getPath('userData'), 'artifacts')
      absolutePath = join(artifactDir, input.path)
      relativePath = input.path
    }

    const fileExists = existsSync(absolutePath)

    // 文件已存在但未设置 overwrite
    if (fileExists && !input.overwrite) {
      throw new Error(`文件已存在: ${input.path}。如需覆盖，请设置 overwrite=true`)
    }

    // 生成 PPTX 文件
    const buffer = await buildPptxPresentation(input.presentation)

    // 原子写入
    atomicWriteBuffer(absolutePath, buffer)

    // 计算哈希和大小
    const afterHash = computeContentHash(buffer.toString('base64'))
    const afterSize = buffer.length

    // 记录生成物
      const artifact = artifactService.recordArtifact({
        task_id: context.taskId,
        tool_call_id: context.toolCallId ?? null,
        workspace_id: context.workspaceId ?? null,
        artifact_type: 'pptx',
        name: input.presentation.title || fileName,
        relative_path: relativePath,
      absolute_path: absolutePath,
      mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size_bytes: afterSize,
      file_hash: afterHash,
    })

    return {
      path: relativePath,
      sizeBytes: afterSize,
      created: !fileExists,
      artifactId: artifact.id,
      slideCount: input.presentation.slides.length,
    }
  },
}
