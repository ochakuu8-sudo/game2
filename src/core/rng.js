/**
 * シード付き乱数。状態が 32bit 整数 1 個なので、そのままセーブに載る。
 * ゲームロジック内で Math.random() を使うことは禁止（再現性が壊れるため）。
 */

/** @param {number} seed @returns {{next:()=>number, state:()=>number}} */
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    state: () => a,
    /** 保存された状態から再開する */
    restore(s) { a = s >>> 0; },
    /** 0 以上 n 未満の整数 */
    int: (n) => (next() * n) | 0,
    /** 配列から 1 つ選ぶ */
    pick: (arr) => arr[(next() * arr.length) | 0],
    /** 確率 p で true */
    chance: (p) => next() < p,
  };
}

/** 今日の日付をシードにする（デイリーシード用） */
export function dailySeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}
