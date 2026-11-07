import { describe, expect, test } from 'bun:test';
import { activeCount, filtersFromParams, filtersToParams, matches, NO_FILTERS, type Filters } from './filters';
import type { Ticket } from './view-model';

const ticket = (over: Partial<{ state: string; assignee: string; type: string; readiness: string; init: string; epic: string; risk: string; hitl: boolean }>): Ticket => ({
  uid: 'u', workspaceId: 'w', workspace: 'w', ref: '1.1', readOnly: false, waitingOn: [], readiness: (over.readiness ?? 'ready') as Ticket['readiness'],
  initiative: { slug: over.init ?? 'initiative-a' } as Ticket['initiative'], epic: { slug: over.epic ?? 'epic-x', title: 'X' } as Ticket['epic'],
  leaf: { key: 'epic-x/1', id: 1, type: (over.type ?? 'story') as never, title: 't', folder: 'epic-x', dir: '', initiative: 'initiative-a', after: [], gatedBy: [], hitl: !!over.hitl, risk: over.risk as never, status: '', state: (over.state ?? 'backlog') as never, plan: over.assignee ? { path: '', ticket: '1', status: '', body: '', assignee: over.assignee } : undefined },
});

describe('filters', () => {
  const agent = (n: string) => n.endsWith('-agent');
  test('any of within a facet, all of across facets', () => {
    const f: Filters = { ...NO_FILTERS, states: ['backlog', 'review'], kind: 'agents', epics: ['initiative-a/epic-x'] };
    expect(matches(ticket({ assignee: 'dev-agent' }), f, agent)).toBe(true);
    expect(matches(ticket({ assignee: 'Dipak' }), f, agent)).toBe(false);
    expect(matches(ticket({ assignee: 'dev-agent', state: 'done' }), f, agent)).toBe(false);
    expect(matches(ticket({ assignee: 'dev-agent', init: 'initiative-b' }), f, agent)).toBe(false);
    expect(matches(ticket({}), { ...NO_FILTERS, who: ['-'] }, agent)).toBe(true);
    expect(matches(ticket({ state: 'done' }), { ...NO_FILTERS, hideDone: true }, agent)).toBe(false);
  });

  test('round-trips through the URL', () => {
    const f: Filters = { ...NO_FILTERS, readiness: ['blocked'], who: ['dipak', '-'], kind: 'people', risk: ['high'], epics: ['initiative-a/epic-x'], hideDone: true, hitl: true };
    const p = filtersToParams(f);
    expect(p.toString()).toBe('rd=blocked&who=dipak%2C-&risk=high&ep=initiative-a%2Fepic-x&kind=people&hitl=1&done=0');
    expect(filtersFromParams(p)).toEqual(f);
    expect(filtersFromParams(new URLSearchParams('ticket=1.2'))).toBeNull();
    expect(activeCount(f)).toBe(8);
  });
});

test('an explicit all-tickets sprint choice survives URL sharing instead of reverting to current', () => {
  const filters = { ...NO_FILTERS, sprint: 'all' };
  const params = filtersToParams(filters);
  expect(params.get('sp')).toBe('all');
  expect(filtersFromParams(params)).toEqual(filters);
});
