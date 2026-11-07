/**
 * Settings, in two scopes like Kaneo's: "You" (display preferences, kept in this browser) and
 * "Project" (team settings committed to `_bmad/custom/bmad-board.toml`, shared with everyone and every agent).
 */
import { DatabaseZap, GitCommitHorizontal, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useState, type ReactNode } from 'react';
import { applyWithToast } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import { CARD_FIELDS, type CardField, type ViewId } from '@/app/preferences';
import type { LinkPreferences } from '@/app/links';
import { useTheme } from '@/app/use-theme';
import { BOARD_CONFIG_PATH, DEFAULT_BOARD_CONFIG, type BoardConfig } from '@/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cacheStats, DEFAULT_COMMIT_TEMPLATE, fillTemplate } from '@/store';
import { loadAuthor } from '@/app/use-board';
import type { GitPreferences } from '@/app/preferences';
import { cn } from '@/lib/cn';
import { TaskCardBody } from '../board/task-card';
import { ShortcutsList } from '../dialogs/shortcuts-dialog';

function Card({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background">
      <header className="border-border border-b px-5 py-3.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </header>
      <div className="flex flex-col divide-y divide-border">{children}</div>
      {footer && <footer className="flex items-center justify-end gap-2 border-border border-t px-5 py-3">{footer}</footer>}
    </section>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
      <div className="min-w-48 flex-1">
        <div className="text-sm">{label}</div>
        {help && <div className="text-xs text-muted-foreground">{help}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn('relative h-5 w-9 rounded-full transition-colors', on ? 'bg-primary' : 'bg-muted-foreground/30')}>
      <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform', on && 'translate-x-4')} />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={cn('h-7 rounded-md px-2.5 text-xs', value === o.id ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground')}>{o.label}</button>
      ))}
    </div>
  );
}

const VIEW_OPTIONS: { id: ViewId; label: string }[] = [
  { id: 'next', label: "What's next" },
  { id: 'board', label: 'Board' },
  { id: 'list', label: 'List' },
  { id: 'graph', label: 'Dependencies' },
  { id: 'standup', label: 'Stand-up' },
  { id: 'docs', label: 'Docs' },
];

function YouSettings() {
  const { preferences, inScope, tickets } = useBoardContext();
  const { prefs, update, reset } = preferences;
  const { theme, setTheme } = useTheme();
  const sample = inScope.find((t) => t.leaf.state !== 'done' && (t.leaf.after.length || t.leaf.plan)) ?? inScope[0] ?? tickets[0];
  const setField = (f: CardField, on: boolean) => update((p) => ({ cardFields: { ...p.cardFields, [f]: on } }));

  return (
    <>
      <Card title="Appearance">
        <Row label="Theme"><Segmented label="Theme" value={theme} onChange={setTheme} options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} /></Row>
      </Card>

      <Card title="Cards" description="What each ticket card shows on the board. Compact cards fit more on screen.">
        <div className="grid gap-6 px-5 py-4 lg:grid-cols-[1fr_300px]">
          <div className="grid content-start gap-x-6 gap-y-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
              <span>Compact cards<span className="block text-xs text-muted-foreground">Less padding, titles up to two lines</span></span>
              <Toggle label="Compact cards" on={prefs.compactCards} onChange={(v) => update({ compactCards: v })} />
            </label>
            {CARD_FIELDS.map((f) => (
              <label key={f.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{f.label}<span className="block text-xs text-muted-foreground">{f.help}</span></span>
                <Toggle label={f.label} on={prefs.cardFields[f.id]} onChange={(v) => setField(f.id, v)} />
              </label>
            ))}
          </div>
          {sample && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Preview</span>
              <div className="pointer-events-none rounded-xl bg-board-lane p-2"><TaskCardBody ticket={sample} /></div>
            </div>
          )}
        </div>
      </Card>

      <LinkSettings />

      <GitSettings />

      <Card title="Board" footer={<Button size="sm" variant="ghost" onClick={reset}><RotateCcw />Reset your settings</Button>}>
        <Row label="Open on" help="The view the board starts in."><Segmented label="Default view" value={prefs.defaultView} onChange={(v) => update({ defaultView: v })} options={VIEW_OPTIONS} /></Row>
        <Row label="Done column" help="Hide it to focus the board on open work."><Toggle label="Show the Done column" on={prefs.showDoneColumn} onChange={(v) => update({ showDoneColumn: v })} /></Row>
        <Row label="Sidebar" help="Also [ on the keyboard."><Toggle label="Show the sidebar" on={prefs.sidebarOpen} onChange={(v) => update({ sidebarOpen: v })} /></Row>
        <Row label="Stand-up covers" help="What “done since” counts back to by default.">
          <Segmented label="Stand-up range" value={prefs.standupRange} onChange={(v) => update({ standupRange: v })} options={[{ id: 'workday', label: 'Last working day' }, { id: '24h', label: '24 hours' }, { id: '7d', label: '7 days' }]} />
        </Row>
      </Card>
    </>
  );
}

/** Whether edits are committed as they're saved, the message they get, and committing what's left over. */
function GitSettings() {
  const { preferences, board } = useBoardContext();
  const { prefs, update } = preferences;
  const set = (patch: Partial<GitPreferences>) => update((p) => ({ git: { ...p.git, ...patch } }));
  const local = board.workspaces.filter((w) => w.store.capabilities.write && w.store.capabilities.commits && !w.store.capabilities.pullRequests);
  const github = board.workspaces.some((w) => w.store.capabilities.pullRequests);
  const [draft, setDraft] = useState(prefs.git.template || DEFAULT_COMMIT_TEMPLATE);
  useEffect(() => setDraft(prefs.git.template || DEFAULT_COMMIT_TEMPLATE), [prefs.git.template]);
  const author = loadAuthor();
  const preview = fillTemplate(draft, 'mark epic-1/2 in-progress', author);
  const saveTemplate = () => set({ template: draft.trim() === DEFAULT_COMMIT_TEMPLATE ? '' : draft.trim() });
  return (
    <Card title="Git" description={<>How the board saves edits to a project on this computer.{github ? ' GitHub projects always commit, to the board’s pull request branch; the message template applies there too.' : ''}</>}>
      <Row label="Commit on save" help={prefs.git.commitOnSave ? 'Each change is its own commit on the current branch (never pushed).' : 'Changes are written to the files and left uncommitted. Commit them yourself, or all at once below.'}>
        <Toggle label="Commit on save" on={prefs.git.commitOnSave} onChange={(v) => set({ commitOnSave: v })} />
      </Row>
      <div className="flex flex-col gap-2 px-5 py-3">
        <div>
          <div className="text-sm">Commit message</div>
          <div className="text-xs text-muted-foreground"><code>{'{summary}'}</code> is what changed, <code>{'{author}'}</code> who changed it, <code>{'{kind}'}</code> person or agent. A <code>Changed-by:</code> line is added if the template has none, because history uses it to tell people from agents.</div>
        </div>
        <Textarea aria-label="Commit message template" value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-20 font-mono text-xs" />
        <div className="flex flex-wrap items-start gap-3">
          <pre className="min-w-0 flex-1 whitespace-pre-wrap rounded-md bg-muted/60 p-2 font-mono text-[11px] text-muted-foreground">{preview}</pre>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={draft === DEFAULT_COMMIT_TEMPLATE} onClick={() => setDraft(DEFAULT_COMMIT_TEMPLATE)}>Default</Button>
            <Button size="sm" disabled={draft.trim() === (prefs.git.template || DEFAULT_COMMIT_TEMPLATE)} onClick={saveTemplate}><Save />Save</Button>
          </div>
        </div>
      </div>
      {local.map((w) => <PendingRow key={w.store.id} store={w.store} label={w.store.label} template={prefs.git.template} />)}
    </Card>
  );
}

/** A local project's uncommitted board edits, and a button to commit them as one commit. */
function PendingRow({ store, label, template }: { store: ReturnType<typeof useBoardContext>['board']['workspaces'][number]['store']; label: string; template: string }) {
  const state = useBoardContext();
  const [paths, setPaths] = useState<string[] | null>(null);
  const [summary, setSummary] = useState('board changes');
  const [busy, setBusy] = useState(false);
  const lastResult = state.board.workspaces.find((w) => w.store.id === store.id)?.lastResult;
  useEffect(() => {
    let live = true;
    void store.pending().then((p) => live && setPaths(p));
    return () => { live = false; };
  }, [store, lastResult]);
  if (!paths?.length) return null;
  const commit = async () => {
    setBusy(true);
    try {
      const r = await store.commitPending(summary.trim() || 'board changes', loadAuthor(), template);
      toast.success(`Committed ${r.paths.length} file${r.paths.length === 1 ? '' : 's'}`, { description: r.commit ? `Commit ${r.commit.slice(0, 7)} in ${label}.` : undefined });
      setPaths(await store.pending());
    } catch (e) {
      toast.error('Could not commit', { description: e instanceof Error ? e.message : String(e) });
    }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2 px-5 py-3">
      <div className="text-sm">{paths.length} file{paths.length === 1 ? '' : 's'} the board changed in <span className="font-medium">{label}</span> {paths.length === 1 ? 'is' : 'are'} not committed</div>
      <ul className="max-h-28 overflow-y-auto font-mono text-[11px] text-muted-foreground">{paths.map((p) => <li key={p} className="truncate">{p}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Summary for the commit" value={summary} onChange={(e) => setSummary(e.target.value)} className="min-w-48 flex-1" />
        <Button size="sm" disabled={busy} onClick={() => void commit()}><GitCommitHorizontal />{busy ? 'Committing…' : 'Commit now'}</Button>
      </div>
    </div>
  );
}

/** Where file, commit and branch links open, and what each project can reach. */
function LinkSettings() {
  const { preferences, board } = useBoardContext();
  const { prefs, update } = preferences;
  const set = (patch: Partial<LinkPreferences>) => update((p) => ({ links: { ...p.links, ...patch } }));
  const reach = board.workspaces.map((w) => ({ label: w.store.label, links: w.store.links(), commits: !!w.store.source.commitDetail }));
  return (
    <Card title="Links" description="Where file, commit and branch links open. When a project can't reach the choice (no GitHub remote, or not on this computer), links fall back to GitHub, then to the board.">
      <Row label="Files" help="Ticket files, plans, tickets.toml, epic and initiative files.">
        <Segmented label="Open files in" value={prefs.links.files} onChange={(v) => set({ files: v })} options={[{ id: 'board', label: 'Board reader' }, { id: 'github', label: 'GitHub' }, { id: 'vscode', label: 'VS Code' }, { id: 'cursor', label: 'Cursor' }]} />
      </Row>
      <Row label="Commits" help="The board's commit view lists the tickets a commit touched.">
        <Segmented label="Open commits in" value={prefs.links.commits} onChange={(v) => set({ commits: v })} options={[{ id: 'board', label: 'Board' }, { id: 'github', label: 'GitHub' }]} />
      </Row>
      <Row label="Branches" help="Open the branch on GitHub, or copy a git switch command.">
        <Segmented label="Branch links" value={prefs.links.branches} onChange={(v) => set({ branches: v })} options={[{ id: 'github', label: 'GitHub' }, { id: 'copy', label: 'Copy command' }]} />
      </Row>
      {reach.length > 0 && (
        <div className="flex flex-col gap-1 px-5 py-3 text-xs text-muted-foreground">
          {reach.map((r) => (
            <div key={r.label} className="flex flex-wrap gap-x-2">
              <span className="font-medium text-foreground">{r.label}</span>
              <span>· GitHub {r.links?.web ? <a className="underline-offset-2 hover:underline" href={r.links.web} target="_blank" rel="noreferrer">{r.links.web.replace(/^https:\/\//, '')}</a> : 'not found'}</span>
              <span>· editor {r.links?.localRoot ? <code className="font-mono">{r.links.localRoot}</code> : 'not on this computer'}</span>
              <span>· commit view {r.commits ? 'yes' : 'no'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

function ProjectSettings() {
  const state = useBoardContext();
  const { board, scope } = state;
  const ws = board.workspaces.find((w) => w.store.id === scope.workspaceId) ?? board.workspaces[0];
  const saved = ws?.tree?.board ?? DEFAULT_BOARD_CONFIG;
  const [draft, setDraft] = useState<BoardConfig>(saved);
  const [agents, setAgents] = useState(saved.agents.join('\n'));
  const [hidden, setHidden] = useState(saved.hidden.join('\n'));
  useEffect(() => {
    setDraft(saved);
    setAgents(saved.agents.join('\n'));
    setHidden(saved.hidden.join('\n'));
  }, [saved]);
  if (!ws) return null;
  const writable = ws.store.capabilities.write && ws.tree?.tracker === 'repo';
  const next: BoardConfig = { ...draft, agents: lines(agents), hidden: lines(hidden) };
  const dirty = JSON.stringify(next) !== JSON.stringify(saved);
  const limit = (k: keyof BoardConfig['wipLimits'], v: string) => {
    const n = Number.parseInt(v, 10);
    setDraft((d) => {
      const wipLimits = { ...d.wipLimits };
      if (n > 0) wipLimits[k] = n;
      else delete wipLimits[k];
      return { ...d, wipLimits };
    });
  };

  return (
    <Card
      title={`Project · ${ws.store.label}`}
      description={<>Shared with the team and its agents through <code>{BOARD_CONFIG_PATH}</code>. {writable ? 'Saving commits the file.' : 'This project is read-only here, so these are shown but cannot be saved.'}</>}
      footer={writable && <Button size="sm" disabled={!dirty} onClick={() => void applyWithToast(state, ws.store.id, [{ kind: 'board-config', config: next }], 'Project settings saved')}><Save />Save project settings</Button>}
    >
      <Row label="Work-in-progress limits" help="A board column warns once it holds more than this. Empty means no limit.">
        {(['in-progress', 'review'] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {k === 'in-progress' ? 'In progress' : 'Review'}
            <Input size="sm" type="number" min={0} disabled={!writable} className="w-16" value={draft.wipLimits[k] ?? ''} onChange={(e) => limit(k, e.target.value)} />
          </label>
        ))}
      </Row>
      <Row label="Agents" help="Names the board treats as agents, beyond ones that look like it (*-agent, claude, *[bot]). One per line.">
        <Textarea rows={3} disabled={!writable} className="w-64 text-sm" value={agents} placeholder={'qa-runner\nrelease-bot'} onChange={(e) => setAgents(e.target.value)} />
      </Row>
      <Row label="Hidden people" help="Left out of assignee suggestions and the stand-up, such as CI users. One per line.">
        <Textarea rows={3} disabled={!writable} className="w-64 text-sm" value={hidden} placeholder={'github-actions\nbuild-bot'} onChange={(e) => setHidden(e.target.value)} />
      </Row>
    </Card>
  );
}

function CacheSettings() {
  const { board } = useBoardContext();
  const [stats, setStats] = useState<{ entries: number; bytes?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void cacheStats().then(setStats);
  }, []);
  const clear = async () => {
    setBusy(true);
    await board.clearCacheAndReload();
    setStats(await cacheStats());
    setBusy(false);
    toast.success('Cache cleared; every project was read again');
  };
  const size = stats?.bytes ? ` · about ${(stats.bytes / 1_048_576).toFixed(1)} MB stored by this site` : '';
  return (
    <Card title="Browser cache" description="Files are kept by their git hash, so a reload only fetches what changed. Clear it if the board ever looks out of date.">
      <Row label="Cached files and boards" help={stats ? `${stats.entries.toLocaleString()} entries${size}` : 'Counting…'}>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void clear()}><DatabaseZap />{busy ? 'Clearing…' : 'Clear cache and reload'}</Button>
      </Row>
    </Card>
  );
}

export function SettingsView() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-10">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">Your settings stay in this browser. Project settings are committed to the repo for everyone.</p>
      </div>
      <YouSettings />
      <ProjectSettings />
      <CacheSettings />
      <Card title="Keyboard shortcuts" description="Press ? anywhere to see these."><div className="px-5 py-4"><ShortcutsList /></div></Card>
    </div>
  );
}
