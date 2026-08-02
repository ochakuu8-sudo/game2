/**
 * 盤面のジオメトリ。4列 × 5行 = 20マス。
 * 隣接は 8 方向。隣接テーブルは起動時に一度だけ作る。
 */

export const COLS = 4;
export const ROWS = 5;
export const CELLS = COLS * ROWS;

/** @type {number[][]} index -> 隣接indexの配列 */
export const ADJACENCY = (() => {
  const table = [];
  for (let i = 0; i < CELLS; i++) {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        list.push(nr * COLS + nc);
      }
    }
    table.push(list);
  }
  return table;
})();

export function isEdge(index) {
  const r = Math.floor(index / COLS);
  const c = index % COLS;
  return r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
}

export function below(index) {
  const next = index + COLS;
  return next < CELLS ? next : null;
}

/**
 * 盤面ビュー。効果関数はここ経由でのみ盤面を参照する。
 * 破壊済みのマスは既定で除外する（破壊されたものは「もう無い」）。
 */
export class BoardView {
  /** @param {import('./types.js').Placed[]} placed */
  constructor(placed) {
    this.placed = placed;
  }

  at(index) {
    const p = this.placed[index];
    return p && !p.destroyed ? p : null;
  }

  adjacent(index) {
    const out = [];
    for (const i of ADJACENCY[index]) {
      const p = this.at(i);
      if (p) out.push(p);
    }
    return out;
  }

  all() {
    return this.placed.filter((p) => p && !p.destroyed);
  }

  byTag(tag) {
    return this.all().filter((p) => p.def.tags.includes(tag));
  }

  byId(defId) {
    return this.all().filter((p) => p.def.id === defId);
  }

  countTag(tag) {
    return this.byTag(tag).length;
  }
}
