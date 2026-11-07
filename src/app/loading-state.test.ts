import { expect, test } from 'bun:test';
import { workspaceLoadState } from './loading-state';
const project = (id: string, tree: unknown | null, loading: boolean, error?: string) => ({ store: { id, label: id }, tree, loading, error });

test('startup discovery and first load remain loading rather than empty', () => {
  expect(workspaceLoadState([], undefined, true).initial).toBe(true);
  expect(workspaceLoadState([project('demo', null, true)]).initial).toBe(true);
  expect(workspaceLoadState([], undefined, false).initial).toBe(false);
});
test('an empty successfully loaded project is distinct from a project that has not loaded', () => {
  const state = workspaceLoadState([project('demo', { initiatives: [], backlog: [] }, false)]);
  expect(state.hasLoaded).toBe(true);
  expect(state.busy).toBe(false);
  expect(state.initial).toBe(false);
  expect(state.failed).toBe(false);
});
test('refreshes and additional projects preserve previously loaded content', () => {
  const state = workspaceLoadState([project('demo', {}, true), project('other', null, true)]);
  expect(state.initial).toBe(false);
  expect(state.busy).toBe(true);
  expect(state.hasLoaded).toBe(true);
});
test('loading another project does not blank the selected loaded project', () => {
  const workspaces = [project('demo', {}, false), project('other', null, true)];
  expect(workspaceLoadState(workspaces, 'demo').busy).toBe(false);
  expect(workspaceLoadState(workspaces, 'other').initial).toBe(true);
});
test('failed initial reads show a load error rather than an empty board', () => {
  const state = workspaceLoadState([project('demo', null, false, 'Connection lost')]);
  expect(state.failed).toBe(true);
  expect(state.initial).toBe(false);
  expect(state.errors[0]?.error).toBe('Connection lost');
});
