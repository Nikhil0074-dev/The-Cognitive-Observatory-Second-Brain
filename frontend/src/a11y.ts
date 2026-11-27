import type { KeyboardEvent } from 'react';
/** Makes a clickable div keyboard-operable: focusable, announced as a button, activates on Enter / Space. */
export const kb = (fn: () => void) => ({
  role: 'button' as const, tabIndex: 0, onClick: fn,
  onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
});

import type { C, N } from './types';
/** Keyboard navigation for the map canvases: arrows step through notes (grouped by cluster, most connected first), Home/End jump, Escape deselects. */
export function navigateNodes(e: { key: string; preventDefault: () => void }, nodes: N[], clusters: C[], selected: string | null, onSelect: (id: string | null) => void) {
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Escape'].includes(e.key)) return;
  e.preventDefault();
  if (e.key === 'Escape') return onSelect(null);
  const idx = new Map(clusters.map((c, i) => [c.id, i])), order = [...nodes].sort((a, b) => ((idx.get(a.cluster_id as string) ?? 99) - (idx.get(b.cluster_id as string) ?? 99)) || b.rank - a.rank);
  if (!order.length) return;
  let i = order.findIndex(n => n.id === selected);
  if (e.key === 'Home') i = 0; else if (e.key === 'End') i = order.length - 1;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = i < 0 ? 0 : Math.min(order.length - 1, i + 1);
  else i = i < 0 ? order.length - 1 : Math.max(0, i - 1);
  onSelect(order[i].id);
}
