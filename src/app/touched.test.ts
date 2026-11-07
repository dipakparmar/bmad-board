import { describe, expect, test } from 'bun:test';
import { ticketsTouched } from './touched';
import type { Ticket } from './view-model';

const epic = { type: 'epic', slug: 'epic-a', title: 'A', path: 'out/init/tickets/epic-a/epic-a.md' };
const initiative = { type: 'initiative', slug: 'init', title: 'Init', path: 'out/init/init.md' };
const t = (id: number, file?: string, plan?: string) =>
  ({ uid: `u${id}`, workspaceId: 'w', ref: `1.${id}`, epic, initiative, leaf: { dir: 'out/init/tickets/epic-a/tickets', file: file ? { path: file } : undefined, plan: plan ? { path: plan } : undefined } }) as unknown as Ticket;

describe('ticketsTouched', () => {
  const all = [t(1, 'out/init/tickets/epic-a/tickets/story-x.md', 'out/init/tickets/epic-a/tickets/story-x-plan.md'), t(2)];
  test('finds tickets by file and plan', () => {
    const r = ticketsTouched(['out/init/tickets/epic-a/tickets/story-x-plan.md'], all);
    expect(r.tickets.map((x) => [x.ticket.ref, x.how])).toEqual([['1.1', ['plan']]]);
    expect(r.containers).toEqual([]);
  });
  test('names the epic once for its tickets.toml and the initiative for its epic table', () => {
    const r = ticketsTouched(['out/init/tickets/epic-a/tickets/tickets.toml', 'out/init/tickets/tickets.toml'], all);
    expect(r.tickets).toEqual([]);
    expect(r.containers.map((c) => [c.kind, c.how])).toEqual([['epic', 'tickets.toml'], ['initiative', 'tickets.toml']]);
  });
});
