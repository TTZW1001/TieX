/**
 * create_docx Agent 工具 - 在工作区内生成 DOCX 文档
 */
import type { AgentTool, ToolExecutionContext } from './agent-tool.types'
import { pathGuard } from '../security/path-guard'
import { computeContentHash } from '../services/backup.service'
import { artifactService } from '../services/artifact.service'
import { existsSync, statSync, writeFileSync, renameSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
} from 'docx'

/** create_docx 输入 */
export interface CreateDocxInput {
  path: string
  document: DocumentSpec
  overwrite?: boolean
}

/** DocumentSpec 结构化规格 */
export interface DocumentSpec {
  title: string
  subtitle?: string
  sections: Array<{
    heading?: string
    level?: 1 | 2 | 3
    paragraphs?: string[]
    bullets?: string[]
    table?: {
      headers: string[]
      rows: string[][]
    }
  }>
}

/** create_docx 输出 */
export interface CreateDocxOutput {
  path: string
  sizeBytes: number
  created: boolean
  artifactId: string
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

/**
 * 构建 DOCX 文档
 */
async function buildDocxDocument(spec: DocumentSpec): Promise<Buffer> {
  const children: (Paragraph | Table)[] = []

  // 文档标题
  children.push(
    new Paragraph({
      text: spec.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  )

  // 副标题
  if (spec.subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: spec.subtitle,
            size: 28,
            color: '666666',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    )
  }

  // 各章节
  for (const section of spec.sections) {
    // 章节标题
    if (section.heading) {
      const level = section.level ?? 1
      const headingLevel =
        level === 1
          ? HeadingLevel.HEADING_1
          : level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3

      children.push(
        new Paragraph({
          text: section.heading,
          heading: headingLevel,
          spacing: { before: 240, after: 120 },
        })
      )
    }

    // 正文段落
    if (section.paragraphs) {
      for (const para of section.paragraphs) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: para,
                size: 22, // 11pt
                font: 'Calibri',
              }),
            ],
            spacing: { after: 120 },
          })
        )
      }
    }

    // 无序列表
    if (section.bullets) {
      for (const bullet of section.bullets) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: bullet,
                size: 22,
                font: 'Calibri',
              }),
            ],
            bullet: {
              level: 0,
            },
            spacing: { after: 60 },
          })
        )
      }
    }

    // 表格
    if (section.table) {
      const { headers, rows } = section.table

      const tableRows: TableRow[] = []

      // 表头行
      tableRows.push(
        new TableRow({
          children: headers.map(
            (header) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: header,
                        bold: true,
                        size: 22,
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
                width: {
                  size: Math.floor(9000 / headers.length),
                  type: WidthType.DXA,
                },
              })
          ),
        })
      )

      // 数据行
      for (const row of rows) {
        tableRows.push(
          new TableRow({
            children: headers.map(
              (_, idx) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: row[idx] || '',
                          size: 22,
                          font: 'Calibri',
                        }),
                      ],
                    }),
                  ],
                  width: {
                    size: Math.floor(9000 / headers.length),
                    type: WidthType.DXA,
                  },
                })
            ),
          })
        )
      }

      children.push(
        new Table({
          rows: tableRows,
          width: {
            size: 9000,
            type: WidthType.DXA,
          },
        })
      )
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch = 1440 twips
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: spec.title,
                    size: 18,
                    color: '999999',
                    font: 'Calibri',
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    font: 'Calibri',
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}

/** create_docx Agent 工具 */
export const createDocxTool: AgentTool<CreateDocxInput, CreateDocxOutput> = {
  name: 'create_docx',
  description:
    '根据结构化规格生成 DOCX 文档。支持标题层级、段落、列表和表格。文件默认保存到 .tiex/artifacts/ 目录。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '工作区内的相对路径，必须以 .docx 结尾',
      },
      document: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '文档标题' },
          subtitle: { type: 'string', description: '副标题（可选）' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string', description: '章节标题（可选）' },
                level: { type: 'integer', enum: [1, 2, 3], description: '标题层级，默认 1' },
                paragraphs: { type: 'array', items: { type: 'string' }, description: '正文段落列表' },
                bullets: { type: 'array', items: { type: 'string' }, description: '无序列表项' },
                table: {
                  type: 'object',
                  properties: {
                    headers: { type: 'array', items: { type: 'string' } },
                    rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                  },
                  required: ['headers', 'rows'],
                },
              },
              additionalProperties: false,
            },
            maxItems: 50,
            description: '文档章节列表，最多 50 个',
          },
        },
        required: ['title', 'sections'],
        additionalProperties: false,
      },
      overwrite: {
        type: 'boolean',
        description: '是否允许覆盖已有文件，默认 false',
      },
    },
    required: ['path', 'document'],
    additionalProperties: false,
  },
  minimumPermission: 'execute',
  riskLevel: 'medium',

  validate(input: unknown): CreateDocxInput {
    const result: CreateDocxInput = {
      path: String((input as any)?.path ?? ''),
      document: (input as any)?.document ?? { title: '', sections: [] },
    }
    if (typeof (input as any)?.overwrite === 'boolean') {
      result.overwrite = (input as any).overwrite
    }
    return result
  },

  async execute(context: ToolExecutionContext, input: CreateDocxInput): Promise<CreateDocxOutput> {
    // 校验后缀
    if (!input.path.endsWith('.docx')) {
      throw new Error('文件路径必须以 .docx 结尾')
    }

    // 校验文件名
    const fileName = input.path.split(/[\\/]/).pop() || ''
    const nameCheck = validateFileName(fileName)
    if (!nameCheck.valid) {
      throw new Error(`文件名校验失败: ${nameCheck.reason}`)
    }

    // 校验 sections 数量
    if (input.document.sections.length > 50) {
      throw new Error('章节数量超过限制（最多 50 个）')
    }

    // 校验每个 section 的段落/列表项数量
    for (const section of input.document.sections) {
      const paraCount = (section.paragraphs?.length ?? 0) + (section.bullets?.length ?? 0)
      if (paraCount > 20) {
        throw new Error(`章节 "${section.heading || '未命名'}" 的段落/列表项数量超过限制（最多 20 个）`)
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

    // 生成 DOCX 文件
    const buffer = await buildDocxDocument(input.document)

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
        artifact_type: 'docx',
        name: input.document.title || fileName,
        relative_path: relativePath,
      absolute_path: absolutePath,
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size_bytes: afterSize,
      file_hash: afterHash,
    })

    return {
      path: relativePath,
      sizeBytes: afterSize,
      created: !fileExists,
      artifactId: artifact.id,
    }
  },
}
