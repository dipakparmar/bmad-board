/** Commits that touched ticket files: what agents and people changed, newest first (Kaneo's activity feed). */
import { Bot, GitCommit, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBoardContext } from '@/app/board-context';
import type { Activity } from '@/store';

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function actorOf(a: Activity): { name: string; agent: boolean } {
  if (a.changedBy) {
    const [kind, ...name] = a.changedBy.split(':');
    return { name: name.join(':') || a.author, agent: kind === 'agent' };
  }
  return { name: a.author, agent: /agent|claude|bot|\[bot\]/i.test(a.author) };
}

export function ActivityList({ items, empty = 'No commits yet.' }: { items: Activity[]; empty?: string }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {items.map((a) => {
        const actor = actorOf(a);
        const Icon = actor.agent ? Bot : a.changedBy ? UserRound : GitCommit;
        return (
          <li key={a.sha} className="flex gap-2.5 text-xs">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate text-foreground/90">{a.subject}</div>
              <div className="text-muted-foreground">
                {actor.name} · {ago(a.date)} · {a.url ? <a className="font-mono hover:underline" href={a.url} target="_blank" rel="noreferrer">{a.sha.slice(0, 7)}</a> : <span className="font-mono">{a.sha.slice(0, 7)}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** History of a set of paths in one workspace; reloads when its tree reloads. */
export function useHistory(workspaceId: string | undefined, paths: string[], limit = 20) {
  const { board } = useBoardContext();
  const ws = board.workspaces.find((w) => w.store.id === workspaceId);
  const tree = ws?.tree;
  const key = paths.join('|');
  const [items, setItems] = useState<Activity[] | null>(null);
  useEffect(() => {
    if (!ws) return;
    let cancelled = false;
    const wanted = key.split('|').filter(Boolean);
    void Promise.all(wanted.map((p) => ws.store.history(p, limit).catch(() => [] as Activity[]))).then((lists) => {
      if (cancelled) return;
      const seen = new Map<string, Activity>();
      for (const a of lists.flat()) if (!seen.has(a.sha)) seen.set(a.sha, a);
      setItems([...seen.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit));
    });
    return () => {
      cancelled = true;
    };
  }, [ws, tree, key, limit]);
  return items;
}
