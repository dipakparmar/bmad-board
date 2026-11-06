/** Projects → initiatives → epics, like Kaneo's workspace/project sidebar. */
import { FolderOpen, GitBranch, Github, Inbox, KanbanSquare, Layers, LogOut, PanelLeftClose, PanelLeftOpen, RefreshCw, Server, Settings, Target } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useBoardContext, type Scope } from '@/app/board-context';
import { loadAuthor, saveAuthor, type Workspace } from '@/app/use-board';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { BrowserFolderSource, LocalServerSource } from '@/store';
import { cn } from '@/lib/cn';

function sourceIcon(w: Workspace) {
  if (w.store.id.startsWith('local:')) return Server;
  if (w.store.id.startsWith('github:')) return Github;
  return FolderOpen;
}

function NavItem({ active, onClick, icon: Icon, label, count, indent = 0 }: { active: boolean; onClick: () => void; icon: typeof Inbox; label: string; count?: string; indent?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: `${0.5 + indent * 0.75}rem` }}
      className={cn('flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground', active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground')}
    >
      <Icon className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
      {count && <span className="ml-auto text-[11px] tabular-nums text-sidebar-foreground/50">{count}</span>}
    </button>
  );
}

/** "name · branch" labels split in two, so long names truncate on their own line instead of pushing the layout. */
function splitLabel(label: string): { name: string; branch?: string } {
  const i = label.lastIndexOf(' · ');
  return i < 0 ? { name: label } : { name: label.slice(0, i), branch: label.slice(i + 3) };
}

function WorkspaceHeader({ w, onSelect, onReload, onRemove }: { w: Workspace; onSelect: () => void; onReload: () => void; onRemove: () => void }) {
  const Icon = sourceIcon(w);
  const { name, branch } = splitLabel(w.store.label);
  const v6 = w.tree?.layout === 'v6';
  const mode = v6 ? 'v6' : w.store.capabilities.pullRequests ? 'PR' : w.store.capabilities.write ? 'git' : 'read';
  const modeHelp = v6 ? 'BMAD v6 layout: read-only until you run `bmad migrate method`' : mode === 'PR' ? 'Changes go to a pull request' : mode === 'git' ? 'Changes are committed on this branch' : 'Read-only';
  return (
    <div className="group flex min-w-0 items-start gap-2 px-2 py-1">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-sidebar-foreground/60" />
      <button type="button" title={w.store.label} className="flex min-w-0 flex-1 flex-col text-left" onClick={onSelect}>
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/70 hover:text-sidebar-foreground">{name}</span>
        {branch && <span className="flex min-w-0 items-center gap-1 text-[11px] text-sidebar-foreground/50"><GitBranch className="size-3 shrink-0" /><span className="truncate">{branch}</span></span>}
      </button>
      <span title={modeHelp} className={cn('shrink-0 rounded px-1 py-px text-[10px]', v6 ? 'bg-warning/15 text-warning-foreground' : 'bg-sidebar-accent')}>{mode}</span>
      <Menu>
        <MenuTrigger render={<button type="button" aria-label={`${w.store.label} options`} className="shrink-0 rounded px-1 text-[11px] opacity-0 hover:bg-sidebar-accent group-hover:opacity-100 focus-visible:opacity-100">···</button>} />
        <MenuPopup align="end">
          <MenuItem onClick={onReload}><RefreshCw />Reload</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={onRemove}><LogOut />Disconnect</MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
}

export async function openFolder(add: (s: BrowserFolderSource) => Promise<void>) {
  if (!BrowserFolderSource.supported()) {
    toast.error('This browser cannot open local folders', { description: 'Use Chrome or Edge, or run `bun run start -- --root <project>` to edit with git.' });
    return;
  }
  try {
    await add(await BrowserFolderSource.pick());
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'AbortError')) toast.error('Could not open that folder', { description: cause instanceof Error ? cause.message : undefined });
  }
}

export function AppSidebar() {
  const state = useBoardContext();
  const { board, scope, setScope, tickets } = state;
  const [name, setName] = useState(() => (loadAuthor().name === 'board user' ? '' : loadAuthor().name));
  // Default "your name" to the project's `git config user.name`, the way a commit would sign it.
  const gitUser = board.workspaces.map((w) => w.store.source).find((src): src is LocalServerSource => src instanceof LocalServerSource && !!src.info.user)?.info.user;
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !gitUser) return;
    prefilled.current = true;
    if (!name) {
      setName(gitUser);
      saveAuthor(gitUser);
    }
  }, [gitUser, name]);
  const is = (s: Scope) => scope.workspaceId === s.workspaceId && scope.initiative === s.initiative && scope.epic === s.epic;
  const count = (f: (t: (typeof tickets)[number]) => boolean) => {
    const mine = tickets.filter(f);
    return `${mine.filter((t) => t.leaf.state === 'done').length}/${mine.length}`;
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 items-center gap-2 px-4">
        <div className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground"><KanbanSquare className="size-3.5" /></div>
        <span className="font-semibold text-sm">BMAD board</span>
        <Button size="icon-xs" variant="ghost" className="ml-auto text-sidebar-foreground/60" aria-label="Hide the sidebar" title="Hide the sidebar ([)" onClick={() => state.preferences.update({ sidebarOpen: false })}><PanelLeftClose /></Button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
        <NavItem active={is({})} onClick={() => setScope({})} icon={Layers} label="All tickets" count={tickets.length ? count(() => true) : undefined} />
        {board.workspaces.map((w) => {
          return (
            <div key={w.store.id} className="mt-4">
              <WorkspaceHeader w={w} onSelect={() => setScope({ workspaceId: w.store.id })} onReload={() => void board.reload(w.store)} onRemove={() => { board.remove(w.store.id); setScope({}); }} />
              {w.loading && !w.tree && <div className="px-3 py-1 text-xs text-sidebar-foreground/50">Loading…</div>}
              {w.error && <div className="px-3 py-1 text-xs text-destructive">{w.error}</div>}
              {w.tree?.initiatives.map((i) => (
                <div key={i.slug}>
                  <NavItem active={is({ workspaceId: w.store.id, initiative: i.slug })} onClick={() => setScope({ workspaceId: w.store.id, initiative: i.slug })} icon={Target} label={i.title} count={count((t) => t.workspaceId === w.store.id && t.initiative?.slug === i.slug)} />
                  {i.epics.map((e) => (
                    <NavItem key={e.slug} indent={1} active={is({ workspaceId: w.store.id, initiative: i.slug, epic: e.slug })} onClick={() => setScope({ workspaceId: w.store.id, initiative: i.slug, epic: e.slug })} icon={Layers} label={e.title} count={count((t) => t.workspaceId === w.store.id && t.epic?.slug === e.slug)} />
                  ))}
                </div>
              ))}
              {(w.tree?.backlog.length ?? 0) > 0 && (
                <NavItem active={is({ workspaceId: w.store.id, epic: 'backlog' })} onClick={() => setScope({ workspaceId: w.store.id, epic: 'backlog' })} icon={Inbox} label="Backlog" count={count((t) => t.workspaceId === w.store.id && t.leaf.folder === 'backlog')} />
              )}
            </div>
          );
        })}
      </nav>
      <div className="flex flex-col gap-2 border-sidebar-border border-t p-3">
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => state.setDialog('github')}><Github />GitHub</Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => void openFolder((s) => board.add(s))}><FolderOpen />Folder</Button>
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-sidebar-foreground/60">
          Your name in commits
          <Input size="sm" value={name} placeholder="e.g. Dipak" onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && saveAuthor(name.trim())} />
        </label>
        <Button size="sm" variant={state.view === 'settings' ? 'secondary' : 'ghost'} className="justify-start" onClick={() => { state.select(null); state.setView('settings'); }}><Settings />Settings</Button>
      </div>
    </aside>
  );
}

/** The sidebar folded away: a thin rail that keeps the way back, and Settings, in reach. */
export function SidebarRail() {
  const state = useBoardContext();
  return (
    <aside className="flex w-12 shrink-0 flex-col items-center gap-1 bg-sidebar py-3 text-sidebar-foreground">
      <div className="mb-2 grid size-6 place-items-center rounded-md bg-primary text-primary-foreground"><KanbanSquare className="size-3.5" /></div>
      <Button size="icon-sm" variant="ghost" aria-label="Show the sidebar" title="Show the sidebar ([)" onClick={() => state.preferences.update({ sidebarOpen: true })}><PanelLeftOpen /></Button>
      <Button size="icon-sm" variant="ghost" aria-label="All tickets" title="All tickets" onClick={() => state.setScope({})}><Layers /></Button>
      <Button size="icon-sm" variant={state.view === 'settings' ? 'secondary' : 'ghost'} className="mt-auto" aria-label="Settings" title="Settings" onClick={() => { state.select(null); state.setView('settings'); }}><Settings /></Button>
    </aside>
  );
}
