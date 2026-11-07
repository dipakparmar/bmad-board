import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBoardContext } from '@/app/board-context';
import { resolveDoc } from '@/app/use-docs';
import { documentTitle } from '@/app/reference-titles';
import { docTitleFromPath, type DocLink, type TicketType } from '@/domain';
import type { Ticket } from '@/app/view-model';
import { TicketTypeIcon } from './ticket-type-icon';

export const referenceChipClass = 'inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 align-middle text-xs font-normal text-foreground no-underline hover:bg-accent';
export function ReferenceChipLabel({ title, ref, type }: { title: string; ref?: string; type?: TicketType }) {
  return <>{type ? <TicketTypeIcon type={type} className="size-3" /> : <FileText aria-hidden="true" className="size-3 shrink-0 text-info" />}{ref && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{ref}</span>}<span className="max-w-80 truncate" title={title}>{title}</span></>;
}
export function TicketReferenceChip({ ticket }: { ticket: Ticket }) {
  const { select } = useBoardContext();
  const title = `${ticket.ref}: ${ticket.leaf.title}`;
  return <button type="button" className={referenceChipClass} title={title} aria-label={`Open ${title}`} onClick={(e) => { e.stopPropagation(); select(ticket.uid); }}><ReferenceChipLabel title={ticket.leaf.title} ref={ticket.ref} type={ticket.leaf.type} /></button>;
}

const titleCache = new WeakMap<object, Map<string, Promise<string | undefined>>>();
export function DocumentReferenceLabel({ workspaceId, link }: { workspaceId?: string; link: DocLink }) {
  const { board } = useBoardContext();
  const ws = board.workspaces.find((w) => w.store.id === workspaceId);
  const key = `${link.candidates.join('|')}#${link.anchor ?? ''}`;
  const [loaded, setLoaded] = useState<{ key: string; title?: string }>();
  useEffect(() => {
    if (!ws) return;
    let live = true;
    const cacheKey = ws.tree ?? ws.store;
    let cache = titleCache.get(cacheKey);
    if (!cache) { cache = new Map(); titleCache.set(cacheKey, cache); }
    let pending = cache.get(key);
    if (!pending) {
      pending = resolveDoc(ws.store.source, link).then((doc) => doc ? documentTitle(doc.text, link.anchor) : undefined).catch(() => undefined);
      cache.set(key, pending);
    }
    void pending.then((title) => { if (live) setLoaded({ key, title }); });
    return () => { live = false; };
  }, [ws, key]);
  const title = (link.anchor ? link.title : undefined) ?? (loaded?.key === key ? loaded.title : undefined) ?? link.title ?? docTitleFromPath(link.candidates[0] ?? 'Document');
  return <ReferenceChipLabel title={title} />;
}
