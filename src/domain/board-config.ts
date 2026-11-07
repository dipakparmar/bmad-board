/**
 * Project-wide board settings, committed beside BMAD's own config in `_bmad/custom/bmad-board.toml`
 * so the whole team (and its agents) share them. Per-person preferences stay in the browser.
 */

export const BOARD_CONFIG_PATH = '_bmad/custom/bmad-board.toml';

export interface BoardConfig {
  /** Most tickets a board column should hold at once; the column warns past it. */
  wipLimits: Partial<Record<'backlog' | 'in-progress' | 'review' | 'done', number>>;
  /** Names that are agents, beyond the ones that look like it (`*-agent`, `claude`, `*[bot]`). */
  agents: string[];
  /** People to leave out of assignee suggestions and the stand-up (CI users, ex-teammates). */
  hidden: string[];
}

export const DEFAULT_BOARD_CONFIG: BoardConfig = { wipLimits: {}, agents: [], hidden: [] };

const AGENT = /agent|claude|codex|copilot|bot|\[bot\]/i;

/** Whether a name belongs to an agent: named in the config, or shaped like one. */
export function isAgent(name: string, config: BoardConfig = DEFAULT_BOARD_CONFIG): boolean {
  const n = name.trim().toLowerCase();
  return config.agents.some((a) => a.trim().toLowerCase() === n) || AGENT.test(name);
}

export function isHidden(name: string, config: BoardConfig = DEFAULT_BOARD_CONFIG): boolean {
  const n = name.trim().toLowerCase();
  return config.hidden.some((h) => h.trim().toLowerCase() === n);
}

/** Reads the TOML table shape; anything malformed falls back to the default. */
export function parseBoardConfig(data: Record<string, unknown>): BoardConfig {
  const board = (data.board ?? {}) as Record<string, unknown>;
  const people = (data.people ?? {}) as Record<string, unknown>;
  const limits = (board.wip_limits ?? {}) as Record<string, unknown>;
  const wipLimits: BoardConfig['wipLimits'] = {};
  for (const k of ['backlog', 'in-progress', 'review', 'done'] as const) {
    const v = Number(limits[k]);
    if (Number.isInteger(v) && v > 0) wipLimits[k] = v;
  }
  const names = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []);
  return { wipLimits, agents: names(people.agents), hidden: names(people.hidden) };
}

/** The file the board writes. Only set values are written, so the file stays short. */
export function boardConfigToml(c: BoardConfig): string {
  const q = (s: string) => JSON.stringify(s);
  const limits = Object.entries(c.wipLimits).filter(([, v]) => v && v > 0).map(([k, v]) => `${q(k)} = ${v}`);
  return [
    '# bmad-board settings for this project. Edited from the board\'s Settings page; safe to edit by hand.',
    '',
    '[board]',
    '# Most tickets per board column before it warns.',
    `wip_limits = { ${limits.join(', ')} }`,
    '',
    '[people]',
    '# Names that are agents, beyond ones that look like it (*-agent, claude, *[bot]).',
    `agents = [${c.agents.map(q).join(', ')}]`,
    '# Left out of assignee suggestions and the stand-up.',
    `hidden = [${c.hidden.map(q).join(', ')}]`,
    '',
  ].join('\n');
}
