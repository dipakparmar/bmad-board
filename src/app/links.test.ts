import { describe, expect, test } from 'bun:test';
import { commitTarget, fileTarget, linkifyRefs } from './links';

const gh = { web: 'https://github.com/o/r', branch: 'main', dir: 'app', localRoot: '/home/d/r/app' };

describe('fileTarget', () => {
  test('opens on GitHub under the project folder', () => {
    expect(fileTarget(gh, '_bmad-output/a b.md', 'github')).toEqual({ kind: 'url', href: 'https://github.com/o/r/blob/main/app/_bmad-output/a%20b.md' });
  });
  test('opens in the editor when the folder is on this computer', () => {
    expect(fileTarget(gh, 'x.md', 'vscode')).toEqual({ kind: 'url', href: 'vscode://file/home/d/r/app/x.md' });
    expect(fileTarget({ ...gh, localRoot: 'C:\\code\\r' }, 'x.md', 'cursor')).toEqual({ kind: 'url', href: 'cursor://file/C%3A/code/r/x.md' });
  });
  test('falls back to GitHub, then the board', () => {
    expect(fileTarget({ ...gh, localRoot: undefined }, 'x.md', 'vscode')).toMatchObject({ kind: 'url', fellBackTo: 'GitHub' });
    expect(fileTarget({ dir: '' }, 'x.md', 'github')).toEqual({ kind: 'board' });
    expect(fileTarget(gh, 'tickets.toml', 'board', false)).toMatchObject({ kind: 'url', fellBackTo: 'GitHub' });
  });
});

describe('commitTarget', () => {
  test('uses the board unless GitHub is asked for and known', () => {
    expect(commitTarget(gh, 'abc1234', 'board', true)).toEqual({ kind: 'board' });
    expect(commitTarget(gh, 'abc1234', 'github', true)).toEqual({ kind: 'url', href: 'https://github.com/o/r/commit/abc1234' });
    expect(commitTarget({ dir: '' }, 'abc1234', 'github', true)).toEqual({ kind: 'board' });
    expect(commitTarget(gh, 'abc1234', 'board', false)).toMatchObject({ kind: 'url', fellBackTo: 'GitHub' });
  });
});

describe('linkifyRefs', () => {
  const r = { ticket: (x: string) => x === '1.2', name: (n: string) => n === 'story-cart', commits: true };
  test('links refs that resolve', () => {
    expect(linkifyRefs('After Story 1.2 and Story 9.9.', r)).toBe('After [Story 1.2](#ticket=1.2) and Story 9.9.');
    expect(linkifyRefs('See story-cart.md, not story-nope.', r)).toBe('See [story-cart.md](#name=story-cart), not story-nope.');
    expect(linkifyRefs('Fixed in 3f9a2c1d.', r)).toBe('Fixed in [`3f9a2c1`](#commit=3f9a2c1d).');
  });
  test('leaves code, links and words alone', () => {
    const md = 'Run `git show 3f9a2c1d` or [Story 1.2](https://x.y/1.2) at https://x.y/3f9a2c1d. A deadbeef and 1234567.\n```\nStory 1.2\n```';
    expect(linkifyRefs(md, r)).toBe(md);
  });
  test('skips commits when the source has none', () => {
    expect(linkifyRefs('3f9a2c1d', { ...r, commits: false })).toBe('3f9a2c1d');
  });
});
