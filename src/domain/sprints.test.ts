import { expect, test } from 'bun:test';
import { currentSprint, matchesSprint, parseSprintDefinitions } from './sprints';
const definitions = parseSprintDefinitions({ 'Sprint-2': { start: '2030-10-26', end: '2030-11-06', status: 'active' }, 'Sprint-3': { start: '2030-11-09', end: '2030-11-20', status: 'planned' } });
test('uses inclusive local calendar dates, then explicit active state between windows', () => {
  expect(currentSprint(definitions, new Date(2030, 10, 6, 23, 59))?.id).toBe('Sprint-2');
  expect(currentSprint(definitions, new Date(2030, 10, 7))?.id).toBe('Sprint-2');
  expect(currentSprint(definitions, new Date(2030, 10, 9))?.id).toBe('Sprint-3');
  expect(currentSprint(definitions, new Date(2030, 10, 20, 23, 59))?.id).toBe('Sprint-3');
});
test('does not select future or closed sprints as the current sprint', () => {
  expect(currentSprint([{ id: 'future', start: '2030-11-09', status: 'active' }], new Date(2030, 10, 7))).toBeUndefined();
  expect(currentSprint([{ id: 'closed', start: '2030-11-01', end: '2030-11-15', status: 'closed' }], new Date(2030, 10, 7))).toBeUndefined();
});
test('defaults to current but supports all tickets and unscheduled work explicitly', () => {
  const now = new Date(2030, 10, 7);
  expect(matchesSprint('Sprint-2', undefined, definitions, now)).toBe(true);
  expect(matchesSprint('Sprint-3', undefined, definitions, now)).toBe(false);
  expect(matchesSprint(undefined, 'all', definitions, now)).toBe(true);
  expect(matchesSprint(undefined, 'unscheduled', definitions, now)).toBe(true);
  expect(matchesSprint('Sprint-2', 'unscheduled', definitions, now)).toBe(false);
  expect(matchesSprint('Sprint-3', 'Sprint-3', definitions, now)).toBe(true);
  expect(matchesSprint('Sprint-2', undefined, [], now)).toBe(true);
});
test('rejects impossible dates rather than silently rolling them into another month', () => {
  expect(parseSprintDefinitions({ bad: { start: '2030-02-30', end: 'invalid' } })[0]?.start).toBeUndefined();
});
