/** Board state: the connected projects, their loaded trees, and writes through each project's store. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeAuthor, ChangeResult, TicketChange, TicketTree } from '../domain';
import { clearCache, FileTicketStore, GitHubSource, LocalServerSource, probeLocalServer, type FileSource, type GitHubTarget } from '../store';
import { loadPreferences } from './preferences';

export interface Workspace {
  store: FileTicketStore;
  tree: TicketTree | null;
  loading: boolean;
  error?: string;
  lastResult?: ChangeResult;
}

const AUTHOR_KEY = 'bmad-board:author';

export function loadAuthor(): ChangeAuthor {
  try {
    const name = localStorage.getItem(AUTHOR_KEY);
    if (name) return { kind: 'person', name };
  } catch {
    /* storage can be blocked */
  }
  return { kind: 'person', name: 'board user' };
}

export function saveAuthor(name: string) {
  try {
    localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    /* ignore */
  }
}

const REPOS_KEY = 'bmad-board:github-repos';
export const TOKEN_KEY = 'bmad-board:github-token';

/** GitHub repos connected in this browser, so a refresh reconnects them (and their cache pays off). Never the token itself. */
type RememberedRepo = Omit<GitHubTarget, 'token'> & { withToken?: boolean };

function rememberedRepos(): RememberedRepo[] {
  try {
    const list = JSON.parse(localStorage.getItem(REPOS_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((r): r is RememberedRepo => !!r && typeof r.owner === 'string' && typeof r.repo === 'string') : [];
  } catch {
    return [];
  }
}

function saveRepos(update: (all: RememberedRepo[]) => RememberedRepo[]) {
  try {
    localStorage.setItem(REPOS_KEY, JSON.stringify(update(rememberedRepos())));
  } catch {
    /* storage can be blocked */
  }
}

const repoId = (r: { owner: string; repo: string }) => `github:${r.owner}/${r.repo}`;

function restoreRepo(r: RememberedRepo): GitHubSource {
  let token: string | undefined;
  try {
    token = r.withToken ? localStorage.getItem(TOKEN_KEY) ?? undefined : undefined;
  } catch {
    /* storage can be blocked */
  }
  const { withToken: _w, ...target } = r;
  return new GitHubSource({ ...target, token });
}

export function useBoard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [serverAvailable, setServerAvailable] = useState(false);
  const unwatch = useRef(new Map<string, () => void>());

  const patch = useCallback((id: string, update: Partial<Workspace>) => {
    setWorkspaces((all) => all.map((w) => (w.store.id === id ? { ...w, ...update } : w)));
  }, []);

  const reload = useCallback(async (store: FileTicketStore) => {
    patch(store.id, { loading: true });
    try {
      const tree = await store.load();
      patch(store.id, { tree, loading: false, error: undefined });
    } catch (cause) {
      patch(store.id, { loading: false, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }, [patch]);

  const add = useCallback(async (source: FileSource) => {
    const store = new FileTicketStore(source);
    if (source instanceof GitHubSource) {
      const { token, ...target } = source.target;
      saveRepos((all) => [...all.filter((r) => repoId(r) !== source.id), { ...target, withToken: !!token }]);
    }
    setWorkspaces((all) => [...all.filter((w) => w.store.id !== store.id), { store, tree: null, loading: true }]);
    unwatch.current.get(store.id)?.();
    if (store.capabilities.watch) unwatch.current.set(store.id, store.watch(() => void reload(store)));
    await reload(store);
  }, [reload]);

  const remove = useCallback((id: string) => {
    saveRepos((all) => all.filter((r) => repoId(r) !== id));
    unwatch.current.get(id)?.();
    unwatch.current.delete(id);
    setWorkspaces((all) => all.filter((w) => w.store.id !== id));
  }, []);

  /** Resolves to the change result, or to an Error that says why it was not saved. */
  const apply = useCallback(async (id: string, changes: TicketChange[], message?: string): Promise<ChangeResult | Error> => {
    const ws = workspaces.find((w) => w.store.id === id);
    if (!ws) return new Error('That project is no longer connected.');
    try {
      const { git } = loadPreferences();
      const result = await ws.store.apply(changes, loadAuthor(), message, { commit: git.commitOnSave, template: git.template });
      patch(id, { lastResult: result });
      await reload(ws.store);
      return result;
    } catch (cause) {
      return cause instanceof Error ? cause : new Error(String(cause));
    }
  }, [workspaces, patch, reload]);

  // The local server, when the app is served by it (or proxied in dev), connects on its own.
  useEffect(() => {
    let cancelled = false;
    const probe = probeLocalServer();
    const local = probe.then(async (info) => {
      if (info && !cancelled) {
        setServerAvailable(true);
        await add(new LocalServerSource(info));
      }
    });
    const restored = rememberedRepos().map(async (r) => {
      if (r.useGhCli && !(await probe)) return;
      if (!cancelled) await add(restoreRepo(r));
    });
    void Promise.allSettled([local, ...restored]).then(() => { if (!cancelled) setInitializing(false); });
    const subscriptions = unwatch.current;
    return () => {
      cancelled = true;
      for (const stop of subscriptions.values()) stop();
    };
  }, [add]);

  /** Empties the browser cache, then reloads every project from scratch. */
  const clearCacheAndReload = useCallback(async () => {
    await clearCache();
    await Promise.all(workspaces.map((w) => {
      (w.store.source as { invalidate?: () => void }).invalidate?.();
      return reload(w.store);
    }));
  }, [workspaces, reload]);

  return { workspaces, initializing, add, remove, reload, apply, patch, serverAvailable, clearCacheAndReload };
}
