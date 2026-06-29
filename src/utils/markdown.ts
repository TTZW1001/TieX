import MarkdownIt from 'markdown-it'
import { createHighlighter, type Highlighter } from 'shiki'

type ThemeMode = 'light' | 'dark'

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

const highlighterPromise: Promise<Highlighter> = createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: [
    'text',
    'plaintext',
    'txt',
    'md',
    'markdown',
    'json',
    'yaml',
    'yml',
    'toml',
    'html',
    'css',
    'js',
    'jsx',
    'ts',
    'tsx',
    'vue',
    'bash',
    'shell',
    'powershell',
    'sql',
    'python',
    'diff',
    'xml',
  ],
}).catch((error) => {
  console.error('Failed to initialize markdown highlighter:', error)
  throw error
})

function normalizeLanguage(language: string | null | undefined): string {
  const normalized = (language ?? '').trim().toLowerCase()
  if (!normalized) return 'text'
  if (normalized === 'sh') return 'bash'
  if (normalized === 'ps1') return 'powershell'
  if (normalized === 'py') return 'python'
  if (normalized === 'md') return 'markdown'
  return normalized
}

async function highlightCodeBlocks(renderedHtml: string, theme: ThemeMode): Promise<string> {
  if (typeof document === 'undefined' || !renderedHtml.includes('<pre><code')) {
    return renderedHtml
  }

  let highlighter: Highlighter
  try {
    highlighter = await highlighterPromise
  } catch {
    return renderedHtml
  }

  const container = document.createElement('div')
  container.innerHTML = renderedHtml

  const codeBlocks = container.querySelectorAll('pre > code')
  for (const codeBlock of codeBlocks) {
    const pre = codeBlock.parentElement
    if (!pre) continue

    const languageClass = Array.from(codeBlock.classList).find((item) => item.startsWith('language-'))
    const language = normalizeLanguage(languageClass?.slice('language-'.length))
    const code = codeBlock.textContent ?? ''

    let highlighted = ''
    try {
      highlighted = highlighter.codeToHtml(code, {
        lang: language,
        theme: theme === 'dark' ? 'github-dark' : 'github-light',
      })
    } catch {
      highlighted = highlighter.codeToHtml(code, {
        lang: 'text',
        theme: theme === 'dark' ? 'github-dark' : 'github-light',
      })
    }

    const replacement = document.createElement('div')
    replacement.innerHTML = highlighted
    const shikiNode = replacement.firstElementChild
    if (!shikiNode) continue
    pre.replaceWith(shikiNode)
  }

  return container.innerHTML
}

export async function renderMarkdown(content: string, theme: ThemeMode): Promise<string> {
  const rendered = markdown.render(content ?? '')
  return highlightCodeBlocks(rendered, theme)
}
