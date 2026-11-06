/**
 * Keyboard shortcuts, after Kaneo's catalog: single keys and `g` sequences. They stay quiet while
 * someone types in a field or holds a modifier, so ⌘K and the browser's own keys keep working.
 */
import { useEffect, useRef } from 'react';
import type { BoardState, View } from './board-context';

export const SHORTCUTS: { keys: string[]; label: string; group: 'Go to' | 'Actions' | 'General' }[] = [
  { keys: ['g', 'n'], label: "What's next", group: 'Go to' },
  { keys: ['g', 'b'], label: 'Board', group: 'Go to' },
  { keys: ['g', 'l'], label: 'List', group: 'Go to' },
  { keys: ['g', 'd'], label: 'Dependencies', group: 'Go to' },
  { keys: ['g', 'u'], label: 'Stand-up', group: 'Go to' },
  { keys: ['g', 's'], label: 'Settings', group: 'Go to' },
  { keys: ['c'], label: 'New ticket', group: 'Actions' },
  { keys: ['m'], label: 'Only my tickets, on or off', group: 'Actions' },
  { keys: ['f'], label: 'Open the open ticket full screen', group: 'Actions' },
  { keys: ['/'], label: 'Filter tickets', group: 'Actions' },
  { keys: ['⌘', 'K'], label: 'Jump to a ticket', group: 'General' },
  { keys: ['['], label: 'Show or hide the sidebar', group: 'General' },
  { keys: ['?'], label: 'This list', group: 'General' },
  { keys: ['Esc'], label: 'Close a panel or dialog', group: 'General' },
];

const GO: Record<string, View> = { n: 'next', b: 'board', l: 'list', d: 'graph', u: 'standup', s: 'settings' };

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const el = target;
  return (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('[role="dialog"],[role="menu"],[role="listbox"]'));
}

export function useShortcuts(state: BoardState, onHelp: () => void) {
  const pendingG = useRef(0);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const s = ref.current;
      const k = e.key;
      if (Date.now() - pendingG.current < 1200 && GO[k.toLowerCase()]) {
        pendingG.current = 0;
        s.setView(GO[k.toLowerCase()] as View);
        s.select(null);
        e.preventDefault();
        return;
      }
      pendingG.current = 0;
      if (k === 'g') pendingG.current = Date.now();
      else if (k === '?') { onHelp(); e.preventDefault(); }
      else if (k === '[') s.preferences.update((p) => ({ sidebarOpen: !p.sidebarOpen }));
      else if (k === 'c') { s.setDialog('new-ticket'); e.preventDefault(); }
      else if (k === 'm') s.setMineOnly((v) => !v);
      else if (k === 'f' && s.selected) s.setExpanded(true);
      else if (k === '/') { document.querySelector<HTMLInputElement>('input[placeholder="Filter tickets"]')?.focus(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHelp]);
}
