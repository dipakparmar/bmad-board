import { expect, test } from 'bun:test';
import { createPersonResolver, resolveMembers, type Identity } from '../domain/identities';
import { mergeMembers, membersFromGitLog } from '../domain/people';
import { resolveTicketPeople } from './ticket-people';
import type { Ticket } from './view-model';

test('ticket fields use the same joined roster identity as Settings even without a saved mapping', () => {
  const members = mergeMembers(membersFromGitLog([
    { name: 'Dipak Parmar', email: 'person@test', date: '2026-11-07' },
    { name: 'dipakparmar', email: 'person@test', date: '2026-11-06' },
  ]));
  const roster = resolveMembers(members, []);
  const resolve = createPersonResolver(roster, []);
  const source = { workspaceId: 'demo', leaf: { owner: 'dipakparmar', plan: { assignee: 'person@test' } }, epic: { owner: 'dipakparmar' }, initiative: { owner: 'person@test' } } as Ticket;
  const ticket = resolveTicketPeople(source, resolve);
  const name = roster[0]!.name;
  expect(ticket.leaf.owner).toBe(name);
  expect(ticket.leaf.plan?.assignee).toBe(name);
  expect(ticket.epic?.owner).toBe(name);
  expect(ticket.initiative?.owner).toBe(name);
  expect(source.leaf.owner).toBe('dipakparmar');
  expect(source.leaf.plan?.assignee).toBe('person@test');
});

test('a saved mapping and all observed Git aliases resolve to one profile id and avatar', () => {
  const rules: Identity[] = [{ id: 'dipak', name: 'Dipak', aliases: ['person@test'], agent: false, hidden: false }];
  const raw = membersFromGitLog([{ name: 'Dipak Parmar', email: 'person@test', date: '2026-11-07' }]);
  raw[0]!.avatarUrl = 'https://avatars.githubusercontent.com/dipakparmar';
  const resolve = createPersonResolver(resolveMembers(raw, rules), rules);
  expect(resolve('Dipak Parmar')?.id).toBe('dipak');
  expect(resolve('person@test')?.id).toBe('dipak');
  expect(resolve('Dipak')?.name).toBe('Dipak');
  expect(resolve('Dipak Parmar')?.avatarUrl).toBe(raw[0]?.avatarUrl);
});
