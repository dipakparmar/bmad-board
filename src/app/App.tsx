import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Toaster } from 'sonner';
import { KanbanBoard } from '@/components/board/kanban-board';
import { GitHubDialog } from '@/components/dialogs/github-dialog';
import { NewTicketDialog } from '@/components/dialogs/new-ticket-dialog';
import { SearchCommand } from '@/components/dialogs/search-command';
import { AppSidebar, SidebarRail } from '@/components/layout/app-sidebar';
import { ShortcutsDialog } from '@/components/dialogs/shortcuts-dialog';
import { SettingsView } from '@/components/settings/settings-view';
import { EmptyState } from '@/components/layout/empty-state';
import { Header } from '@/components/layout/header';
import { ListView } from '@/components/list-view/list-view';
import { NextView } from '@/components/next/next-view';
import { StandupView } from '@/components/standup/standup-view';
import { GraphView } from '@/components/graph/graph-view';
import { TaskSheet, TicketPage } from '@/components/task/task-sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BoardProvider, useBoardContext } from './board-context';
import { useShortcuts } from './use-shortcuts';

function Notices() {
  const { board } = useBoardContext();
  const [hidden, setHidden] = useState<string[]>([]);
  const v6 = board.workspaces.filter((w) => w.tree?.layout === 'v6');
  const problems = board.workspaces.flatMap((w) => (w.tree?.problems ?? []).map((p) => `${w.store.label}: ${p}`));
  if (!v6.length && !problems.length) return null;
  return (
    <div className="flex flex-col gap-2 px-5 pt-3">
      {v6.map((w) => (
        hidden.includes(w.store.id) ? null : (
          <div key={w.store.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-1.5 text-xs" title={`${w.store.label} uses the BMAD v6 layout`}>
            <AlertTriangle className="size-3.5 shrink-0 text-warning" />
            <span className="min-w-0 truncate"><strong className="font-medium">v6 layout, read-only.</strong> Run <code>bmad migrate method</code> in <span className="font-mono">{w.store.label}</span> to edit tickets here.</span>
            <button type="button" aria-label="Dismiss" className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-warning/15" onClick={() => setHidden((h) => [...h, w.store.id])}><X className="size-3.5" /></button>
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
  const { board, view, expanded, selected, preferences } = state;
  const connected = board.workspaces.length > 0;
  const [help, setHelp] = useState(false);
  useShortcuts(state, useCallback(() => setHelp(true), []));
  return (
    <div className="flex h-dvh bg-sidebar">
      {preferences.prefs.sidebarOpen ? <AppSidebar /> : <SidebarRail />}
      <main className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xs">
        {connected && expanded && selected ? <TicketPage /> : connected ? (
          <>
            <Header />
            <Notices />
            <div className="min-h-0 flex-1 overflow-auto p-5">{view === 'board' ? <KanbanBoard /> : view === 'list' ? <ListView /> : view === 'standup' ? <StandupView /> : view === 'graph' ? <GraphView /> : view === 'settings' ? <SettingsView /> : <NextView />}</div>
          </>
        ) : <EmptyState />}
      </main>
      <TaskSheet />
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
