import { useState } from 'react';
import type { Identity, IdentitySettings } from '@/domain/identities';
const KEY = 'bmad-board:identities:v1';
export function loadIdentities(): IdentitySettings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([key, list]) => [key, Array.isArray(list) ? list.filter((i): i is Identity => !!i && typeof i.id === 'string' && typeof i.name === 'string' && Array.isArray(i.aliases) && i.aliases.every((a: unknown) => typeof a === 'string') && typeof i.agent === 'boolean' && typeof i.hidden === 'boolean') : []]));
  } catch { return {}; }
}
export function useIdentitySettings() {
  const [settings, setSettings] = useState(loadIdentities);
  const [storageError, setStorageError] = useState(false);
  const update = (workspaceId: string, identities: Identity[]) => {
    const next = { ...settings, [workspaceId]: identities };
    setSettings(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };
  return { settings, update, storageError };
}
