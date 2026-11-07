import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { isDefaultAvatarPixels, avatarInitials } from '@/domain/avatar';

const checks = new Map<string, Promise<boolean>>();
function pixels(url: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => reject(new Error('Avatar check timed out')), 4000);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.drawImage(img, 0, 0, 32, 32);
        resolve(context.getImageData(0, 0, 32, 32).data);
      } catch (error) { reject(error); }
    };
    img.onerror = (error) => { clearTimeout(timeout); reject(error); };
    img.src = url;
  });
}
let defaultPixels: Promise<Uint8ClampedArray> | undefined;
export function hasCustomAvatar(url: string): Promise<boolean> {
  let check = checks.get(url);
  if (!check) {
    check = (async () => {
      if (/identicons?\//i.test(url)) return false;
      // GitHub's generic fallback and older generated identicons both use initials on cards.
      const data = await pixels(url);
      defaultPixels ??= pixels('https://avatars.githubusercontent.com/u/0?s=64&v=4');
      const fallback = await defaultPixels.catch(() => undefined);
      return !isDefaultAvatarPixels(data, fallback);
    })().catch(() => true); // An unreadable canvas is not evidence of a default avatar.
    checks.set(url, check);
  }
  return check;
}

export function MemberAvatar({ name, avatarUrl, initialsForDefaults = false, agent = false, className }: { name: string; avatarUrl?: string; initialsForDefaults?: boolean; agent?: boolean; className?: string }) {
  const [confirmed, setConfirmed] = useState<string>();
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    if (!avatarUrl || !initialsForDefaults) return;
    let live = true;
    void hasCustomAvatar(avatarUrl).then((custom) => { if (live && custom) setConfirmed(avatarUrl); });
    return () => { live = false; };
  }, [avatarUrl, initialsForDefaults]);
  const showImage = avatarUrl && failed !== avatarUrl && (!initialsForDefaults || confirmed === avatarUrl);
  return <span title={name} aria-label={name} className={cn('inline-grid size-5 shrink-0 place-items-center overflow-hidden rounded-full text-[9px] font-semibold', agent ? 'bg-info/15 text-info' : 'bg-primary/12 text-primary', className)}>
    {showImage ? <img src={avatarUrl} alt="" className="size-full object-cover" onError={() => setFailed(avatarUrl)} /> : avatarInitials(name)}
  </span>;
}
