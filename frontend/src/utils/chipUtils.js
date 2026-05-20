/** Physical poker chip set — fixed inventory, not derived from dollar amounts. */

export const CHIP_DENOMS = [
  { value: 500, color: '#6d28d9', rim: '#4c1d95', label: '500' },
  { value: 100, color: '#1d4ed8', rim: '#1e3a8a', label: '100' },
  { value: 25, color: '#15803d', rim: '#14532d', label: '25' },
  { value: 5, color: '#dc2626', rim: '#991b1b', label: '5' },
  { value: 1, color: '#f8fafc', rim: '#94a3b8', label: '1', text: '#0f172a' },
];

/** Starting rack per player (32 chips = 1000 value). */
export const STARTING_RACK = {
  500: 1,
  100: 2,
  25: 8,
  5: 10,
  1: 50,
};

export const CHIPS_PER_PLAYER = Object.entries(STARTING_RACK).reduce(
  (sum, [d, n]) => sum + Number(d) * n,
  0,
);

export const TOTAL_CHIPS_IN_PLAY = CHIPS_PER_PLAYER * 2;

export function getDenom(value) {
  return CHIP_DENOMS.find((d) => d.value === value);
}

/** inventory: { "500": 1, "100": 2, ... } → groups for rendering */
export function inventoryToGroups(inventory, maxPerStack = 12) {
  if (!inventory) return [];
  return CHIP_DENOMS.map((denom) => {
    const count = Number(inventory[String(denom.value)] || 0);
    if (count <= 0) return null;
    return {
      denom,
      count: Math.min(count, maxPerStack),
      overflow: count > maxPerStack ? count - maxPerStack : 0,
    };
  }).filter(Boolean);
}

export function rackChipCount(inventory) {
  return inventoryToGroups(inventory).reduce((n, g) => n + g.count + g.overflow, 0);
}

export function rackTotal(inventory) {
  if (!inventory) return 0;
  return Object.entries(inventory).reduce((sum, [d, n]) => sum + Number(d) * Number(n), 0);
}

/** Expand backend chips_moved map into individual chip objects for fly animation. */
export function chipsMovedToFlyList(chipsMoved, maxChips = 16) {
  if (!chipsMoved) return [];
  const list = [];
  for (const denom of CHIP_DENOMS) {
    const n = Number(chipsMoved[String(denom.value)] || 0);
    for (let i = 0; i < n && list.length < maxChips; i += 1) {
      list.push(denom);
    }
  }
  return list;
}
