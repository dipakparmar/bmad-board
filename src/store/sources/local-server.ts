/** Talks to `server/index.ts`: reads files, writes them as one git commit, and streams change events. */
import type { ChangeAuthor, ChangeResult, StoreCapabilities } from '../../domain';
import type { FileEntry, FileSource, FileWrite } from '../file-source';

export interface ServerInfo {
  root: string;
  name: string;
  git: boolean;
  branch: string | null;
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

export class LocalServerSource implements FileSource {
  readonly id: string;
  readonly label: string;
  readonly capabilities: StoreCapabilities;

  constructor(readonly info: ServerInfo, private readonly base = '') {
    this.id = `local:${info.root}`;
    this.label = info.branch ? `${info.name} · ${info.branch}` : info.name;
    this.capabilities = { write: true, commits: info.git, pullRequests: false, watch: true };
  }

  async list(path: string): Promise<FileEntry[] | null> {
    const res = await fetch(`${this.base}/api/list?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await errorOf(res));
    return (await res.json()) as FileEntry[];
  }

  async read(path: string): Promise<string | null> {
    const res = await fetch(`${this.base}/api/read?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await errorOf(res));
    return res.text();
  }

  async commit(files: FileWrite[], message: string, author: ChangeAuthor): Promise<ChangeResult> {
    const res = await fetch(`${this.base}/api/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bmad-board': '1' },
      body: JSON.stringify({ files, message, author }),
    });
    if (!res.ok) throw new Error(await errorOf(res));
    return (await res.json()) as ChangeResult;
  }

  watch(onChange: () => void): () => void {
    const events = new EventSource(`${this.base}/api/events`);
    events.onmessage = (e) => {
      if (e.data === 'change') onChange();
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
