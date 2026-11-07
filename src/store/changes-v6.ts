/**
 * Edits to a BMAD v6 project, written the way v6's own workflows write them, so sprint-planning,
 * create-story, dev-story and code-review keep working on the files afterwards:
 *
 * - status: `development_status` in sprint-status.yaml and the story file's `Status:` line (both, since
 *   v6 reads the later of the two), the epic's status (`in-progress` once a story starts, `done` when all
 *   are), and `last_updated`. Only v6's statuses are written: backlog, ready-for-dev, in-progress, review, done.
 * - assignee and block: `Assignee:` and `Blocked:` lines under the story file's `Status:` line. v6 has no
 *   field for either, and sprint-planning would choke on a mapping in sprint-status.yaml.
 * - title and description: the story's section in the epics file, or the story file once it exists.
 * - new stories: `### Story N.M: Title` at the end of the epic in the epics file, and a `backlog` key.
 */
import { blockedLine, type Leaf, type LeafStatus, type TicketChange, type TicketTree, type V6StoryStatus } from '../domain';
import { BOARD_CONFIG_PATH, boardConfigToml } from '../domain';
import { ChangeError } from './changes';
import { joinPath, type FileSource, type FileWrite } from './file-source';
import { allLeaves } from './load-tree';
import { replaceBody } from './frontmatter';
import {
  addEpicsStory, editEpicsStory, renameSprintKey, newStoryFile, setSection, setSprintStatus, setStoryField, setStoryTitle, setTask, sprintValue,
  stampSprint, TASK_SECTIONS, v6Slug, v6Stamp,
} from './v6-edit';

const RANK: Record<V6StoryStatus, number> = { backlog: 0, 'ready-for-dev': 1, 'in-progress': 2, review: 3, done: 4, blocked: 2 };

/** The board's status → the one v6 writes. Blocked is a line in the story file, not a status. */
export function v6StatusFor(status: LeafStatus): Exclude<V6StoryStatus, 'blocked'> | 'blocked' {
  switch (status) {
    case 'draft':
    case 'ready-for-dev': return 'ready-for-dev';
    case 'in-progress': return 'in-progress';
    case 'in-review':
    case 'built': return 'review';
    case 'done': return 'done';
    case 'blocked': return 'blocked';
    case 'dropped': throw new ChangeError('BMAD v6 has no dropped status. Take the story out of the epics file and sprint-status.yaml instead.');
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function planV6Changes(tree: TicketTree, src: FileSource, changes: TicketChange[], now = new Date()): Promise<FileWrite[]> {
  const statusPath = tree.sprint?.statusPath;
  if (!statusPath) throw new ChangeError('This v6 project has no sprint-status.yaml');
  const leaves = new Map(allLeaves(tree).map((l) => [l.key, l]));
  const pending = new Map<string, string | null>();
  const read = async (path: string) => (pending.has(path) ? pending.get(path) ?? null : src.read(path));
  const write = (path: string, text: string | null) => pending.set(path, text);
  /** Stories whose v6 status this batch set, for the epic roll-up. */
  const statusNow = new Map<string, V6StoryStatus>();
  /** Story files this batch created, by leaf key. */
  const created = new Map<string, string>();

  const leafOf = (key: string): Leaf & { v6: NonNullable<Leaf['v6']> } => {
    const leaf = leaves.get(key);
    if (!leaf) throw new ChangeError(`No ticket ${key}`);
    if (!leaf.v6) throw new ChangeError(`${key} is not a v6 story`);
    return leaf as Leaf & { v6: NonNullable<Leaf['v6']> };
  };
  const storyPath = (leaf: Leaf & { v6: NonNullable<Leaf['v6']> }) => leaf.file?.path ?? created.get(leaf.key);
  const sprint = async () => (await read(statusPath)) ?? '';
  const setSprint = async (key: string, value: string) => { write(statusPath, setSprintStatus(await sprint(), key, value)); };

  /** The story file, created from v6's template when it doesn't exist yet. */
  const ensureStory = async (leaf: Leaf & { v6: NonNullable<Leaf['v6']> }, status: string): Promise<string> => {
    const have = storyPath(leaf);
    if (have) return have;
    const path = joinPath(leaf.v6.storyDir, `${leaf.v6.sprintKey}.md`);
    if ((await read(path)) !== null) throw new ChangeError(`${path} exists already`);
    write(path, newStoryFile(leaf.v6.epic, leaf.v6.story, leaf.entry?.title || leaf.title, status, leaf.entry?.description ?? ''));
    created.set(leaf.key, path);
    // A story file means the story is at least ready-for-dev (sprint-planning reads it so too).
    const listed = sprintValue(await sprint(), leaf.v6.sprintKey);
    if (!listed || listed === 'backlog') await setSprint(leaf.v6.sprintKey, 'ready-for-dev');
    return path;
  };
  const editStory = async (path: string, edit: (body: string) => string) => {
    const text = await read(path);
    if (text === null) throw new ChangeError(`${path} does not exist`);
    write(path, edit(text));
  };
  const currentStatus = async (leaf: Leaf & { v6: NonNullable<Leaf['v6']> }): Promise<V6StoryStatus> => {
    const set = statusNow.get(leaf.key);
    if (set) return set;
    const listed = sprintValue(await sprint(), leaf.v6.sprintKey);
    return (listed as V6StoryStatus | undefined) ?? 'backlog';
  };

  const setStatus = async (leaf: Leaf & { v6: NonNullable<Leaf['v6']> }, status: Exclude<V6StoryStatus, 'blocked'>) => {
    await setSprint(leaf.v6.sprintKey, status);
    const path = storyPath(leaf);
    if (path) await editStory(path, (t) => setStoryField(t, 'Status', status));
    statusNow.set(leaf.key, status);
  };

  for (const change of changes) {
    switch (change.kind) {
      case 'mark': {
        const leaf = leafOf(change.key);
        const target = v6StatusFor(change.status);
        if (target === 'blocked' || change.blockedReason !== undefined) {
          const path = await ensureStory(leaf, 'in-progress');
          await editStory(path, (t) => setStoryField(t, 'Blocked', blockedLine(change.blockedReason || 'blocked from the board', today())));
          // A blocked story is under way in v6 terms; a block given with another status keeps that status.
          if (target !== 'blocked') await setStatus(leaf, target);
          else if (RANK[await currentStatus(leaf)] < RANK['in-progress']) await setStatus(leaf, 'in-progress');
        } else {
          await setStatus(leaf, target);
          const path = storyPath(leaf);
          if (path) await editStory(path, (t) => setStoryField(t, 'Blocked', undefined));
        }
        if (change.assignee !== undefined) {
          const a = change.assignee.trim();
          if (a) await editStory(await ensureStory(leaf, await currentStatus(leaf) === 'backlog' ? 'ready-for-dev' : await currentStatus(leaf)), (t) => setStoryField(t, 'Assignee', a));
          else if (storyPath(leaf)) await editStory(storyPath(leaf) ?? '', (t) => setStoryField(t, 'Assignee', leaf.owner ? '' : undefined));
        }
        break;
      }
      case 'clear-block': {
        const leaf = leafOf(change.key);
        const path = storyPath(leaf);
        if (path) await editStory(path, (t) => setStoryField(t, 'Blocked', undefined));
        break;
      }
      case 'assign': {
        const leaf = leafOf(change.key);
        const a = change.assignee.trim();
        if (a) {
          const now = await currentStatus(leaf);
          await editStory(await ensureStory(leaf, now === 'backlog' ? 'ready-for-dev' : now), (t) => setStoryField(t, 'Assignee', a));
        } else if (storyPath(leaf)) {
          await editStory(storyPath(leaf) ?? '', (t) => setStoryField(t, 'Assignee', leaf.owner ? '' : undefined));
        }
        break;
      }
      case 'edit-entry': {
        const leaf = leafOf(change.key);
        const unsupported = Object.keys(change.patch).filter((k) => k !== 'title' && k !== 'description');
        if (unsupported.length) throw new ChangeError(`BMAD v6 stories have no ${unsupported.join(', ')}`);
        const { title, description } = change.patch;
        const file = storyPath(leaf);
        if (file) {
          // Once the story file exists it is the story's truth (v6 never rewrites the epics file after
          // create-story), and renaming the epics heading would change the key sprint-planning derives.
          await editStory(file, (t) => {
            let out = title !== undefined ? setStoryTitle(t, title) : t;
            if (description !== undefined) out = setSection(out, ['Story'], description);
            return out;
          });
        } else if (leaf.v6.epicsPath) {
          const path = leaf.v6.epicsPath;
          const text = await read(path);
          if (text === null) throw new ChangeError(`${path} does not exist`);
          write(path, editEpicsStory(text, leaf.v6.epic, leaf.v6.story, { title, body: description }));
          // sprint-planning keys a story by its heading's slug; keep the key in step so its status survives.
          if (title !== undefined && leaf.v6.inSprint) {
            const to = `${leaf.v6.epic}-${leaf.v6.story}-${v6Slug(title)}`;
            if (to !== leaf.v6.sprintKey) write(statusPath, renameSprintKey(await sprint(), leaf.v6.sprintKey, to));
          }
        } else {
          throw new ChangeError(`${change.key} has no epics entry or story file to edit`);
        }
        break;
      }
      case 'add-entry': {
        const epic = tree.initiatives.flatMap((i) => i.epics).find((e) => e.slug === change.folder);
        if (!epic) throw new ChangeError(`No epic ${change.folder}`);
        const num = Number(epic.id);
        const path = epic.path.endsWith('.md') && epic.path !== statusPath ? epic.path : tree.sprint?.epicsPath;
        if (!path) throw new ChangeError('This project has no epics file to add the story to');
        const text = await read(path);
        if (text === null) throw new ChangeError(`${path} does not exist`);
        const taken = epic.leaves.map((l) => Number.parseInt(String(l.id), 10)).filter(Number.isFinite);
        const story = String(Math.max(0, ...taken, ...addedIn(pending, statusPath, num)) + 1);
        const e = change.entry;
        const body = [e.description.trim(), e.verify?.trim() ? `**Acceptance Criteria:**\n\n${e.verify.trim()}` : ''].filter(Boolean).join('\n\n');
        write(path, addEpicsStory(text, num, story, e.title, body));
        await setSprint(`${num}-${story}-${v6Slug(e.title)}`, 'backlog');
        break;
      }
      case 'toggle-task': {
        const leaf = leafOf(change.key);
        const path = storyPath(leaf);
        if (!path) throw new ChangeError(`${change.key} has no story file yet`);
        await editStory(path, (t) => setTask(t, change.index, change.checked, change.inFile ? undefined : TASK_SECTIONS));
        break;
      }
      case 'edit-body': {
        const text = await read(change.path);
        if (text === null) throw new ChangeError(`${change.path} does not exist`);
        write(change.path, replaceBody(text, change.body));
        break;
      }
      case 'standup-notes': {
        const prefix = `${tree.outputFolder.replace(/\/+$/, '')}/standups/`;
        if (!change.path.startsWith(prefix) || change.path.includes('..') || !change.path.endsWith('.md')) throw new ChangeError(`stand-up notes go under ${prefix}`);
        write(change.path, change.text.endsWith('\n') ? change.text : `${change.text}\n`);
        break;
      }
      case 'board-config':
        write(BOARD_CONFIG_PATH, boardConfigToml(change.config));
        break;
      case 'reorder':
        throw new ChangeError('BMAD v6 builds stories in number order; renumber them in the epics file to reorder.');
      case 'file-bug':
        throw new ChangeError('BMAD v6 has no backlog bugs. Add a story to an epic instead.');
    }
  }

  await rollUpEpics(tree, statusNow, sprint, setSprint);
  if (pending.has(statusPath)) write(statusPath, stampSprint(await sprint(), v6Stamp(now)));
  return [...pending].map(([path, text]) => ({ path, text }));
}

/** Story numbers this batch already added to an epic, from the keys it wrote. */
function addedIn(pending: Map<string, string | null>, statusPath: string, epic: number): number[] {
  const text = pending.get(statusPath) ?? '';
  return [...text.matchAll(new RegExp(`^\\s+${epic}-(\\d+)[a-z]?-`, 'gm'))].map((m) => Number(m[1]));
}

/** An epic is `in-progress` once a story starts and `done` when every story is. */
async function rollUpEpics(
  tree: TicketTree, statusNow: Map<string, V6StoryStatus>, sprint: () => Promise<string>, setSprint: (key: string, value: string) => Promise<void>,
) {
  if (!statusNow.size) return;
  for (const epic of tree.initiatives.flatMap((i) => i.epics)) {
    if (!epic.leaves.some((l) => statusNow.has(l.key))) continue;
    const text = await sprint();
    const key = `epic-${epic.id}`;
    const now = sprintValue(text, key) ?? 'backlog';
    const statuses = await Promise.all(epic.leaves.map(async (l) => statusNow.get(l.key) ?? ((l.v6 && sprintValue(text, l.v6.sprintKey)) as V6StoryStatus | undefined) ?? 'backlog'));
    const allDone = statuses.length > 0 && statuses.every((s) => s === 'done');
    const started = statuses.some((s) => RANK[s] >= RANK['in-progress']);
    const next = allDone ? 'done' : started || now === 'done' ? 'in-progress' : now;
    if (next !== now) await setSprint(key, next);
  }
}

