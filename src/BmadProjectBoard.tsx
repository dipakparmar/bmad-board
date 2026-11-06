import { ArrowUpRight, ChevronDown, CircleDot, FileText, FolderOpen, GitBranch, Github, LayoutGrid, List, RefreshCw, Search, Server, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BoardState, LeafStatus } from './domain';
import { LEAF_STATUSES, statusForDrop } from './domain';
import { BrowserFolderSource, GitHubSource, parseRepo } from './store';
import { loadAuthor, saveAuthor, useBoard } from './app/use-board';
import { bodyOf, COLUMNS, summaryOf, ticketsOf, type Ticket } from './app/view-model';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';


type LocalButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm';
  leadingIcon?: LucideIcon;
};

function Button({ variant = 'secondary', size = 'sm', leadingIcon: Icon, className = '', children, ...props }: LocalButtonProps) {
  const sizeClass = size === 'sm' ? 'h-9 px-3 text-xs' : '';
  const variantClass = variant === 'primary'
    ? 'border border-transparent bg-[#5046e5] text-white hover:bg-[#4338ca]'
    : variant === 'ghost'
      ? 'border border-transparent bg-transparent text-[#666874] hover:bg-[#f1f2f5]'
      : 'border border-[#e0e1e6] bg-white text-[#373943] hover:bg-[#f8f8fa]';
  return <button className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition ${sizeClass} ${variantClass} ${className}`} {...props}>{Icon && <Icon size={15} />}{children}</button>;
}

function Tag({ intent = 'neutral', children }: { intent?: 'info' | 'neutral'; children: ReactNode }) {
  const className = intent === 'info' ? 'bg-[#eeedff] text-[#5046e5]' : 'bg-[#f1f2f5] text-[#6d6f79]';
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{children}</span>;
}

const TOKEN_KEY = 'bmad-board:github-token';

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function BmadProjectBoardPreview() {
  const board = useBoard();
  const [workspaceFilter, setWorkspaceFilter] = useState('all');
  const [epicFilter, setEpicFilter] = useState('all');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState<'github' | null>(null);

  const tickets = useMemo(() => board.workspaces.flatMap((w) => (w.tree ? ticketsOf(w.store.id, w.store.label, w.tree, w.store.capabilities.write) : [])), [board.workspaces]);
  const epics = useMemo(() => [...new Map(tickets.filter((t) => t.epic).map((t) => [t.epic?.slug ?? '', t.epic?.title ?? ''])).entries()], [tickets]);
  const visible = tickets.filter((t) =>
    t.leaf.state !== 'dropped' &&
    `${t.ref} ${t.leaf.title} ${t.leaf.plan?.assignee ?? ''} ${t.epic?.title ?? ''} ${summaryOf(t.leaf)}`.toLowerCase().includes(search.toLowerCase()) &&
    (workspaceFilter === 'all' || t.workspaceId === workspaceFilter) &&
    (epicFilter === 'all' || t.epic?.slug === epicFilter || (epicFilter === 'backlog' && t.leaf.folder === 'backlog')),
  );
  const selected = tickets.find((t) => t.uid === selectedUid) ?? null;
  const problems = board.workspaces.flatMap((w) => [...(w.error ? [`${w.store.label}: ${w.error}`] : []), ...(w.tree?.problems ?? []).map((p) => `${w.store.label}: ${p}`)]);
  const loading = board.workspaces.some((w) => w.loading);
  const v6 = board.workspaces.some((w) => w.tree?.layout === 'v6');

  async function openFolder() {
    if (!BrowserFolderSource.supported()) {
      setError('This browser cannot open local folders. Use Chrome or Edge, or run `bun run server` to edit with git.');
      return;
    }
    try {
      await board.add(await BrowserFolderSource.pick());
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Could not open that folder.');
    }
  }

  async function connectGitHub(repoText: string, token: string) {
    const target = parseRepo(repoText);
    if (!target) {
      setError('Enter a repo as owner/name or a github.com URL.');
      return;
    }
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
    setConnecting(null);
    await board.add(new GitHubSource({ ...target, token: token || undefined }));
  }

  async function move(ticket: Ticket, status: LeafStatus) {
    if (ticket.readOnly) return;
    await board.apply(ticket.workspaceId, [{ kind: 'mark', key: ticket.leaf.key, status }]);
  }

  return (
    <div className="bmad-board min-h-screen bg-[#f7f8fa] text-[#20212a]">
      <header className="flex h-14 items-center justify-between border-b border-[#e6e7eb] bg-white px-6">
        <div className="flex items-center gap-3 text-sm"><div className="grid size-7 place-items-center rounded-lg bg-[#5046e5] text-white"><LayoutGrid size={15} /></div><span className="font-semibold">BMAD board</span><span className="text-[#a0a1aa]">/</span><span className="text-[#676975]">{board.workspaces.map((w) => w.store.label).join(', ') || 'No project'}</span></div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" leadingIcon={RefreshCw} onClick={() => board.workspaces.forEach((w) => void board.reload(w.store))}>{loading ? 'Loading…' : 'Reload'}</Button>
          <Button variant="secondary" size="sm" leadingIcon={Github} onClick={() => setConnecting('github')}>GitHub repo</Button>
          <Button variant="secondary" size="sm" leadingIcon={FolderOpen} onClick={() => void openFolder()}>Open folder</Button>
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] px-7 py-7">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
          <div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#777985]"><span>Ticket tree</span><ChevronDown size={13} /><span>{board.workspaces[0]?.tree?.activeInitiative ?? 'all initiatives'}</span></div><h1 className="text-[28px] font-semibold tracking-[-0.04em]">Board <span className="ml-2 align-middle text-sm font-medium tracking-normal text-[#898b96]">{visible.length} tickets</span></h1><p className="mt-1 text-sm text-[#777985]">BMAD tickets, read from and written back to git.</p></div>
          <div className="flex flex-wrap gap-2">{board.workspaces.map((w) => <span key={w.store.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#e3e4e9] bg-white px-2.5 py-1.5 text-xs text-[#5c5e69]">{w.store.id.startsWith('local:') ? <Server size={13} /> : w.store.id.startsWith('github:') ? <Github size={13} /> : <FolderOpen size={13} />}{w.store.label}<span className="text-[#9a9ba4]">{w.store.capabilities.write ? (w.store.capabilities.pullRequests ? 'PR' : 'commits') : 'read-only'}</span><button aria-label={`Disconnect ${w.store.label}`} onClick={() => board.remove(w.store.id)}><X size={12} /></button></span>)}</div>
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e6ea] pb-4">
          <div className="flex items-center gap-1 rounded-lg bg-[#eeeff2] p-1 text-sm"><button className={`rounded-md px-3 py-1.5 ${view === 'board' ? 'bg-white font-medium shadow-sm' : 'text-[#747682]'}`} onClick={() => setView('board')}><LayoutGrid className="mr-1.5 inline" size={14} />Board</button><button className={`rounded-md px-3 py-1.5 ${view === 'list' ? 'bg-white font-medium shadow-sm' : 'text-[#747682]'}`} onClick={() => setView('list')}><List className="mr-1.5 inline" size={14} />List</button></div>
          <div className="flex flex-wrap items-center gap-2"><label className="flex h-9 items-center gap-2 rounded-md border border-[#e3e4e9] bg-white px-3 text-sm"><Search size={14} className="text-[#92939c]" /><input className="w-40 outline-none placeholder:text-[#a1a2aa]" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets" /></label>
            <select aria-label="Filter by project" className="h-9 rounded-md border border-[#e3e4e9] bg-white px-3 text-sm" value={workspaceFilter} onChange={(e) => setWorkspaceFilter(e.target.value)}><option value="all">All projects</option>{board.workspaces.map((w) => <option key={w.store.id} value={w.store.id}>{w.store.label}</option>)}</select>
            <select aria-label="Filter by epic" className="h-9 rounded-md border border-[#e3e4e9] bg-white px-3 text-sm" value={epicFilter} onChange={(e) => setEpicFilter(e.target.value)}><option value="all">All epics</option>{epics.map(([slug, title]) => <option key={slug} value={slug}>{title}</option>)}<option value="backlog">Backlog</option></select>
          </div>
        </div>
        {error && <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
        {v6 && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">This project uses the BMAD v6 layout, so it is read-only here. Run <code>bmad migrate method</code> to move it to the ticket tree and edit it on the board.</div>}
        {problems.length > 0 && <details className="mb-4 rounded-lg border border-[#e5e6ea] bg-white px-4 py-3 text-sm text-[#5c5e69]"><summary className="cursor-pointer font-medium">{problems.length} issue{problems.length === 1 ? '' : 's'} reading the tree</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{problems.map((p) => <li key={p}>{p}</li>)}</ul></details>}
        {board.workspaces.flatMap((w) => (w.lastResult?.pullRequestUrl ? [w.lastResult.pullRequestUrl] : [])).map((url) => <div key={url} className="mb-4 rounded-lg border border-[#d9d6fd] bg-[#f5f4ff] px-4 py-3 text-sm text-[#3d36b0]"><GitBranch className="mr-1.5 inline" size={14} />Your changes are on a pull request: <a className="underline" href={url} target="_blank" rel="noreferrer">{url}</a></div>)}
        {board.workspaces.length === 0 ? (
          <section className="mx-auto mt-14 max-w-xl rounded-2xl border border-[#e5e6ea] bg-white px-8 py-10 text-center shadow-sm">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-[#eeedff] text-[#5046e5]"><FolderOpen size={22} /></div>
            <h2 className="text-lg font-semibold">Connect a BMAD project</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#777985]">Run <code>bun run server -- --root &lt;project&gt;</code> to edit a local checkout with git commits, connect a GitHub repo to edit through pull requests, or open a folder to browse it read-only.</p>
            <div className="mt-5 flex justify-center gap-2"><Button variant="primary" size="sm" leadingIcon={Github} onClick={() => setConnecting('github')}>Connect GitHub repo</Button><Button variant="secondary" size="sm" leadingIcon={FolderOpen} onClick={() => void openFolder()}>Open folder</Button></div>
          </section>
        ) : <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Open tickets" value={visible.filter((t) => t.leaf.state !== 'done').length} /><Metric label="In progress" value={visible.filter((t) => t.leaf.state === 'in-progress').length} tint="violet" /><Metric label="In review" value={visible.filter((t) => t.leaf.state === 'review').length} tint="amber" /><Metric label="Done" value={visible.filter((t) => t.leaf.state === 'done').length} tint="green" /></div>
          {view === 'board' ? (
            <div className="grid min-w-[900px] grid-cols-4 gap-3 overflow-x-auto">
              {COLUMNS.map((column) => {
                const columnTickets = visible.filter((t) => t.leaf.state === column.id);
                return <section key={column.id} className="min-h-[430px] rounded-xl bg-[#eff0f3] p-2.5" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const t = tickets.find((x) => x.uid === e.dataTransfer.getData('text/plain')); const status = t && statusForDrop(column.id, t.leaf.status); if (t && status) void move(t, status); }}>
                  <div className="mb-2 flex items-center justify-between px-1 py-1"><div className="flex items-center gap-2 text-[13px] font-semibold"><span className={`size-2 rounded-full ${column.color}`} />{column.label}<span className="rounded bg-white/80 px-1.5 py-0.5 text-[11px] text-[#7a7c86]">{columnTickets.length}</span></div></div>
                  <div className="space-y-2">{columnTickets.map((t) => <TicketCard key={t.uid} ticket={t} onClick={() => setSelectedUid(t.uid)} />)}{!columnTickets.length && <div className="rounded-lg border border-dashed border-[#d5d7dd] px-3 py-5 text-center text-xs text-[#9a9ba4]">Nothing here yet</div>}</div>
                </section>;
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#e5e6ea] bg-white"><div className="grid grid-cols-[90px_1fr_140px_200px_120px] border-b border-[#ececf0] px-4 py-2 text-xs font-medium text-[#838590]"><span>Ref</span><span>Ticket</span><span>Status</span><span>Epic</span><span>Assignee</span></div>{visible.map((t) => <button key={t.uid} onClick={() => setSelectedUid(t.uid)} className="grid w-full grid-cols-[90px_1fr_140px_200px_120px] items-center border-b border-[#f0f0f3] px-4 py-3 text-left text-sm last:border-0 hover:bg-[#fafaff]"><span className="font-mono text-xs text-[#81838e]">{t.ref}</span><span className="font-medium">{t.leaf.title}</span><span><StatusChip state={t.leaf.state} status={t.leaf.status} /></span><span className="truncate text-[#777985]">{t.epic?.title ?? 'Backlog'}</span><span className="text-[#777985]">{t.leaf.plan?.assignee ?? 'Unassigned'}</span></button>)}</div>
          )}
        </>}
      </div>
      {connecting === 'github' && <GitHubDialog onCancel={() => setConnecting(null)} onConnect={(repo, token) => void connectGitHub(repo, token)} />}
      {selected && <div className="fixed inset-0 z-20 flex justify-end bg-black/25" onClick={() => setSelectedUid(null)}><aside className="h-full w-full max-w-[760px] overflow-y-auto bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-7 flex items-center justify-between"><span className="font-mono text-xs text-[#858792]">{selected.ref} · {selected.workspace}</span><button onClick={() => setSelectedUid(null)} aria-label="Close ticket details"><X size={19} /></button></div>
        <div className="mb-3 flex items-center gap-2"><StatusChip state={selected.leaf.state} status={selected.leaf.status} />{!selected.readOnly && <select aria-label="Set status" className="h-8 rounded-md border border-[#e3e4e9] bg-white px-2 text-xs" value={selected.leaf.status || ''} onChange={(e) => void move(selected, e.target.value as LeafStatus)}><option value="" disabled>planned</option>{LEAF_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>}</div>
        <h2 className="text-2xl font-semibold leading-8">{selected.leaf.title}</h2>
        <div className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Epic', selected.epic?.title ?? 'Backlog'], ['Assignee', selected.leaf.plan?.assignee], ['Type', selected.leaf.type], ['Risk', selected.leaf.risk], ['Needs a person', selected.leaf.hitl ? 'yes' : 'no'], ['Waits on', selected.leaf.after.join(', ')], ['Blocked', selected.leaf.plan?.blockedReason], ['Covers', selected.leaf.entry?.covers.join(', ')]].map(([label, value]) => <div key={label} className="rounded-lg border border-[#ececf0] p-3"><div className="mb-1 text-[11px] uppercase tracking-wide text-[#8a8c96]">{label}</div><div className="text-sm font-medium">{value || 'Not set'}</div></div>)}</div>
        <section className="border-t border-[#ececf0] pt-5"><h3 className="mb-4 text-sm font-semibold">Ticket</h3>{bodyOf(selected.leaf) ? <MarkdownBody source={bodyOf(selected.leaf)} /> : <p className="text-sm text-[#646672]">No description yet.</p>}</section>
        {selected.leaf.plan?.body.trim() && <section className="mt-6 border-t border-[#ececf0] pt-5"><h3 className="mb-4 text-sm font-semibold">Build plan</h3><MarkdownBody source={selected.leaf.plan.body} /></section>}
        <div className="mt-7 border-t border-[#ececf0] pt-5"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#858792]">Files</div>{[selected.leaf.file?.path, selected.leaf.plan?.path, `${selected.leaf.dir}/tickets.toml`].filter(Boolean).map((p) => <div key={p} className="mb-1 flex items-start gap-2 rounded-lg bg-[#f7f8fa] p-3 text-xs leading-5 text-[#646672]"><FileText size={15} className="mt-0.5 shrink-0" />{p}<ArrowUpRight size={13} className="ml-auto shrink-0" /></div>)}</div>
        <p className="mt-5 text-xs text-[#92939c]">{selected.readOnly ? 'Read-only here.' : `Each change is one git commit, recorded as made by ${loadAuthor().name}.`}</p>
      </aside></div>}
    </div>
  );
}

function GitHubDialog({ onCancel, onConnect }: { onCancel: () => void; onConnect: (repo: string, token: string) => void }) {
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState(readToken);
  const [name, setName] = useState(loadAuthor().name === 'board user' ? '' : loadAuthor().name);
  return <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-4" onClick={onCancel}><form className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (name) saveAuthor(name); onConnect(repo, token); }}>
    <h2 className="text-base font-semibold">Connect a GitHub repo</h2>
    <p className="mt-1 text-xs leading-5 text-[#777985]">Without a token the board is read-only (public repos only). With a fine-grained token that has Contents and Pull requests write access, edits go to a <code>bmad-board/…</code> branch and one pull request. The token stays in this browser.</p>
    <label className="mt-4 block text-xs font-medium">Repo<input required autoFocus className="mt-1 h-9 w-full rounded-md border border-[#e3e4e9] px-3 text-sm" placeholder="owner/name or github.com URL" value={repo} onChange={(e) => setRepo(e.target.value)} /></label>
    <label className="mt-3 block text-xs font-medium">Token (optional)<input type="password" className="mt-1 h-9 w-full rounded-md border border-[#e3e4e9] px-3 text-sm" value={token} onChange={(e) => setToken(e.target.value)} /></label>
    <label className="mt-3 block text-xs font-medium">Your name, for commit messages<input className="mt-1 h-9 w-full rounded-md border border-[#e3e4e9] px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} /></label>
    <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">Connect</Button></div>
  </form></div>;
}

function Metric({ label, value, tint = 'default' }: { label: string; value: number; tint?: string }) {
  const color = tint === 'violet' ? 'text-violet-600' : tint === 'amber' ? 'text-amber-600' : tint === 'green' ? 'text-emerald-600' : 'text-[#242630]';
  return <div className="rounded-xl border border-[#e7e8ec] bg-white px-4 py-3"><div className="text-xs text-[#838590]">{label}</div><div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div></div>;
}

function MarkdownBody({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\s*\n/).filter(Boolean);
  return <div className="space-y-4 text-sm leading-6 text-[#4f515c]">
    {blocks.map((block, index) => {
      const lines = block.split('\n').map((line) => line.trimEnd());
      const first = lines[0]?.trim() ?? '';
      const heading = first.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const title = <InlineMarkdown text={heading[2] ?? ''} />;
        const rest = lines.slice(1).join(' ').trim();
        const className = heading[1]?.length === 1 ? 'text-lg font-semibold text-[#252630]' : 'text-base font-semibold text-[#30313b]';
        return <section key={index}><h4 className={className}>{title}</h4>{rest && <p className="mt-2"><InlineMarkdown text={rest} /></p>}</section>;
      }
      if (first.startsWith('```')) return <pre key={index} className="overflow-x-auto rounded-lg bg-[#f5f6f8] p-4 text-xs leading-5 text-[#42444e]"><code>{lines.slice(1).filter((line) => !line.startsWith('```')).join('\n')}</code></pre>;
      if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) return <ul key={index} className="list-disc space-y-1 pl-5">{lines.map((line, itemIndex) => <li key={itemIndex}><InlineMarkdown text={line.replace(/^\s*[-*+]\s+/, '')} /></li>)}</ul>;
      if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) return <ol key={index} className="list-decimal space-y-1 pl-5">{lines.map((line, itemIndex) => <li key={itemIndex}><InlineMarkdown text={line.replace(/^\s*\d+[.)]\s+/, '')} /></li>)}</ol>;
      if (lines.every((line) => /^\s*>\s?/.test(line))) return <blockquote key={index} className="border-l-2 border-[#c9c6fb] pl-4 text-[#686a75]">{lines.map((line) => line.replace(/^\s*>\s?/, '')).join(' ')}</blockquote>;
      if (/^\s*([-*_]\s*){3,}$/.test(first)) return <hr key={index} className="border-[#ececf0]" />;
      const clean = lines.join(' ').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
      return <p key={index}><InlineMarkdown text={clean} /></p>;
    })}
  </div>;
}

function InlineMarkdown({ text }: { text: string }) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g);
  return <>{tokens.map((token, index) => {
    if (token.startsWith('`') && token.endsWith('`')) return <code key={index} className="rounded bg-[#f0f1f4] px-1 py-0.5 font-mono text-[0.9em]">{token.slice(1, -1)}</code>;
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={index} className="font-semibold text-[#30313b]">{token.slice(2, -2)}</strong>;
    if (token.startsWith('*') && token.endsWith('*')) return <em key={index}>{token.slice(1, -1)}</em>;
    if (token.startsWith('~~') && token.endsWith('~~')) return <del key={index}>{token.slice(2, -2)}</del>;
    const link = token.match(/^\[([^\]]+)\]\([^)]+\)$/);
    if (link) return <span key={index}>{link[1]}</span>;
    return <span key={index}>{token}</span>;
  })}</>;
}


function TicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const { leaf } = ticket;
  return <button draggable={!ticket.readOnly} onDragStart={(e) => e.dataTransfer.setData('text/plain', ticket.uid)} onClick={onClick} className="w-full rounded-lg border border-[#e4e5e9] bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,.03)] transition hover:border-[#c9c6fb] hover:shadow-sm"><div className="mb-2 flex items-center justify-between"><span className="font-mono text-[11px] text-[#858792]">{ticket.ref}</span>{leaf.type !== 'story' ? <Tag intent="info">{leaf.type}</Tag> : <CircleDot size={14} className="text-[#9698a2]" />}</div><div className="text-[13px] font-medium leading-[19px]">{leaf.title}</div>{summaryOf(leaf) && <p className="mt-1.5 line-clamp-2 text-xs leading-[17px] text-[#777985]">{summaryOf(leaf)}</p>}<div className="mt-3 flex items-center gap-2">{ticket.epic && <span className="truncate rounded bg-[#f1f1f4] px-1.5 py-1 text-[10px] font-medium text-[#6d6f79]">{ticket.epic.title}</span>}{leaf.hitl && <Tag>needs a person</Tag>}{leaf.plan?.blockedAt && <span className="text-[10px] font-medium text-red-600">blocked</span>}{leaf.plan?.assignee && <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-[#e8e7ff] text-[10px] font-semibold text-[#5148cb]">{leaf.plan.assignee.slice(0, 2).toUpperCase()}</span>}</div></button>;
}

function StatusChip({ state, status }: { state: BoardState; status: LeafStatus | '' }) {
  const found = COLUMNS.find((column) => column.id === state);
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f3f6] px-2 py-1 text-[11px] font-medium text-[#686a75]"><span className={`size-1.5 rounded-full ${found?.color ?? 'bg-neutral-400'}`} />{status || 'planned'}</span>;
}
