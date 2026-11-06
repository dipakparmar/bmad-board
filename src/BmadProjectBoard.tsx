import { ArrowDownUp, ArrowUpRight, ChevronDown, CircleDot, FileText, FolderOpen, LayoutGrid, List, Search, Settings2, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type Ticket = {
  id: string;
  title: string;
  status: string;
  sprint?: string;
  owner?: string;
  milestone?: string;
  path?: string;
  summary?: string;
  content?: string;
  kind: 'story' | 'epic';
  worktree?: string;
  sourceKey?: string;
};

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

type LocalFileHandle = { kind: 'file'; getFile(): Promise<File> };
type LocalDirectoryHandle = {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string): Promise<LocalDirectoryHandle>;
  getFileHandle(name: string): Promise<LocalFileHandle>;
  entries(): AsyncIterableIterator<[string, LocalFileHandle | LocalDirectoryHandle]>;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: 'read' }) => Promise<LocalDirectoryHandle>;
};
type WorkspaceFile = { name: string; path: string; text: string };

const columns = [
  { id: 'backlog', label: 'Backlog', color: 'bg-neutral-300' },
  { id: 'ready-for-dev', label: 'Ready', color: 'bg-blue-500' },
  { id: 'in-progress', label: 'In progress', color: 'bg-violet-500' },
  { id: 'review', label: 'Review', color: 'bg-amber-500' },
  { id: 'done', label: 'Done', color: 'bg-emerald-500' },
];

function statusFrom(value: string) {
  const normalized = value.toLowerCase().replaceAll('_', '-').trim();
  if (['done', 'complete', 'completed'].includes(normalized)) return 'done';
  if (['in-progress', 'in progress', 'implementing'].includes(normalized)) return 'in-progress';
  if (['review', 'qa', 'compliance', 'blocked'].includes(normalized)) return 'review';
  if (['ready-for-dev', 'ready', 'ready for dev'].includes(normalized)) return 'ready-for-dev';
  return 'backlog';
}

function titleFromSlug(slug: string) {
  return slug.replace(/^\d+-\d+-/, '').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function loadWorkspace(root: LocalDirectoryHandle): Promise<Ticket[]> {
  const output = await root.getDirectoryHandle('_bmad-output');
  const implementation = await output.getDirectoryHandle('implementation-artifacts');
  const planning = await output.getDirectoryHandle('planning-artifacts');
  const statusFile = await (await implementation.getFileHandle('sprint-status.yaml')).getFile();
  const source = await statusFile.text();
  const statusSection = source.split(/^development_status:\s*$/m)[1] ?? source;
  const entries = [...statusSection.matchAll(/^  ([\w.-]+):(?:\s*(.*))?\s*$/gm)];
  const tickets: Ticket[] = [];
  const storyKeys = new Set(entries.map((entry) => entry[1]).filter((key): key is string => typeof key === 'string' && /^\d+-\d+-.+/.test(key)));
  const storyFiles = new Map<string, WorkspaceFile>();
  for await (const [name, handle] of implementation.entries()) {
    if (handle.kind !== 'file' || !storyKeys.has(name.replace(/\.md$/i, ''))) continue;
    const match = name.match(/^(\d+)-(\d+)-(.+)\.md$/i);
    if (!match) continue;
    const id = `${match[1]}.${match[2]}`;
    const file = await handle.getFile();
    storyFiles.set(id, { name, path: `${root.name}/_bmad-output/implementation-artifacts/${name}`, text: await file.text() });
  }
  const epicText = await (await (await planning.getFileHandle('epics.md')).getFile()).text();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const key = entry[1];
    const scalarStatus = entry[2]?.trim();
    if (!key || key === 'development_status') continue;
    if (/^epic-\d+$/i.test(key)) {
      const id = `Epic ${key.replace(/^epic-/i, '')}`;
      const epicNumber = key.replace(/^epic-/i, '');
      const heading = epicText.match(new RegExp(`^## Epic ${epicNumber}[:：]\\s*(.+)$`, 'mi'))?.[1];
      tickets.push({ id, title: heading ?? id, status: statusFrom(scalarStatus ?? 'backlog'), kind: 'epic', path: `${root.name}/_bmad-output/planning-artifacts/epics.md`, sourceKey: key });
      continue;
    }
    const storyMatch = key.match(/^(\d+)-(\d+)-(.+)$/);
    if (!storyMatch) continue;
    const id = `${storyMatch[1]}.${storyMatch[2]}`;
    const end = entries[index + 1]?.index ?? statusSection.length;
    const block = statusSection.slice(entry.index, end);
    const getValue = (field: string) => block.match(new RegExp(`^    ${field}:\\s*([^\\n#]+)`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '');
    const story = storyFiles.get(id);
    const storyHeading = story?.text.match(/^#\s+(.+)$/m)?.[1]?.replace(/^Story\s+[\d.]+[:：-]?\s*/i, '').trim();
    const body = story?.text.replace(/^---[\s\S]*?---\s*/m, '').replace(/^#+\s+.*$/gm, '').replace(/\[[^\]]+\]\([^)]+\)/g, '').replace(/[`*_>#|]/g, '').replace(/\s+/g, ' ').trim();
    const content = story?.text.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, '').replace(/^#\s+.+(?:\r?\n)+/, '');
    tickets.push({
      id,
      title: storyHeading || getValue('title') || titleFromSlug(storyMatch[3] ?? key),
      status: statusFrom(getValue('status') ?? scalarStatus ?? 'backlog'),
      sprint: getValue('sprint'),
      owner: getValue('owner'),
      milestone: getValue('milestone'),
      path: story?.path ?? `${root.name}/_bmad-output/implementation-artifacts/sprint-status.yaml`,
      summary: (body || getValue('note'))?.slice(0, 190),
      content,
      kind: 'story',
      sourceKey: key,
    });
  }
  return tickets;
}

export function BmadProjectBoardPreview() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sourceLabel, setSourceLabel] = useState('No worktree loaded');
  const [worktreeFilter, setWorktreeFilter] = useState('All worktrees');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [search, setSearch] = useState('');
  const [sprint, setSprint] = useState('All sprints');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sprints = useMemo(() => ['All sprints', ...new Set(tickets.map((ticket) => ticket.sprint).filter((value): value is string => Boolean(value)))], [tickets]);
  const worktrees = useMemo(() => ['All worktrees', ...new Set(tickets.map((ticket) => ticket.worktree).filter((value): value is string => Boolean(value)))], [tickets]);
  const visible = tickets.filter((ticket) =>
    `${ticket.id} ${ticket.title} ${ticket.owner ?? ''} ${ticket.sprint ?? ''} ${ticket.summary ?? ''}`.toLowerCase().includes(search.toLowerCase()) &&
    (sprint === 'All sprints' || ticket.sprint === sprint) &&
    (worktreeFilter === 'All worktrees' || ticket.worktree === worktreeFilter),
  );
  const counts = columns.map((column) => ({ ...column, count: visible.filter((ticket) => ticket.status === column.id).length }));

  async function openWorktree() {
    const pickDirectory = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!pickDirectory) {
      setError('This browser does not support local folder access. Open this preview in Chrome or Edge.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const root = await pickDirectory.call(window, { mode: 'read' });
      const imported = await loadWorkspace(root);
      setTickets((previous) => [...previous.filter((ticket) => ticket.worktree !== root.name), ...imported.map((ticket) => ({ ...ticket, worktree: root.name }))]);
      setSourceLabel('Worktrees');
      setWorktreeFilter(root.name);
      setSelected(null);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(cause instanceof Error ? `Could not read this worktree: ${cause.message}` : 'Could not read this worktree.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bmad-board min-h-screen bg-[#f7f8fa] text-[#20212a]">
      <header className="flex h-14 items-center justify-between border-b border-[#e6e7eb] bg-white px-6">
        <div className="flex items-center gap-3 text-sm"><div className="grid size-7 place-items-center rounded-lg bg-[#5046e5] text-white"><LayoutGrid size={15} /></div><span className="font-semibold">Demo Project</span><span className="text-[#a0a1aa]">/</span><span className="text-[#676975]">BMAD workspace</span></div>
        <div className="flex items-center gap-3"><span className="hidden text-xs text-[#747682] sm:block"><FolderOpen className="mr-1 inline" size={14} />{sourceLabel}</span><Button variant="secondary" size="sm" leadingIcon={FolderOpen} onClick={() => void openWorktree()}>{loading ? 'Reading locally…' : 'Open local worktree'}</Button></div>
      </header>
      <div className="mx-auto max-w-[1500px] px-7 py-7">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
          <div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#777985]"><span>Workspace</span><ChevronDown size={13} /><span>BMAD delivery</span></div><h1 className="text-[28px] font-semibold tracking-[-0.04em]">Sprint board <span className="ml-2 align-middle text-sm font-medium tracking-normal text-[#898b96]">{visible.length} issues</span></h1><p className="mt-1 text-sm text-[#777985]">Markdown and sprint status, in one place.</p></div>
          <div className="flex items-center gap-2"><Button variant="secondary" size="sm" leadingIcon={SlidersHorizontal}>Filter</Button><Button variant="secondary" size="sm" leadingIcon={ArrowDownUp}>Sort</Button><Button variant="primary" size="sm" leadingIcon={FolderOpen} onClick={() => void openWorktree()}>Add local worktree</Button></div>
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e6ea] pb-4">
          <div className="flex items-center gap-1 rounded-lg bg-[#eeeff2] p-1 text-sm"><button className={`rounded-md px-3 py-1.5 ${view === 'board' ? 'bg-white font-medium shadow-sm' : 'text-[#747682]'}`} onClick={() => setView('board')}><LayoutGrid className="mr-1.5 inline" size={14} />Board</button><button className={`rounded-md px-3 py-1.5 ${view === 'list' ? 'bg-white font-medium shadow-sm' : 'text-[#747682]'}`} onClick={() => setView('list')}><List className="mr-1.5 inline" size={14} />List</button></div>
          <div className="flex flex-wrap items-center gap-2"><label className="flex h-9 items-center gap-2 rounded-md border border-[#e3e4e9] bg-white px-3 text-sm"><Search size={14} className="text-[#92939c]" /><input className="w-40 outline-none placeholder:text-[#a1a2aa]" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search issues" /></label><select aria-label="Filter by worktree" className="h-9 rounded-md border border-[#e3e4e9] bg-white px-3 text-sm" value={worktreeFilter} onChange={(event) => setWorktreeFilter(event.target.value)}>{worktrees.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by sprint" className="h-9 rounded-md border border-[#e3e4e9] bg-white px-3 text-sm" value={sprint} onChange={(event) => setSprint(event.target.value)}>{sprints.map((item) => <option key={item}>{item}</option>)}</select><Button variant="ghost" size="sm" aria-label="Board settings"><Settings2 size={16} /></Button></div>
        </div>
        {error && <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
        {tickets.length === 0 ? (
          <section className="mx-auto mt-14 max-w-xl rounded-2xl border border-[#e5e6ea] bg-white px-8 py-10 text-center shadow-sm">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-[#eeedff] text-[#5046e5]"><FolderOpen size={22} /></div>
            <h2 className="text-lg font-semibold">Open a local worktree</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#777985]">The board reads sprint status, epic planning, and story Markdown directly from the folder you choose. Files stay on this computer and are never uploaded or changed.</p>
            <Button className="mt-5" variant="primary" size="sm" leadingIcon={FolderOpen} onClick={() => void openWorktree()}>{loading ? 'Reading locally…' : 'Choose local worktree'}</Button>
          </section>
        ) : <>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Total issues" value={visible.length} /><Metric label="In progress" value={visible.filter((ticket) => ticket.status === 'in-progress').length} tint="violet" /><Metric label="Needs attention" value={visible.filter((ticket) => ['review', 'qa', 'compliance'].includes(ticket.status)).length} tint="amber" /><Metric label="Completed" value={visible.filter((ticket) => ticket.status === 'done').length} tint="green" /></div>
        {view === 'board' ? (
          <div className="grid min-w-[1050px] grid-cols-5 gap-3 overflow-x-auto">
            {counts.map((column) => {
              const columnTickets = visible.filter((ticket) => ticket.status === column.id);
              return <section key={column.id} className="min-h-[430px] rounded-xl bg-[#eff0f3] p-2.5">
                <div className="mb-2 flex items-center justify-between px-1 py-1"><div className="flex items-center gap-2 text-[13px] font-semibold"><span className={`size-2 rounded-full ${column.color}`} />{column.label}<span className="rounded bg-white/80 px-1.5 py-0.5 text-[11px] text-[#7a7c86]">{column.count}</span></div><button aria-label={`More ${column.label} options`} className="text-[#858792]">···</button></div>
                <div className="space-y-2">{columnTickets.slice(0, 15).map((ticket) => <TicketCard key={`${ticket.worktree ?? ''}:${ticket.sourceKey ?? ticket.id}`} ticket={ticket} onClick={() => setSelected(ticket)} />)}{column.count > 15 && <div className="px-2 py-2 text-center text-xs text-[#858792]">+ {column.count - 15} more issues</div>}{!column.count && <div className="rounded-lg border border-dashed border-[#d5d7dd] px-3 py-5 text-center text-xs text-[#9a9ba4]">Nothing here yet</div>}</div>
              </section>;
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e5e6ea] bg-white"><div className="grid grid-cols-[110px_1fr_140px_150px_120px] border-b border-[#ececf0] px-4 py-2 text-xs font-medium text-[#838590]"><span>ID</span><span>Issue</span><span>Status</span><span>Sprint</span><span>Owner</span></div>{visible.slice(0, 300).map((ticket) => <button key={`${ticket.worktree ?? ''}:${ticket.sourceKey ?? ticket.id}`} onClick={() => setSelected(ticket)} className="grid w-full grid-cols-[110px_1fr_140px_150px_120px] items-center border-b border-[#f0f0f3] px-4 py-3 text-left text-sm last:border-0 hover:bg-[#fafaff]"><span className="font-mono text-xs text-[#81838e]">{ticket.id}</span><span className="font-medium">{ticket.title}</span><span><StatusChip status={ticket.status} /></span><span className="text-[#777985]">{ticket.sprint ?? 'No sprint'}</span><span className="text-[#777985]">{ticket.owner ?? 'Unassigned'}</span></button>)}{visible.length > 300 && <p className="px-4 py-3 text-xs text-[#858792]">Showing first 300 issues. Use search or filters to narrow the list.</p>}</div>
        )}
        </>}
      </div>
      {selected && <div className="fixed inset-0 z-20 flex justify-end bg-black/25" onClick={() => setSelected(null)}><aside className="h-full w-full max-w-[760px] overflow-y-auto bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-7 flex items-center justify-between"><span className="font-mono text-xs text-[#858792]">{selected.id}</span><button onClick={() => setSelected(null)} aria-label="Close issue details"><X size={19} /></button></div>
        <div className="mb-3"><StatusChip status={selected.status} /></div><h2 className="text-2xl font-semibold leading-8">{selected.title}</h2>
        <div className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Sprint', selected.sprint], ['Owner', selected.owner], ['Milestone', selected.milestone], ['Type', selected.kind]].map(([label, value]) => <div key={label} className="rounded-lg border border-[#ececf0] p-3"><div className="mb-1 text-[11px] uppercase tracking-wide text-[#8a8c96]">{label}</div><div className="text-sm font-medium">{value || 'Not set'}</div></div>)}</div>
        <section className="border-t border-[#ececf0] pt-5"><h3 className="mb-4 text-sm font-semibold">Story details</h3>{selected.content ? <MarkdownBody source={selected.content} /> : <p className="text-sm leading-6 text-[#646672]">{selected.summary || 'No matching story Markdown was found for this ticket.'}</p>}</section>
        <div className="mt-7 border-t border-[#ececf0] pt-5"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#858792]">Source file</div><div className="flex items-start gap-2 rounded-lg bg-[#f7f8fa] p-3 text-xs leading-5 text-[#646672]"><FileText size={15} className="mt-0.5 shrink-0" />{selected.path ?? 'Derived from sprint-status.yaml'} <ArrowUpRight size={13} className="ml-auto shrink-0" /></div></div>
        <p className="mt-5 text-xs text-[#92939c]">Read-only view of the selected worktree. Source files are never modified.</p>
      </aside></div>}
    </div>
  );
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
  return <button onClick={onClick} className="w-full rounded-lg border border-[#e4e5e9] bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,.03)] transition hover:border-[#c9c6fb] hover:shadow-sm"><div className="mb-2 flex items-center justify-between"><span className="font-mono text-[11px] text-[#858792]">{ticket.id}</span>{ticket.kind === 'epic' ? <Tag intent="info">Epic</Tag> : <CircleDot size={14} className="text-[#9698a2]" />}</div><div className="text-[13px] font-medium leading-[19px]">{ticket.title}</div>{ticket.summary && <p className="mt-1.5 line-clamp-2 text-xs leading-[17px] text-[#777985]">{ticket.summary}</p>}<div className="mt-3 flex items-center gap-2">{ticket.sprint && <span className="rounded bg-[#f1f1f4] px-1.5 py-1 text-[10px] font-medium text-[#6d6f79]">{ticket.sprint}</span>}{ticket.milestone && <span className="text-[10px] text-[#858792]">{ticket.milestone}</span>}{ticket.owner && <span className="ml-auto grid size-6 place-items-center rounded-full bg-[#e8e7ff] text-[10px] font-semibold text-[#5148cb]">{ticket.owner.slice(0, 2).toUpperCase()}</span>}</div></button>;
}

function StatusChip({ status }: { status: string }) {
  const found = columns.find((column) => column.id === status);
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f3f6] px-2 py-1 text-[11px] font-medium text-[#686a75]"><span className={`size-1.5 rounded-full ${found?.color ?? 'bg-amber-500'}`} />{found?.label ?? status.replaceAll('-', ' ')}</span>;
}
