/**
 * Reads a BMAD project straight from a GitHub repo and writes changes as commits on a
 * `bmad-board/…` branch with one pull request per editing session, so every board change gets reviewed.
 */
import type { ChangeAuthor, ChangeResult, StoreCapabilities } from '../../domain';
import { changedByOf, joinPath, type Activity, type FileEntry, type FileSource, type FileWrite } from '../file-source';

export interface GitHubTarget {
  owner: string;
  repo: string;
  /** Base branch; defaults to the repo's default branch. */
  branch?: string;
  /** Folder inside the repo that holds `_bmad/`; empty for the repo root. */
  dir?: string;
  token?: string;
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
  private blobs = new Map<string, string>();

  constructor(private readonly target: GitHubTarget, private readonly api = 'https://api.github.com') {
    this.id = `github:${target.owner}/${target.repo}`;
    this.label = `${target.owner}/${target.repo}`;
    this.capabilities = { write: !!target.token, commits: !!target.token, pullRequests: !!target.token, watch: false };
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.api}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(this.target.token ? { authorization: `Bearer ${this.target.token}` } : {}),
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

  /** Loads the whole file listing once per ref; a BMAD store is small. */
  private async ensureTree(): Promise<Map<string, TreeItem>> {
    if (this.tree) return this.tree;
    if (!this.base) {
      this.base = this.target.branch ?? (await this.call<{ default_branch: string }>(this.repoPath())).default_branch;
      this.ref = this.base;
    }
    const tree = await this.call<{ tree: TreeItem[]; truncated: boolean }>(this.repoPath(`/git/trees/${encodeURIComponent(this.ref)}?recursive=1`));
    const prefix = this.target.dir ? `${joinPath(this.target.dir)}/` : '';
    this.tree = new Map(tree.tree.filter((t) => t.path.startsWith(prefix)).map((t) => [t.path.slice(prefix.length), t]));
    return this.tree;
  }

  invalidate() {
    this.tree = null;
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
    const cached = this.blobs.get(item.sha);
    if (cached !== undefined) return cached;
    const blob = await this.call<{ content: string; encoding: string }>(this.repoPath(`/git/blobs/${item.sha}`));
    const bytes = Uint8Array.from(atob(blob.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    this.blobs.set(item.sha, text);
    return text;
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
    this.tree = null;
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
