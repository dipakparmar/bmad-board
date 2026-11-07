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
import { AlertTriangle, X } from 'lucide-react';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { applyWithToast } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import { useTheme } from '@/app/use-theme';
import type { Ticket } from '@/app/view-model';
import { afterWith, afterWithout, cannotLink, dependencyGraph, downstreamOf, statusLabel, upstreamOf, type GraphEdge, type TicketKey } from '@/domain';
import { cn } from '@/lib/cn';
import { Assignee, StateIcon } from '../board/chips';

const W = 232;
const H = 72;

const READY_RING: Partial<Record<Ticket['readiness'], string>> = {
  ready: 'border-success/50',
  blocked: 'border-destructive/40',
  refine: 'border-info/40',
};

type TicketNodeData = { ticket: Ticket; dim: boolean; hot: boolean; cyclic: boolean; editable: boolean };
type TicketNode = Node<TicketNodeData, 'ticket'>;
type Point = { x: number; y: number };
type DepEdgeData = { kind: GraphEdge['kind']; lit: boolean; dim: boolean; removable: boolean; via?: Point[] };
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
        style={{ strokeWidth: on ? 2 : 1.25, strokeDasharray: data?.kind === 'gate' ? '5 4' : undefined, opacity: data?.dim ? 0.2 : 1 }}
        className={on ? '!stroke-primary' : '!stroke-muted-foreground/60'}
      />
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

const nodeTypes = { ticket: TicketCard };
const edgeTypes = { dep: DependencyEdge };

/** Left-to-right positions from dagre; the domain graph's own layers break ties in a cycle. */
function layout(keys: TicketKey[], edges: GraphEdge[]): { at: Map<TicketKey, Point>; via: Map<string, Point[]> } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 72, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const k of keys) g.setNode(k, { width: W, height: H });
  for (const e of edges) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const at = new Map(keys.map((k) => {
    const n = g.node(k);
    return [k, { x: n.x - W / 2, y: n.y - H / 2 }];
  }));
  // Inner bend points only: the first and last sit on the card edges, where the handles already are.
  const via = new Map(edges.map((e) => [`${e.from}>${e.to}`, (g.edge(e.from, e.to)?.points ?? []).slice(1, -1).map((p: Point) => ({ x: p.x, y: p.y }))]));
  return { at, via };
}

function Graph() {
  const state = useBoardContext();
  const { inScope, select, board, scope } = state;
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const [linkedOnly, setLinkedOnly] = useState(true);
  const [hover, setHover] = useState<TicketKey | null>(null);

  // One project at a time: keys are only unique within a project.
  const wsId = scope.workspaceId ?? board.workspaces[0]?.store.id;
  const ws = board.workspaces.find((w) => w.store.id === wsId);
  const editable = !!ws && ws.store.capabilities.write && ws.tree?.layout !== 'v6' && ws.tree?.tracker === 'repo';
  const items = useMemo(() => inScope.filter((t) => t.workspaceId === wsId), [inScope, wsId]);
  const byKey = useMemo(() => new Map(items.map((t) => [t.leaf.key, t])), [items]);
  const g = useMemo(() => dependencyGraph(items, { connectedOnly: linkedOnly }), [items, linkedOnly]);
  const pos = useMemo(() => layout(g.nodes.map((n) => n.key), g.edges), [g]);

  const lit = useMemo(() => (hover ? new Set([hover, ...upstreamOf(hover, g.edges), ...downstreamOf(hover, g.edges)]) : null), [hover, g.edges]);

  // Positions only come from the layout: moving a card is a view thing and is not saved.
  const [dragged, setDragged] = useState<Map<string, { x: number; y: number }>>(new Map());
  // Controlled nodes must carry their measured size back, or React Flow never draws the edges.
  const [picked, setPicked] = useState<string | null>(null);
  const [measured, setMeasured] = useState<Map<string, { width: number; height: number }>>(new Map());
  useEffect(() => setDragged(new Map()), [pos]);
  useEffect(() => {
    const id = requestAnimationFrame(() => void fitView({ padding: 0.15, maxZoom: 1, duration: 200 }));
    return () => cancelAnimationFrame(id);
  }, [pos, fitView]);

  const nodes: TicketNode[] = g.nodes.map((n) => ({
    id: n.key,
    type: 'ticket',
    position: dragged.get(n.key) ?? pos.at.get(n.key) ?? { x: 0, y: 0 },
    measured: measured.get(n.key),
    data: { ticket: n.item, dim: !!lit && !lit.has(n.key), hot: n.key === hover, cyclic: g.cyclic.includes(n.key), editable },
  }));
  const edges: DepEdge[] = g.edges.map((e) => {
    const on = !!lit && lit.has(e.from) && lit.has(e.to);
    return {
      id: `${e.from}>${e.to}`,
      source: e.from,
      target: e.to,
      type: 'dep',
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

  return (
    <div className="flex h-full min-h-[480px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} />Only tickets with dependencies</label>
        <span className="flex items-center gap-1.5"><svg width="28" height="6" aria-hidden><line x1="0" y1="3" x2="28" y2="3" className="stroke-muted-foreground" strokeWidth="1.5" /></svg>waits on</span>
        <span className="flex items-center gap-1.5"><svg width="28" height="6" aria-hidden><line x1="0" y1="3" x2="28" y2="3" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="4 3" /></svg>epic gate (waits for the whole epic)</span>
        <span>{editable ? 'Drag from a ticket’s right dot to another ticket to make it wait. Select an arrow to remove it.' : 'Left to right is build order. Hover a ticket to trace its chain.'}</span>
        {multi && <span className="text-warning">Showing {board.workspaces[0]?.store.label}; pick a project in the sidebar for another.</span>}
      </div>
      {g.cyclic.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="size-3.5" />These tickets wait on each other in a loop, so none can start: {g.cyclic.join(', ')}</p>
      )}
      {g.nodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dependencies here. Tickets get them from <code>after</code> in tickets.toml or a story's front matter{editable ? ', or untick the box above and drag between tickets.' : '.'}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-board-lane">
          <RemoveEdge.Provider value={remove}>
            <ReactFlow<TicketNode, DepEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              colorMode={theme}
              minZoom={0.2}
              maxZoom={1.5}
              nodesConnectable={editable}
              elementsSelectable
              deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
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
              onNodeClick={(_, n) => select(n.data.ticket.uid)}
              onNodeMouseEnter={(_, n) => setHover(n.id)}
              onNodeMouseLeave={() => setHover(null)}
              proOptions={{ hideAttribution: true }}
              style={{ background: 'transparent' }}
            >
              <Background gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeStrokeWidth={2} nodeColor={(n) => ((n.data as TicketNodeData).ticket.leaf.state === 'done' ? 'var(--success)' : (n.data as TicketNodeData).ticket.readiness === 'blocked' ? 'var(--destructive)' : 'var(--muted-foreground)')} />
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
