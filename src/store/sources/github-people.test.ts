import { expect, test } from 'bun:test';
import { membersFromGitLog, mergeMembers } from '../../domain/people';
import { createPersonResolver, resolveMembers } from '../../domain/identities';
import { avatarLookupCommits, membersFromGitHubAccounts } from './github-people';

test('a personal commit email gains the actual GitHub account photo and survives the board resolver', () => {
  const raw = membersFromGitLog([{ name: 'Sam Taylor', email: 'sam@example.com', date: '2026-11-07' }]);
  const accounts = membersFromGitHubAccounts([{ author: { login: 'sam-taylor', avatar_url: 'https://avatars.githubusercontent.com/u/0?v=4', type: 'User' }, commit: { author: { name: 'Sam Taylor', email: 'sam@example.com' }, message: 'Work' } }]);
  const members = mergeMembers(raw, accounts);
  const rules = [{ id: 'sam', name: 'Sam', aliases: ['Sam Taylor', 'sam@example.com'], agent: false, hidden: false }];
  const resolve = createPersonResolver(resolveMembers(members, rules), rules);
  expect(resolve('Sam')?.avatarUrl).toBe('https://avatars.githubusercontent.com/u/0?v=4');
  expect(resolve('Sam Taylor')?.login).toBe('sam-taylor');
  expect(resolve('Sam')?.commits).toBe(1);
});
test('avatar lookups use exact local commit evidence and exclude bots and existing photos', () => {
  const humans = membersFromGitLog([{ name: 'Sam Taylor', email: 'sam@example.com', date: '2026-11-07' }]);
  const bots = membersFromGitLog([{ name: 'github-actions[bot]', email: 'actions@test', date: '2026-11-07' }]);
  const lines = [{ sha: 'actual-sam-commit', name: 'Sam Taylor', email: 'sam@example.com' }, { sha: 'bot-commit', name: 'github-actions[bot]', email: 'actions@test' }];
  expect(avatarLookupCommits([...humans, ...bots], lines)).toEqual(['actual-sam-commit']);
  expect(avatarLookupCommits([{ ...humans[0]!, avatarUrl: 'https://photo' }], lines)).toEqual([]);
});
test('unlinked commit emails do not get a guessed GitHub login or picture', () => {
  expect(membersFromGitHubAccounts([{ author: null, commit: { author: { name: 'Unknown Person', email: 'unknown@test' }, message: 'Work' } }])).toEqual([]);
});
