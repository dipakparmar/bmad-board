/**
 * Line-level edits to BMAD v6 files, so a change touches only the lines it means to and every
 * comment, blank line and key order stays as BMAD (or a person) wrote it:
 *
 * - `sprint-status.yaml`: a key's status under `development_status`, a new key in its epic's group,
 *   and `last_updated` (`MM-DD-YYYY HH:MM`, as sprint-planning writes it).
 * - story files: the `Status:` line, plus `Assignee:` and `Blocked:` lines beside it (v6 has no field
 *   for either; BMAD's own tools ignore lines they don't know), sections, the title, task checkboxes.
 * - epics files: a story's heading and body, and a new story at the end of its epic.
 */

export class V6EditError extends Error {}

const FENCE = /^\s*(```|~~~)/;
const STORY_HEAD = /^(#{2,4})\s*Story\s+(\d+)\.(\d+[a-z]?)\s*[:：.\-–—]?\s*(.*?)\s*#*$/i;
const EPIC_HEAD = /^(#{1,3})\s*Epic\s+(\d+)\s*[:：.\-–—]?\s*(.*?)\s*#*$/i;

const lines = (text: string) => text.split('\n');

/** BMAD's `_slug` in sprint_plan.py: lowercase, runs of non-word characters to `-`, at most 60 long. */
export function v6Slug(title: string): string {
  const slug = title.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return slug || 'story';
}

export function v6Stamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getMonth() + 1)}-${p(now.getDate())}-${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

// ---------------------------------------------------------------- sprint-status.yaml

interface Block {
  /** Index of the `development_status:` line. */
  head: number;
  /** One past the last indented content line of the block. */
  end: number;
}

function devBlock(ls: string[]): Block | null {
  const head = ls.findIndex((l) => /^development_status\s*:\s*(#.*)?$/.test(l));
  if (head < 0) return null;
  let end = head + 1;
  for (let i = head + 1; i < ls.length; i++) {
    const l = ls[i] ?? '';
    if (/^\S/.test(l) && !l.startsWith('#')) break;
    if (/^\s+\S/.test(l) && !/^\s+#/.test(l)) end = i + 1;
  }
  return { head, end };
}

const KEY_LINE = /^(\s+)([^\s:#][^:#]*?)\s*:(\s*)([^#]*?)(\s+#.*)?$/;

/** The value of a key in `development_status`, or undefined when the key is not there. */
export function sprintValue(text: string, key: string): string | undefined {
  const ls = lines(text);
  const b = devBlock(ls);
  if (!b) return undefined;
  for (let i = b.head + 1; i < b.end; i++) {
    const m = KEY_LINE.exec(ls[i] ?? '');
    if (m && m[2] === key) return unquote(m[4] ?? '') || nestedStatus(ls, i, b.end)?.value;
  }
  return undefined;
}

const unquote = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, '$2');

/** `key:` with the status on its own `status:` line under it, the mapping form some teams use. */
function nestedStatus(ls: string[], at: number, end: number): { line: number; value: string } | undefined {
  const indent = /^\s*/.exec(ls[at] ?? '')?.[0].length ?? 0;
  for (let i = at + 1; i < end; i++) {
    const l = ls[i] ?? '';
    if (!l.trim() || /^\s*#/.test(l)) continue;
    if ((/^\s*/.exec(l)?.[0].length ?? 0) <= indent) break;
    const m = /^\s+status\s*:\s*([^#]*?)(\s+#.*)?$/.exec(l);
    if (m) return { line: i, value: unquote(m[1] ?? '') };
  }
  return undefined;
}

/**
 * Sets `development_status[key]`. A key that isn't there yet goes at the end of its epic's group (before
 * `epic-N-retrospective`), or in a new group for a new epic. Comments on the line stay.
 */
export function setSprintStatus(text: string, key: string, value: string): string {
  const ls = lines(text);
  const b = devBlock(ls);
  if (!b) throw new V6EditError('sprint-status.yaml has no development_status section');
  for (let i = b.head + 1; i < b.end; i++) {
    const m = KEY_LINE.exec(ls[i] ?? '');
    if (!m || m[2] !== key) continue;
    if (!(m[4] ?? '').trim()) {
      const nested = nestedStatus(ls, i, b.end);
      if (!nested) throw new V6EditError(`${key} in sprint-status.yaml has no status`);
      ls[nested.line] = (ls[nested.line] ?? '').replace(/^(\s+status\s*:\s*)([^#]*?)(\s+#.*)?$/, (_a, pre: string, _v, c = '') => `${pre}${value}${c}`);
    } else {
      ls[i] = `${m[1]}${m[2]}:${m[3] || ' '}${value}${m[5] ?? ''}`;
    }
    return ls.join('\n');
  }
  return insertSprintKey(ls, b, key, value).join('\n');
}

/** Renames a `development_status` key in place, keeping its value and comment. */
export function renameSprintKey(text: string, from: string, to: string): string {
  const ls = lines(text);
  const b = devBlock(ls);
  if (!b) return text;
  for (let i = b.head + 1; i < b.end; i++) {
    const m = KEY_LINE.exec(ls[i] ?? '');
    if (m && m[2] === from) {
      ls[i] = (ls[i] ?? '').replace(`${from}:`, `${to}:`);
      return ls.join('\n');
    }
  }
  return text;
}

function epicOfKey(key: string): number | null {
  const m = /^epic-(\d+)(?:-retrospective)?$/.exec(key) ?? /^(\d+)-/.exec(key);
  return m ? Number(m[1]) : null;
}

function insertSprintKey(ls: string[], b: Block, key: string, value: string): string[] {
  const epic = epicOfKey(key);
  let indent = '  ';
  let lastOfEpic = -1;
  let retro = -1;
  for (let i = b.head + 1; i < b.end; i++) {
    const m = KEY_LINE.exec(ls[i] ?? '');
    if (!m) continue;
    indent = m[1] ?? indent;
    if (m[2] === `epic-${epic}-retrospective`) retro = i;
    else if (epic !== null && epicOfKey(m[2] ?? '') === epic) lastOfEpic = i;
  }
  const line = `${indent}${key}: ${value}`;
  if (retro >= 0) {
    ls.splice(retro, 0, line);
  } else if (lastOfEpic >= 0) {
    let at = lastOfEpic + 1;
    while (at < b.end && /^\s{2,}\S/.test(ls[at] ?? '') && (/^\s*/.exec(ls[at] ?? '')?.[0].length ?? 0) > indent.length) at++;
    ls.splice(at, 0, line);
  } else {
    // A new epic: its own group after a blank line, as sprint-planning lays it out.
    const group = epic === null ? [line] : [`${indent}epic-${epic}: backlog`, ...(key === `epic-${epic}` ? [] : [line]), `${indent}epic-${epic}-retrospective: optional`];
    if (key === `epic-${epic}`) group[0] = line;
    ls.splice(b.end, 0, ...(b.end > b.head + 1 ? [''] : []), ...group);
  }
  return ls;
}

/** Sets `last_updated` (adding it after `generated` when missing). */
export function stampSprint(text: string, stamp: string): string {
  const ls = lines(text);
  const i = ls.findIndex((l) => /^last_updated\s*:/.test(l));
  if (i >= 0) {
    ls[i] = (ls[i] ?? '').replace(/^(last_updated\s*:\s*)([^#]*?)(\s+#.*)?$/, (_a, pre: string, _v, c = '') => `${pre}${stamp}${c}`);
    return ls.join('\n');
  }
  const g = ls.findIndex((l) => /^generated\s*:/.test(l));
  if (g < 0) return text;
  ls.splice(g + 1, 0, `last_updated: ${stamp}`);
  return ls.join('\n');
}

// ---------------------------------------------------------------- story files

const fieldLine = (name: string) => new RegExp(`^(\\s*(?:\\*\\*)?${name}(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*)(.*?)\\s*$`, 'i');

/** A `Name: value` line of a story file (Status, Assignee, Blocked). */
export function storyField(body: string, name: string): string | undefined {
  for (const l of outsideFences(lines(body))) {
    const m = fieldLine(name).exec(l.text);
    if (m) return m[2]?.replace(/\*\*$/, '').trim() || undefined;
  }
  return undefined;
}

function* outsideFences(ls: string[]): Generator<{ i: number; text: string }> {
  let fenced = false;
  let comment = false;
  for (let i = 0; i < ls.length; i++) {
    const text = ls[i] ?? '';
    if (FENCE.test(text)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (comment) {
      if (text.includes('-->')) comment = false;
      continue;
    }
    if (text.includes('<!--') && !text.includes('-->')) {
      comment = true;
      continue;
    }
    yield { i, text: text.replace(/<!--.*?-->/g, '') };
  }
}

/**
 * Sets (or with undefined, removes) a `Name: value` line. `Status` goes after the title; other fields go
 * right under `Status`, in the order they're first written.
 */
export function setStoryField(body: string, name: string, value: string | undefined): string {
  const ls = lines(body);
  const re = fieldLine(name);
  for (const { i, text } of outsideFences(ls)) {
    const m = re.exec(text);
    if (!m) continue;
    if (value === undefined) ls.splice(i, 1);
    else ls[i] = `${m[1]}${value}${/\*\*\s*$/.test(ls[i] ?? '') && m[1]?.includes('**') && !m[1].trimEnd().endsWith('**') ? '**' : ''}`;
    return ls.join('\n');
  }
  if (value === undefined) return body;
  const status = [...outsideFences(ls)].find((l) => fieldLine('Status').exec(l.text));
  if (status && name.toLowerCase() !== 'status') {
    let at = status.i + 1;
    while (at < ls.length && /^\s*(?:\*\*)?[A-Z][\w ]{0,20}(?:\*\*)?\s*:/.test(ls[at] ?? '') && !/^\s*#/.test(ls[at] ?? '')) at++;
    ls.splice(at, 0, `${name}: ${value}`);
    return ls.join('\n');
  }
  const title = ls.findIndex((l) => /^#\s+/.test(l));
  if (title < 0) return `${name}: ${value}\n\n${body}`;
  ls.splice(title + 1, 0, '', `${name}: ${value}`);
  // Keep one blank line between the field and what followed the title.
  if ((ls[title + 3] ?? '').trim()) ls.splice(title + 3, 0, '');
  return ls.join('\n').replace(/\n{3,}(?=\w+: )/, '\n\n');
}

/** Lines of a `## Heading` section: from the line after the heading to the next `##` (or `#`) heading. */
function sectionRange(ls: string[], names: string[]): { head: number; start: number; end: number } | null {
  const wanted = names.map((n) => n.toLowerCase());
  let head = -1;
  for (const { i, text } of outsideFences(ls)) {
    const m = /^(#{1,2})\s+(.+?)\s*#*$/.exec(text);
    if (!m) continue;
    if (head >= 0) return { head, start: head + 1, end: i };
    if ((m[1] ?? '') === '##' && wanted.includes((m[2] ?? '').toLowerCase())) head = i;
  }
  return head >= 0 ? { head, start: head + 1, end: ls.length } : null;
}

export const TASK_SECTIONS = ['Tasks / Subtasks', 'Tasks/Subtasks', 'Tasks'];

/** Replaces a section's content, or adds the section after `after` (or at the end) when it's missing. */
export function setSection(body: string, names: string[], content: string, after?: string[]): string {
  const ls = lines(body);
  const r = sectionRange(ls, names);
  const block = ['', ...content.trim().split('\n'), ''];
  if (r) {
    ls.splice(r.start, r.end - r.start, ...block);
    return ls.join('\n');
  }
  const prev = after ? sectionRange(ls, after) : null;
  const at = prev ? prev.end : ls.length;
  ls.splice(at, 0, `## ${names[0]}`, ...block);
  return ls.join('\n');
}

/** Sets the title in `# Story N.M: Title`. */
export function setStoryTitle(body: string, title: string): string {
  const ls = lines(body);
  const i = ls.findIndex((l) => /^#\s+/.test(l));
  if (i < 0) return `# ${title}\n\n${body}`;
  const m = /^(#\s+Story\s+[\d.]+[a-z]?\s*[:：.\-–—]?\s*)/i.exec(ls[i] ?? '');
  ls[i] = m ? `${m[1]}${title}` : `# ${title}`;
  return ls.join('\n');
}

const CHECKBOX = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

/**
 * Ticks or unticks the `index`th checkbox (counting from 0, in the order the board shows them) of the
 * whole text or, with `section`, of that `##` section. Fenced code and HTML comments don't count.
 */
export function setTask(text: string, index: number, checked: boolean, section?: string[]): string {
  const ls = lines(text);
  const r = section ? sectionRange(ls, section) : null;
  if (section && !r) throw new V6EditError('The story file has no Tasks / Subtasks section');
  let n = 0;
  for (const { i, text: l } of outsideFences(ls)) {
    if (r && (i < r.start || i >= r.end)) continue;
    const m = CHECKBOX.exec(l);
    if (!m) continue;
    if (n++ !== index) continue;
    ls[i] = (ls[i] ?? '').replace(CHECKBOX, `$1${checked ? 'x' : ' '}$3`);
    return ls.join('\n');
  }
  throw new V6EditError('That task is no longer in the file; reload and try again');
}

/** A story file as v6's create-story template lays it out, filled with what the epics file says. */
export function newStoryFile(epic: number, story: string, title: string, status: string, planned = ''): string {
  const [storyText, acceptance] = splitPlanned(planned);
  return [
    `# Story ${epic}.${story}: ${title}`, '', `Status: ${status}`, '',
    '## Story', '', storyText || 'As a {{role}},\nI want {{action}},\nso that {{benefit}}.', '',
    '## Acceptance Criteria', '', acceptance || '1. [Add acceptance criteria from epics/PRD]', '',
    '## Tasks / Subtasks', '', '- [ ] Task 1 (AC: #)', '',
    '## Dev Notes', '', '### References', '',
    '## Dev Agent Record', '', '### Agent Model Used', '', '### Debug Log References', '', '### Completion Notes List', '', '### File List', '',
  ].join('\n');
}

/** An epics-file story body split at its `**Acceptance Criteria:**` label. */
function splitPlanned(body: string): [string, string] {
  const m = /^\s*\*\*Acceptance Criteria:?\*\*:?\s*$/im.exec(body) ?? /\*\*Acceptance Criteria:?\*\*:?/i.exec(body);
  if (!m) return [body.trim(), ''];
  return [body.slice(0, m.index).trim(), body.slice(m.index + m[0].length).trim()];
}

// ---------------------------------------------------------------- epics files

interface StoryAt {
  head: number;
  end: number;
  level: string;
}

function findStory(ls: string[], epic: number, story: string): StoryAt | null {
  let found: StoryAt | null = null;
  for (const { i, text } of outsideFences(ls)) {
    if (found) {
      if (STORY_HEAD.test(text) || EPIC_HEAD.test(text) || /^#{1,2}\s/.test(text)) {
        found.end = i;
        return found;
      }
      continue;
    }
    const m = STORY_HEAD.exec(text);
    if (m && Number(m[2]) === epic && m[3] === story) found = { head: i, end: ls.length, level: m[1] ?? '###' };
  }
  return found;
}

/** Rewrites a story's heading title and/or body in an epics file. */
export function editEpicsStory(text: string, epic: number, story: string, patch: { title?: string; body?: string }): string {
  const ls = lines(text);
  const at = findStory(ls, epic, story);
  if (!at) throw new V6EditError(`Story ${epic}.${story} is not in the epics file`);
  if (patch.body !== undefined) {
    // Keep the blank lines (and any `<!-- -->` markers) that separate it from the next heading.
    let end = at.end;
    while (end > at.head + 1 && !(ls[end - 1] ?? '').trim()) end--;
    ls.splice(at.head + 1, end - at.head - 1, '', ...patch.body.trim().split('\n'));
  }
  if (patch.title !== undefined) ls[at.head] = `${at.level} Story ${epic}.${story}: ${patch.title}`;
  return ls.join('\n');
}

/** Appends `### Story N.M: Title` and its body at the end of epic N's section. */
export function addEpicsStory(text: string, epic: number, story: string, title: string, body: string): string {
  const ls = lines(text);
  let head = -1;
  let end = ls.length;
  let level = '###';
  for (const { i, text: l } of outsideFences(ls)) {
    const em = EPIC_HEAD.exec(l);
    const sm = STORY_HEAD.exec(l);
    if (sm) level = sm[1] ?? level;
    if (head < 0) {
      if (em && Number(em[2]) === epic) head = i;
      continue;
    }
    if (em || (/^#{1,2}\s/.test(l) && !sm)) {
      end = i;
      break;
    }
  }
  if (head < 0) throw new V6EditError(`Epic ${epic} is not in the epics file`);
  let at = end;
  while (at > head + 1 && !(ls[at - 1] ?? '').trim()) at--;
  // End-of-repeat markers from the template stay after the stories.
  while (at > head + 1 && /^\s*<!--.*-->\s*$/.test(ls[at - 1] ?? '')) at--;
  while (at > head + 1 && !(ls[at - 1] ?? '').trim()) at--;
  const block = ['', `${level} Story ${epic}.${story}: ${title}`, '', ...(body.trim() ? body.trim().split('\n') : []), ...(at < ls.length && (ls[at] ?? '').trim() ? [''] : [])];
  ls.splice(at, 0, ...block);
  return ls.join('\n').replace(/\n*$/, '\n');
}
