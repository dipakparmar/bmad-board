import { afterEach, expect, test } from 'bun:test';
import { hasCustomAvatar } from './member-avatar';
const original = Object.getOwnPropertyDescriptor(globalThis, 'Image');
afterEach(() => { if (original) Object.defineProperty(globalThis, 'Image', original); else Reflect.deleteProperty(globalThis, 'Image'); });
test('a blocked cross-origin image check still allows the actual profile image to display', async () => {
  class BlockedImage {
    onerror?: (error: Error) => void;
    set src(_url: string) { this.onerror?.(new Error('Cross-origin check blocked')); }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: BlockedImage });
  expect(await hasCustomAvatar('https://avatars.githubusercontent.com/custom-photo-regression')).toBe(true);
});
test('known generated identicon URLs use initials without a network probe', async () => {
  expect(await hasCustomAvatar('https://github.com/identicons/someone.png')).toBe(false);
});
