/**
 * Dependency graph: tickets laid out left to right by what they wait on. Hover a ticket to light up its
 * chain (what it waits on, and what waits on it); click to open it.
 */
import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBoardContext } from '@/app/board-context';
import type { Ticket } from '@/app/view-model';
import { dependencyGraph, downstreamOf, statusLabel, upstreamOf, type TicketKey } from '@/domain';
import { cn } from '@/lib/cn';
import { Assignee, StateIcon } from '../board/chips';

const W = 232;
const H = 68;
const GAP_X = 72;
const GAP_Y = 14;
const PAD = 16;

const READY_RING: Partial<Record<Ticket['readiness'], string>> = {
  ready: 'border-success/50',
  blocked: 'border-destructive/40',
  refine: 'border-info/40',
};

export function GraphView() {
  const { inScope, select, board, scope } = useBoardContext();
  const [linkedOnly, setLinkedOnly] = useState(true);
  const [hover, setHover] = useState<TicketKey | null>(null);

  // One project at a time: keys are only unique within a project.
  const wsId = scope.workspaceId ?? board.workspaces[0]?.store.id;
  const items = inScope.filter((t) => t.workspaceId === wsId);
  const g = useMemo(() => dependencyGraph(items, { connectedOnly: linkedOnly }), [items, linkedOnly]);

  const layerOf = new Map(g.nodes.map((n) => [n.key, n.layer]));
  const pos = new Map(g.nodes.map((n) => [n.key, { x: PAD + n.layer * (W + GAP_X), y: PAD + n.row * (H + GAP_Y) }]));
  const width = PAD * 2 + Math.max(1, g.layers) * (W + GAP_X) - GAP_X;
  const height = PAD * 2 + Math.max(1, ...g.nodes.map((n) => n.row + 1)) * (H + GAP_Y);

  const lit = useMemo(() => {
    if (!hover) return null;
    return new Set([hover, ...upstreamOf(hover, g.edges), ...downstreamOf(hover, g.edges)]);
  }, [hover, g.edges]);

  const multi = board.workspaces.length > 1 && !scope.workspaceId;

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} />Only tickets with dependencies</label>
        <span className="flex items-center gap-1.5"><svg width="28" height="6" aria-hidden><line x1="0" y1="3" x2="28" y2="3" className="stroke-muted-foreground" strokeWidth="1.5" /></svg>waits on</span>
        <span className="flex items-center gap-1.5"><svg width="28" height="6" aria-hidden><line x1="0" y1="3" x2="28" y2="3" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="4 3" /></svg>epic gate (waits for the whole epic)</span>
        <span>Left to right is build order. Hover a ticket to trace its chain.</span>
        {multi && <span className="text-warning">Showing {board.workspaces[0]?.store.label}; pick a project in the sidebar for another.</span>}
      </div>
      {g.cyclic.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="size-3.5" />These tickets wait on each other in a loop, so none can start: {g.cyclic.join(', ')}</p>
      )}
      {g.nodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dependencies here. Tickets get them from <code>after</code> in tickets.toml or a story's front matter.</p>
      ) : (
        <div className="overflow-auto rounded-xl border border-border bg-board-lane">
          <div className="relative" style={{ width, height }}>
            <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" className="fill-muted-foreground" /></marker>
                <marker id="arrow-lit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" className="fill-primary" /></marker>
              </defs>
              {g.edges.map((e) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + W;
                const y1 = a.y + H / 2;
                const x2 = b.x - 2;
                const y2 = b.y + H / 2;
                const mid = (x1 + x2) / 2;
                // An edge that skips columns would run behind the cards between; send it along the gap
                // under the lower of its two rows instead.
                const skips = (layerOf.get(e.to) ?? 0) - (layerOf.get(e.from) ?? 0) > 1;
                const yc = Math.max(a.y, b.y) + H + GAP_Y / 2;
                const r = 10;
                const d = skips
                  ? `M${x1},${y1} C${x1 + GAP_X / 2},${y1} ${x1 + GAP_X / 2 - r},${yc} ${x1 + GAP_X / 2 + r},${yc} L${x2 - GAP_X / 2 - r},${yc} C${x2 - GAP_X / 2 + r},${yc} ${x2 - GAP_X / 2},${y2} ${x2},${y2}`
                  : `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
                const on = lit ? lit.has(e.from) && lit.has(e.to) : false;
                return (
                  <path
                    key={`${e.from}>${e.to}`}
                    d={d}
                    fill="none"
                    strokeWidth={on ? 2 : 1.25}
                    strokeDasharray={e.kind === 'gate' ? '5 4' : undefined}
                    markerEnd={on ? 'url(#arrow-lit)' : 'url(#arrow)'}
                    className={cn(on ? 'stroke-primary' : 'stroke-muted-foreground/60', lit && !on && 'opacity-25')}
                  />
                );
              })}
            </svg>
            {g.nodes.map((n) => {
              const t = n.item;
              const p = pos.get(n.key);
              if (!p) return null;
              return (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => select(t.uid)}
                  onMouseEnter={() => setHover(n.key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(n.key)}
                  onBlur={() => setHover(null)}
                  style={{ left: p.x, top: p.y, width: W, height: H }}
                  className={cn(
                    'absolute flex flex-col justify-between rounded-[10px] border bg-board-card px-3 py-2 text-left shadow-board-card transition-opacity hover:border-board-card-border-hover',
                    READY_RING[t.readiness] ?? 'border-board-card-border',
                    n.key === hover && 'ring-2 ring-primary/40',
                    lit && !lit.has(n.key) && 'opacity-35',
                    g.cyclic.includes(n.key) && 'border-destructive',
                    t.leaf.state === 'done' && 'opacity-70',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <StateIcon state={t.leaf.state} className="size-3.5 shrink-0" />
                    <span className="font-mono text-[11px] text-board-id">{t.ref}</span>
                    <span className="ml-auto truncate text-[11px] text-muted-foreground">{statusLabel(t.leaf.status)}</span>
                    <Assignee name={t.leaf.plan?.assignee} className="size-4" />
                  </span>
                  <span className="truncate text-[13px] font-medium">{t.leaf.title}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{t.epic?.title ?? (t.leaf.folder === 'backlog' ? 'Backlog' : '')}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
