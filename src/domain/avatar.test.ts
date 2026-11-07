import { expect, test } from 'bun:test';
import { avatarInitials, isDefaultAvatarPixels } from './avatar';
test('initials use the real name, with a short-name fallback', () => {
  expect(avatarInitials('Dipak Parmar')).toBe('DP');
  expect(avatarInitials('dipak')).toBe('DI');
  expect(avatarInitials('Éric Martin')).toBe('ÉM');
});
test('recognizes the GitHub fallback image by pixels, not by the user avatar URL', () => {
  const reference = Uint8ClampedArray.from({ length: 4096 }, (_, i) => i % 256);
  expect(isDefaultAvatarPixels(new Uint8ClampedArray(reference), reference)).toBe(true);
  const photo = Uint8ClampedArray.from({ length: 4096 }, (_, i) => (i * 37) % 256);
  expect(isDefaultAvatarPixels(photo, reference)).toBe(false);
  expect(isDefaultAvatarPixels(new Uint8ClampedArray())).toBe(false);
});
test('recognizes mirrored two-color grid identicons while preserving photos', () => {
  const data = new Uint8ClampedArray(4096).fill(255);
  const grid = [[1,0,1,0,1],[0,1,1,1,0],[1,1,0,1,1],[0,1,0,1,0],[1,0,0,0,1]];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
    const x = Math.round((col + 1) * 32 / 6), y = Math.round((row + 1) * 32 / 6);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (let c = 0; c < 3; c++) data[((y + dy) * 32 + x + dx) * 4 + c] = grid[row]![col] ? 100 : 255;
  }
  expect(isDefaultAvatarPixels(data)).toBe(true);
  data[(5 * 32 + 4) * 4] = 0;
  expect(isDefaultAvatarPixels(data)).toBe(false);
});
