import { expect, test } from 'bun:test';
import { fixture } from './testing/fixture';
import { allLeaves, loadTicketTree } from './load-tree';
const statusPath = '_bmad-output/implementation-artifacts/sprint-status.yaml';
test('loads dated sprint definitions and story assignment from project metadata', async () => {
  const src = fixture('v6-template');
  src.files.set('_super-bmad/followup/board-config.yaml', 'sprints:\n  Sprint-2:\n    start: "2030-10-26"\n    end: "2030-11-06"\n    status: active\n');
  src.files.set(statusPath, (await src.read(statusPath))!.replace('1-2-account-management: ready-for-dev', '1-2-account-management:\n    status: ready-for-dev\n    sprint: Sprint-2'));
  const tree = await loadTicketTree(src);
  expect(tree.sprints).toEqual([{ id: 'Sprint-2', start: '2030-10-26', end: '2030-11-06', status: 'active' }]);
  expect(allLeaves(tree).find((l) => l.key === 'epic-1/2')?.sprint).toBe('Sprint-2');
});
test('story frontmatter can supply a sprint, but explicit unscheduling in sprint-status wins', async () => {
  const src = fixture('v6-template');
  const path = 'docs/stories/1-2-account-management.md';
  src.files.set(path, `---\nsprint: Sprint-1\n---\n${await src.read(path)}`);
  expect(allLeaves(await loadTicketTree(src)).find((l) => l.key === 'epic-1/2')?.sprint).toBe('Sprint-1');
  src.files.set(statusPath, (await src.read(statusPath))!.replace('1-2-account-management: ready-for-dev', '1-2-account-management:\n    status: ready-for-dev\n    sprint: null'));
  expect(allLeaves(await loadTicketTree(src)).find((l) => l.key === 'epic-1/2')?.sprint).toBeUndefined();
});
