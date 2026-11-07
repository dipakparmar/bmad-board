/** Draws long lists a page at a time, so a project with thousands of tickets stays quick. */
import { useState } from 'react';

export function usePaged<T>(items: T[], page: number): { visible: T[]; more: React.ReactNode } {
  const [shown, setShown] = useState(page);
  const visible = items.length > shown ? items.slice(0, shown) : items;
  const rest = items.length - visible.length;
  const more = rest > 0 && (
    <div className="flex items-center justify-center gap-3 py-1.5 text-xs text-muted-foreground">
      <button type="button" className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground" onClick={() => setShown((n) => n + page)}>Show {Math.min(page, rest)} more</button>
      {rest > page && <button type="button" className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground" onClick={() => setShown(items.length)}>Show all {items.length.toLocaleString()}</button>}
    </div>
  );
  return { visible, more };
}
