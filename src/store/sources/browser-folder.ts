/** A folder picked in Chrome or Edge with the File System Access API. Read-only: no git here. */
import type { StoreCapabilities } from '../../domain';
import type { FileEntry, FileSource } from '../file-source';

type Handle = FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };

export class BrowserFolderSource implements FileSource {
  readonly id: string;
  readonly label: string;
  readonly capabilities: StoreCapabilities = { write: false, commits: false, pullRequests: false, watch: false };

  constructor(private readonly root: FileSystemDirectoryHandle) {
    this.id = `folder:${root.name}`;
    this.label = root.name;
  }

  static supported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  static async pick(): Promise<BrowserFolderSource> {
    const picker = (window as unknown as { showDirectoryPicker(o: { mode: 'read' }): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    return new BrowserFolderSource(await picker.call(window, { mode: 'read' }));
  }

  private async dir(path: string): Promise<FileSystemDirectoryHandle | null> {
    let handle = this.root;
    for (const part of path.split('/').filter(Boolean)) {
      try {
        handle = await handle.getDirectoryHandle(part);
      } catch {
        return null;
      }
    }
    return handle;
  }

  async list(path: string): Promise<FileEntry[] | null> {
    const handle = (await this.dir(path)) as Handle | null;
    if (!handle) return null;
    const out: FileEntry[] = [];
    for await (const [name, child] of handle.entries()) out.push({ name, kind: child.kind === 'directory' ? 'dir' : 'file' });
    return out;
  }

  async read(path: string): Promise<string | null> {
    const at = path.lastIndexOf('/');
    const dir = await this.dir(at < 0 ? '' : path.slice(0, at));
    try {
      return (await (await dir?.getFileHandle(path.slice(at + 1)))?.getFile())?.text() ?? null;
    } catch {
      return null;
    }
  }
}
