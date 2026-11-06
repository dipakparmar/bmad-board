import { AlertTriangle } from 'lucide-react';
import { Toaster } from 'sonner';
import { KanbanBoard } from '@/components/board/kanban-board';
import { GitHubDialog } from '@/components/dialogs/github-dialog';
import { NewTicketDialog } from '@/components/dialogs/new-ticket-dialog';
import { SearchCommand } from '@/components/dialogs/search-command';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { EmptyState } from '@/components/layout/empty-state';
import { Header } from '@/components/layout/header';
import { ListView } from '@/components/list-view/list-view';
import { NextView } from '@/components/next/next-view';
import { StandupView } from '@/components/standup/standup-view';
import { TaskSheet } from '@/components/task/task-sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BoardProvider, useBoardContext } from './board-context';

function Notices() {
  const { board } = useBoardContext();
  const v6 = board.workspaces.filter((w) => w.tree?.layout === 'v6');
  const problems = board.workspaces.flatMap((w) => (w.tree?.problems ?? []).map((p) => `${w.store.label}: ${p}`));
  if (!v6.length && !problems.length) return null;
  return (
    <div className="flex flex-col gap-2 px-5 pt-3">
      {v6.map((w) => (
        <div key={w.store.id} className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs">
          <strong>{w.store.label}</strong> uses the BMAD v6 layout, so it is read-only here. Run <code>bmad migrate method</code> to move it to the ticket tree.
        </div>
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
  const { board, view } = useBoardContext();
  const connected = board.workspaces.length > 0;
  return (
    <div className="flex h-dvh bg-sidebar">
      <AppSidebar />
      <main className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xs">
        {connected ? (
          <>
            <Header />
            <Notices />
            <div className="min-h-0 flex-1 overflow-auto p-5">{view === 'board' ? <KanbanBoard /> : view === 'list' ? <ListView /> : view === 'standup' ? <StandupView /> : <NextView />}</div>
          </>
        ) : <EmptyState />}
      </main>
      <TaskSheet />
      <GitHubDialog />
      <NewTicketDialog />
      <SearchCommand />
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
