import { useState } from 'react';
import { toast } from 'sonner';
import { useBoardContext } from '@/app/board-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { GitHubSource, parseRepo } from '@/store';

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

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const target = parseRepo(repo);
    if (!target) {
      toast.error('Enter a repo as owner/name or a github.com URL');
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
              Without a token the board is read-only and works on public repos. With a fine-grained token that has Contents and Pull requests write access, your edits go to a <code>bmad-board/…</code> branch and one pull request. The token stays in this browser.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium">Repo<Input autoFocus required placeholder="owner/name, or a github.com URL with /tree/branch/folder" value={repo} onChange={(e) => setRepo(e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-xs font-medium">Token (optional)<Input type="password" value={token} onChange={(e) => setToken(e.target.value)} /></label>
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
