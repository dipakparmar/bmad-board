import { describe, expect, test } from 'bun:test';
import { membersFromAssignees, membersFromGitLog, mergeMembers, type Member } from './people';
import { recommendIdentities, acceptIdentityRecommendations } from './identity-recommendations';
import { resolveMembers, type Identity } from './identities';

const github = (name: string): Member => ({ name, login: name, avatarUrl: `https://avatars.githubusercontent.com/${name}`, agent: false, commits: 5, sources: ['github'] });
const person = (name: string, email: string) => membersFromGitLog([{ name, email, date: '2026-11-07' }]);

describe('bulk user matching', () => {
  test('groups a BMAD first name, GitHub login, full name and all personal/work/private emails', () => {
    const members = mergeMembers(
      membersFromAssignees(['Dipak']),
      person('Dipak Parmar', 'dipak@work.test'),
      person('Dipak Parmar', 'personal@test.example'),
      person('Dipak Parmar', '24366206+dipakparmar@users.noreply.github.com'),
      [github('dipakparmar')],
    );
    const proposed = recommendIdentities(members, []);
    expect(proposed.ambiguous).toEqual([]);
    expect(proposed.matches).toHaveLength(1);
    expect(proposed.matches[0]?.aliases).toEqual(expect.arrayContaining(['Dipak', 'Dipak Parmar', 'dipakparmar', 'dipak@work.test', 'personal@test.example', '24366206+dipakparmar@users.noreply.github.com']));
    const saved = acceptIdentityRecommendations([], proposed.matches);
    const resolved = resolveMembers(members, saved);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.name).toBe('Dipak');
    expect(resolved[0]?.avatarUrl).toBeTruthy();
    expect(recommendIdentities(members, saved).matches).toHaveLength(0);
  });
  test('does not arbitrarily choose between two people with the same first name', () => {
    const result = recommendIdentities(mergeMembers(membersFromAssignees(['Alex']), person('Alex Smith', 'smith@test'), person('Alex Jones', 'jones@test')), []);
    expect(result.ambiguous).toEqual([{ name: 'Alex', candidates: expect.arrayContaining(['Alex Smith', 'Alex Jones']) }]);
    const rules = acceptIdentityRecommendations([], result.matches);
    expect(resolveMembers(membersFromAssignees(['Alex']), rules)[0]?.name).toBe('Alex');
    expect(result.matches.every((m) => !m.aliases.includes('Alex'))).toBe(true);
  });
  test('retains every email when one author uses multiple addresses in a log scan', () => {
    const members = membersFromGitLog([
      { name: 'Dipak Parmar', email: 'd@work.test', date: '2026-11-07' },
      { name: 'Dipak Parmar', email: 'personal@test', date: '2026-11-06' },
      { name: 'Dipak Parmar', email: 'dipakparmar@users.noreply.github.com', date: '2026-11-05' },
    ]);
    expect(members[0]?.aliases).toEqual(expect.arrayContaining(['d@work.test', 'personal@test', 'dipakparmar@users.noreply.github.com']));
    expect(members[0]?.login).toBe('dipakparmar');
    expect(mergeMembers(members, [github('dipakparmar')])).toHaveLength(1);
  });
  test('keeps agents separate from people who co-authored their commits', () => {
    const members = mergeMembers(membersFromGitLog([{ name: 'demo-agent[bot]', email: '99+demo-agent[bot]@users.noreply.github.com', date: '2026-11-07', coAuthors: 'Dipak Parmar <dipak@test>' }]), membersFromAssignees(['Dipak']));
    const result = recommendIdentities(members, []);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.aliases).not.toContain('demo-agent[bot]');
    expect(resolveMembers(members, acceptIdentityRecommendations([], result.matches))).toHaveLength(2);
  });
  test('accepts selected groups only and preserves saved profile settings when adding emails', () => {
    const existing: Identity = { id: 'dipak', name: 'Dipak', aliases: ['Dipak Parmar', 'd@work'], hidden: true, agent: false };
    const result = recommendIdentities(mergeMembers(person('Dipak Parmar', 'new@test'), person('Jordan Rivera', 's@test')), [existing]);
    const selected = result.matches.filter((m) => m.existingIds.includes('dipak'));
    const saved = acceptIdentityRecommendations([existing], selected);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'dipak', name: 'Dipak', hidden: true, agent: false });
    expect(saved[0]?.aliases).toContain('new@test');
    expect(result.matches).toHaveLength(2);
  });
  test('does not merge two people explicitly kept separate in saved mappings', () => {
    const rules: Identity[] = [{ id: 'a', name: 'Dipak', aliases: ['Dipak Parmar'], agent: false, hidden: false }, { id: 'b', name: 'dipakparmar', aliases: [], agent: false, hidden: false }];
    const result = recommendIdentities([github('dipakparmar'), ...person('Dipak Parmar', 'work@test')], rules);
    expect(result.matches.every((m) => m.existingIds.length <= 1)).toBe(true);
  });
});

test('suggests shortened BMAD names such as chris for Christopher only with one candidate', () => {
  const result = recommendIdentities(mergeMembers(membersFromAssignees(['chris']), person('Christopher Lane', 'christopher@test')), []);
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0]?.aliases).toContain('chris');
});
test('keeps author and committer email variants without counting a commit twice', () => {
  const members = membersFromGitLog([{ name: 'Dipak Parmar', email: 'personal@test', date: '2026-11-07', committerName: 'Dipak Parmar', committerEmail: '42+dipakparmar@users.noreply.github.com' }]);
  expect(members).toHaveLength(1);
  expect(members[0]?.commits).toBe(1);
  expect(members[0]?.aliases).toEqual(expect.arrayContaining(['personal@test', '42+dipakparmar@users.noreply.github.com']));
});
test('does not recommend Codex as a human user', () => {
  const result = recommendIdentities(person('OpenAI Codex', 'codex@openai.test'), []);
  expect(result.matches).toHaveLength(0);
});

test('repairs a previously accepted GitHub-as-person mapping and excludes it from human matches', () => {
  const rules: Identity[] = [{ id: 'github', name: 'GitHub', aliases: ['noreply@github.com'], agent: false, hidden: false }];
  const members = person('GitHub', 'noreply@github.com');
  expect(resolveMembers(members, rules)[0]?.agent).toBe(true);
  expect(recommendIdentities(members, rules).matches).toHaveLength(0);
});
