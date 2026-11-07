import { describe, expect, test } from 'bun:test';
import { findIdentity, identityError, resolveMembers, type Identity } from './identities';
import { membersFromAssignees, membersFromGitLog, mergeMembers } from './people';
const person: Identity = { id: 'dipak', name: 'Dipak', aliases: ['dipakparmar', 'Dipak Parmar', 'dipak@example.com'], agent: false, hidden: false };

describe('explicit identity corrections', () => {
  test('links names, emails and logins without guessing first names', () => {
    expect(findIdentity(' @DipakParmar ', [person])).toBe(person);
    expect(findIdentity('DIPAK@example.com', [person])).toBe(person);
    expect(findIdentity('Dipak Other', [person])).toBeUndefined();
    expect(findIdentity('dipakparmar', [])).toBeUndefined();
  });
  test('rejects ambiguous aliases and empty names', () => {
    expect(identityError({ ...person, id: 'other', name: 'Someone' }, [person])).toContain('already belongs');
    expect(identityError({ ...person, name: ' ' }, [])).toContain('display name');
    expect(identityError(person, [person])).toBeUndefined();
  });
  test('merges bot co-authorship with ticket owners while keeping bot separate', () => {
    const raw = mergeMembers(membersFromGitLog([{ name: 'demo-agent[bot]', email: 'bot@example.com', date: '2026-11-07', coAuthors: 'Dipak Parmar <dipak@example.com>\nDipak Parmar <dipak@example.com>' }]), membersFromAssignees(['Dipak']));
    const resolved = resolveMembers(raw, [person]);
    expect(resolved).toHaveLength(2);
    expect(resolved.find((m) => m.name === 'Dipak')).toMatchObject({ agent: false, commits: 1, sources: ['git', 'tickets'] });
    expect(resolved.find((m) => m.name === 'demo-agent[bot]')?.agent).toBe(true);
    expect(raw.find((m) => m.name === 'Dipak Parmar')).toBeDefined();
  });
  test('explicit person classification overrides inferred bot names', () => {
    const rule = { ...person, name: 'Robotson', aliases: ['robotson'], agent: false };
    expect(resolveMembers(membersFromAssignees(['robotson']), [rule])[0]?.agent).toBe(false);
  });
  test('a bridging GitHub record merges both existing groups and retains aliases', () => {
    const raw = mergeMembers(membersFromAssignees(['dipakparmar']), membersFromGitLog([{ name: 'Dipak Parmar', email: 'dipak@example.com', date: '2026-11-07' }]), [{ name: 'Profile', login: 'dipakparmar', email: 'dipak@example.com', agent: false, commits: 5, sources: ['github'] }]);
    expect(raw).toHaveLength(1);
    expect(raw[0]?.aliases).toContain('Dipak Parmar');
  });
});
