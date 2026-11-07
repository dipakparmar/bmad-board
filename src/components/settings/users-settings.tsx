import { useMemo, useState } from 'react';
import { useBoardContext } from '@/app/board-context';
import { identityAliases, identityError, type Identity } from '@/domain/identities';
import { recommendIdentities, acceptIdentityRecommendations } from '@/domain/identity-recommendations';
import { CommitCount, PersonKindIcon } from '@/components/common/person-meta';
import { MemberAvatar } from '@/components/common/member-avatar';
import { usePeople } from '@/app/use-people';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

function ProjectUsers({ workspaceId }: { workspaceId: string }) {
  const { board, rawPeople, people, identities } = useBoardContext();
  const rules = identities.settings[workspaceId] ?? [];
  const users = usePeople(workspaceId);
  const [draft, setDraft] = useState<Identity | null>(null);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const ws = board.workspaces.find((w) => w.store.id === workspaceId);
  const all = rawPeople[workspaceId] ?? [];
  const query = search.trim().toLowerCase();
  const roster = people[workspaceId] ?? [];
  const recommendations = useMemo(() => recommendIdentities(all, rules), [all, rules]);
  const selected = recommendations.matches.filter((m) => !excluded.has(m.id));
  const accept = () => {
    try {
      identities.update(workspaceId, acceptIdentityRecommendations(rules, selected));
      setExcluded(new Set());
      setError(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not apply these matches.'); }
  };
  return (
    <section className="rounded-xl border border-border bg-background">
      <header className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-medium">Users · {ws?.store.label}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{users.length} visible users, {all.length} discovered identities. Includes ticket and story owners, plan assignees, action owners, Git authors and co-authors, and available GitHub contributors.</p>
        <p className="mt-1 text-xs text-muted-foreground">Group first names, full names, emails and GitHub logins using aliases. Corrections apply to this project in this browser. Saved project files keep their original values.</p>
      </header>
      <div className="flex flex-wrap gap-2 px-5 py-3">
        <Input aria-label={`Search users in ${ws?.store.label}`} placeholder="Search users and aliases" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-40 flex-1" />
        <Button size="sm" variant="outline" onClick={() => { setDraft({ id: crypto.randomUUID(), name: '', aliases: [], agent: false, hidden: false }); setError(undefined); }}>Add user</Button>
      </div>
      {(recommendations.matches.length > 0 || recommendations.ambiguous.length > 0) && <div className="mx-5 mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h4 className="text-sm font-medium">Recommended user matches</h4><p className="text-xs text-muted-foreground">Review each group, then accept them together. Names, logins and all observed commit emails become one user.</p></div>
          <Button size="sm" disabled={!selected.length} onClick={accept}>Accept {selected.length} selected {selected.length === 1 ? 'match' : 'matches'}</Button>
        </div>
        {!!recommendations.matches.length && <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.length === recommendations.matches.length} onChange={(e) => setExcluded(e.target.checked ? new Set() : new Set(recommendations.matches.map((m) => m.id)))} />Select all recommendations</label>}
        <div className="mt-2 max-h-96 overflow-y-auto">
          {recommendations.matches.map((match) => {
            const avatar = all.find((m) => m.avatarUrl && identityAliases(m).some((a) => match.aliases.includes(a)));
            return <label key={match.id} className="flex items-start gap-3 border-t border-primary/10 py-3">
              <input type="checkbox" className="mt-1" checked={!excluded.has(match.id)} onChange={(e) => setExcluded((old) => { const next = new Set(old); if (e.target.checked) next.delete(match.id); else next.add(match.id); return next; })} />
              <MemberAvatar name={match.name} avatarUrl={avatar?.avatarUrl} className="size-8" />
              <div className="min-w-0 flex-1"><div className="text-sm font-medium">{match.name}</div><div className="mt-1 flex flex-wrap gap-1">{match.aliases.map((a) => <span key={a} className="break-all rounded bg-background px-1.5 py-0.5 text-xs">{a}</span>)}</div><p className="mt-1 text-xs text-muted-foreground">{match.reasons.join(' · ')}</p></div>
            </label>;
          })}
        </div>
        {recommendations.ambiguous.map((item) => <div key={item.name} className="mt-2 rounded bg-background p-2 text-xs"><strong>{item.name}: needs review.</strong> Could match {item.candidates.join(', ')}. Use Correct below to choose the person.</div>)}
        {error && !draft && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </div>}
      {draft && (
        <form className="mx-5 mb-4 flex flex-col gap-3 rounded-lg border border-border p-4" onSubmit={(e) => {
          e.preventDefault();
          const clean = { ...draft, name: draft.name.trim(), aliases: [...new Set(draft.aliases.map((a) => a.trim()).filter(Boolean))] };
          const problem = identityError(clean, rules);
          if (problem) { setError(problem); return; }
          identities.update(workspaceId, [...rules.filter((i) => i.id !== clean.id), clean]);
          setDraft(null);
        }}>
          <label className="text-xs">Display and assignment name<Input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="text-xs">Aliases, one per line<Textarea rows={4} placeholder={'Dipak\ndipakparmar\nperson@example.com'} value={draft.aliases.join('\n')} onChange={(e) => setDraft({ ...draft, aliases: e.target.value.split('\n') })} /></label>
          <div className="flex flex-wrap gap-5 text-sm">
            <label>Type <select aria-label="User type" className="rounded border border-border bg-background px-2 py-1" value={draft.agent ? 'agent' : 'person'} onChange={(e) => setDraft({ ...draft, agent: e.target.value === 'agent' })}><option value="person">Person</option><option value="agent">Agent / bot</option></select></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.hidden} onChange={(e) => setDraft({ ...draft, hidden: e.target.checked })} />Hide from suggestions and stand-up when unassigned</label>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2"><Button size="sm" type="submit">Save user</Button><Button size="sm" variant="ghost" type="button" onClick={() => setDraft(null)}>Cancel</Button></div>
        </form>
      )}
      {identities.storageError && <p role="alert" className="px-5 pb-3 text-xs text-destructive">Browser storage is unavailable. Corrections last only until this page closes.</p>}
      <div className="max-h-96 overflow-auto border-t border-border px-5 py-3">
        <h4 className="mb-2 text-xs font-medium">Users · grouped identities</h4>
        {roster.filter((m) => !query || identityAliases(m).some((a) => a.toLowerCase().includes(query))).map((m) => <div key={`${m.name}:${m.email ?? ''}`} className="flex items-center gap-3 border-b border-border/50 py-2 last:border-0">
          <MemberAvatar name={m.name} avatarUrl={m.avatarUrl} className="size-8" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-sm">{m.name}<PersonKindIcon agent={m.agent} />{m.commits > 0 && <CommitCount count={m.commits} context="in the scanned history" />}</div><div className="break-words text-xs text-muted-foreground">{[m.login && `@${m.login}`, ...identityAliases(m).filter((a) => a !== m.name && a !== m.login), m.sources.join(', ')].filter(Boolean).join(' · ')}</div></div>
          <Button size="sm" variant="ghost" onClick={() => {
            const existing = rules.find((i) => [i.name, ...i.aliases].some((a) => identityAliases(m).some((b) => a.toLowerCase() === b.toLowerCase())));
            setDraft(existing ? { ...existing, aliases: [...new Set([...existing.aliases, ...identityAliases(m)])] } : { id: crypto.randomUUID(), name: m.name, aliases: identityAliases(m), agent: m.agent, hidden: false });
            setError(undefined);
          }}>{rules.some((r) => r.name === m.name) ? 'Edit' : 'Correct'}</Button>
          {rules.some((r) => r.name === m.name) && <Button size="sm" variant="ghost" onClick={() => identities.update(workspaceId, rules.filter((r) => r.name !== m.name))}>Remove mapping</Button>}
        </div>)}
        {!all.length && <p className="text-xs text-muted-foreground">No identities discovered yet. Add a user or wait for the project roster to load.</p>}
      </div>
    </section>
  );
}

export function UsersSettings() {
  const { board } = useBoardContext();
  return <>{board.workspaces.map((w) => <ProjectUsers key={w.store.id} workspaceId={w.store.id} />)}</>;
}
