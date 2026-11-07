/**
 * Reads a BMAD v6 project (see `domain/sprint-v6.ts` for the formats) into the board's tree, read-only.
 * Paths come from `_bmad/bmm/config.yaml` (`planning_artifacts`, `implementation_artifacts`) and the
 * sprint file's `story_location`, with v6's defaults when they are missing. Each story carries a `v6`
 * ref so `changes-v6.ts` can write its edits back in v6's own format.
 */
import { parse } from 'yaml';
import { v6Slug } from './v6-edit';
import {
  boardState, docKind, docLinks, laterStatus, leafStatusFromV6, parseEpicsDoc, parseSprintStatus, parseStoryFile,
  type DocLink, type Epic, type Leaf, type LeafLinks, type TicketKey, type TicketTree, type V6EpicsDoc,
} from '../domain';
import { proseDependencies, type ProseRef } from '../domain/prose-deps';
import { parseFrontmatter } from './frontmatter';
import { joinPath, type FileSource } from './file-source';

/** Kept for callers that only need a status mapped. */
export function v6Status(value: string) {
  return leafStatusFromV6(parseSprintStatus(`development_status:\n  1-1-x: ${JSON.stringify(value)}`).stories[0]?.status ?? null);
}

interface V6Paths {
  output: string;
  planning: string;
  implementation: string;
}

/** `{project-root}/x`, `{output_folder}/x`, `{config_source}:…` → a path inside the project, or null. */
function resolveVar(raw: unknown, output: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const p = raw.trim().replace(/^["']|["']$/g, '').replace(/^\{project-root\}\/?/, '').replace(/^\{output_folder\}/, output).replace(/^\.\//, '');
  if (p.startsWith('/') || p.includes('{') || p.split('/').includes('..')) return null;
  return joinPath(p);
}

async function v6Paths(src: FileSource, outputFolder: string): Promise<V6Paths> {
  const text = await src.read('_bmad/bmm/config.yaml').catch(() => null);
  let cfg: Record<string, unknown> = {};
  try { cfg = text ? ((parse(text) ?? {}) as Record<string, unknown>) : {}; } catch { /* fall back to defaults */ }
  const output = resolveVar(cfg.output_folder, outputFolder) ?? outputFolder;
  return {
    output,
    planning: resolveVar(cfg.planning_artifacts, output) ?? joinPath(output, 'planning-artifacts'),
    implementation: resolveVar(cfg.implementation_artifacts, output) ?? joinPath(output, 'implementation-artifacts'),
  };
}

/** The epics file: whole `epics.md` first, then sharded `epics/` (index + epic-N.md), then any `*epic*.md`. */
async function readEpics(src: FileSource, planning: string): Promise<{ doc: V6EpicsDoc; path?: string; files: Map<number, string> }> {
  const files = new Map<number, string>();
  const whole = joinPath(planning, 'epics.md');
  const wholeText = await src.read(whole).catch(() => null);
  if (wholeText !== null) return { doc: parseEpicsDoc(wholeText), path: whole, files };
  const shardDir = joinPath(planning, 'epics');
  const shards = ((await src.list(shardDir).catch(() => null)) ?? []).filter((e) => e.kind === 'file' && e.name.endsWith('.md') && e.name !== 'index.md').map((e) => e.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (shards.length) {
    const texts = await Promise.all(shards.map((n) => src.read(joinPath(shardDir, n))));
    const doc = parseEpicsDoc(texts.map((t) => t ?? '').join('\n\n'));
    shards.forEach((n, i) => {
      for (const e of parseEpicsDoc(texts[i] ?? '').epics) files.set(e.num, joinPath(shardDir, n));
    });
    return { doc, path: joinPath(shardDir, 'index.md'), files };
  }
  const loose = ((await src.list(planning).catch(() => null)) ?? []).find((e) => e.kind === 'file' && /epic.*\.md$/i.test(e.name));
  if (loose) return { doc: parseEpicsDoc((await src.read(joinPath(planning, loose.name))) ?? ''), path: joinPath(planning, loose.name), files };
  return { doc: { epics: [] }, files };
}

/** Story files by `N-M` (and `spec-N-M-…`, which the migration also accepts), across the likely folders. */
async function storyFiles(src: FileSource, dirs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const dir of dirs) {
    for (const e of (await src.list(dir).catch(() => null)) ?? []) {
      const m = e.kind === 'file' ? /^(?:spec-)?(\d+)-(\d+[a-z]?)-.+\.md$/.exec(e.name) : null;
      if (m && !out.has(`${m[1]}-${m[2]}`)) out.set(`${m[1]}-${m[2]}`, joinPath(dir, e.name));
    }
  }
  return out;
}

const slugTitle = (slug: string) => slug.replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function loadV6Tree(src: FileSource, outputFolder: string): Promise<TicketTree | null> {
  const paths = await v6Paths(src, outputFolder);
  const statusPath = joinPath(paths.implementation, 'sprint-status.yaml');
  const statusText = await src.read(statusPath);
  if (statusText === null) return null;
  const sprint = parseSprintStatus(statusText, statusPath);
  const problems = [...sprint.problems];
  const epicsFile = await readEpics(src, paths.planning);
  const storyDir = sprint.storyLocation ? resolveVar(sprint.storyLocation.replace('{implementation_artifacts}', paths.implementation).replace('{story_dir}', paths.implementation), paths.output) : null;
  const stories = await storyFiles(src, [...new Set([storyDir, paths.implementation, joinPath(paths.implementation, 'stories')].filter((d): d is string => !!d))]);
  const implFiles = ((await src.list(paths.implementation).catch(() => null)) ?? []).filter((e) => e.kind === 'file').map((e) => e.name);

  // Planning docs every ticket can reach through its initiative: PRD, architecture, UX, brief…
  const planningDocs: DocLink[] = ((await src.list(paths.planning).catch(() => null)) ?? [])
    .filter((e) => (e.kind === 'dir' || /\.md$/i.test(e.name)) && e.name !== 'epics' && !/epic/i.test(e.name))
    .map((e) => joinPath(paths.planning, e.name))
    .map((p): DocLink => ({ candidates: [p], label: docKind(p), kind: docKind(p) }))
    .filter((d) => d.kind !== 'doc' || /context|readiness|proposal/i.test(d.candidates[0] ?? ''));
  const epicsLink = (anchor?: string, title?: string): DocLink[] => (epicsFile.path ? [{ candidates: [epicsFile.path], anchor, label: 'epics', kind: 'epics', title }] : []);

  const epics = new Map<number, Epic>();
  const epicFor = (num: number): Epic => {
    let epic = epics.get(num);
    if (!epic) {
      const planned = epicsFile.doc.epics.find((e) => e.num === num);
      const status = sprint.epics.find((e) => e.num === num);
      const retroFile = implFiles.find((n) => new RegExp(`^epic-${num}-retro`).test(n));
      const title = planned?.title ?? `Epic ${num}`;
      epic = {
        type: 'epic', slug: `epic-${num}`, id: num, title, description: planned?.goal.split('\n\n')[0] ?? '',
        path: epicsFile.files.get(num) ?? epicsFile.path ?? statusPath,
        status: status?.status === 'done' ? 'done' : status?.status === 'in-progress' ? 'in-progress' : undefined,
        covers: [], after: [], gates: [], refined: true, companions: [], body: planned?.goal ?? '', leaves: [],
        retrospective: status?.retrospective ? { status: status.retrospective, path: retroFile ? joinPath(paths.implementation, retroFile) : undefined } : undefined,
        docs: [
          ...epicsLink(`epic-${num}`, `Epic ${num} in the epics file`),
          ...(retroFile ? [{ candidates: [joinPath(paths.implementation, retroFile)], label: 'retrospective', kind: 'retro' as const, title: `Epic ${num} retrospective${status?.retrospective === 'done' ? '' : ' (optional)'}` }] : []),
        ],
      };
      epics.set(num, epic);
    }
    return epic;
  };

  const leafFor = async (num: number, story: string, key: string | undefined, slug: string, yamlStatus: ReturnType<typeof laterStatus>, owner?: string): Promise<Leaf> => {
    const epic = epicFor(num);
    const planned = epicsFile.doc.epics.find((e) => e.num === num)?.stories.find((s) => s.story === story);
    const path = stories.get(`${num}-${story}`);
    let file: Leaf['file'];
    let parsed: ReturnType<typeof parseStoryFile> | undefined;
    // "### Story 1.2: Title" has the slug `story-12-title`; the reader matches on the prefix.
    let docs: DocLink[] = epicsLink(`story-${num}${story}-`, `Story ${num}.${story} in the epics file`);
    if (path) {
      const { body } = parseFrontmatter((await src.read(path)) ?? '');
      parsed = parseStoryFile(body);
      file = { path, body, refined: true };
      docs = [...docLinks({ body }, { baseDir: path.slice(0, path.lastIndexOf('/')), outputFolder: paths.output }), ...docs];
    }
    const v6 = laterStatus(yamlStatus, parsed?.status ?? (path ? 'ready-for-dev' : null));
    const status = parsed?.blocked && v6 !== 'done' ? 'blocked' : leafStatusFromV6(v6);
    const assignee = parsed?.assignee ?? owner;
    const id = /^\d+$/.test(story) ? Number(story) : story;
    const title = planned?.title || parsed?.title || slugTitle(slug);
    return {
      // Once a story file exists it is newer than the epics file, so its title wins.
      key: `${epic.slug}/${story}`, id, type: 'story', title: parsed?.title ?? title, folder: epic.slug, dir: paths.implementation, initiative: 'sprint',
      entry: {
        id, type: 'story', title, description: planned?.body ?? parsed?.story ?? '', verify: parsed?.acceptance,
        covers: [], after: [], hitl: false, refine: !path && !planned?.body ? true : undefined,
      },
      file, after: [], gatedBy: [], hitl: false, status, state: boardState(status), docs,
      // The story file's task list is its build checklist, and `owner` (when a team adds one) its assignee.
      plan: path || assignee ? {
        path: path ?? statusPath, ticket: key ?? `${num}-${story}`, status, assignee, body: parsed?.tasks ?? '',
        blockedReason: parsed?.blocked?.reason, blockedAt: parsed?.blocked?.since,
      } : undefined,
      v6: {
        sprintKey: key ?? `${num}-${story}-${v6Slug(planned?.title || slug)}`, epic: num, story, inSprint: !!key,
        epicsPath: planned ? epicsFile.files.get(num) ?? epicsFile.path : undefined, storyDir: storyDir ?? paths.implementation,
      },
    };
  };

  for (const e of sprint.epics) epicFor(e.num);
  for (const s of sprint.stories) epicFor(s.epic).leaves.push(await leafFor(s.epic, s.story, s.key, s.slug, s.status, s.owner));
  // Stories planned in the epics file that sprint planning hasn't picked up yet are backlog.
  for (const planned of epicsFile.doc.epics) {
    const epic = epicFor(planned.num);
    for (const st of planned.stories) {
      if (epic.leaves.some((l) => String(l.id) === st.story)) continue;
      epic.leaves.push(await leafFor(planned.num, st.story, undefined, st.title.toLowerCase().replace(/\W+/g, '-'), null));
    }
    epic.leaves.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  }
  // v6 builds an epic's stories in order, so each waits on the one before it; that is order, not a
  // declared prerequisite. What a story or epic says it needs in words is drawn as well.
  const all = [...epics.values()].sort((a, b) => Number(a.id) - Number(b.id));
  const keys = new Set(all.flatMap((e) => [e.slug, ...e.leaves.map((l) => l.key)]));
  const toKey = (r: ProseRef, epicNum: number): TicketKey | null => {
    const k = r.kind === 'story' ? `epic-${r.epic}/${r.story}` : r.kind === 'sibling' ? `epic-${epicNum}/${r.id}` : r.kind === 'epic' ? `epic-${r.id}` : /^epic-\d+$/.test(r.name) ? r.name : null;
    return k && keys.has(k) ? k : null;
  };
  all.forEach((epic, ei) => {
    const num = Number(epic.id);
    const planned = epicsFile.doc.epics.find((e) => e.num === num);
    const epicNoted = [...new Set(proseDependencies(planned?.goal ?? '').map((r) => toKey(r, num)).filter((k): k is TicketKey => !!k && k !== epic.slug && !k.startsWith(`${epic.slug}/`)))];
    epic.leaves.forEach((l, i) => {
      const prev = epic.leaves[i - 1];
      const text = [l.file?.body ?? '', planned?.stories.find((s) => s.story === String(l.id))?.body ?? ''].join('\n\n');
      const noted = [...new Set(proseDependencies(text).map((r) => toKey(r, num)).filter((k): k is TicketKey => !!k && k !== l.key))];
      const links: LeafLinks = {};
      if (prev) Object.assign(links, { previous: prev.key, sequential: true });
      if (noted.length) links.noted = noted;
      if (epicNoted.length) links.epicNoted = epicNoted;
      const before = all[ei - 1];
      if (before) links.previousEpic = before.slug;
      if (Object.keys(links).length) l.links = links;
    });
  });

  return {
    projectRoot: '', outputFolder: paths.output, tracker: 'repo', layout: 'v6', backlog: [], problems,
    sprint: {
      statusPath, project: sprint.project, projectKey: sprint.projectKey, generated: sprint.generated, lastUpdated: sprint.lastUpdated,
      trackingSystem: sprint.trackingSystem, storyLocation: storyDir ?? undefined, epicsPath: epicsFile.path, actionItems: sprint.actionItems,
    },
    initiatives: [{
      type: 'initiative', slug: 'sprint', title: sprint.project || 'Sprint plan', description: '', path: statusPath,
      covers: [], after: [], gates: [], companions: [], body: '', epics: [...epics.values()].sort((a, b) => Number(a.id) - Number(b.id)), leaves: [],
      docs: [{ candidates: [statusPath], label: 'sprint status', kind: 'sprint' }, ...epicsLink(), ...planningDocs],
    }],
  };
}
