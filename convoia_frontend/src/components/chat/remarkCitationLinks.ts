/**
 * remark-citation-links
 *
 * Walks the markdown AST, finds `[N]` in text nodes, and replaces each
 * with a link node pointing to `#citation-<prefix>-N` (or `#citation-N` when
 * no prefix is given). The prefix is the message id — without it, every
 * message's pills share ids `citation-1..N`, so a `[N]` click in a later
 * answer resolves (via getElementById) to the FIRST match in the DOM, i.e. an
 * OLDER search block. Namespacing by message id keeps anchors unique per turn.
 * The MessageBubble's custom `a` renderer detects these internal anchors and
 * turns clicks into a scroll-to-pill + flash highlight instead of navigation.
 *
 * Skips code / inlineCode / existing link nodes so literal `[1]` inside
 * a code block stays literal.
 *
 * Kept as a tiny hand-rolled plugin so we don't pull in
 * `unist-util-visit` — one dep less, same behavior.
 */

type MdNode = {
  type: string
  value?: string
  url?: string
  title?: string | null
  children?: MdNode[]
  position?: unknown
}

const CITATION_RE = /\[(\d{1,2})\]/g

function walk(node: MdNode, prefix?: string): MdNode {
  if (!node || typeof node !== 'object') return node
  // Skip any code-ish or link-ish container — don't rewrite `[1]` inside those.
  if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'link' || node.type === 'linkReference') {
    return node
  }
  if (!Array.isArray(node.children) || node.children.length === 0) return node

  const nextChildren: MdNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && CITATION_RE.test(child.value)) {
      CITATION_RE.lastIndex = 0 // reset between test() and split below
      const raw = child.value
      let last = 0
      let m: RegExpExecArray | null
      CITATION_RE.lastIndex = 0
      while ((m = CITATION_RE.exec(raw)) !== null) {
        if (m.index > last) {
          nextChildren.push({ type: 'text', value: raw.slice(last, m.index) })
        }
        const n = m[1]
        nextChildren.push({
          type: 'link',
          url: prefix ? `#citation-${prefix}-${n}` : `#citation-${n}`,
          title: null,
          children: [{ type: 'text', value: `[${n}]` }],
        })
        last = m.index + m[0].length
      }
      if (last < raw.length) {
        nextChildren.push({ type: 'text', value: raw.slice(last) })
      }
    } else {
      nextChildren.push(walk(child, prefix))
    }
  }
  node.children = nextChildren
  return node
}

export default function remarkCitationLinks(options?: { prefix?: string }) {
  const prefix = options?.prefix
  return (tree: MdNode) => {
    walk(tree, prefix)
  }
}
