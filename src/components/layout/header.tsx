import { KanbanSquare, List, Moon, Network, Plus, Search, Sun, Users, Workflow } from 'lucide-react';
import { useBoardContext, type View } from '@/app/board-context';
import { useTheme } from '@/app/use-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/cn';

const VIEWS: { id: View; label: string; icon: typeof List }[] = [
  { id: 'next', label: "What's next", icon: Workflow },
  { id: 'board', label: 'Board', icon: KanbanSquare },
  { id: 'list', label: 'List', icon: List },
  { id: 'graph', label: 'Dependencies', icon: Network },
  { id: 'standup', label: 'Stand-up', icon: Users },
];

export function Header() {
  const { scope, board, view, setView, search, setSearch, setDialog, inScope } = useBoardContext();
  const { theme, toggle } = useTheme();
  const ws = board.workspaces.find((w) => w.store.id === scope.workspaceId);
  const initiative = ws?.tree?.initiatives.find((i) => i.slug === scope.initiative);
  const epic = initiative?.epics.find((e) => e.slug === scope.epic);
  const crumbs = [ws?.store.label ?? 'All projects', initiative?.title, scope.epic === 'backlog' ? 'Backlog' : epic?.title].filter(Boolean);

  return (
    <header className="flex flex-col gap-3 border-border border-b px-5 py-3">
      <div className="flex items-center gap-3">
        <nav className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => (
            <span key={`${c}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              <span className={cn('truncate', i === crumbs.length - 1 ? 'font-medium' : 'text-muted-foreground')}>{c}</span>
            </span>
          ))}
          <span className="ml-1 text-xs tabular-nums text-muted-foreground">{inScope.length}</span>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setDialog('search')} className="text-muted-foreground"><Search />Search<Kbd className="ml-1">⌘K</Kbd></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Toggle theme" onClick={toggle}>{theme === 'dark' ? <Sun /> : <Moon />}</Button>
          <Button size="sm" onClick={() => setDialog('new-ticket')}><Plus />New ticket</Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)} className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors', view === v.id ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
              <v.icon className="size-3.5" />{v.label}
            </button>
          ))}
        </div>
        <Input size="sm" className="ml-auto w-56" placeholder="Filter tickets" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
    </header>
  );
}
