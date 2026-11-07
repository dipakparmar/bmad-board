/**
 * Reads a BMAD project straight from a GitHub repo and writes changes as commits on a
 * `bmad-board/…` branch with one pull request per editing session, so every board change gets reviewed.
 */
import type { ChangeAuthor, ChangeResult, Member, StoreCapabilities } from '../../domain';
import { cacheGet, cacheSet } from '../cache';
import { changedByOf, joinPath, type Activity, type CommitDetail, type FileEntry, type FileSource, type FileWrite, type RepoLinks } from '../file-source';
import { readThroughCache, snapshotFromFiles, type Snapshot } from '../snapshot';

export interface GitHubTarget {
  owner: string;
  repo: string;
  /** Base branch; defaults to the repo's default branch. */
  branch?: string;
  /** Folder inside the repo that holds `_bmad/`; empty for the repo root. */
  dir?: string;
  token?: string;
  /** Use the GitHub CLI login on this machine, through the local server's `/api/gh` proxy. */
  useGhCli?: boolean;
}

type TreeItem = { path: string; type: 'blob' | 'tree'; sha: string };

export function parseRepo(input: string): Pick<GitHubTarget, 'owner' | 'repo' | 'branch' | 'dir'> | null {
  const m = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?\/?$/.exec(input.trim());
  return m ? { owner: m[1] ?? '', repo: m[2] ?? '', branch: m[3], dir: m[4] } : null;
}

export class GitHubSource implements FileSource {
  readonly id: string;
  readonly label: string;
  readonly capabilities: StoreCapabilities;
  private base = '';
  /** Where reads come from: the base branch, then the session branch once it exists. */
  private ref = '';
  private sessionBranch: string | null = null;
  private pullRequestUrl: string | undefined;
  private tree: Map<string, TreeItem> | null = null;
  /** The snapshot the tree belongs to, and the commit it was taken at. */
  private snap: { commit: string; snapshot: Snapshot } | null = null;

  private readonly api: string;

  /** `localBase` is where the local server runs, for `useGhCli`; `api` overrides the API root (tests). */
  constructor(readonly target: GitHubTarget, api?: string, localBase = '') {
    this.id = `github:${target.owner}/${target.repo}`;
    this.label = target.branch ? `${target.owner}/${target.repo} · ${target.branch}` : `${target.owner}/${target.repo}`;
    this.api = api ?? (target.useGhCli ? `${localBase}/api/gh` : 'https://api.github.com');
    const write = !!target.token || !!target.useGhCli;
    this.capabilities = { write, commits: write, pullRequests: write, watch: false };
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.api}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(this.target.useGhCli ? { 'x-bmad-board': '1' } : this.target.token ? { authorization: `Bearer ${this.target.token}` } : {}),
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(`GitHub ${res.status}: ${detail.message ?? res.statusText}`);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  private repoPath(path = '') {
    return `/repos/${this.target.owner}/${this.target.repo}${path}`;
  }

  /**
   * Where the branch is now (one request, revalidated with its ETag so an unchanged ref costs no rate
   * limit), and the file tree at that commit: from memory, then IndexedDB, then one recursive tree call.
   * File text is cached by blob SHA, so after a new commit only the files it changed are fetched.
   */
  async snapshot(): Promise<Snapshot> {
    if (!this.base) {
      this.base = this.target.branch ?? (await this.call<{ default_branch: string }>(this.repoPath())).default_branch;
      this.ref = this.base;
    }
    const head = await this.call<{ object: { sha: string } }>(this.repoPath(`/git/ref/heads/${encodeURIComponent(this.ref)}`), { cache: 'no-cache' });
    const commit = head.object.sha;
    if (this.snap?.commit === commit && this.tree) return this.snap.snapshot;
    const key = `ghtree:${this.target.owner}/${this.target.repo}:${commit}`;
    let listing = await cacheGet<{ items: TreeItem[]; truncated: boolean }>(key);
    if (!listing) {
      const tree = await this.call<{ tree: TreeItem[]; truncated: boolean }>(this.repoPath(`/git/trees/${commit}?recursive=1`));
      listing = { items: tree.tree.map(({ path, type, sha }) => ({ path, type, sha })), truncated: tree.truncated };
      void cacheSet(key, listing);
    }
    const prefix = this.target.dir ? `${joinPath(this.target.dir)}/` : '';
    this.tree = new Map(listing.items.filter((t) => t.path.startsWith(prefix)).map((t) => [t.path.slice(prefix.length), t]));
    const blobs = [...this.tree].filter(([, t]) => t.type === 'blob').map(([p, t]): [string, string] => [p, t.sha]);
    // A truncated listing (a very large repo) can't vouch for missing files, so it caches nothing.
    const truncated = listing.truncated;
    this.snap = { commit, snapshot: snapshotFromFiles(commit, blobs, () => !truncated) };
    return this.snap.snapshot;
  }

  private async ensureTree(): Promise<Map<string, TreeItem>> {
    if (!this.tree) await this.snapshot();
    return this.tree ?? new Map();
  }

  invalidate() {
    this.tree = null;
    this.snap = null;
  }

  async list(path: string): Promise<FileEntry[] | null> {
    const tree = await this.ensureTree();
    const dir = joinPath(path);
    if (dir && tree.get(dir)?.type !== 'tree') return null;
    const out: FileEntry[] = [];
    for (const [p, item] of tree) {
      const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      if (parent === dir) out.push({ name: p.slice(p.lastIndexOf('/') + 1), kind: item.type === 'tree' ? 'dir' : 'file' });
    }
    return out;
  }

  async read(path: string): Promise<string | null> {
    const item = (await this.ensureTree()).get(joinPath(path));
    if (!item || item.type !== 'blob') return null;
    return readThroughCache(this.snap?.snapshot ?? null, path, async () => {
      const blob = await this.call<{ content: string; encoding: string }>(this.repoPath(`/git/blobs/${item.sha}`));
      const bytes = Uint8Array.from(atob(blob.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    });
  }

  async commit(files: FileWrite[], message: string, author: ChangeAuthor): Promise<ChangeResult> {
    if (!this.target.token) throw new Error('Add a GitHub token to write to this repo.');
    await this.ensureTree();
    const branch = await this.ensureSessionBranch();
    const head = await this.call<{ object: { sha: string } }>(this.repoPath(`/git/ref/heads/${branch}`));
    const parent = await this.call<{ tree: { sha: string } }>(this.repoPath(`/git/commits/${head.object.sha}`));
    const prefix = this.target.dir ? `${joinPath(this.target.dir)}/` : '';
    const tree = await this.call<{ sha: string }>(this.repoPath('/git/trees'), {
      method: 'POST',
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: files.map((f) => ({ path: prefix + joinPath(f.path), mode: '100644', type: 'blob', ...(f.text === null ? { sha: null } : { content: f.text }) })),
      }),
    });
    const commit = await this.call<{ sha: string }>(this.repoPath('/git/commits'), {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [head.object.sha] }),
    });
    await this.call(this.repoPath(`/git/refs/heads/${branch}`), { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    this.ref = branch;
    this.invalidate();
    if (!this.pullRequestUrl) {
      const pr = await this.call<{ html_url: string }>(this.repoPath('/pulls'), {
        method: 'POST',
        body: JSON.stringify({
          title: 'Ticket updates from bmad-board',
          head: branch,
          base: this.base,
          body: `Ticket changes made on the board by ${author.name}. Each commit is one board action.`,
        }),
      });
      this.pullRequestUrl = pr.html_url;
    }
    return { paths: files.map((f) => f.path), commit: commit.sha, pullRequestUrl: this.pullRequestUrl };
  }

  links(): RepoLinks {
    return { web: `https://github.com/${this.target.owner}/${this.target.repo}`, branch: this.ref || this.target.branch, dir: this.target.dir ? joinPath(this.target.dir) : '' };
  }

  async commitDetail(sha: string): Promise<CommitDetail> {
    type C = { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } }; files?: { filename: string; status: string }[] };
    const c = await this.call<C>(this.repoPath(`/commits/${encodeURIComponent(sha)}`));
    const prefix = this.target.dir ? `${joinPath(this.target.dir)}/` : '';
    const [subject = '', ...rest] = c.commit.message.split('\n');
    const status: Record<string, string> = { added: 'A', removed: 'D', modified: 'M', renamed: 'R', copied: 'C', changed: 'M' };
    const files = (c.files ?? []).filter((f) => f.filename.startsWith(prefix)).map((f) => ({ status: status[f.status] ?? 'M', path: f.filename.slice(prefix.length) }));
    return { sha: c.sha, author: c.commit.author.name, date: c.commit.author.date, subject, body: rest.join('\n').trim(), changedBy: changedByOf(rest.join('\n')), files, paths: files.map((f) => f.path), url: c.html_url };
  }

  async history(path: string, limit = 30): Promise<Activity[]> {
    await this.ensureTree();
    const prefix = this.target.dir ? `${joinPath(this.target.dir)}/` : '';
    type C = { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } } };
    const commits = await this.call<C[]>(this.repoPath(`/commits?sha=${encodeURIComponent(this.ref)}&path=${encodeURIComponent(prefix + joinPath(path))}&per_page=${limit}`));
    return commits.map((c) => {
      const [subject = '', ...rest] = c.commit.message.split('\n');
      return { sha: c.sha, author: c.commit.author.name, date: c.commit.author.date, subject, changedBy: changedByOf(rest.join('\n')), paths: [], url: c.html_url };
    });
  }

  /**
   * Contributors (top 100 by commits, one request) plus collaborators when the token may list them.
   * Cached per repo for six hours in this browser, so a big repo costs two requests a session at most.
   */
  async people(): Promise<Member[]> {
    const key = `bmad-board:people:${this.id}`;
    try {
      const hit = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; members: Member[] } | null;
      if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.members;
    } catch { /* storage unavailable */ }
    type U = { login: string; avatar_url: string; type: string; contributions?: number };
    const [contributors, collaborators] = await Promise.all([
      this.call<U[]>(this.repoPath('/contributors?per_page=100')).catch(() => [] as U[]),
      this.capabilities.write ? this.call<U[]>(this.repoPath('/collaborators?per_page=100')).catch(() => [] as U[]) : Promise.resolve([] as U[]),
    ]);
    const seen = new Map<string, Member>();
    for (const u of [...contributors, ...collaborators]) {
      if (seen.has(u.login)) continue;
      seen.set(u.login, { name: u.login, login: u.login, avatarUrl: u.avatar_url, agent: u.type === 'Bot' || /\[bot\]$/.test(u.login), commits: u.contributions ?? 0, sources: ['github'] });
    }
    const members = [...seen.values()];
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), members })); } catch { /* storage unavailable */ }
    return members;
  }

  private async ensureSessionBranch(): Promise<string> {
    if (this.sessionBranch) return this.sessionBranch;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const name = `bmad-board/${stamp}`;
    const base = await this.call<{ object: { sha: string } }>(this.repoPath(`/git/ref/heads/${encodeURIComponent(this.base)}`));
    await this.call(this.repoPath('/git/refs'), { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${name}`, sha: base.object.sha }) });
    this.sessionBranch = name;
    return name;
  }
}
