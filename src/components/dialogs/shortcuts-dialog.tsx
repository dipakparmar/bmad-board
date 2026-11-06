import { SHORTCUTS } from '@/app/use-shortcuts';
import { Dialog, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

export function ShortcutsList() {
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {groups.map((g) => (
        <section key={g}>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</h4>
          <ul className="flex flex-col gap-1.5">
            {SHORTCUTS.filter((s) => s.group === g).map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                <span>{s.label}</span>
                <span className="flex shrink-0 items-center gap-1">{s.keys.map((k, i) => <Kbd key={`${k}${i}`}>{k}</Kbd>)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
        <DialogPanel><ShortcutsList /></DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
