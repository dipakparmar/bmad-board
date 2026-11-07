import { afterEach, expect, test } from 'bun:test';
import { loadIdentities } from './identity-settings';
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
function stored(value: string) { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => value } }); }
test('restores project-scoped identity settings and discards malformed entries', () => {
  const user = { id: 'd', name: 'Dipak', aliases: ['dipakparmar'], agent: false, hidden: false };
  stored(JSON.stringify({ demo: [user, { name: 4 }], shop: [] }));
  expect(loadIdentities()).toEqual({ demo: [user], shop: [] });
});
test('unavailable or corrupt browser storage uses an empty identity map', () => {
  stored('{broken');
  expect(loadIdentities()).toEqual({});
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
  expect(loadIdentities()).toEqual({});
});
