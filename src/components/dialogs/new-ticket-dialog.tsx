/**
 * Adds an entry to an epic's tickets.toml, or files a standalone bug in backlog/, the way the PO agent would.
 * On a v6 project it adds `### Story N.M` to the epic in the epics file, as create-epics-and-stories does.
 */
import { useMemo, useState } from 'react';
import { applyWithToast } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import { RISK_LABELS, TYPE_LABELS, type LeafType, type Risk } from '@/domain';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Target {
  value: string;
  label: string;
  workspaceId: string;
  folder: string;
  v6?: boolean;
}

export function NewTicketDialog() {
  const state = useBoardContext();
  const { dialog, setDialog, board, scope } = state;
  const targets = useMemo<Target[]>(() => board.workspaces.flatMap((w) => {
    if (!w.tree || !w.store.capabilities.write || w.tree.tracker !== 'repo') return [];
    const out: Target[] = [];
    if (w.tree.layout === 'v6') {
      for (const e of w.tree.initiatives.flatMap((i) => i.epics)) out.push({ value: `${w.store.id}::${e.slug}`, label: `Epic ${e.id}: ${e.title} · ${w.store.label}`, workspaceId: w.store.id, folder: e.slug, v6: true });
      return out;
    }
    for (const i of w.tree.initiatives) {
      if (i.children) continue;
      for (const e of i.epics) out.push({ value: `${w.store.id}::${e.slug}`, label: `${e.title} · ${w.store.label}`, workspaceId: w.store.id, folder: e.slug });
      if (i.epics.length === 0) out.push({ value: `${w.store.id}::${i.slug}`, label: `${i.title} · ${w.store.label}`, workspaceId: w.store.id, folder: i.slug });
    }
    out.push({ value: `${w.store.id}::backlog`, label: `Backlog bug · ${w.store.label}`, workspaceId: w.store.id, folder: 'backlog' });
    return out;
  }), [board.workspaces]);

  const preferred = targets.find((t) => t.workspaceId === scope.workspaceId && t.folder === scope.epic) ?? targets[0];
  const [target, setTarget] = useState<string | null>(null);
  const [type, setType] = useState<LeafType>('story');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [verify, setVerify] = useState('');
  const [after, setAfter] = useState('');
  const [risk, setRisk] = useState<Risk>('low');
  const [hitl, setHitl] = useState(false);
  const chosen = targets.find((t) => t.value === (target ?? preferred?.value));
  const isBug = chosen?.folder === 'backlog';
  const v6 = !!chosen?.v6;

  function reset() {
    setTarget(null); setType('story'); setTitle(''); setDescription(''); setVerify(''); setAfter(''); setRisk('low'); setHitl(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen || !title.trim()) return;
    const ok = isBug
      ? await applyWithToast(state, chosen.workspaceId, [{ kind: 'file-bug', title: title.trim(), body: description }], `Filed "${title.trim()}"`)
      : await applyWithToast(state, chosen.workspaceId, [{
        kind: 'add-entry', folder: chosen.folder,
        entry: {
          type: v6 ? 'story' : type, title: title.trim(), description: description.trim(), verify: verify.trim() || undefined, covers: [],
          after: after.split(',').map((a) => a.trim()).filter(Boolean).map((a) => (/^\d+$/.test(a) ? Number(a) : a)), hitl, risk,
        },
      }], `Added "${title.trim()}"`);
    if (ok) {
      reset();
      setDialog(null);
    }
  }

  return (
    <Dialog open={dialog === 'new-ticket'} onOpenChange={(open) => !open && setDialog(null)}>
      <DialogPopup className="sm:max-w-lg">
        <form className="contents" onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>{v6
              ? <>Adds the next <code>Story N.M</code> to the epic in the epics file, and lists it in <code>sprint-status.yaml</code> as backlog. create-story writes its story file.</>
              : <>Adds an entry to the epic's <code>tickets.toml</code> in build order. The build agent plans its acceptance criteria when it builds it.</>}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-3">
            {targets.length === 0 ? <p className="text-sm text-muted-foreground">Connect a writable project first: the local server, or a GitHub repo with a token.</p> : (
              <>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Select value={chosen?.value ?? null} onValueChange={(v) => typeof v === 'string' && setTarget(v)}>
                    <SelectTrigger aria-label="Where"><SelectValue>{chosen?.label}</SelectValue></SelectTrigger>
                    <SelectPopup>{targets.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectPopup>
                  </Select>
                  {!isBug && !v6 && (
                    <Select value={type} onValueChange={(v) => typeof v === 'string' && setType(v as LeafType)}>
                      <SelectTrigger aria-label="Type" className="w-28"><SelectValue>{TYPE_LABELS[type].label}</SelectValue></SelectTrigger>
                      <SelectPopup>{(['story', 'spike', 'bug'] as const).map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t].label}</SelectItem>)}</SelectPopup>
                    </Select>
                  )}
                </div>
                <Input required autoFocus placeholder={isBug ? 'What is broken' : 'What works when it is done'} value={title} onChange={(e) => setTitle(e.target.value)} />
                <Textarea placeholder={isBug ? 'Steps, expected, actual' : v6 ? 'As a …,\nI want …,\nSo that ….' : 'One sentence on what it delivers'} value={description} onChange={(e) => setDescription(e.target.value)} />
                {v6 && <Textarea placeholder={'Acceptance criteria\n**Given** …\n**When** …\n**Then** …'} value={verify} onChange={(e) => setVerify(e.target.value)} />}
                {!isBug && !v6 && (
                  <>
                    <Input placeholder="Verify: how it will be checked" value={verify} onChange={(e) => setVerify(e.target.value)} />
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                      <Input placeholder="Waits on, e.g. 1, 2.3, epic-cart" value={after} onChange={(e) => setAfter(e.target.value)} />
                      <Select value={risk} onValueChange={(v) => typeof v === 'string' && setRisk(v as Risk)}>
                        <SelectTrigger aria-label="Risk" className="w-32"><SelectValue>{RISK_LABELS[risk].label}</SelectValue></SelectTrigger>
                        <SelectPopup>{(['low', 'medium', 'high'] as const).map((r) => <SelectItem key={r} value={r}>{RISK_LABELS[r].label}</SelectItem>)}</SelectPopup>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={hitl} onChange={(e) => setHitl(e.target.checked)} />Needs a person</label>
                    </div>
                  </>
                )}
              </>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" disabled={!chosen || !title.trim()}>{isBug ? 'File bug' : v6 ? 'Add story' : 'Add ticket'}</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
