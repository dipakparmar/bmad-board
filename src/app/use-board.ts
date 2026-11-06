/** Board state: the connected projects, their loaded trees, and writes through each project's store. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeAuthor, ChangeResult, TicketChange, TicketTree } from '../domain';
import { FileTicketStore, LocalServerSource, probeLocalServer, type FileSource } from '../store';

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

export function useBoard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
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
    setWorkspaces((all) => [...all.filter((w) => w.store.id !== store.id), { store, tree: null, loading: true }]);
    unwatch.current.get(store.id)?.();
    if (store.capabilities.watch) unwatch.current.set(store.id, store.watch(() => void reload(store)));
    await reload(store);
  }, [reload]);

  const remove = useCallback((id: string) => {
    unwatch.current.get(id)?.();
    unwatch.current.delete(id);
    setWorkspaces((all) => all.filter((w) => w.store.id !== id));
  }, []);

  /** Resolves to the change result, or to an Error that says why it was not saved. */
  const apply = useCallback(async (id: string, changes: TicketChange[], message?: string): Promise<ChangeResult | Error> => {
    const ws = workspaces.find((w) => w.store.id === id);
    if (!ws) return new Error('That project is no longer connected.');
    try {
      const result = await ws.store.apply(changes, loadAuthor(), message);
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
    void probeLocalServer().then((info) => {
      if (info && !cancelled) {
        setServerAvailable(true);
        void add(new LocalServerSource(info));
      }
    });
    const subscriptions = unwatch.current;
    return () => {
      cancelled = true;
      for (const stop of subscriptions.values()) stop();
    };
  }, [add]);

  return { workspaces, add, remove, reload, apply, patch, serverAvailable };
}
