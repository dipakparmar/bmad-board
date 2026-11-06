/** Ticket body: the leaf file once it exists, else the tickets.toml entry. Editable on writable projects. */
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { applyWithToast } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import { bodyOf, type Ticket } from '@/app/view-model';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from './markdown';

export function TaskDescription({ ticket }: { ticket: Ticket }) {
  const state = useBoardContext();
  const { leaf } = ticket;
  const [draft, setDraft] = useState<string | null>(null);
  const editingFile = !!leaf.file;
  const source = editingFile ? leaf.file?.body ?? '' : leaf.entry?.description ?? '';

  async function save() {
    if (draft === null) return;
    const ok = await applyWithToast(
      state,
      ticket.workspaceId,
      [leaf.file ? { kind: 'edit-body', path: leaf.file.path, body: draft } : { kind: 'edit-entry', key: leaf.key, patch: { description: draft.trim() } }],
      `${ticket.ref} updated`,
    );
    if (ok) setDraft(null);
  }

  if (draft !== null) {
    return (
      <div className="flex flex-col gap-2">
        <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-64 font-mono text-xs" />
        <p className="text-xs text-muted-foreground">{editingFile ? `Editing ${leaf.file?.path}` : 'Editing the description in tickets.toml. Once the story is refined, BMAD gives it its own file.'}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void save()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
        </div>
      </div>
    );
  }

  const shown = bodyOf(leaf);
  return (
    <div className="group relative">
      {shown ? <Markdown source={shown} /> : <p className="text-sm text-muted-foreground">No description yet.</p>}
      {!ticket.readOnly && (
        <Button size="xs" variant="ghost" className="absolute -top-1 right-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setDraft(source)}>
          <Pencil />Edit
        </Button>
      )}
    </div>
  );
}
