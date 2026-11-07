/** Compact plain text for cards. Full Markdown remains in the ticket detail. */
export function textPreview(markdown: string, limit = 280): string {
  const text = markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}\s+|[-*>]\s+|\d+[.)]\s+|[-*]\s+\[[ xX]\]\s*)/gm, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  const head = text.slice(0, Math.max(0, limit - 1));
  const boundary = head.lastIndexOf(' ');
  return `${boundary > head.length * 0.7 ? head.slice(0, boundary) : head}…`;
}
