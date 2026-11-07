/**
 * Docs: the project's planning and implementation documents (PRD, architecture, UX, epics, sprint
 * status, retros) in a reader. Links between docs open here too, and tickets link in through
 * "Linked docs", with a way back to the ticket.
 */
import { ArrowLeft, BookOpen, ClipboardCopy, FileCode2, FileText, Folder, ListTree, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useBoardContext, type Scope } from '@/app/board-context';
import { Breadcrumbs, useScopeCrumbs } from '../layout/breadcrumbs';
import { resolveDoc, useDocLibrary, type DocEntry, type ResolvedDoc } from '@/app/use-docs';
import { DOC_KIND_LABELS, docKind, docOutline, docTitleFromPath, headingSlug, normalisePath, type DocKind, type DocLink } from '@/domain';
import { parseFrontmatter } from '@/store/frontmatter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { Markdown } from '../task/markdown';

const KIND_TONE: Partial<Record<DocKind, string>> = {
  prd: 'bg-info/10 text-info', architecture: 'bg-warning/10 text-warning', ux: 'bg-success/10 text-success',
  epics: 'bg-primary/8 text-foreground', sprint: 'bg-primary/8 text-foreground', retro: 'bg-muted text-muted-foreground',
};

export function KindBadge({ kind, className }: { kind: DocKind; className?: string }) {
  return <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', KIND_TONE[kind] ?? 'bg-muted text-muted-foreground', className)}>{DOC_KIND_LABELS[kind]}</span>;
}

function DocList({ docs, current, onOpen }: { docs: DocEntry[]; current?: string; onOpen: (path: string) => void }) {
  const [q, setQ] = useState('');
  const [ticketFiles, setTicketFiles] = useState(false);
  const shown = docs.filter((d) => (ticketFiles || !d.ticketFile) && (!q || `${d.path} ${DOC_KIND_LABELS[d.kind]}`.toLowerCase().includes(q.toLowerCase())));
  const groups = [...new Set(shown.map((d) => d.group))];
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input size="sm" className="pl-7" placeholder="Find a document" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <label className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"><input type="checkbox" checked={ticketFiles} onChange={(e) => setTicketFiles(e.target.checked)} />Include ticket files and plans</label>
      <nav className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {groups.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No documents match.</p>}
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-medium text-muted-foreground"><Folder className="size-3" /><span className="truncate">{g}</span></div>
            {shown.filter((d) => d.group === g).map((d) => (
              <button key={d.path} type="button" title={d.path} onClick={() => onOpen(d.path)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent', current === d.path && 'bg-accent font-medium')}>
                {/\.ya?ml$/i.test(d.path) ? <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" /> : <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                {d.kind !== 'doc' && <KindBadge kind={d.kind} />}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

const show = (v: unknown): string => (Array.isArray(v) ? v.map(show).join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));

/** The initiative and epic a document sits in, by folder, for its breadcrumbs. */
function containerScope(ws: { store: { id: string }; tree?: { initiatives: { slug: string; path: string; epics: { slug: string; path: string }[] }[] } | null }, path: string): Scope {
  const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/') + 1);
  for (const i of ws.tree?.initiatives ?? []) {
    if (!dirOf(i.path) || !path.startsWith(dirOf(i.path))) continue;
    const e = i.epics.find((x) => dirOf(x.path) !== dirOf(i.path) && path.startsWith(dirOf(x.path)));
    return { workspaceId: ws.store.id, initiative: i.slug, epic: e?.slug };
  }
  return { workspaceId: ws.store.id };
}

export function DocReader({ workspaceId, link }: { workspaceId: string; link: DocLink }) {
  const { board, openDoc, doc, closeDoc, tickets, setDoc, setView } = useBoardContext();
  const scopeCrumbs = useScopeCrumbs();
  const ws = board.workspaces.find((w) => w.store.id === workspaceId);
  const [state, setState] = useState<{ doc: ResolvedDoc | null; loading: boolean }>({ doc: null, loading: true });
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ws) return;
    let live = true;
    setState({ doc: null, loading: true });
    void resolveDoc(ws.store.source, link).then((d) => live && setState({ doc: d, loading: false }));
    return () => { live = false; };
  }, [ws, link]);

  const parsed = useMemo(() => {
    if (!state.doc) return null;
    if (/\.ya?ml$/i.test(state.doc.path)) return { data: {} as Record<string, unknown>, body: `\`\`\`yaml\n${state.doc.text}\n\`\`\``, yaml: true };
    const { data, body } = parseFrontmatter(state.doc.text);
    return { data: data as Record<string, unknown>, body, yaml: false };
  }, [state.doc]);
  const outline = useMemo(() => (parsed && !parsed.yaml ? docOutline(parsed.body) : []), [parsed]);

  // Land on the linked section: an exact heading id, or the first heading that starts with it (`#ad-8` → "AD-8: Pricing").
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    if (!link.anchor || !outline.length) return;
    const want = headingSlug(link.anchor);
    const hit = outline.find((h) => h.slug === want) ?? outline.find((h) => h.slug.startsWith(want));
    if (hit) requestAnimationFrame(() => document.getElementById(hit.slug)?.scrollIntoView({ block: 'start' }));
  }, [outline, link.anchor]);

  if (!ws) return null;
  const path = state.doc?.path ?? link.candidates[0] ?? '';
  const kind = docKind(path);
  const dir = path.slice(0, path.lastIndexOf('/'));
  const back = doc?.back;
  const backTicket = back?.ticketUid ? tickets.find((t) => t.uid === back.ticketUid) : undefined;
  const openRelative = (href: string) => {
    const [p = '', anchor] = href.split('#');
    openDoc(workspaceId, { candidates: [normalisePath(`${dir}/${p}`), normalisePath(p)], anchor, label: 'link', kind: docKind(p) });
  };
  const fm = parsed ? Object.entries(parsed.data).filter(([, v]) => v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-border border-b px-4 py-2.5">
        {back && <Button size="sm" variant="ghost" onClick={closeDoc}><ArrowLeft />{backTicket ? `Back to ${backTicket.ref}` : 'Back'}</Button>}
        <KindBadge kind={kind} />
        <Breadcrumbs className="min-w-0 flex-1" items={[
          { label: 'Docs', title: 'All documents', go: () => { setDoc(null); setView('docs'); } },
          ...scopeCrumbs(containerScope(ws, path)).slice(1),
          { label: docTitleFromPath(path), title: path, className: 'font-semibold', go: () => scroller.current?.scrollTo({ top: 0, behavior: 'smooth' }) },
        ]} />
        <span className="hidden max-w-[30%] truncate font-mono text-[11px] text-muted-foreground 2xl:inline" title={path}>{path}</span>
        <Button size="icon-sm" variant="ghost" aria-label="Copy path" title="Copy path" onClick={() => { void navigator.clipboard?.writeText(path); toast.success('Path copied'); }}><ClipboardCopy /></Button>
      </header>
      {state.doc && state.doc.siblings.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-border border-b px-4 py-1.5">
          {state.doc.siblings.map((s) => (
            <button key={s} type="button" onClick={() => openDoc(workspaceId, { candidates: [s], label: 'file', kind: docKind(s) })} className={cn('shrink-0 rounded-md px-2 py-1 text-xs', s === state.doc?.path ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent')}>{s.slice(s.lastIndexOf('/') + 1)}</button>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10">
          {state.loading && <p className="text-sm text-muted-foreground">Opening…</p>}
          {!state.loading && !state.doc && (
            <div className="text-sm text-muted-foreground">
              <p>This document isn't in the project yet. The link points at:</p>
              <ul className="mt-2 list-disc pl-5 font-mono text-xs">{link.candidates.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
          {parsed && (
            <div className="mx-auto max-w-3xl">
              {fm.length > 0 && (
                <details className="mb-6 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Details · {fm.length} field{fm.length === 1 ? '' : 's'}</summary>
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                    {fm.map(([k, v]) => [<dt key={`${k}-k`} className="text-muted-foreground">{k}</dt>, <dd key={`${k}-v`} className="min-w-0 break-words font-mono">{show(v)}</dd>])}
                  </dl>
                </details>
              )}
              <Markdown source={parsed.body} onDocLink={openRelative} />
            </div>
          )}
        </div>
        {outline.length > 2 && (
          <aside className="hidden w-60 shrink-0 overflow-y-auto border-border border-l px-3 py-5 xl:block">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><ListTree className="size-3.5" />On this page</div>
            {outline.filter((h) => h.depth <= 3).map((h) => (
              <button key={h.slug} type="button" onClick={() => document.getElementById(h.slug)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="block w-full truncate rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground" style={{ paddingLeft: `${(h.depth - 1) * 10 + 4}px` }}>{h.text}</button>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}

export function DocsView() {
  const { board, scope, doc, openDoc } = useBoardContext();
  const ws = board.workspaces.find((w) => w.store.id === (doc?.workspaceId ?? scope.workspaceId)) ?? board.workspaces[0];
  const library = useDocLibrary(ws);
  if (!ws) return null;
  const openPath = (path: string) => openDoc(ws.store.id, { candidates: [path], label: 'document', kind: docKind(path) });

  return (
    <div className="flex h-full min-h-[480px] gap-4">
      <aside className="flex w-72 shrink-0 flex-col max-md:hidden">
        {library === null ? <p className="text-xs text-muted-foreground">Finding documents…</p> : (
          <>
            <DocList docs={library.docs} current={doc?.link.candidates[0]} onOpen={openPath} />
            {library.truncated && <p className="pt-2 text-[11px] text-muted-foreground">Showing the first {library.docs.length} documents.</p>}
          </>
        )}
      </aside>
      {doc && doc.workspaceId === ws.store.id ? <DocReader workspaceId={ws.store.id} link={doc.link} /> : (
        <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
          <div className="flex max-w-sm flex-col items-center gap-2 p-6">
            <BookOpen className="size-6" />
            <p>Pick a document on the left: PRDs, architecture, UX, epics, sprint status and retrospectives from <span className="font-mono text-xs">{ws.tree?.outputFolder}</span>.</p>
            <p className="text-xs">Tickets list the docs they link to under "Linked docs".</p>
          </div>
        </div>
      )}
    </div>
  );
}
