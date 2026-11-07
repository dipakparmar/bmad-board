import { expect, test } from 'bun:test';
import { scopeBreadcrumbs } from './breadcrumbs';
import type { Workspace } from './use-board';
import type { Scope } from './board-context';
const workspace = (title: string, additional = false): Workspace => ({ store: { id: 'demo', label: 'demo-project · develop' }, tree: { initiatives: [{ slug: 'sprint', title, epics: [{ slug: 'epic-12', title: 'Ongoing Bug Fixes' }] }, ...(additional ? [{ slug: 'other', title: 'Another initiative', epics: [] }] : [])] } } as unknown as Workspace);

test('collapses the sole project-named v6 initiative without losing epic navigation', () => {
  let selected: Scope | undefined;
  const crumbs = scopeBreadcrumbs(workspace('demo-project'), { workspaceId: 'demo', initiative: 'sprint', epic: 'epic-12' }, (scope) => { selected = scope; });
  expect(crumbs.map((c) => c.label)).toEqual(['demo-project', 'Ongoing Bug Fixes']);
  crumbs[1]!.go();
  expect(selected).toEqual({ workspaceId: 'demo', initiative: 'sprint', epic: 'epic-12' });
  crumbs[0]!.go();
  expect(selected).toEqual({ workspaceId: 'demo' });
});
test('ignores casing and separator differences in a redundant project label', () => {
  expect(scopeBreadcrumbs(workspace('Demo Project'), { workspaceId: 'demo', initiative: 'sprint' }, () => {}).map((c) => c.label)).toEqual(['demo-project']);
});
test('preserves distinct initiatives and same-named levels when multiple initiatives need navigation', () => {
  expect(scopeBreadcrumbs(workspace('Platform foundation'), { workspaceId: 'demo', initiative: 'sprint' }, () => {}).map((c) => c.label)).toEqual(['demo-project', 'Platform foundation']);
  expect(scopeBreadcrumbs(workspace('demo-project', true), { workspaceId: 'demo', initiative: 'sprint' }, () => {}).map((c) => c.label)).toEqual(['demo-project', 'demo-project']);
});
