/**
 * Round trips on v6 files: `examples/v6-template` is built from BMAD v6.12's own templates
 * (sprint-status-template.yaml as shipped, epics-template.md and create-story's template.md filled in).
 * Each edit must change only the lines it means to.
 */
import { describe, expect, test } from 'bun:test';
import { parse } from 'yaml';
import { allLeaves } from './load-tree';
import { FileTicketStore } from './store';
import { fixture } from './testing/fixture';
import { addEpicsStory, setSprintStatus, setStoryField, setTask, stampSprint, v6Slug } from './v6-edit';

const person = { kind: 'person' as const, name: 'Dipak' };
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml';
const EPICS = '_bmad-output/planning-artifacts/epics.md';
const S12 = 'docs/stories/1-2-account-management.md';

async function setup(name = 'v6-template') {
  const src = fixture(name);
  const store = new FileTicketStore(src);
  await store.load();
  return { src, store, before: Object.fromEntries(src.files) as Record<string, string> };
}

/** Lines that differ between two texts, as [before, after] pairs (texts of equal length only). */
function changed(a: string, b: string): [string, string][] {
  const x = a.split('\n');
  const y = b.split('\n');
  expect(y.length).toBe(x.length);
  return x.flatMap((l, i) => (l === y[i] ? [] : [[l, y[i] ?? '']] as [string, string][]));
}

const leaf = async (store: FileTicketStore, key: string) => allLeaves(await store.load()).find((l) => l.key === key);

describe('v6 edits', () => {
  test('a status change touches only the story, its epic and last_updated, comments and order kept', async () => {
    const { src, store, before } = await setup();
    await store.apply([{ kind: 'mark', key: 'epic-1/2', status: 'in-progress' }], person);
    const diff = changed(before[SPRINT] ?? '', (await src.read(SPRINT)) ?? '');
    expect(diff[0]).toEqual(['last_updated: 05-06-2025 21:30', expect.stringMatching(/^last_updated: \d{2}-\d{2}-\d{4} \d{2}:\d{2}$/)]);
    expect(diff.slice(1)).toEqual([
      ['  epic-1: backlog', '  epic-1: in-progress'],
      ['  1-2-account-management: ready-for-dev', '  1-2-account-management: in-progress'],
    ]);
    expect(changed(before[S12] ?? '', (await src.read(S12)) ?? '')).toEqual([['Status: ready-for-dev', 'Status: in-progress']]);
    expect(src.commits[0]?.message).toStartWith('chore(tickets): mark epic-1/2 in-progress');
    expect((await leaf(store, 'epic-1/2'))?.status).toBe('in-progress');
  });

  test('moving a story back writes both places, so the story file does not win it back', async () => {
    const { src, store } = await setup('legacy-v6');
    await store.apply([{ kind: 'mark', key: 'epic-1/2', status: 'ready-for-dev' }], person);
    expect((await src.read('_bmad-output/implementation-artifacts/1-2-password-reset.md'))).toContain('\nStatus: ready-for-dev\n');
    expect((await leaf(store, 'epic-1/2'))?.status).toBe('ready-for-dev');
  });

  test('review on the board is review in v6; the epic is done once every story is', async () => {
    const { src, store } = await setup();
    await store.apply([{ kind: 'mark', key: 'epic-1/2', status: 'in-review' }], person);
    expect(parse((await src.read(SPRINT)) ?? '').development_status['1-2-account-management']).toBe('review');
    await store.load();
    await store.apply(['epic-1/2', 'epic-1/3', 'epic-1/4'].map((key) => ({ kind: 'mark' as const, key, status: 'done' as const })), person);
    const dev = parse((await src.read(SPRINT)) ?? '').development_status;
    expect(dev['epic-1']).toBe('done');
    expect(dev['epic-1-retrospective']).toBe('optional');
    await store.load();
    await store.apply([{ kind: 'mark', key: 'epic-1/4', status: 'in-progress' }], person);
    expect(parse((await src.read(SPRINT)) ?? '').development_status['epic-1']).toBe('in-progress');
  });

  test('dropped and reordering have no v6 equivalent', async () => {
    const { store } = await setup();
    expect(store.apply([{ kind: 'mark', key: 'epic-1/2', status: 'dropped' }], person)).rejects.toThrow('no dropped status');
    expect(store.apply([{ kind: 'reorder', folder: 'epic-1', order: [2, 1] }], person)).rejects.toThrow('number order');
  });

  test('assigning a backlog story creates its story file from the v6 template', async () => {
    const { src, store } = await setup();
    const { paths } = await store.apply([{ kind: 'assign', key: 'epic-1/3', assignee: 'Priya' }], person);
    const path = 'docs/stories/1-3-plant-data-model.md';
    expect(paths.sort()).toEqual([path, SPRINT].sort());
    const text = (await src.read(path)) ?? '';
    expect(text).toStartWith('# Story 1.3: Plant Data Model\n\nStatus: ready-for-dev\nAssignee: Priya\n\n## Story\n\nAs a developer,');
    expect(text).toContain('## Acceptance Criteria\n\n**Given** a new plant');
    expect(text).toContain('## Dev Agent Record');
    expect(parse((await src.read(SPRINT)) ?? '').development_status['1-3-plant-data-model']).toBe('ready-for-dev');
    const l = await leaf(store, 'epic-1/3');
    expect(l?.plan?.assignee).toBe('Priya');
    expect(l?.file?.path).toBe(path);
    await store.apply([{ kind: 'assign', key: 'epic-1/3', assignee: '' }], person);
    expect(await src.read(path)).not.toContain('Assignee:');
  });

  test('blocking writes a Blocked line and keeps the story under way; clearing removes it', async () => {
    const { src, store, before } = await setup();
    await store.apply([{ kind: 'mark', key: 'epic-1/2', status: 'blocked', blockedReason: 'needs the email provider' }], person);
    const diff = changed((before[S12] ?? '') + '\n', (await src.read(S12)) ?? '');
    expect(diff[0]).toEqual(['Status: ready-for-dev', 'Status: in-progress']);
    expect(diff[1]?.[1]).toMatch(/^Blocked: needs the email provider \(since \d{4}-\d{2}-\d{2}\)$/);
    const l = await leaf(store, 'epic-1/2');
    expect(l?.status).toBe('blocked');
    expect(l?.plan?.blockedReason).toBe('needs the email provider');
    expect(parse((await src.read(SPRINT)) ?? '').development_status['1-2-account-management']).toBe('in-progress');
    await store.apply([{ kind: 'clear-block', key: 'epic-1/2' }], person);
    expect(await src.read(S12)).not.toContain('Blocked:');
    // The rail's Block button keeps the status it has and adds the reason.
    await store.apply([{ kind: 'mark', key: 'epic-1/2', status: 'in-review', blockedReason: 'flaky test' }], person);
    expect(await src.read(S12)).toMatch(/\nStatus: review\nBlocked: flaky test \(since /);
    await store.apply([{ kind: 'clear-block', key: 'epic-1/2' }], person);
    expect(await src.read(S12)).not.toContain('Blocked:');
    expect((await leaf(store, 'epic-1/2'))?.status).toBe('in-review');
  });

  test('ticking a task changes that checkbox only; fenced examples do not count', async () => {
    const { src, store, before } = await setup();
    expect((await leaf(store, 'epic-1/2'))?.plan?.body).toContain('Subtask 1.2: Revoke other sessions');
    await store.apply([{ kind: 'toggle-task', key: 'epic-1/2', index: 2, checked: true }], person);
    expect(changed(before[S12] ?? '', (await src.read(S12)) ?? '')).toEqual([['  - [ ] Subtask 1.2: Revoke other sessions', '  - [x] Subtask 1.2: Revoke other sessions']]);
    await store.load();
    expect(store.apply([{ kind: 'toggle-task', key: 'epic-1/2', index: 5, checked: true }], person)).rejects.toThrow('no longer in the file');
  });

  test('title and description edits rewrite only that story in the epics file', async () => {
    const { src, store, before } = await setup();
    await store.apply([{ kind: 'edit-entry', key: 'epic-1/3', patch: { title: 'Plant record', description: 'As a developer,\nI want one plant record,\nSo that features agree.' } }], person);
    const after = (await src.read(EPICS)) ?? '';
    const b = (before[EPICS] ?? '').split('\n');
    const a = after.split('\n');
    const start = b.indexOf('### Story 1.3: Plant Data Model');
    const next = b.indexOf('### Story 1.4: Add Plant Manual');
    expect(a.slice(0, start)).toEqual(b.slice(0, start));
    expect(a.slice(start, a.indexOf('### Story 1.4: Add Plant Manual'))).toEqual(['### Story 1.3: Plant record', '', 'As a developer,', 'I want one plant record,', 'So that features agree.', '']);
    expect(a.slice(a.indexOf('### Story 1.4: Add Plant Manual'))).toEqual(b.slice(next));
    expect((await leaf(store, 'epic-1/3'))?.title).toBe('Plant record');
    // The key follows the heading, as sprint-planning would derive it.
    const dev = parse((await src.read(SPRINT)) ?? '').development_status;
    expect(dev['1-3-plant-record']).toBe('backlog');
    expect(dev['1-3-plant-data-model']).toBeUndefined();
  });

  test('once a story file exists, title edits go to it and leave the epics file and key alone', async () => {
    const { src, store, before } = await setup();
    await store.apply([{ kind: 'edit-entry', key: 'epic-1/2', patch: { title: 'Account settings' } }], person);
    expect(await src.read(S12)).toStartWith('# Story 1.2: Account settings\n');
    expect(await src.read(EPICS)).toBe(before[EPICS] ?? '');
    expect((await leaf(store, 'epic-1/2'))?.title).toBe('Account settings');
    expect(store.apply([{ kind: 'edit-entry', key: 'epic-1/2', patch: { risk: 'high' } }], person)).rejects.toThrow('no risk');
  });

  test('a new story goes at the end of its epic and into sprint-status as backlog', async () => {
    const { src, store } = await setup();
    await store.apply([{ kind: 'add-entry', folder: 'epic-1', entry: { type: 'story', title: 'Delete account', description: 'As a plant owner,\nI want to delete my account,\nSo that my data is gone.', verify: '**Given** I confirm\n**Then** my data is removed', covers: [], after: [], hitl: false } }], person);
    const epics = (await src.read(EPICS)) ?? '';
    expect(epics).toContain('**Then** the plant appears in my list\n\n### Story 1.5: Delete account\n\nAs a plant owner,\nI want to delete my account,\nSo that my data is gone.\n\n**Acceptance Criteria:**\n\n**Given** I confirm\n**Then** my data is removed\n\n<!-- End story repeat -->\n\n## Epic 2');
    const sprint = (await src.read(SPRINT)) ?? '';
    expect(sprint).toContain('  1-4-add-plant-manual: backlog\n  1-5-delete-account: backlog\n  epic-1-retrospective: optional\n');
    const l = await leaf(store, 'epic-1/5');
    expect(l?.title).toBe('Delete account');
    expect(l?.v6?.inSprint).toBe(true);
    // A second one in the same epic takes the next number.
    await store.apply([{ kind: 'add-entry', folder: 'epic-2', entry: { type: 'story', title: 'Voice', description: 'Plants speak.', covers: [], after: [], hitl: false } }], person);
    expect(await src.read(EPICS)).toEndWith('### Story 2.4: Voice\n\nPlants speak.\n');
  });
});

describe('v6 line editors', () => {
  test('setSprintStatus keeps inline comments, quoting style elsewhere and the mapping form', () => {
    const text = 'development_status:\n  epic-1: backlog # first\n  1-1-a:\n    status: review\n    owner: Priya\n  epic-1-retrospective: optional\n';
    expect(setSprintStatus(text, 'epic-1', 'in-progress')).toBe(text.replace('epic-1: backlog # first', 'epic-1: in-progress # first'));
    expect(setSprintStatus(text, '1-1-a', 'done')).toBe(text.replace('status: review', 'status: done'));
    expect(setSprintStatus(text, '1-2-b', 'backlog')).toBe(text.replace('  epic-1-retrospective', '  1-2-b: backlog\n  epic-1-retrospective'));
    expect(setSprintStatus(text, '2-1-c', 'backlog')).toBe(`${text}\n  epic-2: backlog\n  2-1-c: backlog\n  epic-2-retrospective: optional\n`);
  });

  test('stampSprint and slugs follow sprint-planning', () => {
    expect(stampSprint('generated: 01-01-2026 09:00\nproject: x\n', '11-07-2026 02:30')).toBe('generated: 01-01-2026 09:00\nlast_updated: 11-07-2026 02:30\nproject: x\n');
    expect(v6Slug('Add Plant (Manual)!')).toBe('add-plant-manual');
    expect(v6Slug('Ünïcode títle')).toBe('ünïcode-títle');
  });

  test('story fields sit under Status; a bold Status keeps its bold', () => {
    expect(setStoryField('# Story 1.1: X\n\nStatus: review\n\n## Story\n', 'Assignee', 'Priya')).toBe('# Story 1.1: X\n\nStatus: review\nAssignee: Priya\n\n## Story\n');
    expect(setStoryField('# Story 1.1: X\n\n**Status:** review\n', 'Status', 'done')).toBe('# Story 1.1: X\n\n**Status:** done\n');
    expect(setStoryField('# Story 1.1: X\n\n## Story\n', 'Status', 'done')).toBe('# Story 1.1: X\n\nStatus: done\n\n## Story\n');
  });

  test('setTask skips comments and code', () => {
    const text = '<!--\n- [ ] hidden\n-->\n```\n- [ ] code\n```\n- [ ] one\n- [x] two\n';
    expect(setTask(text, 1, false)).toBe(text.replace('- [x] two', '- [ ] two'));
  });

  test('addEpicsStory adds to the right epic when it is not the last', () => {
    const text = '## Epic 1: A\n\nGoal.\n\n### Story 1.1: One\n\nBody.\n\n## Epic 2: B\n\nGoal 2.\n';
    expect(addEpicsStory(text, 1, '2', 'Two', 'Body two.')).toBe('## Epic 1: A\n\nGoal.\n\n### Story 1.1: One\n\nBody.\n\n### Story 1.2: Two\n\nBody two.\n\n## Epic 2: B\n\nGoal 2.\n');
  });
});

/**
 * The checks BMAD v6.12's `sprint_plan.py validate` makes, ported, plus the one `generate` relies on:
 * every story heading in the epics file has the key `N-M-<slug of its title>`.
 */
function bmadValidate(sprintText: string, epicsText: string): string[] {
  const problems: string[] = [];
  const data = parse(sprintText) as Record<string, unknown>;
  for (const f of ['generated', 'last_updated', 'project', 'development_status']) if (data[f] == null) problems.push(`missing ${f}`);
  for (const f of ['generated', 'last_updated']) if (data[f] != null && !/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/.test(String(data[f]))) problems.push(`${f} format`);
  const ranks = { epic: ['backlog', 'in-progress', 'done'], story: ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'], retro: ['optional', 'done'] };
  const legacy: Record<string, string> = { drafted: 'ready-for-dev', contexted: 'in-progress' };
  const dev = data.development_status as Record<string, unknown>;
  for (const [key, raw] of Object.entries(dev)) {
    const kind = /^epic-\d+-retrospective$/.test(key) ? 'retro' : /^epic-\d+$/.test(key) ? 'epic' : /^\d+-\d+[a-z]?-.+/.test(key) ? 'story' : null;
    if (!kind) problems.push(`unrecognized key ${key}`);
    else if (typeof raw !== 'string' || !ranks[kind].includes(legacy[raw] ?? raw)) problems.push(`illegal ${kind} status ${String(raw)} on ${key}`);
  }
  for (const item of (data.action_items as Record<string, unknown>[] | undefined) ?? []) if (!['open', 'in-progress', 'done'].includes(String(item.status))) problems.push('action item status');
  let fenced = false;
  for (const line of epicsText.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const m = fenced ? null : /^#{2,4}\s*Story\s+(\d+)\.(\d+[a-z]?)\s*[:：.\-–—]?\s*(.*?)\s*#*$/.exec(line);
    if (m && !(`${m[1]}-${m[2]}-${v6Slug(m[3] ?? '')}` in dev)) problems.push(`no key for Story ${m[1]}.${m[2]}`);
  }
  return problems;
}

test('after a mixed batch of edits, the files still pass BMAD\'s own sprint-status checks', async () => {
  const { src, store } = await setup();
  await store.apply([{ kind: 'mark', key: 'epic-1/2', status: 'in-review' }, { kind: 'assign', key: 'epic-1/3', assignee: 'Priya' }], person);
  await store.load();
  await store.apply([{ kind: 'mark', key: 'epic-1/3', status: 'blocked', blockedReason: 'schema review' }], person);
  await store.load();
  await store.apply([{ kind: 'add-entry', folder: 'epic-2', entry: { type: 'story', title: 'Voice replies', description: 'Plants speak.', covers: [], after: [], hitl: false } }], person);
  await store.load();
  await store.apply([{ kind: 'edit-entry', key: 'epic-1/4', patch: { title: 'Add a plant by hand' } }, { kind: 'mark', key: 'epic-2/1', status: 'built' }, { kind: 'toggle-task', key: 'epic-1/2', index: 0, checked: true }], person);
  expect(bmadValidate((await src.read(SPRINT)) ?? '', (await src.read(EPICS)) ?? '')).toEqual([]);
  const dev = parse((await src.read(SPRINT)) ?? '').development_status;
  expect(dev).toMatchObject({ 'epic-1': 'in-progress', '1-2-account-management': 'review', '1-3-plant-data-model': 'in-progress', '1-4-add-a-plant-by-hand': 'backlog', 'epic-2': 'in-progress', '2-1-personality-system': 'review', '2-4-voice-replies': 'backlog' });
  // The shipped template's comment header is all still there.
  expect((await src.read(SPRINT))?.split('\n').slice(0, 42)).toEqual(fixture('v6-template').files.get(SPRINT)?.split('\n').slice(0, 42));
});
