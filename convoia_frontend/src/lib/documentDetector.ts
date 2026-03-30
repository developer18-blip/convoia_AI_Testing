/**
 * Detects if an AI response is "document-worthy" — long, structured content
 * that would benefit from being downloaded as a PDF or DOCX.
 */

export function isDocumentWorthy(content: string): { worthy: boolean; title: string } {
  if (!content || content.length < 800) return { worthy: false, title: '' }

  let structureScore = 0

  // Has markdown headings
  if (/^#{1,3}\s+.+/m.test(content)) structureScore++
  // Has 3+ paragraphs
  if ((content.match(/\n\n/g) || []).length >= 3) structureScore++
  // Has lists
  if (/^[\s]*[-*]\s+.+/m.test(content) || /^\d+\.\s+.+/m.test(content)) structureScore++
  // Has table
  if (/\|.*\|.*\|/m.test(content)) structureScore++
  // Has code blocks
  if (/```[\s\S]*?```/.test(content)) structureScore++
  // Has bold/emphasis (structured writing)
  if (/\*\*.+?\*\*/m.test(content)) structureScore++

  const worthy = structureScore >= 2

  // Extract title
  let title = 'Document'
  const h1 = content.match(/^#\s+(.+)/m)
  const h2 = content.match(/^##\s+(.+)/m)
  const bold = content.match(/^\*\*(.+?)\*\*/m)

  if (h1) title = h1[1]
  else if (h2) title = h2[1]
  else if (bold) title = bold[1]
  else title = content.split('\n')[0].slice(0, 50)

  // Clean title for filename
  title = title.replace(/[#*`]/g, '').trim().slice(0, 60)

  return { worthy, title }
}
