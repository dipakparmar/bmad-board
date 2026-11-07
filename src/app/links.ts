/**
 * Where file, commit and branch links go. Each person picks a target in Settings; when that target
 * can't be reached for a project (no remote, no folder on this computer), the link falls back to the
 * next one that can: editor → GitHub → the board's own reader or commit view.
 */
import type { RepoLinks } from '@/store';

export type FileTarget = 'board' | 'github' | 'vscode' | 'cursor';
export type CommitTarget = 'board' | 'github';
export type BranchTarget = 'github' | 'copy';

export interface LinkPreferences {
  files: FileTarget;
  commits: CommitTarget;
  branches: BranchTarget;
}

export const DEFAULT_LINKS: LinkPreferences = { files: 'board', commits: 'board', branches: 'github' };

export type Opened =
  | { kind: 'board' }
  | { kind: 'url'; href: string; /** The target used, when it differs from the one asked for. */ fellBackTo?: string };

const joinRepo = (...parts: string[]) => parts.flatMap((p) => p.split('/')).filter(Boolean).join('/');
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** `vscode://file/<abs path>` works for both POSIX and Windows roots. */
function editorHref(scheme: 'vscode' | 'cursor', root: string, path: string): string {
  const abs = `${root.replace(/\\/g, '/').replace(/\/$/, '')}/${path}`;
  return `${scheme}://file${abs.startsWith('/') ? '' : '/'}${encodePath(abs)}`;
}

export function githubFileHref(links: RepoLinks, path: string): string | undefined {
  if (!links.web) return undefined;
  return `${links.web}/blob/${encodePath(links.branch || 'HEAD')}/${encodePath(joinRepo(links.dir, path))}`;
}

/** Where a project file opens. `path` is relative to the project root. */
export function fileTarget(links: RepoLinks | undefined, path: string, want: FileTarget, boardCanOpen = true): Opened {
  const github = links ? githubFileHref(links, path) : undefined;
  if ((want === 'vscode' || want === 'cursor') && links?.localRoot) return { kind: 'url', href: editorHref(want, links.localRoot, path) };
  if (want !== 'board' && github) return { kind: 'url', href: github, ...(want !== 'github' ? { fellBackTo: 'GitHub' } : {}) };
  if (boardCanOpen) return { kind: 'board' };
  return github ? { kind: 'url', href: github, fellBackTo: 'GitHub' } : { kind: 'board' };
}

/** Where a commit opens. `boardCanOpen` is false when the source can't show commits itself. */
export function commitTarget(links: RepoLinks | undefined, sha: string, want: CommitTarget, boardCanOpen: boolean): Opened {
  const github = links?.web ? `${links.web}/commit/${sha}` : undefined;
  if (want === 'github' && github) return { kind: 'url', href: github };
  if (boardCanOpen) return { kind: 'board' };
  return github ? { kind: 'url', href: github, fellBackTo: 'GitHub' } : { kind: 'board' };
}

export function branchHref(links: RepoLinks | undefined, branch: string): string | undefined {
  return links?.web ? `${links.web}/tree/${encodePath(branch)}` : undefined;
}

/** A commit hash in prose: 7 to 40 hex digits with at least one digit and one letter. */
export const SHA = /^(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}$/;

export interface RefResolver {
  /** Whether `1.2` names a ticket. */
  ticket(ref: string): boolean;
  /** Whether a file name like `story-cart-scaffold` or `epic-pricing` names a ticket or epic. */
  name(name: string): boolean;
  /** Whether bare commit hashes should become links. */
  commits: boolean;
}

/**
 * Turns ticket refs, ticket file names and commit hashes in markdown into links the board handles:
 * `#ticket=1.2`, `#name=story-x`, `#commit=<sha>`. Code, existing links and URLs are left alone, and
 * only refs that resolve become links.
 */
export function linkifyRefs(md: string, r: RefResolver): string {
  const skip = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|!?\[[^\]\n]*\]\([^)\n]*\)|\[[^\]\n]*\]\[[^\]\n]*\]|<[^>\n]+>|https?:\/\/\S+|^\[[^\]\n]+\]:.*$)/gm;
  let out = '';
  let last = 0;
  for (const m of md.matchAll(skip)) {
    out += linkifyText(md.slice(last, m.index), r) + m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  return out + linkifyText(md.slice(last), r);
}

function linkifyText(text: string, r: RefResolver): string {
  return text
    .replace(/\b((?:epic|story|spike|bug)-[a-z0-9][a-z0-9-]*[a-z0-9])(\.md)?\b/gi, (all, name: string) => (r.name(name.toLowerCase()) ? `[${all}](#name=${name.toLowerCase()})` : all))
    .replace(/\b([Ss]tory|[Ss]pike|[Bb]ug|[Tt]icket)[ \t]+#?(\d+\.\d+[a-z]?)\b/g, (all, _w, ref: string) => (r.ticket(ref) ? `[${all}](#ticket=${ref})` : all))
    .replace(/(?<![\w#=/-])([0-9a-f]{7,40})(?![\w-])/g, (all, sha: string) => (r.commits && SHA.test(sha) ? `[\`${sha.slice(0, 7)}\`](#commit=${sha})` : all));
}
