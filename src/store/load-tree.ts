/**
 * Reads a BMAD ticket tree from any FileSource into the domain model.
 * Follows tickets.py (bmad-agent-po) so the board shows what the agents see.
 */
import { parse as parseToml } from 'smol-toml';
import {
  BOARD_CONFIG_PATH,
  boardState,
  parseBoardConfig,
  type BoardConfig,
  isLeafStatus,
  type BoardState,
  type BreakdownEntry,
  type ContainerAfter,
  type ContainerStatus,
  type Epic,
  type Initiative,
  type Leaf,
  type LeafStatus,
  type LeafType,
  type Plan,
  type Risk,
  type TicketKey,
  type TicketTree,
  type TrackerKind,
} from '../domain';
import { flag, list, parseFrontmatter, str } from './frontmatter';
import { joinPath, type FileSource } from './file-source';
import { loadV6Tree } from './load-v6';

const LEAF_TYPES: readonly string[] = ['story', 'spike', 'bug'];
const BOARD_STATES: readonly string[] = ['backlog', 'in-progress', 'review', 'done', 'dropped'];
const ID_RE = /^[0-9A-Za-z]+$/;
const CROSS_RE = /^([0-9A-Za-z]+)\.([0-9A-Za-z]+)$/;
const EPIC_RE = /^epic-[^/]+$/;
const UNKNOWN_RE = /^[ \t]*(?:[-*][ \t]+)?Unknown:[ \t]*(\S.*)$/gm;

type Toml = Record<string, unknown>;

export function toId(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && ID_RE.test(value) && value !== 'true' && value !== 'false') return /^\d+$/.test(value) ? Number(value) : value;
  return null;
}

export function titleSlug(title: string): string {
  const ascii = title.normalize('NFKD').replace(/[^\x00-\x7f]/g, '');
  return ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'untitled';
}

async function readToml(src: FileSource, path: string, problems: string[]): Promise<Toml> {
  const text = await src.read(path);
  if (text === null) return {};
  try {
    return parseToml(text) as Toml;
  } catch (cause) {
    problems.push(`${path}: ${cause instanceof Error ? cause.message : 'invalid TOML'}`);
    return {};
  }
}

function merge(a: Toml, b: Toml): Toml {
  const out: Toml = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = prev && v && typeof prev === 'object' && typeof v === 'object' && !Array.isArray(prev) && !Array.isArray(v) ? merge(prev as Toml, v as Toml) : v;
  }
  return out;
}

export interface BmadConfig {
  outputFolder: string;
  activeInitiative?: string;
  tracker: TrackerKind;
}

/** The merged BMad config: `_bmad/config.toml`, then `custom/config.toml`, then `custom/config.user.toml`. */
export async function readConfig(src: FileSource, problems: string[] = []): Promise<BmadConfig> {
  const layers = await Promise.all(['_bmad/config.toml', '_bmad/custom/config.toml', '_bmad/custom/config.user.toml'].map((p) => readToml(src, p, problems)));
  const core = (layers.reduce(merge, {}).core ?? {}) as Toml;
  let outputFolder = str(core.output_folder) || '_bmad-output';
  outputFolder = outputFolder.replace(/^\{project-root\}\/?/, '');
  if (outputFolder.startsWith('/') || outputFolder.split('/').includes('..')) {
    problems.push(`output_folder ${outputFolder} is outside the project root; the board can only read inside it`);
    outputFolder = '_bmad-output';
  }
  const store = ((await readToml(src, '_bmad/custom/ticketing-store-config.toml', problems)).tickets ?? {}) as Toml;
  const tracker = (str(store.store) || 'repo') as TrackerKind;
  return { outputFolder: joinPath(outputFolder), activeInitiative: str(core.active_initiative).trim() || undefined, tracker };
}

export async function readBoardConfig(src: FileSource, problems: string[] = []): Promise<BoardConfig> {
  return parseBoardConfig(await readToml(src, BOARD_CONFIG_PATH, problems));
}

/** A leaf before its `after` refs are resolved. */
interface RawLeaf extends Omit<Leaf, 'after' | 'gatedBy' | 'drift'> {
  rawAfter: unknown[];
  entryAfter?: unknown[];
  entryHitl?: boolean;
  fileName?: string;
}

function toEntry(t: Toml): BreakdownEntry {
  return {
    id: toId(t.id) ?? str(t.id),
    type: (str(t.type) || 'story') as LeafType,
    title: str(t.title),
    description: str(t.description),
    verify: str(t.verify) || undefined,
    covers: list(t.covers).map(str),
    after: list(t.after) as (number | string)[],
    hitl: flag(t.hitl),
    risk: (str(t.risk) || undefined) as Risk | undefined,
    estimate: typeof t.estimate === 'number' ? t.estimate : undefined,
    unknown: str(t.unknown) || undefined,
    references: list(t.references).map(str),
    notes: list(t.notes).map(str),
    refine: flag(t.refine) || undefined,
    planCheckpoint: flag(t.plan_checkpoint) || undefined,
    doneCheckpoint: flag(t.done_checkpoint) || undefined,
  };
}

function leafStatus(value: unknown, where: string, problems: string[]): LeafStatus | '' {
  const s = str(value);
  if (!s) return '';
  if (isLeafStatus(s)) return s;
  problems.push(`${where}: unknown status ${JSON.stringify(s)}; reads as blocked`);
  return 'blocked';
}

/** Every ticket in one folder, in build order: entries joined to leaf files, then unlisted leaf files; plans set status. */
async function loadFolder(src: FileSource, dir: string, folder: string, initiative: string, entries: Toml[], problems: string[]): Promise<RawLeaf[]> {
  const rows = new Map<string, RawLeaf>();
  for (const raw of entries) {
    const entry = toEntry(raw);
    const id = toId(raw.id);
    if (id === null) {
      problems.push(`${dir}/tickets.toml: an entry has no valid id`);
      continue;
    }
    if (!LEAF_TYPES.includes(entry.type)) problems.push(`${dir}/tickets.toml: entry ${id} type ${entry.type} is not story, spike or bug`);
    rows.set(String(id), {
      key: `${folder}/${id}`, id, type: entry.type, title: entry.title, folder, dir, initiative, entry,
      hitl: entry.hitl, risk: entry.risk, status: '', state: 'backlog', rawAfter: entry.after,
    });
  }
  const extra: RawLeaf[] = [];
  const plans: { path: string; data: Toml; body: string }[] = [];
  const names = ((await src.list(dir)) ?? []).filter((e) => e.kind === 'file' && e.name.endsWith('.md')).map((e) => e.name).sort();
  const texts = await Promise.all(names.map((n) => src.read(joinPath(dir, n))));
  names.forEach((name, i) => {
    const text = texts[i] ?? '';
    const path = joinPath(dir, name);
    const { data, body } = parseFrontmatter(text);
    if (!LEAF_TYPES.includes(str(data.type))) {
      if ('ticket' in data) plans.push({ path, data, body });
      return;
    }
    const id = toId(data.id);
    let row = id !== null ? rows.get(String(id)) : undefined;
    if (row) {
      row.entryAfter = row.rawAfter;
      row.entryHitl = row.hitl;
    } else {
      row = { key: `${folder}/${id ?? name}`, id, type: str(data.type) as LeafType, title: '', folder, dir, initiative, hitl: false, status: '', state: 'backlog', rawAfter: [] };
      extra.push(row);
    }
    const trackerStatus = BOARD_STATES.includes(str(data.tracker_status)) ? (str(data.tracker_status) as BoardState) : undefined;
    const unknown = [...body.replace(/<!--[\s\S]*?-->/g, '').matchAll(UNKNOWN_RE)].map((m) => (m[1] ?? '').trim()).join('; ');
    row.fileName = name;
    row.type = str(data.type) as LeafType;
    row.title = str(data.title) || row.title;
    row.file = { path, body, refined: flag(data.refined), severity: (str(data.severity) || undefined) as never };
    row.hitl = flag(data.hitl);
    row.risk = (str(data.risk) || row.risk) as Risk | undefined;
    row.status = leafStatus(data.status, path, problems);
    row.rawAfter = list(data.after);
    if (str(data.tracker_id)) row.tracker = { trackerId: str(data.tracker_id), remote: str(data.remote), trackerStatus };
    if (row.entry && unknown) row.entry = { ...row.entry, unknown };
    else if (!row.entry && unknown) row.entry = { id: row.id ?? name, type: row.type, title: row.title, description: '', covers: [], after: [], hitl: row.hitl, unknown, refine: true };
  });
  const all = [...rows.values(), ...extra];
  for (const plan of plans) {
    const ticket = plan.data.ticket;
    const id = toId(ticket);
    const row = (id !== null ? all.find((r) => String(r.id) === String(id)) : undefined) ?? all.find((r) => r.fileName === `${str(ticket)}.md`);
    if (!row) {
      problems.push(`${plan.path}: ticket ${JSON.stringify(ticket)} names no entry or leaf file; skipped`);
      continue;
    }
    if (row.plan) {
      problems.push(`${row.plan.path} and ${plan.path} are both plans for ticket ${str(ticket)}`);
      continue;
    }
    const status = leafStatus(plan.data.status, plan.path, problems);
    row.plan = {
      path: plan.path, ticket: str(ticket), status,
      assignee: str(plan.data.assignee) || undefined,
      blockedAt: str(plan.data.blocked_at) || undefined,
      blockedReason: str(plan.data.blocked_reason) || undefined,
      baselineRevision: str(plan.data.baseline_revision) || undefined,
      body: plan.body,
    } satisfies Plan;
    row.status = status;
  }
  for (const row of all) row.state = boardState(row.status, row.tracker?.trackerStatus);
  return all;
}

interface ContainerFile {
  data: Toml;
  body: string;
  path: string;
}

async function readContainer(src: FileSource, dir: string, slug: string, problems: string[]): Promise<ContainerFile | null> {
  const path = joinPath(dir, `${slug}.md`);
  const text = await src.read(path);
  if (text === null) {
    problems.push(`${dir}: no ${slug}.md`);
    return null;
  }
  const { data, body } = parseFrontmatter(text);
  return { data, body, path };
}

function containerStatus(value: unknown): ContainerStatus | undefined {
  const s = str(value);
  return s === 'in-progress' || s === 'done' || s === 'dropped' ? s : undefined;
}

/** Companion planning docs: run folders like prd-*, ux-*, architecture-* beside the container file. */
async function companions(src: FileSource, dir: string): Promise<string[]> {
  const entries = (await src.list(dir)) ?? [];
  return entries.filter((e) => e.kind === 'dir' && e.name !== 'tickets').map((e) => joinPath(dir, e.name));
}

/** Resolves `after` refs inside one initiative, the same way tickets.py does. */
function resolveAfter(raws: RawLeaf[], epicIds: Map<string, string>, epicSlugs: Set<string>, problems: string[]) {
  const byKey = new Map(raws.map((r) => [r.key, r]));
  const trackerIds = new Map<string, TicketKey>();
  for (const r of raws) if (r.tracker?.trackerId) trackerIds.set(r.tracker.trackerId.toLowerCase(), r.key);

  return (folder: string | null, refs: unknown[], where: string): TicketKey[] => {
    const keys: TicketKey[] = [];
    for (const ref of refs) {
      const text = str(ref).trim();
      let key: TicketKey | undefined;
      const id = toId(ref);
      if (folder && id !== null && byKey.has(`${folder}/${id}`)) key = `${folder}/${id}`;
      const cross = CROSS_RE.exec(text);
      if (!key && cross) {
        const slug = epicIds.get(String(toId(cross[1])));
        if (slug && byKey.has(`${slug}/${toId(cross[2])}`)) key = `${slug}/${toId(cross[2])}`;
      }
      if (!key && EPIC_RE.test(text) && epicSlugs.has(text)) key = text;
      if (!key) key = trackerIds.get(text.toLowerCase());
      if (!key && folder) key = raws.find((r) => r.folder === folder && r.fileName === (text.endsWith('.md') ? text : `${text}.md`))?.key;
      if (!key) {
        problems.push(`${where}: after ${JSON.stringify(ref)} matches no ticket`);
        continue;
      }
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  };
}

function finish(raws: RawLeaf[], resolve: ReturnType<typeof resolveAfter>, gates: Map<string, TicketKey[]>): Leaf[] {
  return raws.map(({ rawAfter, entryAfter, entryHitl, fileName: _f, ...rest }) => {
    const where = rest.file?.path ?? `${rest.dir}/tickets.toml entry ${rest.id}`;
    const after = resolve(rest.folder, rawAfter, where);
    const leaf: Leaf = { ...rest, after, gatedBy: gates.get(rest.folder) ?? [] };
    if (entryAfter) {
      const planned = resolve(rest.folder, entryAfter, where);
      const drift: NonNullable<Leaf['drift']> = {};
      if ([...planned].sort().join() !== [...after].sort().join()) drift.after = { file: after, entry: planned };
      if (entryHitl !== undefined && entryHitl !== rest.hitl) drift.hitl = { file: rest.hitl, entry: entryHitl };
      if (drift.after || drift.hitl) leaf.drift = drift;
    }
    return leaf;
  });
}

function containerAfter(value: unknown): ContainerAfter[] {
  return list(value).filter((a): a is ContainerAfter => !!a && typeof a === 'object') as ContainerAfter[];
}

async function loadInitiative(src: FileSource, dir: string, slug: string, problems: string[]): Promise<Initiative | null> {
  const file = await readContainer(src, dir, slug, problems);
  if (!file) return null;
  const ticketsDir = joinPath(dir, 'tickets');
  const breakdown = await readToml(src, joinPath(ticketsDir, 'tickets.toml'), problems);
  const base: Initiative = {
    type: 'initiative', slug, title: str(file.data.title) || slug, description: '', path: file.path,
    status: containerStatus(file.data.status), covers: [], after: [], gates: [], risk: (str(file.data.risk) || undefined) as Risk | undefined,
    companions: await companions(src, dir), body: file.body, epics: [], leaves: [],
  };
  if (file.data.tracker_id) base.tracker = { trackerId: str(file.data.tracker_id), remote: str(file.data.remote) };

  if (Array.isArray(breakdown.initiative)) {
    base.children = (breakdown.initiative as Toml[]).map((c) => ({ id: toId(c.id) ?? str(c.id), slug: str(c.slug), title: str(c.title), after: containerAfter(c.after) }));
    return base;
  }

  const listed = (Array.isArray(breakdown.epic) ? breakdown.epic : []) as Toml[];
  const order = listed.map((e) => str(e.slug));
  const epicIds = new Map(listed.map((e) => [String(toId(e.id)), str(e.slug)]));
  const children = ((await src.list(ticketsDir)) ?? []).filter((e) => e.kind === 'dir' && e.name.startsWith('epic-')).map((e) => e.name);
  children.sort((a, b) => (order.indexOf(a) < 0 ? order.length : order.indexOf(a)) - (order.indexOf(b) < 0 ? order.length : order.indexOf(b)) || a.localeCompare(b));

  const raws: RawLeaf[] = [];
  const epicFiles = new Map<string, { file: ContainerFile | null; dir: string }>();
  for (const epicSlug of children) {
    const epicDir = joinPath(ticketsDir, epicSlug);
    const epicTickets = joinPath(epicDir, 'tickets');
    const epicBreakdown = await readToml(src, joinPath(epicTickets, 'tickets.toml'), problems);
    const entries = (Array.isArray(epicBreakdown.entry) ? epicBreakdown.entry : []) as Toml[];
    const file = await readContainer(src, epicDir, epicSlug, problems);
    epicFiles.set(epicSlug, { file, dir: epicDir });
    raws.push(...(await loadFolder(src, epicTickets, epicSlug, slug, entries, problems)));
  }
  if (children.length === 0) {
    const entries = (Array.isArray(breakdown.entry) ? breakdown.entry : []) as Toml[];
    raws.push(...(await loadFolder(src, ticketsDir, slug, slug, entries, problems)));
  }

  const resolve = resolveAfter(raws, epicIds, new Set(children), problems);
  const gates = new Map<string, TicketKey[]>();
  for (const [epicSlug, { file }] of epicFiles) gates.set(epicSlug, file ? resolve(null, list(file.data.after), file.path) : []);
  const leaves = finish(raws, resolve, gates);

  base.epics = children.map((epicSlug): Epic => {
    const { file, dir: epicDir } = epicFiles.get(epicSlug) ?? { file: null, dir: '' };
    const table = listed.find((e) => str(e.slug) === epicSlug) ?? {};
    const data = file?.data ?? {};
    return {
      type: 'epic', slug: epicSlug, id: toId(table.id) ?? undefined, title: str(data.title) || str(table.title) || epicSlug,
      description: str(table.description), path: file?.path ?? joinPath(epicDir, `${epicSlug}.md`), status: containerStatus(data.status),
      covers: list(data.covers ?? table.covers).map(str), after: containerAfter(table.after), gates: gates.get(epicSlug) ?? [],
      // An epic file with no `refined` line, from an older tree, counts as refined.
      refined: str(data.refined).toLowerCase() !== 'false', risk: (str(data.risk) || undefined) as Risk | undefined,
      companions: [], body: file?.body ?? '', leaves: leaves.filter((l) => l.folder === epicSlug),
      ...(data.tracker_id ? { tracker: { trackerId: str(data.tracker_id), remote: str(data.remote) } } : {}),
    };
  });
  await Promise.all(base.epics.map(async (e) => { e.companions = await companions(src, dirOf(e.path)); }));
  base.leaves = leaves.filter((l) => l.folder === slug);
  return base;
}

function dirOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

/** Loads the whole tree: every initiative in the store, plus `backlog/`. Falls back to the v6 layout. */
export async function loadTicketTree(src: FileSource): Promise<TicketTree> {
  const problems: string[] = [];
  const config = await readConfig(src, problems);
  const entries = (await src.list(config.outputFolder)) ?? [];
  const initiatives: Initiative[] = [];
  for (const e of entries) {
    if (e.kind !== 'dir' || e.name === 'backlog' || !e.name.startsWith('initiative-')) continue;
    const loaded = await loadInitiative(src, joinPath(config.outputFolder, e.name), e.name, problems);
    if (loaded) initiatives.push(loaded);
  }
  const backlogDir = joinPath(config.outputFolder, 'backlog');
  const hasBacklog = entries.some((e) => e.kind === 'dir' && e.name === 'backlog');
  if (initiatives.length === 0 && !hasBacklog) {
    const v6 = await loadV6Tree(src, config.outputFolder);
    if (v6) return { ...v6, tracker: config.tracker, problems: [...problems, ...v6.problems], board: await readBoardConfig(src, problems) };
  }
  const backlogRaw = hasBacklog ? await loadFolder(src, backlogDir, 'backlog', '', [], problems) : [];
  const backlog = finish(backlogRaw, resolveAfter(backlogRaw, new Map(), new Set(), problems), new Map());
  // Active initiative first, as BMAD's `next` reports it.
  initiatives.sort((a, b) => Number(b.slug === config.activeInitiative) - Number(a.slug === config.activeInitiative));
  const board = await readBoardConfig(src, problems);
  return { projectRoot: '', outputFolder: config.outputFolder, activeInitiative: config.activeInitiative, tracker: config.tracker, initiatives, backlog, layout: 'ticket-tree', problems, board };
}

/** Every leaf in the tree, initiatives first in their build order, then the backlog. */
export function allLeaves(tree: TicketTree): Leaf[] {
  return [...tree.initiatives.flatMap((i) => [...i.epics.flatMap((e) => e.leaves), ...i.leaves]), ...tree.backlog];
}

/** Epic slugs whose own status is done, which an epic gate waits on. */
export function doneContainers(tree: TicketTree): string[] {
  return tree.initiatives.flatMap((i) => i.epics.filter((e) => e.status === 'done').map((e) => e.slug));
}
