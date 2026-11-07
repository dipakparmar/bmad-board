/**
 * BMAD v6's implementation tracking, read as the v6 workflows write it:
 *
 * - `{implementation_artifacts}/sprint-status.yaml` (sprint-planning): metadata, then `development_status`
 *   keyed `epic-N`, `N-M-slug` (split stories as `N-Ma-slug`) and `epic-N-retrospective`, and the
 *   retrospective's `action_items`.
 * - `{planning_artifacts}/epics.md` or sharded `epics/epic-N.md` (create-epics-and-stories):
 *   `## Epic N: Title`, a goal paragraph, then `### Story N.M: Title` with the user story and
 *   Given/When/Then acceptance criteria.
 * - `{story_location}/N-M-slug.md` (create-story, dev-story, code-review): `# Story N.M: Title`,
 *   a `Status:` line, `## Story`, `## Acceptance Criteria`, `## Tasks / Subtasks` checkboxes, `## Dev Notes`
 *   with `[Source: …]` citations, `## Dev Agent Record`, `## Change Log`.
 *
 * The board edits these files in place (store/changes-v6.ts); `bmad migrate method` stays optional.
 */
import { parse } from 'yaml';
import type { LeafStatus } from './status';

/** Board statuses a v6 story can be set to: v6's own four past backlog, and a block. */
export const V6_PICKABLE: LeafStatus[] = ['ready-for-dev', 'in-progress', 'in-review', 'done', 'blocked'];

export type V6StoryStatus = 'backlog' | 'ready-for-dev' | 'in-progress' | 'review' | 'done' | 'blocked';
export type V6EpicStatus = 'backlog' | 'in-progress' | 'done';
export type V6RetroStatus = 'optional' | 'done';

export interface V6ActionItem {
  epic?: number;
  action: string;
  owner?: string;
  status: 'open' | 'in-progress' | 'done';
}

export interface V6SprintStatus {
  generated?: string;
  lastUpdated?: string;
  project?: string;
  projectKey?: string;
  trackingSystem?: string;
  storyLocation?: string;
  epics: { num: number; status: V6EpicStatus; owner?: string; retrospective?: V6RetroStatus }[];
  stories: { key: string; epic: number; story: string; slug: string; status: V6StoryStatus; owner?: string; sprint?: string | null }[];
  actionItems: V6ActionItem[];
  problems: string[];
}

const STORY_RANK: Record<V6StoryStatus, number> = { backlog: 0, 'ready-for-dev': 1, 'in-progress': 2, review: 3, done: 4, blocked: 2 };

/** A story status as written, with v6's legacy names (`drafted`, `contexted`) and common spellings. */
export function v6StoryStatus(raw: unknown): V6StoryStatus | null {
  const s = String(raw ?? '').trim().toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
  if (s === 'drafted') return 'ready-for-dev';
  if (s === 'contexted') return 'in-progress';
  if (s === 'in-review' || s === 'code-review') return 'review';
  if (s === 'completed' || s === 'complete') return 'done';
  return s in STORY_RANK ? (s as V6StoryStatus) : null;
}

/** v6 never moves a story backwards: the later of two readings (status file, story file) wins. */
export function laterStatus(a: V6StoryStatus | null, b: V6StoryStatus | null): V6StoryStatus | null {
  if (!a || !b) return a ?? b;
  if (a === 'blocked' || b === 'blocked') return 'blocked';
  return STORY_RANK[a] >= STORY_RANK[b] ? a : b;
}

/** v6 story status → the board's leaf status. `backlog` means the story only exists in the epics file. */
export function leafStatusFromV6(s: V6StoryStatus | null): LeafStatus | '' {
  switch (s) {
    case 'ready-for-dev': return 'ready-for-dev';
    case 'in-progress': return 'in-progress';
    case 'review': return 'in-review';
    case 'done': return 'done';
    case 'blocked': return 'blocked';
    default: return '';
  }
}

const EPIC_KEY = /^epic-(\d+)$/;
const RETRO_KEY = /^epic-(\d+)-retrospective$/;
const STORY_KEY = /^(\d+)-(\d+[a-z]?)-(.+)$/;
const text = (v: unknown) => (v === undefined || v === null ? undefined : String(v).trim() || undefined);

export function parseSprintStatus(source: string, where = 'sprint-status.yaml'): V6SprintStatus {
  const out: V6SprintStatus = { epics: [], stories: [], actionItems: [], problems: [] };
  let doc: Record<string, unknown> = {};
  try {
    doc = (parse(source) ?? {}) as Record<string, unknown>;
  } catch (cause) {
    out.problems.push(`${where}: ${cause instanceof Error ? cause.message : 'invalid YAML'}`);
    return out;
  }
  out.generated = text(doc.generated);
  out.lastUpdated = text(doc.last_updated);
  out.project = text(doc.project);
  out.projectKey = text(doc.project_key);
  out.trackingSystem = text(doc.tracking_system);
  out.storyLocation = text(doc.story_location);
  const epicOf = (num: number) => {
    let e = out.epics.find((x) => x.num === num);
    if (!e) {
      e = { num, status: 'backlog' };
      out.epics.push(e);
    }
    return e;
  };
  for (const [key, value] of Object.entries((doc.development_status ?? {}) as Record<string, unknown>)) {
    const fields = value && typeof value === 'object' ? (value as Record<string, unknown>) : { status: value };
    const status = String(fields.status ?? '').trim().toLowerCase().replaceAll('_', '-');
    let m = RETRO_KEY.exec(key);
    if (m) {
      epicOf(Number(m[1])).retrospective = status === 'done' || status === 'completed' ? 'done' : 'optional';
      continue;
    }
    m = EPIC_KEY.exec(key);
    if (m) {
      const e = epicOf(Number(m[1]));
      e.owner = text(fields.owner ?? fields.assignee);
      // `contexted` was v6's early name for an epic under way.
      if (status === 'done' || status === 'completed') e.status = 'done';
      else if (status === 'in-progress' || status === 'contexted') e.status = 'in-progress';
      else if (status !== 'backlog') out.problems.push(`${where}: ${key} has unknown status ${JSON.stringify(fields.status)}`);
      continue;
    }
    m = STORY_KEY.exec(key);
    if (m) {
      const parsed = v6StoryStatus(fields.status);
      if (!parsed) out.problems.push(`${where}: ${key} has unknown status ${JSON.stringify(fields.status)}; reads as backlog`);
      epicOf(Number(m[1]));
      out.stories.push({ key, epic: Number(m[1]), story: m[2] ?? '', slug: m[3] ?? '', status: parsed ?? 'backlog', owner: text(fields.owner ?? fields.assignee), sprint: 'sprint' in fields ? text(fields.sprint) ?? null : undefined });
      continue;
    }
    out.problems.push(`${where}: ${key} is not an epic, story or retrospective key`);
  }
  for (const raw of Array.isArray(doc.action_items) ? doc.action_items : []) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const action = text(a.action);
    if (!action) continue;
    const st = String(a.status ?? 'open').toLowerCase().replaceAll('_', '-');
    out.actionItems.push({ epic: a.epic === undefined ? undefined : Number(a.epic), action, owner: text(a.owner), status: st === 'done' ? 'done' : st === 'in-progress' ? 'in-progress' : 'open' });
  }
  out.epics.sort((a, b) => a.num - b.num);
  return out;
}

export interface V6EpicsDoc {
  epics: { num: number; title: string; goal: string; stories: { epic: number; story: string; title: string; body: string }[] }[];
}

const EPIC_RE = /^#{1,3}\s*Epic\s+(\d+)\s*[:：.\-–—]?\s*(.*?)\s*#*$/i;
const STORY_RE = /^#{2,4}\s*Story\s+(\d+)\.(\d+[a-z]?)\s*[:：.\-–—]?\s*(.*?)\s*#*$/i;

/** Epics and their stories from an epics file (or sharded files joined in order). Fenced code is skipped. */
export function parseEpicsDoc(source: string): V6EpicsDoc {
  const out: V6EpicsDoc = { epics: [] };
  let epic: V6EpicsDoc['epics'][number] | undefined;
  let story: V6EpicsDoc['epics'][number]['stories'][number] | undefined;
  let fenced = false;
  const lines: string[] = [];
  const flush = () => {
    const body = lines.join('\n').trim();
    if (story) story.body = body;
    else if (epic) epic.goal = body;
    lines.length = 0;
  };
  for (const line of source.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const em = fenced ? null : EPIC_RE.exec(line);
    const sm = fenced ? null : STORY_RE.exec(line);
    if (em) {
      flush();
      const num = Number(em[1]);
      epic = out.epics.find((e) => e.num === num);
      if (!epic) {
        epic = { num, title: (em[2] ?? '').trim() || `Epic ${num}`, goal: '', stories: [] };
        out.epics.push(epic);
      }
      story = undefined;
      continue;
    }
    if (sm) {
      flush();
      const num = Number(sm[1]);
      epic = out.epics.find((e) => e.num === num) ?? epic;
      if (!epic || epic.num !== num) {
        epic = { num, title: `Epic ${num}`, goal: '', stories: [] };
        out.epics.push(epic);
      }
      story = { epic: num, story: sm[2] ?? '', title: (sm[3] ?? '').trim(), body: '' };
      epic.stories.push(story);
      continue;
    }
    // Any other `#` or `##` heading (an appendix, say) ends the epic it follows.
    if (!fenced && /^#{1,2}\s/.test(line)) {
      flush();
      story = undefined;
      epic = undefined;
      continue;
    }
    if (epic) lines.push(line);
  }
  flush();
  return out;
}

export interface V6StoryFile {
  title?: string;
  status: V6StoryStatus | null;
  /** `## Story`: the As a / I want / so that. */
  story?: string;
  acceptance?: string;
  /** `## Tasks / Subtasks`, checkboxes and all. */
  tasks?: string;
  /** Review follow-ups the code review left (`[AI-Review]` items still open). */
  openReviewItems: number;
  /** `Assignee:` and `Blocked:` lines the board writes under `Status:`; v6 has no field for either. */
  assignee?: string;
  owner?: string;
  blocked?: { reason: string; since?: string };
}

/** `Blocked: reason (since 2026-11-07)`. */
export function blockedLine(reason: string, since?: string): string {
  return since ? `${reason} (since ${since})` : reason;
}

function parseBlocked(raw: string | undefined): V6StoryFile['blocked'] {
  if (!raw?.trim()) return undefined;
  const m = /^(.*?)\s*\(since (\d{4}-\d{2}-\d{2})\)\s*$/.exec(raw.trim());
  return m ? { reason: m[1] || 'blocked', since: m[2] } : { reason: raw.trim() };
}

const field = (body: string, name: string) => new RegExp(`^\\s*(?:\\*\\*)?${name}(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*(.+?)\\s*$`, 'im').exec(body)?.[1]?.replace(/\*\*$/, '').trim() || undefined;

/** Sections of a v6 story file, keyed by their `##` heading, lowercased. */
function sections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let name = '';
  let buf: string[] = [];
  let fenced = false;
  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const m = fenced ? null : /^##\s+(.+?)\s*#*$/.exec(line);
    if (m) {
      if (name) out.set(name, buf.join('\n').trim());
      name = (m[1] ?? '').toLowerCase();
      buf = [];
    } else if (name) buf.push(line);
  }
  if (name) out.set(name, buf.join('\n').trim());
  return out;
}

export function parseStoryFile(body: string): V6StoryFile {
  const title = /^#\s+(.+)$/m.exec(body)?.[1]?.replace(/^Story\s+[\d.]+[a-z]?\s*[:：.\-–—]?\s*/i, '').trim();
  const statusLine = /^\s*(?:\*\*)?Status(?:\*\*)?\s*:\s*(?:\*\*)?\s*([\w -]+)/im.exec(body)?.[1];
  const s = sections(body);
  const tasks = s.get('tasks / subtasks') ?? s.get('tasks/subtasks') ?? s.get('tasks');
  return {
    title: title || undefined,
    status: v6StoryStatus(statusLine),
    story: s.get('story'),
    acceptance: s.get('acceptance criteria'),
    tasks,
    openReviewItems: [...(tasks ?? '').matchAll(/^\s*[-*]\s+\[ \]\s+\[AI-Review\]/gim)].length,
    assignee: /^[ \t]*(?:\*\*)?Assignee(?:\*\*)?[ \t]*:[ \t]*(?:\*\*)?[ \t]*([^\r\n]*)$/im.exec(body)?.[1]?.replace(/\*\*$/, '').trim(),
    owner: field(body, 'Owner'),
    blocked: parseBlocked(field(body, 'Blocked')),
  };
}
