interface LoadableWorkspace {
  store: { id: string; label: string };
  tree: unknown | null;
  loading: boolean;
  error?: string;
}

/** Evaluate the selected project, so another project's refresh does not blank a loaded view. */
export function workspaceLoadState(workspaces: LoadableWorkspace[], workspaceId?: string, initializing = false) {
  const relevant = workspaceId ? workspaces.filter((w) => w.store.id === workspaceId) : workspaces;
  const pending = relevant.filter((w) => w.loading);
  const errors = relevant.filter((w) => !!w.error);
  const hasLoaded = relevant.some((w) => !!w.tree);
  const discovering = initializing && !workspaceId;
  return { pending, errors, hasLoaded, busy: discovering || pending.length > 0, initial: !hasLoaded && (discovering || pending.length > 0), failed: !hasLoaded && errors.length > 0 && pending.length === 0 && !discovering };
}
