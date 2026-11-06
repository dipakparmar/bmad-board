import { describe, expect, test } from 'bun:test';
import { parse } from 'smol-toml';
import { boardConfigToml, isAgent, isHidden, parseBoardConfig } from './board-config';

describe('board config', () => {
  test('round-trips through the TOML file it writes', () => {
    const config = { wipLimits: { 'in-progress': 3, review: 2 }, agents: ['qa-runner'], hidden: ['CI'] };
    expect(parseBoardConfig(parse(boardConfigToml(config)))).toEqual(config);
    expect(parseBoardConfig(parse(boardConfigToml({ wipLimits: {}, agents: [], hidden: [] })))).toEqual({ wipLimits: {}, agents: [], hidden: [] });
  });

  test('ignores malformed values', () => {
    expect(parseBoardConfig({ board: { wip_limits: { 'in-progress': -1, review: 'x', done: 4 } }, people: { agents: 'nope' } })).toEqual({ wipLimits: { done: 4 }, agents: [], hidden: [] });
  });

  test('agents are named or look like one; hidden people match by name', () => {
    const c = { wipLimits: {}, agents: ['qa-runner'], hidden: ['ci'] };
    expect(isAgent('QA-Runner', c)).toBe(true);
    expect(isAgent('dev-agent')).toBe(true);
    expect(isAgent('Priya', c)).toBe(false);
    expect(isHidden('CI', c)).toBe(true);
  });
});
