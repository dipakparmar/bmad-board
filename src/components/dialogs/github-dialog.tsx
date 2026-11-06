import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useBoardContext } from '@/app/board-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { GitHubSource, ghCliStatus, LocalServerSource, parseRepo } from '@/store';

const TOKEN_KEY = 'bmad-board:github-token';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function GitHubDialog() {
  const { dialog, setDialog, board } = useBoardContext();
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState(readToken);
  // The local server can lend this machine's `gh` login, so no token has to be pasted.
  const hasServer = board.workspaces.some((w) => w.store.source instanceof LocalServerSource) || board.serverAvailable;
  const [gh, setGh] = useState<{ available: boolean; login?: string; error?: string } | null>(null);
  const [auth, setAuth] = useState<'gh' | 'token'>('token');
  useEffect(() => {
    if (dialog !== 'github' || !hasServer) return;
    void ghCliStatus().then((s) => {
      setGh(s);
      if (s.available && !readToken()) setAuth('gh');
    });
  }, [dialog, hasServer]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const target = parseRepo(repo);
    if (!target) {
      toast.error('Enter a repo as owner/name or a github.com URL');
      return;
    }
    if (auth === 'gh') {
      setDialog(null);
      await board.add(new GitHubSource({ ...target, useGhCli: true }));
      return;
    }
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage can be blocked */
    }
    setDialog(null);
    await board.add(new GitHubSource({ ...target, token: token || undefined }));
  }

  return (
    <Dialog open={dialog === 'github'} onOpenChange={(open) => !open && setDialog(null)}>
      <DialogPopup className="sm:max-w-md">
        <form className="contents" onSubmit={(e) => void connect(e)}>
          <DialogHeader>
            <DialogTitle>Connect a GitHub repo</DialogTitle>
            <DialogDescription>
              Your edits go to a <code>bmad-board/…</code> branch and one pull request. Use your GitHub CLI login, or a fine-grained token with Contents and Pull requests write access (kept in this browser). Without either, the board is read-only on public repos.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium">Repo<Input autoFocus required placeholder="owner/name, or a github.com URL with /tree/branch/folder" value={repo} onChange={(e) => setRepo(e.target.value)} /></label>
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium">Sign in with</span>
              <label className={`flex items-start gap-2 rounded-lg border p-2.5 ${gh?.available ? '' : 'opacity-60'}`}>
                <input type="radio" name="auth" className="mt-0.5" checked={auth === 'gh'} disabled={!gh?.available} onChange={() => setAuth('gh')} />
                <span>
                  <span className="font-medium">GitHub CLI on this machine</span>
                  <span className="block text-muted-foreground">
                    {!hasServer ? 'Needs the local server (bun run start).' : gh === null ? 'Checking `gh auth`…' : gh.available ? `Signed in as @${gh.login}. The token stays with the local server.` : gh.error ?? 'Run `gh auth login`, then reopen this dialog.'}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border p-2.5">
                <input type="radio" name="auth" className="mt-0.5" checked={auth === 'token'} onChange={() => setAuth('token')} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span><span className="font-medium">A token</span> <span className="text-muted-foreground">(optional; leave empty for read-only public repos)</span></span>
                  {auth === 'token' && <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" />}
                </span>
              </label>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit">Connect</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
