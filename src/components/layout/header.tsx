import { BookOpen, KanbanSquare, Keyboard, List, Moon, Network, Plus, Search, Sun, UserRound, Users, Workflow } from 'lucide-react';
import { useBoardContext, type View } from '@/app/board-context';
import { useTheme } from '@/app/use-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/cn';
import { SprintSelector } from './sprint-selector';
import { ActiveFilters, FilterMenu } from './filter-bar';
import { Breadcrumbs, useGoToScope, useScopeCrumbs, type Crumb } from './breadcrumbs';

const VIEWS: { id: View; label: string; icon: typeof List }[] = [
  { id: 'next', label: "What's next", icon: Workflow },
  { id: 'board', label: 'Board', icon: KanbanSquare },
  { id: 'list', label: 'List', icon: List },
  { id: 'graph', label: 'Dependencies', icon: Network },
  { id: 'standup', label: 'Stand-up', icon: Users },
  { id: 'docs', label: 'Docs', icon: BookOpen },
];

export function Header() {
  const { scope, board, view, setView, search, setSearch, setDialog, inScope, mineOnly, setMineOnly, loadState } = useBoardContext();
  const { theme, toggle } = useTheme();
  const go = useGoToScope();
  const scopeCrumbs = useScopeCrumbs();
  const crumbs: Crumb[] = [{ label: board.workspaces.length > 1 ? 'All projects' : 'All tickets', title: 'Every ticket in every project', go: () => go({}) }, ...scopeCrumbs(scope)];

  return (
    <header className="flex flex-col gap-3 border-border border-b px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Breadcrumbs items={crumbs} />
          <span className="text-xs tabular-nums text-muted-foreground">{loadState.initial ? 'Loading…' : loadState.busy ? `${inScope.length} loaded` : inScope.length}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setDialog('search')} className="text-muted-foreground"><Search />Search<Kbd className="ml-1">⌘K</Kbd></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))}><Keyboard /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Toggle theme" onClick={toggle}>{theme === 'dark' ? <Sun /> : <Moon />}</Button>
          <Button size="sm" disabled={!loadState.hasLoaded} onClick={() => setDialog('new-ticket')}><Plus />New ticket</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)} className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors', view === v.id ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
              <v.icon className="size-3.5" />{v.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant={mineOnly ? 'secondary' : 'ghost'} className={cn('ml-auto', mineOnly ? '' : 'text-muted-foreground')} aria-pressed={mineOnly} title="Only tickets assigned to you (m)" onClick={() => setMineOnly((v) => !v)}><UserRound />Mine</Button>
        <SprintSelector />
        <FilterMenu />
        <Input size="sm" className="w-56" placeholder="Find in titles" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <ActiveFilters />
    </header>
  );
}
