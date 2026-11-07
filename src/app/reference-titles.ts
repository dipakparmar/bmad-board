import { docOutline } from '@/domain/docs';
import { parseFrontmatter } from '@/store/frontmatter';
import type { Ticket } from './view-model';

export function documentTitle(text: string, anchor?: string): string | undefined {
  const { data, body } = parseFrontmatter(text);
  if (anchor) {
    const section = docOutline(body).find((h) => h.slug === anchor);
    if (section) return section.text;
  }
  if (typeof data.title === 'string' && data.title.trim()) return data.title.trim();
  const withoutCode = body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
  return /^#\s+(.+?)\s*#*\s*$/m.exec(withoutCode)?.[1]?.replace(/[`*_]/g, '').trim();
}
/** Avoid linking a bare ref to another project, or choosing arbitrarily between initiatives. */
export function referencedTicket(ref: string, context: Ticket, tickets: Ticket[]): Ticket | undefined {
  const matches = tickets.filter((t) => t.workspaceId === context.workspaceId && t.ref === ref);
  const same = matches.filter((t) => t.initiative?.slug === context.initiative?.slug);
  return same.length === 1 ? same[0] : matches.length === 1 ? matches[0] : undefined;
}
