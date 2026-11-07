/** One commit: who made it and why, the tickets it touched, and the files it changed. */
import { ExternalLink, FileText, Layers } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useBoardContext } from '@/app/board-context';
import { ticketsTouched } from '@/app/touched';
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog';
import type { CommitDetail } from '@/store';
import { StateIcon } from '../board/chips';
import { actorOf } from '../next/activity-feed';
import { BranchLink, FileLink } from '../common/links';
import { usePaged } from '../common/show-more';

const STATUS: Record<string, string> = { A: 'added', D: 'deleted', M: 'changed', R: 'renamed', C: 'copied', T: 'changed' };

export function CommitDialog() {
  const { commit, closeCommit, board, tickets, select, setScope, setView } = useBoardContext();
  const store = board.workspaces.find((w) => w.store.id === commit?.workspaceId)?.store;
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDetail(null);
    setError(null);
    if (!commit || !store) return;
    let cancelled = false;
    store.commitDetail(commit.sha).then((d) => !cancelled && setDetail(d), (e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [commit, store]);
  const touched = useMemo(() => (detail ? ticketsTouched(detail.paths, tickets.filter((t) => t.workspaceId === commit?.workspaceId)) : null), [detail, tickets, commit]);
  const actor = detail ? actorOf(detail) : null;
  const { visible, more } = usePaged(touched?.tickets ?? [], 25);

  return (
    <Dialog open={!!commit} onOpenChange={(o) => !o && closeCommit()}>
      <DialogPopup className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-6">{detail?.subject ?? (error ? 'Commit not found' : 'Loading commit…')}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{commit?.sha.slice(0, 10)}</span>
            {detail && actor && <span>· {actor.name}{actor.agent ? ' (agent)' : ''} · {new Date(detail.date).toLocaleString()}</span>}
            {detail?.url && <a href={detail.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">· GitHub<ExternalLink className="size-3" /></a>}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-5">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {detail?.body && <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 font-sans text-xs text-muted-foreground">{detail.body}</pre>}
          {detail?.branches?.length ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs text-muted-foreground">On</span>
              {detail.branches.map((b) => <BranchLink key={b} workspaceId={commit?.workspaceId ?? ''} branch={b} />)}
            </div>
          ) : null}
          {touched && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tickets it touched · {touched.tickets.length + touched.containers.length}</h3>
              {touched.tickets.length === 0 && touched.containers.length === 0 && <p className="text-xs text-muted-foreground">None of the board's tickets.</p>}
              {touched.containers.map((c) => (
                <button key={c.key} type="button" onClick={() => { closeCommit(); select(null); setScope({ workspaceId: commit?.workspaceId, ...c.scope }); setView('board'); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                  <Layers className="size-3.5 text-muted-foreground" />
                  <span className="w-12 shrink-0 text-[11px] text-muted-foreground">{c.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{c.how}</span>
                </button>
              ))}
              {visible.map(({ ticket: t, how }) => (
                <button key={t.uid} type="button" onClick={() => { closeCommit(); select(t.uid); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                  <StateIcon state={t.leaf.state} className="size-3.5" />
                  <span className="w-12 shrink-0 truncate font-mono text-[11px] text-board-id">{t.ref}</span>
                  <span className="min-w-0 flex-1 truncate">{t.leaf.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{how.join(' and ')}</span>
                </button>
              ))}
              {more}
            </section>
          )}
          {detail && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Files · {detail.files.length}</h3>
              <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto" onClickCapture={() => closeCommit()}>
                {detail.files.slice(0, 300).map((f) => (
                  <li key={f.path}>
                    {f.status === 'D' ? (
                      <span className="flex items-center gap-2 px-2 py-1 font-mono text-[11px] text-muted-foreground line-through"><FileText className="size-3 shrink-0" /><span className="min-w-0 flex-1 truncate">{f.path}</span><span className="shrink-0 font-sans no-underline">deleted</span></span>
                    ) : (
                    <FileLink workspaceId={commit?.workspaceId ?? ''} path={f.path} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-[11px] text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground [&:is(a)]:hover:bg-accent">
                      <FileText className="size-3 shrink-0" /><span className="min-w-0 flex-1 truncate">{f.path}</span><span className="shrink-0 font-sans">{STATUS[f.status] ?? f.status}</span>
                    </FileLink>
                    )}
                  </li>
                ))}
                {detail.files.length > 300 && <li className="px-2 text-[11px] text-muted-foreground">+{detail.files.length - 300} more</li>}
              </ul>
            </section>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
