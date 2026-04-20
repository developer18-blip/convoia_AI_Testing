/**
 * Clipboard helpers shared by MessageBubble (AI/user replies) and
 * CodeBlock (fenced code blocks).
 *
 * Why a helper: `navigator.clipboard.writeText` requires a secure
 * context (HTTPS or localhost) AND permissions on some browsers.
 * The execCommand('copy') fallback covers Capacitor WebView,
 * http://192.168.x.x during dev, and older Android Chrome.
 *
 * The helper does NOT install a global `onCopy` listener —
 * native Ctrl+C / Cmd+C / long-press-copy of highlighted text is
 * never intercepted.
 */

/** Copy `text` to the clipboard exactly as given. Returns true on success. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fall through to execCommand */
    }
  }

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

/**
 * Strip HTML tags + named/numeric entities to plain text. Used as a
 * last-resort cleanup for markdown strings that happen to contain raw
 * HTML (some models occasionally emit `<br/>` or `&amp;`). For
 * rendered message content, prefer `ref.current?.innerText`
 * instead — it matches exactly what the user sees on screen.
 */
export function stripHtmlAndEntities(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => {
      const n = Number(d)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
