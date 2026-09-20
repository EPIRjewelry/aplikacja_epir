/** Smart kolekcje linii Kamienie szlachetne — handles + linki drugiego poziomu. */

export const GEMSTONE_LINE_HANDLE = 'kazka-kamienie-szlachetne';

export type GemstoneStoneTile = {
  handle: string;
  href: string;
  label: string;
  stoneTag: string;
};

export const GEMSTONE_STONE_TILES: GemstoneStoneTile[] = [
  {
    handle: 'kazka-szafiry',
    href: '/collections/kazka-szafiry',
    label: 'Szafiry',
    stoneTag: 'kazka-szafir',
  },
  {
    handle: 'kazka-rubiny',
    href: '/collections/kazka-rubiny',
    label: 'Rubiny',
    stoneTag: 'kazka-rubin',
  },
  {
    handle: 'kazka-szmaragdy',
    href: '/collections/kazka-szmaragdy',
    label: 'Szmaragdy',
    stoneTag: 'kazka-szmaragd',
  },
];

const GEMSTONE_HANDLES = new Set([
  GEMSTONE_LINE_HANDLE,
  ...GEMSTONE_STONE_TILES.map((t) => t.handle),
]);

export function isGemstoneCollectionHandle(handle: string): boolean {
  return GEMSTONE_HANDLES.has(handle);
}

export function isGemstoneHubHandle(handle: string): boolean {
  return handle === GEMSTONE_LINE_HANDLE;
}
