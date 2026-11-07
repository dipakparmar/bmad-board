/** Talks to `server/index.ts`: reads files, writes them as one git commit, and streams change events. */
import { membersFromGitLog, type ChangeAuthor, type ChangeResult, type Member, type StoreCapabilities } from '../../domain';
import type { Activity, FileEntry, FileWrite } from '../file-source';
import { cacheGet, cacheSet } from '../cache';
import { readThroughCache, snapshotFromFiles, underPrefixes, type Snapshot, type SnapshotSource } from '../snapshot';

export interface ServerInfo {
  root: string;
  name: string;
  git: boolean;
  branch: string | null;
  /** `git config user.name` in the project, to prefill "your name". */
  user?: string | null;
}

export async function probeLocalServer(base = ''): Promise<ServerInfo | null> {
  try {
    const res = await fetch(`${base}/api/info`, { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return (await res.json()) as ServerInfo;
  } catch {
    return null;
  }
}

/** Whether the local server can reach GitHub with this machine's `gh` login, and as whom. */
export async function ghCliStatus(base = ''): Promise<{ available: boolean; login?: string; error?: string }> {
  try {
    const res = await fetch(`${base}/api/gh-status`, { headers: { 'x-bmad-board': '1' }, cache: 'no-store' });
    return res.ok ? await res.json() : { available: false };
  } catch {
    return { available: false };
  }
}

export class LocalServerSource implements SnapshotSource {
  readonly id: string;
  readonly label: string;
  readonly capabilities: StoreCapabilities;

  constructor(readonly info: ServerInfo, private readonly base = '') {
    this.id = `local:${info.root}`;
    this.label = info.branch ? `${info.name} · ${info.branch}` : info.name;
    this.capabilities = { write: true, commits: info.git, pullRequests: false, watch: true };
  }

  private snap: Promise<Snapshot | null> | null = null;

  /**
   * Every BMAD file's version from one `/api/tree` call. Taken fresh at the start of each load; reads
   * reuse the latest one until a write or a file change event drops it.
   */
  snapshot(): Promise<Snapshot | null> {
    this.snap = fetch(`${this.base}/api/tree`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        const t = (await res.json()) as { at: string; covered: string[]; files: [string, string][] };
        if (!t.covered.length) return null;
        await this.prefetch(t.files);
        return snapshotFromFiles(t.at, t.files, underPrefixes(t.covered));
      })
      .catch(() => null);
    return this.snap;
  }

  /**
   * On a cold cache, fetches the BMAD text files the cache lacks in a few large requests rather than one
   * request per file, so a project of thousands of tickets opens in seconds.
   */
  private async prefetch(files: [string, string][]) {
    const wanted = files.filter(([p]) => /\.(md|toml|ya?ml)$/i.test(p));
    const missing: [string, string][] = [];
    for (const [p, sha] of wanted) if ((await cacheGet<string>(`blob:${sha}`)) === undefined) missing.push([p, sha]);
    if (missing.length < 20) return; // a few files read one by one just as fast
    const sha = new Map(missing);
    for (let i = 0; i < missing.length; i += 1000) {
      const res = await fetch(`${this.base}/api/read-many`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bmad-board': '1' },
        body: JSON.stringify({ paths: missing.slice(i, i + 1000).map(([p]) => p) }),
      }).catch(() => null);
      if (!res?.ok) return; // an older server: reads fall back to one by one
      const texts = (await res.json()) as Record<string, string | null>;
      for (const [p, text] of Object.entries(texts)) if (text !== null) void cacheSet(`blob:${sha.get(p)}`, text);
    }
  }

  invalidate() {
    this.snap = null;
  }

  async list(path: string): Promise<FileEntry[] | null> {
    const res = await fetch(`${this.base}/api/list?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await errorOf(res));
    return (await res.json()) as FileEntry[];
  }

  async read(path: string): Promise<string | null> {
    // Only trust a snapshot taken for the load in progress; with none, read straight through.
    const snap = this.snap ? await this.snap : null;
    return readThroughCache(snap, path, async () => {
      const res = await fetch(`${this.base}/api/read?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await errorOf(res));
      return res.text();
    });
  }

  async commit(files: FileWrite[], message: string, author: ChangeAuthor): Promise<ChangeResult> {
    const res = await fetch(`${this.base}/api/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bmad-board': '1' },
      body: JSON.stringify({ files, message, author }),
    });
    this.invalidate();
    if (!res.ok) throw new Error(await errorOf(res));
    return (await res.json()) as ChangeResult;
  }

  async people(): Promise<Member[]> {
    const res = await fetch(`${this.base}/api/people`, { cache: 'no-store' });
    if (!res.ok) return [];
    const { lines } = (await res.json()) as { lines: Parameters<typeof membersFromGitLog>[0] };
    return membersFromGitLog(lines);
  }

  async history(path: string, limit = 30): Promise<Activity[]> {
    const res = await fetch(`${this.base}/api/log?path=${encodeURIComponent(path)}&limit=${limit}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as Activity[]) : [];
  }

  watch(onChange: () => void): () => void {
    const events = new EventSource(`${this.base}/api/events`);
    events.onmessage = (e) => {
      if (e.data === 'change') {
        this.invalidate();
        onChange();
      }
    };
    return () => events.close();
  }
}

async function errorOf(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
