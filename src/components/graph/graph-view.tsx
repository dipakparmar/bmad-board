/**
 * Dependency graph on React Flow, laid out left to right in build order by dagre. Hover a ticket to light
 * up its chain; click to open it. Where the project is writable, drag from a ticket's right edge to
 * another ticket to make that one wait on it, or select an arrow and press Delete (or its ×) to remove it.
 * Both are commits to tickets.toml, like every other change on the board.
 */
import dagre from '@dagrejs/dagre';
import {
  Background,
  BaseEdge,
  type Connection,
  Controls,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Crosshair, Layers, Maximize2, Minimize2, X } from 'lucide-react';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { applyWithToast } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import { useTheme } from '@/app/use-theme';
import type { Ticket } from '@/app/view-model';
import { afterWith, afterWithout, cannotLink, dependencyGraph, downstreamOf, epicGraph, neighbourhood, statusLabel, upstreamOf, type EpicEdge, type EpicNode, type GraphEdge } from '@/domain';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Assignee, StateIcon } from '../board/chips';

const W = 232;
const H = 72;

// Past this many tickets the graph opens on epics; past the second it will not lay out tickets at all.
const EPIC_VIEW_ABOVE = 300;
const MAX_TICKETS = 900;
const EW = 260;
const EH = 84;

const READY_RING: Partial<Record<Ticket['readiness'], string>> = {
  ready: 'border-success/50',
  blocked: 'border-destructive/40',
  refine: 'border-info/40',
};

type TicketNodeData = { ticket: Ticket; dim: boolean; hot: boolean; cyclic: boolean; editable: boolean };
type TicketNode = Node<TicketNodeData, 'ticket'>;
type EpicNodeData = { epic: EpicNode<Ticket>; title: string; ref: string; dim: boolean; hot: boolean };
type EpicFlowNode = Node<EpicNodeData, 'epic'>;
type AnyNode = TicketNode | EpicFlowNode;
type Point = { x: number; y: number };
type DepEdgeData = { kind: GraphEdge['kind']; lit: boolean; dim: boolean; removable: boolean; via?: Point[]; count?: number };
type DepEdge = Edge<DepEdgeData, 'dep'>;

/** Removing an edge is a commit, so the edge's × reaches back to the view through this. */
const RemoveEdge = createContext<(id: string) => void>(() => {});

const TicketCard = memo(function TicketCard({ data }: NodeProps<TicketNode>) {
  const t = data.ticket;
  return (
    <div
      style={{ width: W, height: H }}
      className={cn(
        'flex cursor-pointer flex-col justify-between rounded-[10px] border bg-board-card px-3 py-2 text-left shadow-board-card transition-opacity hover:border-board-card-border-hover',
        READY_RING[t.readiness] ?? 'border-board-card-border',
        data.hot && 'ring-2 ring-primary/40',
        data.dim && 'opacity-35',
        data.cyclic && 'border-destructive',
        t.leaf.state === 'done' && !data.dim && 'opacity-70',
      )}
    >
      <Handle type="target" position={Position.Left} isConnectable={data.editable} className="!size-2 !border-background !bg-muted-foreground/60" />
      <span className="flex items-center gap-1.5">
        <StateIcon state={t.leaf.state} className="size-3.5 shrink-0" />
        <span className="font-mono text-[11px] text-board-id">{t.ref}</span>
        <span className="ml-auto truncate text-[11px] text-muted-foreground">{statusLabel(t.leaf.status)}</span>
        <Assignee name={t.leaf.plan?.assignee} className="size-4" />
      </span>
      <span className="truncate text-[13px] font-medium">{t.leaf.title}</span>
      <span className="truncate text-[11px] text-muted-foreground">{t.epic?.title ?? (t.leaf.folder === 'backlog' ? 'Backlog' : '')}</span>
      <Handle type="source" position={Position.Right} isConnectable={data.editable} className={cn('!size-2.5 !border-background', data.editable ? '!bg-primary' : '!bg-muted-foreground/60')} />
    </div>
  );
});

function DependencyEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd }: EdgeProps<DepEdge>) {
  const remove = useContext(RemoveEdge);
  // dagre routes long edges between the cards in the columns they cross; follow its bends when we have them.
  const path = data?.via?.length ? smoothPath([{ x: sourceX, y: sourceY }, ...data.via, { x: targetX, y: targetY }]) : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })[0];
  // The × sits just before the arrowhead, in the gap between columns, where no card can cover it.
  const lx = targetX - 24;
  const ly = targetY;
  const on = data?.lit || selected;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ strokeWidth: on ? 2 : 1.25, strokeDasharray: data ? EDGE_DASH[data.kind] : undefined, opacity: data?.dim ? 0.2 : data?.kind === 'order' && !on ? 0.55 : 1 }}
        className={on ? '!stroke-primary' : data ? EDGE_STROKE[data.kind] : ''}
      />
      {!!data?.count && data.count > 1 && (
        <EdgeLabelRenderer>
          <span style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, opacity: data.dim ? 0.3 : 1 }} className="pointer-events-none absolute rounded-full border border-border bg-background px-1 text-[10px] tabular-nums text-muted-foreground">{data.count}</span>
        </EdgeLabelRenderer>
      )}
      {selected && data?.removable && (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label="Remove this dependency"
            title="Remove this dependency"
            onClick={() => remove(id)}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            className="nodrag nopan pointer-events-auto absolute grid size-5 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-xs hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const EDGE_DASH: Record<GraphEdge['kind'], string | undefined> = { after: undefined, gate: '6 4', noted: undefined, order: '1.5 4' };
const EDGE_STROKE: Record<GraphEdge['kind'], string> = {
  after: '!stroke-muted-foreground/70', gate: '!stroke-muted-foreground/70', noted: '!stroke-info', order: '!stroke-muted-foreground/60',
};

const SAMPLE_STROKE: Record<GraphEdge['kind'], string> = {
  after: 'stroke-muted-foreground', gate: 'stroke-muted-foreground', noted: 'stroke-info', order: 'stroke-muted-foreground/60',
};

function EdgeSample({ kind }: { kind: GraphEdge['kind'] }) {
  return <svg width="28" height="6" aria-hidden><line x1="0" y1="3" x2="28" y2="3" className={SAMPLE_STROKE[kind]} strokeWidth="1.5" strokeDasharray={EDGE_DASH[kind]} strokeLinecap="round" /></svg>;
}

/** A curve through `pts`: straight runs joined by rounded bends, flat where it leaves and enters a card. */
function smoothPath(pts: Point[]): string {
  const [first, ...rest] = pts;
  if (!first) return '';
  let d = `M${first.x},${first.y}`;
  let prev = first;
  for (const p of rest) {
    const mx = (prev.x + p.x) / 2;
    d += ` C${mx},${prev.y} ${mx},${p.y} ${p.x},${p.y}`;
    prev = p;
  }
  return d;
}

const EpicCard = memo(function EpicCard({ data }: NodeProps<EpicFlowNode>) {
  const items = data.epic.items;
  const done = items.filter((t) => t.leaf.state === 'done').length;
  const blocked = items.filter((t) => t.readiness === 'blocked').length;
  const active = items.filter((t) => t.leaf.state === 'in-progress' || t.leaf.state === 'review').length;
  return (
    <div style={{ width: EW, height: EH }} className={cn('flex cursor-pointer flex-col justify-between rounded-[10px] border border-board-card-border bg-board-card px-3 py-2 shadow-board-card transition-opacity hover:border-board-card-border-hover', data.hot && 'ring-2 ring-primary/40', data.dim && 'opacity-35')}>
      <Handle type="target" position={Position.Left} isConnectable={false} className="!size-2 !border-background !bg-muted-foreground/60" />
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Layers className="size-3.5" /><span className="font-mono text-board-id">{data.ref}</span><span className="ml-auto tabular-nums">{done}/{items.length} done</span></span>
      <span className="truncate text-[13px] font-medium">{data.title}</span>
      <span className="flex items-center gap-2 text-[11px]">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-success" style={{ width: `${(done / Math.max(items.length, 1)) * 100}%` }} /></span>
        {active > 0 && <span className="text-info">{active} active</span>}
        {blocked > 0 && <span className="text-destructive">{blocked} blocked</span>}
      </span>
      <Handle type="source" position={Position.Right} isConnectable={false} className="!size-2 !border-background !bg-muted-foreground/60" />
    </div>
  );
});

const nodeTypes = { ticket: TicketCard, epic: EpicCard };
const edgeTypes = { dep: DependencyEdge };

/** dagre's layout, plus the bend points it routes each edge through. */
function layout(nodes: { key: string; w: number; h: number }[], edges: { from: string; to: string }[]): { at: Map<string, Point>; via: Map<string, Point[]> } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 72, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.key, { width: n.w, height: n.h });
  for (const e of edges) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const size = new Map(nodes.map((n) => [n.key, n]));
  const at = new Map(nodes.map((n) => {
    const p = g.node(n.key);
    return [n.key, { x: p.x - (size.get(n.key)?.w ?? W) / 2, y: p.y - (size.get(n.key)?.h ?? H) / 2 }];
  }));
  // Inner bend points only: the first and last sit on the card edges, where the handles already are.
  const via = new Map(edges.map((e) => [`${e.from}>${e.to}`, (g.edge(e.from, e.to)?.points ?? []).slice(1, -1).map((p: Point) => ({ x: p.x, y: p.y }))]));
  return { at, via };
}

type Mode = 'auto' | 'tickets' | 'epics';
const DEPTHS = [1, 2, 3, 99] as const;

function Graph() {
  const state = useBoardContext();
  const { inScope, select, board, scope } = state;
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const [linkedOnly, setLinkedOnly] = useState(true);
  const [showOrder, setShowOrder] = useState(false);
  const [showNoted, setShowNoted] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  /** A ticket whose neighbourhood is shown, or an epic opened from the epic view. */
  // The focus lives in the URL, so Back returns from an epic or a ticket's neighbourhood.
  const { graphFocus, setGraphFocus } = useBoardContext();
  const focus = useMemo(() => {
    const m = /^(ticket|epic):(.+)$/.exec(graphFocus ?? '');
    return m ? { kind: m[1] as 'ticket' | 'epic', key: m[2] ?? '' } : null;
  }, [graphFocus]);
  const setFocus = useCallback((f: { key: string; kind: 'ticket' | 'epic' } | null) => setGraphFocus(f ? `${f.kind}:${f.key}` : null), [setGraphFocus]);
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]>(2);
  const [full, setFull] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  // One project at a time: keys are only unique within a project.
  const wsId = scope.workspaceId ?? board.workspaces[0]?.store.id;
  const ws = board.workspaces.find((w) => w.store.id === wsId);
  const editable = !!ws && ws.store.capabilities.write && ws.tree?.layout !== 'v6' && ws.tree?.tracker === 'repo';
  const items = useMemo(() => inScope.filter((t) => t.workspaceId === wsId), [inScope, wsId]);
  const byKey = useMemo(() => new Map(items.map((t) => [t.leaf.key, t])), [items]);
  const opts = { order: showOrder, noted: showNoted };
  const whole = useMemo(() => dependencyGraph(items, { connectedOnly: linkedOnly, order: showOrder, noted: showNoted }), [items, linkedOnly, showOrder, showNoted]);

  // What to draw: a focused neighbourhood or epic, else everything, as tickets or (when big) as epics.
  const shown = useMemo(() => {
    if (focus?.kind === 'ticket') {
      const keep = neighbourhood(focus.key, dependencyGraph(items, opts).edges, depth);
      return items.filter((t) => keep.has(t.leaf.key));
    }
    if (focus?.kind === 'epic') {
      const inEpic = new Set(items.filter((t) => t.leaf.folder === focus.key).map((t) => t.leaf.key));
      const edges = dependencyGraph(items, opts).edges;
      // The epic's tickets, plus the tickets elsewhere they link to directly.
      const keep = new Set(inEpic);
      for (const e of edges) {
        if (inEpic.has(e.to)) keep.add(e.from);
        if (inEpic.has(e.from)) keep.add(e.to);
      }
      return items.filter((t) => keep.has(t.leaf.key));
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, items, depth, showOrder, showNoted]);
  const g = useMemo(() => (shown ? dependencyGraph(shown, { order: showOrder, noted: showNoted }) : whole), [shown, whole, showOrder, showNoted]);
  const epicsView = !focus && (mode === 'epics' || (mode === 'auto' && g.nodes.length > EPIC_VIEW_ABOVE) || g.nodes.length > MAX_TICKETS);
  const eg = useMemo(() => (epicsView ? epicGraph(items, dependencyGraph(items, opts).edges) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [epicsView, items, showOrder, showNoted]);

  const pos = useMemo(() => (eg
    ? layout(eg.nodes.map((n) => ({ key: n.folder, w: EW, h: EH })), eg.edges)
    : layout(g.nodes.map((n) => ({ key: n.key, w: W, h: H })), g.edges)), [g, eg]);

  const lit = useMemo(() => {
    if (!hover) return null;
    const edges: { from: string; to: string }[] = eg ? eg.edges : g.edges;
    return new Set([hover, ...upstreamOf(hover, edges as GraphEdge[]), ...downstreamOf(hover, edges as GraphEdge[])]);
  }, [hover, g.edges, eg]);

  // Positions only come from the layout: moving a card is a view thing and is not saved.
  const [dragged, setDragged] = useState<Map<string, { x: number; y: number }>>(new Map());
  // Controlled nodes must carry their measured size back, or React Flow never draws the edges.
  const [picked, setPicked] = useState<string | null>(null);
  const [measured, setMeasured] = useState<Map<string, { width: number; height: number }>>(new Map());
  useEffect(() => setDragged(new Map()), [pos]);
  useEffect(() => {
    const id = requestAnimationFrame(() => void fitView({ padding: 0.15, maxZoom: 1, duration: 200 }));
    return () => cancelAnimationFrame(id);
  }, [pos, fitView, full]);

  // Full screen: the graph covers the app, and the browser's own full screen when allowed.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    const onChange = () => !document.fullscreenElement && setFull(false);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onChange);
    void frame.current?.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [full]);

  const epicMeta = useMemo(() => {
    const m = new Map<string, { title: string; ref: string }>();
    for (const t of items) if (!m.has(t.leaf.folder)) m.set(t.leaf.folder, { title: t.epic?.title ?? (t.leaf.folder === 'backlog' ? 'Backlog' : t.initiative?.title ?? t.leaf.folder), ref: t.epic?.id !== undefined ? `E${t.epic.id}` : '' });
    return m;
  }, [items]);

  const nodes: AnyNode[] = eg
    ? eg.nodes.map((n): EpicFlowNode => ({
        id: n.folder, type: 'epic', position: dragged.get(n.folder) ?? pos.at.get(n.folder) ?? { x: 0, y: 0 }, measured: measured.get(n.folder),
        data: { epic: n, title: epicMeta.get(n.folder)?.title ?? n.folder, ref: epicMeta.get(n.folder)?.ref ?? '', dim: !!lit && !lit.has(n.folder), hot: n.folder === hover },
      }))
    : g.nodes.map((n): TicketNode => ({
        id: n.key, type: 'ticket', position: dragged.get(n.key) ?? pos.at.get(n.key) ?? { x: 0, y: 0 }, measured: measured.get(n.key),
        data: { ticket: n.item, dim: !!lit && !lit.has(n.key), hot: n.key === hover || (focus?.kind === 'ticket' && focus.key === n.key), cyclic: g.cyclic.includes(n.key), editable },
      }));
  const edges: DepEdge[] = eg
    ? eg.edges.map((e: EpicEdge) => {
        const on = !!lit && lit.has(e.from) && lit.has(e.to);
        const kind: GraphEdge['kind'] = e.kinds.includes('after') ? 'after' : e.kinds.includes('gate') ? 'gate' : e.kinds.includes('noted') ? 'noted' : 'order';
        return {
          id: `${e.from}>${e.to}`, source: e.from, target: e.to, type: 'dep', selectable: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: on ? 'var(--primary)' : 'var(--muted-foreground)' },
          data: { kind, count: e.count, lit: on, dim: !!lit && !on, removable: false, via: dragged.has(e.from) || dragged.has(e.to) ? undefined : pos.via.get(`${e.from}>${e.to}`) },
        };
      })
    : g.edges.map((e) => {
        const on = !!lit && lit.has(e.from) && lit.has(e.to);
        return {
          id: `${e.from}>${e.to}`, source: e.from, target: e.to, type: 'dep',
          selected: picked === `${e.from}>${e.to}`,
          selectable: editable && e.kind === 'after',
          deletable: editable && e.kind === 'after',
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: on ? 'var(--primary)' : 'var(--muted-foreground)' },
          data: { kind: e.kind, lit: on, dim: !!lit && !on, removable: editable && e.kind === 'after', via: dragged.has(e.from) || dragged.has(e.to) ? undefined : pos.via.get(`${e.from}>${e.to}`) },
        };
      });

  const connect = useCallback((c: Connection) => {
    const prereq = byKey.get(c.source);
    const target = byKey.get(c.target);
    if (!prereq || !target || !wsId) return;
    const why = cannotLink(target, prereq, dependencyGraph(items).edges);
    if (why) {
      toast.error('Cannot add that dependency', { description: why });
      return;
    }
    void applyWithToast(state, wsId, [{ kind: 'edit-entry', key: target.leaf.key, patch: { after: afterWith(target, prereq) } }], `${target.ref} now waits on ${prereq.ref}`);
  }, [byKey, items, state, wsId]);

  const remove = useCallback((id: string) => {
    const [from, to] = id.split('>');
    const prereq = byKey.get(from ?? '');
    const target = byKey.get(to ?? '');
    if (!prereq || !target || !wsId) return;
    void applyWithToast(state, wsId, [{ kind: 'edit-entry', key: target.leaf.key, patch: { after: afterWithout(target, prereq) } }], `${target.ref} no longer waits on ${prereq.ref}`);
  }, [byKey, state, wsId]);

  const multi = board.workspaces.length > 1 && !scope.workspaceId;
  const focusLabel = focus?.kind === 'ticket' ? byKey.get(focus.key)?.ref ?? focus.key : focus ? epicMeta.get(focus.key)?.title ?? focus.key : '';
  const tooMany = !focus && mode === 'tickets' && g.nodes.length > MAX_TICKETS;

  return (
    <div ref={frame} className={cn('flex h-full min-h-[480px] flex-col gap-3', full && 'fixed inset-0 z-50 bg-background p-4')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Show">
          {(['auto', 'tickets', 'epics'] as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setFocus(null); }} className={cn('h-6 rounded-md px-2', mode === m ? 'bg-background font-medium text-foreground shadow-xs' : 'hover:text-foreground')}>
              {m === 'auto' ? 'Auto' : m === 'tickets' ? 'Tickets' : 'Epics'}
            </button>
          ))}
        </div>
        {focus && (
          <span className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 py-0.5 pl-2 pr-1 text-foreground">
            <Crosshair className="size-3.5 text-primary" />{focus.kind === 'ticket' ? <>Around <b className="font-mono">{focusLabel}</b></> : <>Epic <b>{focusLabel}</b> and its links</>}
            {focus.kind === 'ticket' && (
              <select aria-label="How far" className="rounded border border-border bg-background px-1 text-xs" value={depth} onChange={(e) => setDepth(Number(e.target.value) as (typeof DEPTHS)[number])}>
                {DEPTHS.map((d) => <option key={d} value={d}>{d === 99 ? 'whole chain' : `${d} step${d > 1 ? 's' : ''}`}</option>)}
              </select>
            )}
            <button type="button" aria-label="Show everything" onClick={() => setFocus(null)} className="rounded p-0.5 hover:bg-accent"><X className="size-3" /></button>
          </span>
        )}
        {!eg && !focus && <label className="flex items-center gap-1.5"><input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} />Only tickets with dependencies</label>}
        <span className="flex items-center gap-1.5" title="`after` in tickets.toml or the ticket's front matter"><EdgeSample kind="after" />waits on</span>
        <span className="flex items-center gap-1.5" title="The epic's `after`, in its file or in tickets.toml"><EdgeSample kind="gate" />epic waits on epic</span>
        <label className="flex items-center gap-1.5" title="Prerequisites the ticket's text names: a Dependencies section, a Prerequisites or Depends on line, a Waits on note"><input type="checkbox" checked={showNoted} onChange={(e) => setShowNoted(e.target.checked)} /><EdgeSample kind="noted" />named in the ticket</label>
        <label className="flex items-center gap-1.5" title="The order tickets are listed in: build order, not a declared prerequisite"><input type="checkbox" checked={showOrder} onChange={(e) => setShowOrder(e.target.checked)} /><EdgeSample kind="order" />build order (inferred)</label>
        <Button size="xs" variant="outline" className="ml-auto" onClick={() => setFull((v) => !v)} title={full ? 'Leave full screen (Esc)' : 'Full screen'}>{full ? <Minimize2 /> : <Maximize2 />}{full ? 'Exit full screen' : 'Full screen'}</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {eg
          ? `${items.length.toLocaleString()} tickets in ${eg.nodes.length} epics. Click an epic to open its tickets; the number on an arrow is how many ticket links it stands for.`
          : focus ? 'Click a ticket to open it; double-click another to move the focus there.'
          : editable ? 'Drag from a ticket’s right dot to another ticket to make it wait. Select an arrow to remove it. Double-click a ticket to see only its neighbourhood.'
          : 'Left to right is build order. Hover a ticket to trace its chain; double-click to see only its neighbourhood.'}
        {multi && <span className="ml-2 text-warning">Showing {board.workspaces[0]?.store.label}; pick a project in the sidebar for another.</span>}
      </p>
      {!eg && g.cyclic.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="size-3.5" />These tickets wait on each other in a loop, so none can start: {g.cyclic.join(', ')}</p>
      )}
      {tooMany && <p className="text-xs text-warning">{g.nodes.length.toLocaleString()} tickets is too many to lay out one by one, so they are shown as epics. Filter the board, or open an epic, to see its tickets.</p>}
      {nodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dependencies here. Tickets get them from <code>after</code> in tickets.toml or a story's front matter, from a Dependencies section or a Prerequisites line in their text, and from build order{editable ? ', or untick the box above and drag between tickets.' : '.'}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-board-lane">
          <RemoveEdge.Provider value={remove}>
            <ReactFlow<AnyNode, DepEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              colorMode={theme}
              minZoom={0.05}
              maxZoom={1.5}
              onlyRenderVisibleElements
              nodesConnectable={editable && !eg}
              elementsSelectable
              deleteKeyCode={editable && !eg ? ['Backspace', 'Delete'] : null}
              onConnect={connect}
              onEdgesChange={(changes) => {
                for (const c of changes) if (c.type === 'select') setPicked((p) => (c.selected ? c.id : p === c.id ? null : p));
              }}
              onEdgeClick={(_, e) => e.data?.removable && setPicked(e.id)}
              onPaneClick={() => setPicked(null)}
              onEdgesDelete={(es) => es.forEach((e) => remove(e.id))}
              onNodesChange={(changes) => {
                const moves = new Map<string, { x: number; y: number }>();
                const sizes = new Map<string, { width: number; height: number }>();
                for (const c of changes) {
                  if (c.type === 'position' && c.position) moves.set(c.id, c.position);
                  if (c.type === 'dimensions' && c.dimensions) sizes.set(c.id, c.dimensions);
                }
                if (moves.size) setDragged((m) => new Map([...m, ...moves]));
                if (sizes.size) setMeasured((m) => new Map([...m, ...sizes]));
              }}
              onNodeClick={(_, n) => (n.type === 'epic' ? setFocus({ key: n.id, kind: 'epic' }) : select((n.data as TicketNodeData).ticket.uid))}
              onNodeDoubleClick={(_, n) => n.type === 'ticket' && setFocus({ key: n.id, kind: 'ticket' })}
              onNodeMouseEnter={(_, n) => setHover(n.id)}
              onNodeMouseLeave={() => setHover(null)}
              proOptions={{ hideAttribution: true }}
              style={{ background: 'transparent' }}
            >
              <Background gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeStrokeWidth={2} nodeColor={(n) => {
                if (n.type === 'epic') return 'var(--muted-foreground)';
                const t = (n.data as TicketNodeData).ticket;
                return t.leaf.state === 'done' ? 'var(--success)' : t.readiness === 'blocked' ? 'var(--destructive)' : 'var(--muted-foreground)';
              }} />
            </ReactFlow>
          </RemoveEdge.Provider>
        </div>
      )}
    </div>
  );
}

export function GraphView() {
  return (
    <ReactFlowProvider>
      <Graph />
    </ReactFlowProvider>
  );
}
