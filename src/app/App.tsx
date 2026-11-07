import { AlertTriangle, Info, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Toaster } from 'sonner';
import { KanbanBoard } from '@/components/board/kanban-board';
import { GitHubDialog } from '@/components/dialogs/github-dialog';
import { NewTicketDialog } from '@/components/dialogs/new-ticket-dialog';
import { SearchCommand } from '@/components/dialogs/search-command';
import { AppSidebar, SidebarRail } from '@/components/layout/app-sidebar';
import { ShortcutsDialog } from '@/components/dialogs/shortcuts-dialog';
import { SettingsView } from '@/components/settings/settings-view';
import { DocsView } from '@/components/docs/docs-view';
import { ProjectLoading } from '@/components/layout/loading-state';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/layout/empty-state';
import { Header } from '@/components/layout/header';
import { ListView } from '@/components/list-view/list-view';
import { NextView } from '@/components/next/next-view';
import { StandupView } from '@/components/standup/standup-view';
import { GraphView } from '@/components/graph/graph-view';
import { TaskSheet, TicketPage } from '@/components/task/task-sheet';
import { CommitDialog } from '@/components/commit/commit-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BoardProvider, useBoardContext } from './board-context';
import { useShortcuts } from './use-shortcuts';

const V6_NOTICE_KEY = 'bmad-board:v6-notice-hidden';

function Notices() {
  const { board } = useBoardContext();
  const [hidden, setHiddenState] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(V6_NOTICE_KEY) ?? '[]') as string[]; } catch { return []; }
  });
  const setHidden = (f: (h: string[]) => string[]) => setHiddenState((h) => {
    const next = f(h);
    try { localStorage.setItem(V6_NOTICE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });
  const v6 = board.workspaces.filter((w) => w.tree?.layout === 'v6');
  const problems = board.workspaces.flatMap((w) => (w.tree?.problems ?? []).map((p) => `${w.store.label}: ${p}`));
  if (!v6.length && !problems.length) return null;
  return (
    <div className="flex flex-col gap-2 px-5 pt-3">
      {v6.map((w) => (
        hidden.includes(w.store.id) ? null : (
          <div key={w.store.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground" title={`${w.store.label} uses the BMAD v6 layout. \`bmad migrate method\` moves it to the ticket tree, if you ever want to.`}>
            <Info className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate"><strong className="font-medium text-foreground">v6 sprint{w.tree?.sprint?.project ? ` · ${w.tree.sprint.project}` : ''}.</strong>{w.tree?.sprint?.lastUpdated || w.tree?.sprint?.generated ? ` Updated ${w.tree.sprint.lastUpdated ?? w.tree.sprint.generated}.` : ''} Edits are written to sprint-status.yaml and story files the way v6 writes them.</span>
            <button type="button" aria-label="Dismiss" className="ml-auto shrink-0 rounded p-0.5 hover:bg-accent" onClick={() => setHidden((h) => [...h, w.store.id])}><X className="size-3.5" /></button>
          </div>
        )
      ))}
      {problems.length > 0 && (
        <details className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer"><AlertTriangle className="mr-1 inline size-3.5 text-warning" />{problems.length} issue{problems.length === 1 ? '' : 's'} reading the tree</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

function Shell() {
  const state = useBoardContext();
  const { board, view, expanded, selected, preferences, loadState, inScope } = state;
  const waitingForData = loadState.initial || (loadState.busy && !inScope.length && view !== 'settings');
  const connected = board.workspaces.length > 0;
  const [help, setHelp] = useState(false);
  useShortcuts(state, useCallback(() => setHelp(true), []));
  return (
    <div className="flex h-dvh bg-sidebar">
      {/* On a phone the sidebar would take the whole screen, so it starts folded there. */}
      {preferences.prefs.sidebarOpen ? (
        <>
          <div className="contents max-md:hidden"><AppSidebar /></div>
          <div className="contents md:hidden"><SidebarRail /></div>
        </>
      ) : <SidebarRail />}
      <main className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xs">
        {connected && expanded && selected ? <TicketPage /> : connected ? (
          <>
            <Header />
            <Notices />
            {loadState.busy && !waitingForData && <div role="status" className="flex items-center gap-2 px-5 pt-3 text-xs text-muted-foreground"><Spinner aria-hidden="true" className="size-3.5" />Updating project data. Showing the tickets already loaded.</div>}
            <div aria-busy={loadState.busy} className="min-h-0 flex-1 overflow-auto p-5">{waitingForData ? <ProjectLoading labels={loadState.pending.map((w) => w.store.label)} /> : loadState.failed ? <div role="alert" className="rounded-lg border border-destructive/30 p-5"><h2 className="text-sm font-medium">Could not load project data</h2>{loadState.errors.map((w) => <div key={w.store.id} className="mt-3 text-sm"><p>{w.store.label}: {w.error}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => { const workspace = board.workspaces.find((item) => item.store.id === w.store.id); if (workspace) void board.reload(workspace.store); }}>Try again</Button></div>)}</div> : view === 'board' ? <KanbanBoard /> : view === 'list' ? <ListView /> : view === 'standup' ? <StandupView /> : view === 'graph' ? <GraphView /> : view === 'settings' ? <SettingsView /> : view === 'docs' ? <DocsView /> : <NextView />}</div>
          </>
        ) : board.initializing ? <ProjectLoading /> : <EmptyState />}
      </main>
      <TaskSheet />
      <CommitDialog />
      <GitHubDialog />
      <NewTicketDialog />
      <SearchCommand />
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <BoardProvider>
        <Shell />
        <Toaster position="bottom-right" richColors closeButton />
      </BoardProvider>
    </TooltipProvider>
  );
}
