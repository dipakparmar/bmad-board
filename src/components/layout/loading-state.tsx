import { Spinner } from '@/components/ui/spinner';

export function ProjectLoading({ labels = [] }: { labels?: string[] }) {
  return <div role="status" aria-live="polite" className="flex w-full flex-1 flex-col gap-6 p-6">
    <div className="flex items-center gap-3"><Spinner aria-hidden="true" className="size-5 text-primary" /><div><h2 className="text-sm font-medium">Loading {labels.length === 1 ? labels[0] : 'your projects'}</h2><p className="mt-1 text-xs text-muted-foreground">Reading tickets, owners and project details. Your board will appear when they are ready.</p></div></div>
    <div aria-hidden="true" className="grid flex-1 content-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((lane) => <div key={lane} className="rounded-xl bg-muted/40 p-3"><div className="mb-4 h-3 w-24 rounded bg-muted motion-safe:animate-pulse" />{[0, 1, 2].map((card) => <div key={card} className="mb-3 space-y-3 rounded-lg border border-border bg-background p-4 motion-safe:animate-pulse"><div className="h-2 w-12 rounded bg-muted" /><div className="h-3 w-4/5 rounded bg-muted" /><div className="h-3 w-2/3 rounded bg-muted" /></div>)}</div>)}
    </div>
  </div>;
}
