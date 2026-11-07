import { isAutomatedIdentity, mergeMembers, type Member } from '../../domain/people';

interface GitHubUser { login: string; avatar_url: string; type?: string }
interface GitActor { name: string; email: string }
export interface GitHubPeopleCommit {
  author?: GitHubUser | null;
  committer?: GitHubUser | null;
  commit: { author: GitActor; committer?: GitActor; message: string };
}

/** GitHub attaches the account to the Git author, including commits made with personal email. */
export function membersFromGitHubAccounts(commits: GitHubPeopleCommit[]): Member[] {
  const members: Member[] = [];
  for (const c of commits) {
    for (const [git, user] of [[c.commit.author, c.author], [c.commit.committer, c.committer]] as const) {
      if (!git || !user?.login || !user.avatar_url) continue;
      members.push({ name: git.name, email: git.email, login: user.login, avatarUrl: user.avatar_url, aliases: [git.name, git.email, user.login], agent: user.type === 'Bot' || isAutomatedIdentity(git.name, git.email), commits: 0, sources: ['github'] });
    }
  }
  return mergeMembers(members);
}

export interface LocalPeopleLine { sha?: string; name: string; email: string; committerName?: string; committerEmail?: string }

/** Choose actual authored commits for missing photos. Never turn names or personal email prefixes into logins. */
export function avatarLookupCommits(members: Member[], lines: LocalPeopleLine[], limit = 40): string[] {
  const shas = new Set<string>();
  for (const m of members) {
    if (m.agent || m.avatarUrl) continue;
    const aliases = new Set([m.name, m.email, ...(m.aliases ?? [])].filter(Boolean).map((v) => v!.trim().toLowerCase()));
    const line = lines.find((l) => l.sha && (aliases.has(l.email.trim().toLowerCase()) || (!!l.committerEmail && aliases.has(l.committerEmail.trim().toLowerCase()))));
    if (line?.sha) shas.add(line.sha);
    if (shas.size >= limit) break;
  }
  return [...shas];
}
