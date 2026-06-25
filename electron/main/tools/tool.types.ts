/**
 * 只读工具类型定义
 */

/** list_files 工具输入 */
export interface ListFilesInput {
  path: string // 工作区内的相对路径，默认为 ''
  includeHidden?: boolean // 是否包含隐藏文件，默认 false
  maxDepth?: number // 递归深度，0 表示仅当前目录，默认 1
}

/** 文件条目 */
export interface FileEntry {
  name: string
  path: string // 相对路径
  type: 'file' | 'directory'
  size: number // 文件大小，目录为 0
  extension: string // 文件扩展名
  modifiedAt: string // 最后修改时间
}

/** list_files 工具返回 */
export interface ListFilesResult {
  entries: FileEntry[]
  total: number
}

/** read_file 工具输入 */
export interface ReadFileInput {
  path: string // 工作区内的相对路径
  startOffset?: number // 起始偏移量（字节），默认 0
  maxLength?: number // 最大读取长度（字节），默认 65536（64KB）
}

/** read_file 工具返回 */
export interface ReadFileResult {
  content: string
  totalSize: number
  startOffset: number
  endOffset: number
  isTruncated: boolean
}

/** search_files 工具输入 */
export interface SearchFilesInput {
  pattern: string // 搜索关键词或正则
  path?: string // 搜索起始路径，默认工作区根目录
  filePattern?: string // 文件匹配模式，如 '*.ts'、'*.json'
  maxResults?: number // 最大返回结果数，默认 50
  searchContent?: boolean // 是否搜索文件内容，默认 false
}

/** 搜索匹配详情 */
export interface SearchMatch {
  line: number
  column: number
  content: string // 匹配行内容（最多 200 字符）
}

/** 搜索结果条目 */
export interface SearchResult {
  path: string // 相对路径
  fileName: string
  matches?: SearchMatch[] // 内容匹配详情（仅 searchContent=true 时）
}

/** search_files 工具返回 */
export interface SearchFilesResult {
  results: SearchResult[]
  total: number
  truncated: boolean
}

/** 默认忽略的目录 */
export const DEFAULT_IGNORED_DIRS = ['node_modules', '.git']

/** list_files 最大条目数 */
export const MAX_LIST_ENTRIES = 1000

/** list_files 最大深度 */
export const MAX_LIST_DEPTH = 3

/** read_file 单次最大读取 1MB */
export const MAX_READ_SIZE = 1024 * 1024

/** read_file 默认分段 64KB */
export const DEFAULT_CHUNK_SIZE = 64 * 1024

/** search_files 默认最大结果数 */
export const DEFAULT_MAX_SEARCH_RESULTS = 50

/** search_files 最大结果数上限 */
export const MAX_SEARCH_RESULTS_LIMIT = 200

/** 每个文件最多返回的匹配行数 */
export const MAX_MATCHES_PER_FILE = 10

/** 匹配行内容最大长度 */
export const MAX_MATCH_LINE_LENGTH = 200
