/**
 * シンボル定義。
 *
 * 効果は必ず以下 6 つのプリミティブの組み合わせだけで書く。
 * ここを増やさないことが、バランス崩壊とバグに対する最大の防波堤。
 *
 *   c.add(target, n)           値を加算
 *   c.mult(target, n)          値を乗算（target に 'total' を渡すと合計に乗る）
 *   c.destroy(target)          破壊（インベントリから永久に失われる）
 *   c.spawn(defId)             インベントリに追加
 *   c.addPermanent(target, n)  ラン中ずっと残るボーナスを加算
 *   c.transform(target, defId) 別のシンボルに変身
 *
 * フェーズ:  tick → add → transform → destroy → mult → post
 * 同一フェーズ内は盤面インデックス昇順で処理する（＝結果は完全に再現可能）。
 */

/** @type {Record<string, import('./types.js').SymbolDef>} */
const DEFS = {};

function def(d) {
  DEFS[d.id] = { base: 0, tags: [], effects: {}, ...d };
  return DEFS[d.id];
}

// ───────────────────────── コモン ─────────────────────────

def({
  id: 'coin', name: '十円玉', emoji: '🪙', rarity: 'common',
  tags: ['money'], base: 1, desc: '—',
});

def({
  id: 'onigiri', name: 'おにぎり', emoji: '🍙', rarity: 'common',
  tags: ['food'], base: 2, desc: '—',
});

def({
  id: 'cupnoodle', name: 'カップ麺', emoji: '🍜', rarity: 'common',
  tags: ['food'], base: 2, desc: '隣の住人 1人につき +1',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.tags.includes('resident')) c.add('self', 1, p);
      }
    },
  },
});

def({
  id: 'egg', name: 'たまご', emoji: '🥚', rarity: 'common',
  tags: ['food', 'animal'], base: 1, desc: '5スピン後、🐔ニワトリになる',
  effects: {
    tick: (c) => {
      c.self.inst.counter++;
      if (c.self.inst.counter >= 5) c.transform('self', 'chicken');
    },
  },
});

def({
  id: 'planter', name: '植木鉢', emoji: '🌱', rarity: 'common',
  tags: ['plant'], base: 1, desc: 'スピンごとに永続 +1 成長する',
  effects: { tick: (c) => c.addPermanent('self', 1) },
});

def({
  id: 'sock', name: 'くつ下', emoji: '🧦', rarity: 'common',
  tags: ['junk'], base: 1, desc: '隣の🧦くつ下 1つにつき +4（片方だけだと悲しい）',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.id === 'sock') c.add('self', 4, p);
      }
    },
  },
});

def({
  id: 'radio', name: 'ラジオ', emoji: '📻', rarity: 'common',
  tags: ['appliance'], base: 2, desc: '隣の住人すべてに +1',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.tags.includes('resident')) c.add(p, 1);
      }
    },
  },
});

def({
  id: 'bulb', name: '電球', emoji: '💡', rarity: 'common',
  tags: ['appliance', 'fragile'], base: 1, desc: '隣のすべてに +1',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) c.add(p, 1);
    },
  },
});

def({
  id: 'mouse', name: 'ネズミ', emoji: '🐁', rarity: 'common',
  tags: ['animal'], base: 1, desc: '壊されると、壊した相手に +5',
  effects: {
    destroyed: (c) => { if (c.destroyer) c.add(c.destroyer, 5); },
  },
});

def({
  id: 'cat', name: 'ノラ猫', emoji: '🐈', rarity: 'common',
  tags: ['animal'], base: 2, desc: '隣の🐁ネズミを狩り、1匹につき +8',
  effects: {
    destroy: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.id !== 'mouse') continue;
        c.destroy(p);
        c.add('self', 8, p);
      }
    },
  },
});

def({
  id: 'bicycle', name: 'ママチャリ', emoji: '🚲', rarity: 'common',
  tags: ['junk'], base: 2, desc: '盤面の端にあると +3',
  effects: {
    add: (c) => { if (c.isEdge(c.self.index)) c.add('self', 3); },
  },
});

def({
  id: 'can', name: '空き缶', emoji: '🥫', rarity: 'common',
  tags: ['junk'], base: 1, desc: '隣のガラクタ 1つにつき +1',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.tags.includes('junk')) c.add('self', 1, p);
      }
    },
  },
});

def({
  id: 'leak', name: '雨漏り', emoji: '💧', rarity: 'common',
  tags: ['water'], base: 1, desc: '真下のマスに +2',
  effects: {
    add: (c) => {
      const b = c.below(c.self.index);
      if (b) c.add(b, 2);
    },
  },
});

def({
  id: 'bucket', name: 'バケツ', emoji: '🪣', rarity: 'common',
  tags: ['water'], base: 0, desc: '隣に💧雨漏りがあると、永続 +2 溜まる',
  effects: {
    tick: (c) => {
      const wet = c.board.adjacent(c.self.index).some((p) => p.def.id === 'leak');
      if (wet) c.addPermanent('self', 2);
    },
  },
});

def({
  id: 'umbrella', name: '傘', emoji: '☂️', rarity: 'common',
  tags: ['water'], base: 2, desc: '盤面に💧雨漏りがあると +4',
  effects: {
    add: (c) => {
      const leaks = c.board.byId('leak');
      if (leaks.length > 0) c.add('self', 4, leaks);
    },
  },
});

def({
  id: 'bowl', name: '茶碗', emoji: '🍵', rarity: 'common',
  tags: ['fragile'], base: 2, desc: '壊されると、壊した相手に +3',
  effects: {
    destroyed: (c) => { if (c.destroyer) c.add(c.destroyer, 3); },
  },
});

def({
  id: 'student', name: '学生', emoji: '🎒', rarity: 'common',
  tags: ['resident'], base: 2, desc: '隣の食べ物 1つにつき +2',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.tags.includes('food')) c.add('self', 2, p);
      }
    },
  },
});

def({
  id: 'grandma', name: 'おばあちゃん', emoji: '👵', rarity: 'common',
  tags: ['resident'], base: 3, desc: '隣の住人すべてに +2',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.tags.includes('resident')) c.add(p, 2);
      }
    },
  },
});

// ──────────────────────── アンコモン ────────────────────────

def({
  id: 'chicken', name: 'ニワトリ', emoji: '🐔', rarity: 'uncommon',
  tags: ['animal'], base: 3, desc: '3スピンごとに🥚たまごを 1つ産む',
  effects: {
    tick: (c) => {
      c.self.inst.counter++;
      if (c.self.inst.counter % 3 === 0) c.spawn('egg');
    },
  },
});

def({
  id: 'beer', name: '缶ビール', emoji: '🍺', rarity: 'uncommon',
  tags: ['food', 'junk'], base: 3, desc: '隣の住人すべてに +3',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.tags.includes('resident')) c.add(p, 3);
      }
    },
  },
});

def({
  id: 'tv', name: 'ブラウン管TV', emoji: '📺', rarity: 'uncommon',
  tags: ['appliance', 'fragile'], base: 4, desc: '隣に📻ラジオがあると +8',
  effects: {
    add: (c) => {
      const radio = c.board.adjacent(c.self.index).find((p) => p.def.id === 'radio');
      if (radio) c.add('self', 8, radio);
    },
  },
});

def({
  id: 'guitar', name: 'ギター', emoji: '🎸', rarity: 'uncommon',
  tags: ['junk'], base: 3, desc: '隣の住人 1人につき +3',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.tags.includes('resident')) c.add('self', 3, p);
      }
    },
  },
});

def({
  id: 'toolbox', name: '工具箱', emoji: '🔧', rarity: 'uncommon',
  tags: ['junk'], base: 2, desc: '隣の壊れもの 1つにつき +4',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.tags.includes('fragile')) c.add('self', 4, p);
      }
    },
  },
});

def({
  id: 'pochi', name: 'ポチ袋', emoji: '🧧', rarity: 'uncommon',
  tags: ['money'], base: 0, desc: '壊されると、壊した相手に +40',
  effects: {
    destroyed: (c) => { if (c.destroyer) c.add(c.destroyer, 40); },
  },
});

def({
  id: 'broom', name: 'ほうき', emoji: '🧹', rarity: 'uncommon',
  tags: ['junk'], base: 2, desc: '隣のガラクタを捨て、1つにつき +6',
  effects: {
    destroy: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.id === 'broom' || !p.def.tags.includes('junk')) continue;
        c.destroy(p);
        c.add('self', 6, p);
      }
    },
  },
});

def({
  id: 'moon', name: '満月', emoji: '🌕', rarity: 'uncommon',
  tags: [], base: 4, desc: '盤面の動物すべてに +4',
  effects: {
    add: (c) => {
      for (const p of c.board.byTag('animal')) c.add(p, 4);
    },
  },
});

def({
  id: 'sake', name: '一升瓶', emoji: '🍶', rarity: 'uncommon',
  tags: ['fragile'], base: 3, desc: '隣の住人 1人につき +3。壊されると +20',
  effects: {
    add: (c) => {
      for (const p of c.board.adjacent(c.self.index)) {
        if (p.def.tags.includes('resident')) c.add('self', 3, p);
      }
    },
    destroyed: (c) => { if (c.destroyer) c.add(c.destroyer, 20); },
  },
});

// ───────────────────────── レア ─────────────────────────

def({
  id: 'landlord', name: '大家さん', emoji: '👴', rarity: 'rare',
  tags: ['resident'], base: 3, desc: '自分以外のすべてに +2',
  effects: {
    add: (c) => {
      for (const p of c.board.all()) {
        if (p.index !== c.self.index) c.add(p, 2);
      }
    },
  },
});

def({
  id: 'shortcircuit', name: '漏電', emoji: '⚡', rarity: 'rare',
  tags: ['appliance'], base: 0, desc: '電化製品を ×2。ただし 1つ壊す',
  effects: {
    destroy: (c) => {
      const targets = c.board.byTag('appliance').filter((p) => p.index !== c.self.index);
      if (targets.length > 0) c.destroy(c.rng.pick(targets));
    },
    mult: (c) => {
      for (const p of c.board.byTag('appliance')) c.mult(p, 2);
    },
  },
});

def({
  id: 'banknote', name: '一万円札', emoji: '💴', rarity: 'rare',
  tags: ['money'], base: 15, desc: '出るたび、持ち物からランダムに 1つ失う',
  effects: {
    post: (c) => c.loseRandomFromInventory(),
  },
});

def({
  id: 'pachinko', name: 'パチンコ玉', emoji: '🎰', rarity: 'rare',
  tags: ['junk'], base: 0, desc: '20% の確率で +60',
  effects: {
    add: (c) => { if (c.rng.chance(0.2)) c.add('self', 60); },
  },
});

def({
  id: 'trophy', name: '優勝カップ', emoji: '🏆', rarity: 'rare',
  tags: ['money'], base: 0, desc: '隣のシンボルの値の合計だけ +（もう一度もらう）',
  effects: {
    // mult フェーズで動かすことで、隣の加算がすべて確定した後の値を読む
    mult: (c) => {
      const around = c.board.adjacent(c.self.index);
      let sum = 0;
      for (const p of around) sum += p.value * p.multiplier;
      c.add('self', Math.round(sum), around);
    },
  },
});

def({
  id: 'sacredtree', name: 'ご神木', emoji: '🌳', rarity: 'rare',
  tags: ['plant'], base: 5, desc: '盤面の植物 1つにつき、永続 +2 育つ',
  effects: {
    tick: (c) => {
      const n = c.board.byTag('plant').length;
      if (n > 0) c.addPermanent('self', 2 * n);
    },
  },
});

// ──────────────────────── ベリーレア ────────────────────────

def({
  id: 'dragon', name: '商店街の龍神', emoji: '🐉', rarity: 'veryRare',
  tags: [], base: 10, desc: '5スピンごとに、そのスピンの合計を ×3',
  effects: {
    mult: (c) => {
      if ((c.run.totalSpins + 1) % 5 === 0) c.mult('total', 3);
    },
  },
});

def({
  id: 'manekineko', name: '招き猫', emoji: '🧿', rarity: 'veryRare',
  tags: ['animal'], base: 2, desc: '手に入れたとき、持っているコモンすべてが永続 +2',
  effects: {
    acquire: (c) => {
      for (const inst of c.inventory) {
        if (DEFS[inst.defId].rarity === 'common') inst.permanentBonus += 2;
      }
    },
  },
});

// ───────────────────────────────────────────────────────────

export const SYMBOLS = DEFS;
export const SYMBOL_LIST = Object.values(DEFS);

export function getDef(id) {
  const d = DEFS[id];
  if (!d) throw new Error(`unknown symbol: ${id}`);
  return d;
}

/** 期ごとの出現解禁（レアは第4期、ベリーレアは第7期から） */
export const RARITY_UNLOCK = { common: 1, uncommon: 1, rare: 4, veryRare: 7 };
export const RARITY_WEIGHT = { common: 60, uncommon: 27, rare: 11, veryRare: 2 };
export const RARITY_LABEL = { common: 1, uncommon: 2, rare: 3, veryRare: 4 };

/** ラン開始時のインベントリ */
export const STARTING_INVENTORY = ['coin', 'coin', 'onigiri', 'sock', 'planter'];
