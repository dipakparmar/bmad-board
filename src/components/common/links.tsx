/**
 * Links to project files, commits and branches. Each opens where the person chose in Settings (the
 * board, GitHub, or their editor), falling back to what this project can reach.
 */
import { GitBranch } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useBoardContext } from '@/app/board-context';
import { branchHref, commitTarget, fileTarget, type RefResolver } from '@/app/links';
import type { Ticket } from '@/app/view-model';
import { docKind } from '@/domain';
import { cn } from '@/lib/cn';

export function useRepoLinks(workspaceId: string) {
  const { board } = useBoardContext();
  const store = board.workspaces.find((w) => w.store.id === workspaceId)?.store;
  return { links: store?.links(), canShowCommits: !!store?.source.commitDetail };
}

function Anchor({ href, className, title, children }: { href: string; className?: string; title?: string; children: ReactNode }) {
  const web = /^https?:/.test(href);
  return <a href={href} className={className} title={title} {...(web ? { target: '_blank', rel: 'noreferrer' } : {})}>{children}</a>;
}

/** Board-side opener for a file path, or the URL it should go to instead. */
export function useOpenFile() {
  const { board, preferences, openDoc } = useBoardContext();
  return (workspaceId: string, path: string) => {
    const links = board.workspaces.find((w) => w.store.id === workspaceId)?.store.links();
    const t = fileTarget(links, path, preferences.prefs.links.files, !path.endsWith('.toml'));
    if (t.kind === 'url') return t.href;
    openDoc(workspaceId, { candidates: [path], label: 'file', kind: docKind(path) });
    return null;
  };
}

export function FileLink({ workspaceId, path, className, children }: { workspaceId: string; path: string; className?: string; children: ReactNode }) {
  const { preferences, openDoc } = useBoardContext();
  const { links } = useRepoLinks(workspaceId);
  const toml = path.endsWith('.toml');
  const t = fileTarget(links, path, preferences.prefs.links.files, !toml);
  if (t.kind === 'url') return <Anchor href={t.href} className={className} title={`Open ${path}${t.fellBackTo ? ` on ${t.fellBackTo}` : ''}`}>{children}</Anchor>;
  return (
    <button type="button" disabled={toml} className={className} title={toml ? path : `Read ${path}`} onClick={() => openDoc(workspaceId, { candidates: [path], label: 'file', kind: docKind(path) })}>
      {children}
    </button>
  );
}

export function CommitLink({ workspaceId, sha, className, children }: { workspaceId: string; sha: string; className?: string; children?: ReactNode }) {
  const { preferences, openCommit } = useBoardContext();
  const { links, canShowCommits } = useRepoLinks(workspaceId);
  const t = commitTarget(links, sha, preferences.prefs.links.commits, canShowCommits);
  const body = children ?? <span className="font-mono">{sha.slice(0, 7)}</span>;
  const cls = cn('hover:underline', className);
  if (t.kind === 'url') return <Anchor href={t.href} className={cls} title={`Commit ${sha}`}>{body}</Anchor>;
  if (!canShowCommits) return <span className={className}>{body}</span>;
  return <button type="button" className={cls} title={`Commit ${sha}: what it changed`} onClick={(e) => { e.stopPropagation(); openCommit(workspaceId, sha); }}>{body}</button>;
}

export function BranchLink({ workspaceId, branch, className }: { workspaceId: string; branch: string; className?: string }) {
  const { preferences } = useBoardContext();
  const { links } = useRepoLinks(workspaceId);
  const href = preferences.prefs.links.branches === 'github' ? branchHref(links, branch) : undefined;
  const body = <><GitBranch className="size-3 shrink-0" /><span className="truncate">{branch}</span></>;
  const cls = cn('inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground', className);
  if (href) return <Anchor href={href} className={cls} title={`Open ${branch} on GitHub`}>{body}</Anchor>;
  return (
    <button type="button" className={cls} title={`Copy git switch ${branch}`} onClick={() => { void navigator.clipboard?.writeText(`git switch ${branch}`); toast.success('Copied', { description: `git switch ${branch}` }); }}>
      {body}
    </button>
  );
}

/**
 * Ticket refs, file names and commit hashes in a ticket's text, resolved against its project: the
 * resolver for `linkifyRefs`, and what clicking each link does.
 */
export function useTicketRefs(ticket: Ticket) {
  const { tickets, select, openCommit, preferences } = useBoardContext();
  const want = preferences.prefs.links.commits;
  const openFile = useOpenFile();
  const { canShowCommits, links } = useRepoLinks(ticket.workspaceId);
  return useMemo(() => {
    const peers = tickets.filter((t) => t.workspaceId === ticket.workspaceId);
    const sameInit = (t: Ticket) => t.initiative?.slug === ticket.initiative?.slug;
    const byRef = (ref: string) => peers.find((t) => t.ref === ref && sameInit(t)) ?? peers.find((t) => t.ref === ref);
    const byName = (name: string) => peers.find((t) => t.leaf.file?.path.endsWith(`/${name}.md`) && sameInit(t)) ?? peers.find((t) => t.leaf.file?.path.endsWith(`/${name}.md`));
    const epicByName = (name: string) => (peers.find((t) => t.epic?.slug === name && sameInit(t)) ?? peers.find((t) => t.epic?.slug === name))?.epic;
    const resolver: RefResolver = {
      ticket: (ref) => !!byRef(ref),
      name: (name) => (name.startsWith('epic-') ? !!epicByName(name) : !!byName(name)),
      commits: canShowCommits || !!links?.web,
    };
    const onRef = (kind: string, value: string) => {
      if (kind === 'ticket') { const t = byRef(value); if (t) select(t.uid); }
      else if (kind === 'name') {
        const epic = value.startsWith('epic-') ? epicByName(value) : undefined;
        const t = epic ? undefined : byName(value);
        if (t) select(t.uid);
        else if (epic) { const href = openFile(ticket.workspaceId, epic.path); if (href) window.open(href, /^https?:/.test(href) ? '_blank' : '_self'); }
      } else if (kind === 'commit') {
        const href = commitTarget(links, value, want, canShowCommits);
        if (href.kind === 'url') window.open(href.href, '_blank');
        else openCommit(ticket.workspaceId, value);
      }
    };
    return { resolver, onRef };
  }, [tickets, ticket, select, openCommit, openFile, canShowCommits, links, want]);
}
