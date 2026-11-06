/** Projects → initiatives → epics, like Kaneo's workspace/project sidebar. */
import { FolderOpen, Github, Inbox, KanbanSquare, Layers, LogOut, RefreshCw, Server, Target } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useBoardContext, type Scope } from '@/app/board-context';
import { loadAuthor, saveAuthor, type Workspace } from '@/app/use-board';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { BrowserFolderSource } from '@/store';
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
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
        <NavItem active={is({})} onClick={() => setScope({})} icon={Layers} label="All tickets" count={tickets.length ? count(() => true) : undefined} />
        {board.workspaces.map((w) => {
          const Icon = sourceIcon(w);
          return (
            <div key={w.store.id} className="mt-4">
              <div className="group flex h-7 items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/60">
                <Icon className="size-3.5" />
                <button type="button" className="truncate hover:text-sidebar-foreground" onClick={() => setScope({ workspaceId: w.store.id })}>{w.store.label}</button>
                <span className="ml-auto rounded bg-sidebar-accent px-1 py-px text-[10px] normal-case tracking-normal">{w.tree?.layout === 'v6' ? 'v6 · read-only' : w.store.capabilities.pullRequests ? 'PR' : w.store.capabilities.write ? 'git' : 'read-only'}</span>
                <Menu>
                  <MenuTrigger render={<button type="button" aria-label={`${w.store.label} options`} className="rounded px-1 opacity-0 hover:bg-sidebar-accent group-hover:opacity-100 focus-visible:opacity-100">···</button>} />
                  <MenuPopup align="end">
                    <MenuItem onClick={() => void board.reload(w.store)}><RefreshCw />Reload</MenuItem>
                    <MenuSeparator />
                    <MenuItem onClick={() => { board.remove(w.store.id); setScope({}); }}><LogOut />Disconnect</MenuItem>
                  </MenuPopup>
                </Menu>
              </div>
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
      </div>
    </aside>
  );
}
