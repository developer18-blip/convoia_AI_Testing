/**
 * Content-export adapter — single source of truth for transforming
 * theme-rendered chat DOM (which uses CSS custom properties like
 * var(--chat-text) for color) into portable, self-contained HTML
 * with hardcoded hex colors that survive any destination — Notion,
 * Word, Gmail, PDF, plain Notepad, future share/email surfaces.
 *
 * The on-screen renderer (MessageBubble) is intentionally NOT changed;
 * it relies on theme variables so it adapts to dark/light mode. This
 * adapter is the boundary where we drop the theme dependency for export.
 */

// Portable, print-safe hex palette. Hardcoded on purpose — any reference
// to var(...) here would re-introduce theme dependence and undo the fix.
const COLORS = {
  bodyText: '#1a1a1a',
  heading: '#000000',
  muted: '#4a4a4a',
  link: '#2563eb',
  inlineCodeText: '#c7254e',
  inlineCodeBg: '#f9f2f4',
  codeBlockText: '#1a1a1a',
  codeBlockBg: '#f5f5f5',
  blockquoteText: '#4a4a4a',
  blockquoteBorder: '#cccccc',
  tableBorder: '#dddddd',
  tableHeaderBg: '#f0f0f0',
}

const MONO_FAMILY = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
const SANS_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

function setStyle(el: HTMLElement, decls: Record<string, string>): void {
  // 'important' priority: existing inline `var(--chat-text)` from React JSX
  // is already inline-priority, so we need !important to win the cascade.
  for (const [prop, value] of Object.entries(decls)) {
    el.style.setProperty(prop, value, 'important')
  }
}

/**
 * Walk every descendant element of `root` and replace any theme-dependent
 * inline styles with portable hex equivalents. Mutates in place — caller
 * is expected to pass a clone if the original DOM must be preserved.
 */
function applyExportStyles(root: Element): void {
  // Strip data-theme on the root + descendants so destinations can't
  // accidentally re-apply theme rules from a stylesheet that follows.
  root.removeAttribute('data-theme')
  ;(root as HTMLElement).style?.removeProperty('background-color')

  const all = root.querySelectorAll<HTMLElement>('*')
  for (const el of Array.from(all)) {
    el.removeAttribute('data-theme')

    const tag = el.tagName.toLowerCase()

    // Block + inline body text — anything that holds prose
    if (['p', 'span', 'li', 'div', 'section', 'article'].includes(tag)) {
      setStyle(el, { color: COLORS.bodyText, 'background-color': 'transparent' })
    }

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      setStyle(el, {
        color: COLORS.heading,
        'font-weight': '700',
        'background-color': 'transparent',
      })
    }

    if (tag === 'a') {
      setStyle(el, { color: COLORS.link, 'text-decoration': 'underline' })
    }

    if (tag === 'strong' || tag === 'b') {
      setStyle(el, { color: COLORS.heading, 'font-weight': '700' })
    }
    if (tag === 'em' || tag === 'i') {
      setStyle(el, { color: COLORS.bodyText, 'font-style': 'italic' })
    }

    if (tag === 'blockquote') {
      setStyle(el, {
        color: COLORS.blockquoteText,
        'border-left': `3px solid ${COLORS.blockquoteBorder}`,
        'padding-left': '1em',
        margin: '0.5em 0',
        'background-color': 'transparent',
        'font-style': 'italic',
      })
    }

    if (tag === 'pre') {
      setStyle(el, {
        color: COLORS.codeBlockText,
        'background-color': COLORS.codeBlockBg,
        'font-family': MONO_FAMILY,
        padding: '12px 16px',
        'border-radius': '6px',
        'border': `1px solid ${COLORS.tableBorder}`,
        overflow: 'auto',
        'white-space': 'pre',
      })
    }

    if (tag === 'code') {
      // <code> inside <pre> is a code block (background already on the pre);
      // standalone <code> is inline code (gets the inline-code pill style).
      const inPre = el.parentElement?.tagName.toLowerCase() === 'pre'
      if (inPre) {
        setStyle(el, {
          color: COLORS.codeBlockText,
          'background-color': 'transparent',
          'font-family': MONO_FAMILY,
        })
      } else {
        setStyle(el, {
          color: COLORS.inlineCodeText,
          'background-color': COLORS.inlineCodeBg,
          'font-family': MONO_FAMILY,
          padding: '1px 6px',
          'border-radius': '4px',
          'font-size': '0.9em',
        })
      }
    }

    if (tag === 'table') {
      setStyle(el, {
        'border-collapse': 'collapse',
        'border-spacing': '0',
        width: '100%',
        margin: '0.5em 0',
      })
    }
    if (tag === 'th') {
      setStyle(el, {
        color: COLORS.heading,
        'background-color': COLORS.tableHeaderBg,
        'font-weight': '700',
        padding: '8px 12px',
        border: `1px solid ${COLORS.tableBorder}`,
        'text-align': 'left',
      })
    }
    if (tag === 'td') {
      setStyle(el, {
        color: COLORS.bodyText,
        'background-color': 'transparent',
        padding: '8px 12px',
        border: `1px solid ${COLORS.tableBorder}`,
      })
    }

    if (tag === 'hr') {
      setStyle(el, {
        border: 'none',
        'border-top': `1px solid ${COLORS.blockquoteBorder}`,
        margin: '1em 0',
      })
    }

    if (tag === 'img') {
      setStyle(el, { 'max-width': '100%', height: 'auto' })
    }

    if (tag === 'ul' || tag === 'ol') {
      setStyle(el, { color: COLORS.bodyText, 'padding-left': '1.5em' })
    }
  }
}

/**
 * Recursive plain-text walker — produces flat markdown-flavoured text:
 *   `# Heading`, `- list item`, ``` code ```, `> quote`, `**bold**`, `*italic*`,
 *   `[label](url)`. Preserves block separation with blank lines.
 */
function walkPlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replace(/\s+/g, ' ')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const children = Array.from(el.childNodes)
  const inner = children.map(walkPlainText).join('')

  switch (tag) {
    case 'h1': return `\n\n# ${inner.trim()}\n\n`
    case 'h2': return `\n\n## ${inner.trim()}\n\n`
    case 'h3': return `\n\n### ${inner.trim()}\n\n`
    case 'h4': return `\n\n#### ${inner.trim()}\n\n`
    case 'h5': return `\n\n##### ${inner.trim()}\n\n`
    case 'h6': return `\n\n###### ${inner.trim()}\n\n`
    case 'p':  return `${inner.trim()}\n\n`
    case 'br': return '\n'
    case 'hr': return '\n---\n\n'
    case 'ul':
    case 'ol': return `${inner}\n`
    case 'li': {
      const parent = el.parentElement?.tagName.toLowerCase()
      const idx = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) + 1 : 1
      const marker = parent === 'ol' ? `${idx}. ` : '- '
      return `${marker}${inner.trim()}\n`
    }
    case 'pre': {
      const lang = el.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] || ''
      return `\n\`\`\`${lang}\n${inner.replace(/\n+$/, '')}\n\`\`\`\n\n`
    }
    case 'code': {
      const inPre = el.parentElement?.tagName.toLowerCase() === 'pre'
      return inPre ? inner : `\`${inner}\``
    }
    case 'blockquote':
      return inner.split('\n').map(l => l ? `> ${l}` : '>').join('\n').replace(/(>\s*)+$/, '') + '\n\n'
    case 'strong':
    case 'b': return `**${inner}**`
    case 'em':
    case 'i': return `*${inner}*`
    case 'a': {
      const href = el.getAttribute('href')
      return href ? `[${inner}](${href})` : inner
    }
    case 'table': return `\n${inner}\n`
    case 'tr':    return inner.replace(/\s*\|\s*$/, '').trimEnd() + '\n'
    case 'th':
    case 'td':    return `${inner.trim()} | `
    default:      return inner
  }
}

/**
 * Takes raw HTML content (as a string) and returns a sanitized,
 * portable HTML string with inline hex colors. Safe for any destination
 * (clipboard target, PDF renderer, email body) regardless of source theme.
 */
export function prepareHtmlForExport(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body><div data-export-root>${html}</div></body></html>`,
    'text/html',
  )
  const root = doc.body.firstElementChild as HTMLElement | null
  if (!root) return html
  applyExportStyles(root)
  return root.innerHTML
}

/**
 * Convenience: clone a live DOM element, sanitize the clone, return its
 * inner HTML. The original element is left untouched.
 */
export function elementToExportableHtml(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement
  applyExportStyles(clone)
  // Wrap in a body-text container so destinations get a single, styled
  // root element without inheriting whatever class the source had.
  return `<div style="color: ${COLORS.bodyText}; font-family: ${SANS_FAMILY}; line-height: 1.6;">${clone.innerHTML}</div>`
}

/**
 * Convenience: extract plain-text fallback from a live DOM element,
 * preserving structural hints (#, ##, -, blockquotes, etc.).
 */
export function elementToExportablePlainText(el: HTMLElement): string {
  return walkPlainText(el)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Combined: returns { html, text } — call this when writing to the
 * clipboard with both formats so modern targets (Notion, Word, Slack)
 * paste rich HTML and plain targets (Notepad) get readable text.
 */
export function elementToClipboardPayload(el: HTMLElement): { html: string; text: string } {
  return {
    html: elementToExportableHtml(el),
    text: elementToExportablePlainText(el),
  }
}

/**
 * Write both HTML and plain-text payloads to the clipboard in a single
 * ClipboardItem so the paste destination can pick its preferred format.
 * Falls back to plain-text writeText, then to a hidden-textarea +
 * execCommand('copy') for Capacitor WebView / non-secure contexts.
 */
export async function copyHtmlAndText(html: string, text: string): Promise<boolean> {
  // Modern dual-format path.
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof ClipboardItem !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  ) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      return true
    } catch {
      /* fall through to text-only */
    }
  }

  // Fallback 1: text-only writeText (loses formatting but readable).
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof window !== 'undefined' && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fall through */
    }
  }

  // Fallback 2: legacy execCommand path for Capacitor / non-HTTPS dev.
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Re-export the style applier for export targets that already clone
// into a wrapper (e.g. PDF generator) and want to sanitize in place
// without going through the string-roundtrip in prepareHtmlForExport.
export { applyExportStyles as applyExportStylesToElement }
