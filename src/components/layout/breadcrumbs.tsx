/**
 * Breadcrumbs: every segment is a link. Project, initiative and epic segments narrow the board to that
 * scope (closing any open ticket or document); other segments do what their `go` says.
 */
import { scopeBreadcrumbs, type Crumb } from '@/app/breadcrumbs';
export type { Crumb } from '@/app/breadcrumbs';
import { ChevronRight } from 'lucide-react';
import { useBoardContext, type Scope } from '@/app/board-context';
import { cn } from '@/lib/cn';

/** Shows the board at a scope: closes the open ticket or doc, and leaves views that don't list tickets. */
export function useGoToScope() {
  const { setScope, select, setExpanded, view, setView, setDoc } = useBoardContext();
  return (scope: Scope) => {
    select(null);
    setExpanded(false);
    setScope(scope);
    if (view === 'docs' || view === 'settings') {
      setDoc(null);
      setView('board');
    }
  };
}

/** Crumbs for a project, initiative and epic, each going to that scope. */
export function useScopeCrumbs() {
  const { board } = useBoardContext();
  const go = useGoToScope();
  return (scope: Scope): Crumb[] => {
    const ws = board.workspaces.find((w) => w.store.id === scope.workspaceId);
    return scopeBreadcrumbs(ws, scope, go);
  };
}

export function Breadcrumbs({ items, className, size = 'sm' }: { items: Crumb[]; className?: string; size?: 'sm' | 'xs' }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className={cn('flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5', size === 'sm' ? 'text-sm' : 'text-xs')}>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 max-w-full items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/50" />}
              <button
                type="button"
                title={c.title ?? c.label}
                aria-current={last ? 'page' : undefined}
                onClick={c.go}
                className={cn('min-w-0 whitespace-normal break-words rounded px-1 py-0.5 text-left [overflow-wrap:anywhere] underline-offset-2 hover:bg-accent hover:text-foreground hover:underline', last ? 'font-medium text-foreground' : 'text-muted-foreground', c.className)}
              >
                {c.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
