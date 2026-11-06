/**
 * Per-person display preferences, kept in this browser (Kaneo's "display options"). Team-wide settings
 * live in the repo instead; see BoardConfig.
 */
import { useCallback, useState } from 'react';

export type CardField = 'assignee' | 'readiness' | 'yourCall' | 'progress' | 'type' | 'risk' | 'hitl' | 'deps' | 'epic';

export const CARD_FIELDS: { id: CardField; label: string; help: string }[] = [
  { id: 'assignee', label: 'Assignee', help: 'Who holds the ticket' },
  { id: 'readiness', label: 'Readiness', help: 'Ready, Blocked or Refine first' },
  { id: 'yourCall', label: 'Your call', help: 'Built work waiting for a person' },
  { id: 'progress', label: 'Plan progress', help: 'Checked items in the build plan' },
  { id: 'type', label: 'Type and severity', help: 'Spike, Bug · High' },
  { id: 'risk', label: 'Risk', help: 'Medium and high risk' },
  { id: 'hitl', label: 'Needs a person', help: 'Work a person does part of' },
  { id: 'deps', label: 'Dependencies', help: 'How many tickets it waits on' },
  { id: 'epic', label: 'Epic', help: 'Which epic it belongs to' },
];

export type ViewId = 'next' | 'board' | 'list' | 'graph' | 'standup';

export interface Preferences {
  defaultView: ViewId;
  sidebarOpen: boolean;
  compactCards: boolean;
  cardFields: Record<CardField, boolean>;
  showDoneColumn: boolean;
  standupRange: 'workday' | '24h' | '7d';
}

export const DEFAULT_PREFERENCES: Preferences = {
  defaultView: 'next',
  sidebarOpen: true,
  compactCards: false,
  cardFields: Object.fromEntries(CARD_FIELDS.map((f) => [f.id, true])) as Record<CardField, boolean>,
  showDoneColumn: true,
  standupRange: 'workday',
};

const KEY = 'bmad-board:preferences';

export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Preferences>;
    return { ...DEFAULT_PREFERENCES, ...saved, cardFields: { ...DEFAULT_PREFERENCES.cardFields, ...saved.cardFields } };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const update = useCallback((patch: Partial<Preferences> | ((p: Preferences) => Partial<Preferences>)) => {
    setPrefs((p) => {
      const next = { ...p, ...(typeof patch === 'function' ? patch(p) : patch) };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: the change lasts for this page */
      }
      return next;
    });
  }, []);
  const reset = useCallback(() => update(DEFAULT_PREFERENCES), [update]);
  return { prefs, update, reset };
}
