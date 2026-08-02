/** localStorage への保存。フェーズ境界でのみ呼ぶ。 */

const KEY = 'lucky-heights/v1';
const SCHEMA_VERSION = 1;

const EMPTY_META = {
  clearedDifficulties: [],
  seenSymbols: [],
  records: [],
};

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function load() {
  const s = storage();
  if (!s) return { run: null, meta: { ...EMPTY_META } };
  try {
    const raw = s.getItem(KEY);
    if (!raw) return { run: null, meta: { ...EMPTY_META } };
    const data = JSON.parse(raw);
    if (data.schemaVersion !== SCHEMA_VERSION) {
      // 移行できない場合も、図鑑と記録（meta）だけは残す
      return { run: null, meta: { ...EMPTY_META, ...(data.meta ?? {}) } };
    }
    return { run: data.run ?? null, meta: { ...EMPTY_META, ...(data.meta ?? {}) } };
  } catch {
    return { run: null, meta: { ...EMPTY_META } };
  }
}

export function save(run, meta) {
  const s = storage();
  if (!s) return;
  try {
    // lastSpin は盤面の実体参照を含み容量も食うので保存しない
    const slim = run ? { ...run, lastSpin: null } : null;
    s.setItem(KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, run: slim, meta }));
  } catch {
    /* 容量超過やプライベートモードでは黙って諦める */
  }
}

export function clearRun(meta) {
  save(null, meta);
}
