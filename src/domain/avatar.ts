export function avatarInitials(name: string): string {
  const words = name.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}` : words[0]?.slice(0, 2) ?? '?').toUpperCase();
}

/** Conservative image check on a 32 x 32 sample; no assumption that an avatar URL means a photo. */
export function isDefaultAvatarPixels(data: Uint8ClampedArray, fallback?: Uint8ClampedArray): boolean {
  if (data.length !== 32 * 32 * 4) return false;
  if (fallback?.length === data.length) {
    let difference = 0;
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) difference += Math.abs(data[i + c]! - fallback[i + c]!);
    if (difference / (32 * 32 * 3) < 3) return true;
  }
  // Older GitHub identicons have two colors, a mirrored five-column grid and uniform block interiors.
  const color = (x: number, y: number) => Array.from(data.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 3));
  const equal = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 8);
  const palette: number[][] = [];
  const grid: number[][] = [];
  for (let row = 0; row < 5; row++) {
    const cells: number[] = [];
    for (let col = 0; col < 5; col++) {
      const x = Math.round((col + 1) * 32 / 6); const y = Math.round((row + 1) * 32 / 6);
      const sample = color(x, y);
      if (![-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => equal(sample, color(x + dx, y + dy))))) return false;
      let index = palette.findIndex((c) => equal(c, sample));
      if (index < 0) { index = palette.length; palette.push(sample); }
      cells.push(index);
    }
    grid.push(cells);
  }
  return palette.length === 2 && grid.every((r) => r[0] === r[4] && r[1] === r[3]);
}
