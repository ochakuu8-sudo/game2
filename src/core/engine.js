/**
 * ゲームエンジン。DOM にも UI フレームワークにも一切依存しない。
 * ここが純粋であることが、Node 上のバランスシミュレータ（sim/run.mjs）の前提になっている。
 *
 * 状態はすべてプレーンなオブジェクトなので、そのまま JSON にしてセーブできる。
 */

import { createRng } from './rng.js';
import { BoardView, CELLS, isEdge, below } from './board.js';
import { getDef, RARITY_UNLOCK, RARITY_WEIGHT, STARTING_INVENTORY, SYMBOL_LIST } from './symbols.js';
import { ITEMS, ITEM_LIST, MAX_ITEMS, hasItem } from './items.js';
import { DIFFICULTIES, TOTAL_PERIODS, rentFor, spinsFor } from './rent.js';

export const REMOVE_COST_BASE = 10;
export const REMOVE_COST_STEP = 10;
export const REROLL_COST_BASE = 5;
export const SKIP_REWARD = 5;

// ───────────────────────── ラン生成 ─────────────────────────

export function newRun(seed, difficulty = 'normal') {
  const rng = createRng(seed);
  const state = {
    seed,
    rngState: rng.state(),
    difficulty,
    uidCounter: 0,
    inventory: [],
    items: [],
    coins: 0,
    period: 1,
    spinInPeriod: 0,
    totalSpins: 0,
    removeCost: REMOVE_COST_BASE,
    rerollCost: REROLL_COST_BASE,
    guaranteeUsed: false,
    /** 'idle' | 'offering' | 'shop' | 'over' | 'clear' */
    phase: 'idle',
    lastSpin: null,
    offers: null,
    shop: null,
    periodEarned: 0,
    history: [],
    seen: [],
  };
  for (const id of STARTING_INVENTORY) addSymbol(state, id, { silent: true });
  return state;
}

function makeInstance(state, defId) {
  return { uid: ++state.uidCounter, defId, permanentBonus: 0, counter: 0 };
}

/** インベントリにシンボルを 1 つ加える */
export function addSymbol(state, defId, { silent = false } = {}) {
  const inst = makeInstance(state, defId);
  state.inventory.push(inst);
  if (!state.seen.includes(defId)) state.seen.push(defId);
  const def = getDef(defId);
  if (!silent && def.effects.acquire) {
    def.effects.acquire({ inventory: state.inventory, state });
  }
  return inst;
}

// ───────────────────────── スピン解決 ─────────────────────────

/**
 * 1 スピンを解決する。
 * フェーズ: DRAW → TICK → BASE → ADD → TRANSFORM → DESTROY → MULT → TOTAL → POST
 * 同一フェーズ内は盤面インデックス昇順で処理するので、結果は完全に再現可能。
 */
export function resolveSpin(state) {
  const rng = createRng(state.rngState);

  // ── Phase 0: DRAW ─────────────────────────────────────────
  const pool = state.inventory.slice();
  shuffle(pool, rng);
  const cells = Array.from({ length: CELLS }, (_, i) => i);
  shuffle(cells, rng);

  const count = Math.min(CELLS, pool.length);
  /** @type {(object|null)[]} */
  const placed = new Array(CELLS).fill(null);
  for (let i = 0; i < count; i++) {
    const inst = pool[i];
    const index = cells[i];
    placed[index] = {
      index,
      inst,
      def: getDef(inst.defId),
      value: 0,
      multiplier: 1,
      destroyed: false,
      destroyedBy: null,
      touched: false,
    };
  }

  const board = new BoardView(placed);
  const spawns = [];
  const losses = [];
  const events = [];
  let totalMultiplier = 1;

  const live = () => placed.filter((p) => p && !p.destroyed);
  const ordered = () => placed.filter(Boolean);

  /**
   * 効果の実行ログ。
   *
   * 「どのシンボルが、どのシンボルを使って、どこにいくら足したか」を全部残す。
   * UI はこれを読んで 1手ずつ再生するだけでよく、演出のためにルールを再実装しなくて済む。
   * ゴールデンテスト（docs/04 4.8）の比較対象にもこれをそのまま使える。
   */
  const steps = [];

  /**
   * いま効果を実行している「主体」。
   * 破壊された側の死亡時効果のような入れ子は、主体を切り替えず破壊者に紐付ける。
   * そうしないと 1つのやり取りが複数の主体に割れて、演出が細切れになる。
   */
  let actor = null;
  let phaseName = '';

  /**
   * 「コンボ」の単位。UI（演出②）は、この値が変わるたびに新しい1手として区切って再生する。
   *
   * 1つのシンボルが複数の相手に効果を出す場合（おばあちゃんが隣の住人3人を強化する等）、
   * 相手が変わるたびに新しいコンボとして扱う。
   * 一方、1つの相手をめぐる複数の手続き（ノラ猫がネズミを破壊し、ネズミの死亡時効果が発動し、
   * 猫自身がその報酬を得る、という一連の流れ）は、同じ相手＝同じコンボとして束ねる。
   * そうしないと「1匹食べる」が3つの操作にバラけて演出される。
   */
  let lastComboKey = null;

  const shown = (p) => Math.round(p.value * p.multiplier);

  function comboKeyFor(step) {
    // 明示的な根拠（cause）があれば、それが「相手」
    if (step.causes && step.causes.length) return step.causes.join(',');
    // 根拠を渡していなくても、対象が自分以外ならその対象が「相手」
    // （例: ラジオが隣の住人に +1 する時、cause は渡していないが対象は毎回変わる）
    if (step.target != null && actor && step.target !== actor.index) return String(step.target);
    // どちらも無い（自分自身への操作で相手が分からない）場合は、直前のコンボを継続する
    return null;
  }

  function record(step) {
    const key = comboKeyFor(step);
    if (key != null) lastComboKey = key;
    steps.push({
      source: actor?.index ?? null,
      phase: phaseName,
      comboKey: key ?? lastComboKey,
      ...step,
    });
  }

  const causeIndex = (cause) => {
    if (!cause) return null;
    return Array.isArray(cause) ? cause.map((c) => c.index) : [cause.index];
  };

  const makeCtx = (self, extra = {}) => ({
    self,
    board,
    rng,
    run: state,
    inventory: state.inventory,
    isEdge,
    below: (i) => board.at(below(i) ?? -1),
    /** @param cause この加算の根拠になったシンボル（演出で光らせる） */
    add(target, n, cause) {
      const t = target === 'self' ? self : target;
      if (!t || t.destroyed) return;
      t.value += n;
      t.touched = true;
      if (t !== self) self.touched = true;
      record({ kind: 'add', target: t.index, amount: n, causes: causeIndex(cause), after: shown(t) });
    },
    mult(target, n, cause) {
      if (target === 'total') {
        totalMultiplier *= n;
        self.touched = true;
        record({ kind: 'totalMult', target: null, factor: n, causes: causeIndex(cause) });
        return;
      }
      const t = target === 'self' ? self : target;
      if (!t || t.destroyed) return;
      t.multiplier *= n;
      t.touched = true;
      self.touched = true;
      record({ kind: 'mult', target: t.index, factor: n, causes: causeIndex(cause), after: shown(t) });
    },
    destroy(target) {
      if (!target || target.destroyed) return;
      target.destroyed = true;
      target.destroyedBy = self.index;
      self.touched = true;
      events.push({ type: 'destroy', at: target.index, by: self.index });
      record({ kind: 'destroy', target: target.index, causes: [target.index], after: 0 });
      const d = target.def.effects.destroyed;
      // 死亡時効果は「壊した側の一手」として記録する（actor は切り替えない）
      if (d) d({ ...makeCtx(target), self: target, destroyer: self });
      losses.push(target.inst.uid);
    },
    spawn(defId) {
      spawns.push(defId);
      record({ kind: 'spawn', target: self.index, defId });
    },
    addPermanent(target, n) {
      const t = target === 'self' ? self : target;
      if (!t) return;
      t.inst.permanentBonus += n;
      t.touched = true;
      // 成長ぶんは基礎金額に含まれて表示されるので、演出では 1手として扱わない
      record({ kind: 'addPermanent', target: t.index, amount: n, silent: true });
    },
    transform(target, defId) {
      const t = target === 'self' ? self : target;
      if (!t) return;
      t.inst.defId = defId;
      t.inst.counter = 0;
      t.def = getDef(defId);
      t.touched = true;
      events.push({ type: 'transform', at: t.index, to: defId });
      record({ kind: 'transform', target: t.index, defId });
    },
    loseRandomFromInventory() {
      const pickable = state.inventory.filter((i) => !losses.includes(i.uid));
      if (pickable.length <= 1) return;
      losses.push(rng.pick(pickable).uid);
    },
    ...extra,
  });

  const runPhase = (phase) => {
    phaseName = phase;
    for (const p of ordered()) {
      if (p.destroyed) continue;
      const fn = p.def.effects[phase];
      if (!fn) continue;
      actor = p;
      lastComboKey = null; // シンボルが発動するたびに、コンボの単位をリセットする
      fn(makeCtx(p));
    }
    actor = null;
  };

  // ── Phase 1: TICK（成長・変身・産卵） ──────────────────────
  runPhase('tick');

  // ── Phase 2: BASE ────────────────────────────────────────
  // ここで決まる値が演出①の「基礎金額」。成長ぶん(permanentBonus)も含む
  for (const p of ordered()) {
    p.value = p.def.base + p.inst.permanentBonus;
    p.base = p.value;
  }

  // ── Phase 3-6 ────────────────────────────────────────────
  runPhase('add');
  runPhase('transform');
  runPhase('destroy');
  runPhase('mult');

  // ── Phase 7: TOTAL ───────────────────────────────────────
  let subtotal = 0;
  for (const p of live()) {
    p.gain = Math.round(p.value * p.multiplier);
    subtotal += p.gain;
  }
  if (hasItem(state, 'wallet')) subtotal += 3;
  if (hasItem(state, 'tea') && state.spinInPeriod === 0) totalMultiplier *= 2;
  const total = Math.max(0, Math.round(subtotal * totalMultiplier));

  // ── Phase 8: POST ────────────────────────────────────────
  runPhase('post');
  if (losses.length > 0) {
    state.inventory = state.inventory.filter((i) => !losses.includes(i.uid));
  }
  for (const defId of spawns) addSymbol(state, defId);

  state.rngState = rng.state();

  return {
    placed,
    total,
    subtotal,
    totalMultiplier,
    events,
    steps,
    lost: losses.length,
    spawned: spawns.length,
  };
}

// ───────────────────────── ゲーム進行 ─────────────────────────

/** スピンボタンが押されたとき。状態を次のフェーズまで進める。 */
export function spin(state) {
  if (state.phase !== 'idle') return null;

  const result = resolveSpin(state);
  state.coins += result.total;
  state.periodEarned += result.total;
  state.lastSpin = result;
  state.spinInPeriod++;
  state.totalSpins++;

  const isRentDue = state.spinInPeriod >= spinsFor(state.period);
  if (isRentDue) {
    state.payment = settleRent(state);
  } else {
    state.phase = 'offering';
    state.offers = makeOffers(state);
  }
  return result;
}

function settleRent(state) {
  const rent = rentFor(state.period, state.difficulty);
  const spins = spinsFor(state.period);
  state.history.push({
    period: state.period,
    earned: state.periodEarned,
    rent,
    perSpin: state.periodEarned / spins,
    requiredPerSpin: rent / spins,
  });

  let rescued = false;
  if (state.coins < rent) {
    if (hasItem(state, 'guarantee') && !state.guaranteeUsed) {
      state.guaranteeUsed = true;
      rescued = true;
    } else {
      state.phase = 'over';
      return { rent, paid: false, rescued: false };
    }
  }

  if (!rescued) {
    state.coins -= rent;
    if (hasItem(state, 'receipt')) state.coins += Math.round(rent * 0.1);
  }

  if (state.period >= TOTAL_PERIODS) {
    state.phase = 'clear';
    return { rent, paid: true, rescued, cleared: true };
  }

  state.phase = 'shop';
  state.shop = makeShop(state);
  return { rent, paid: true, rescued };
}

// ───────────────────────── 3択 ─────────────────────────

function rarityFor(state, rng) {
  const weights = { ...RARITY_WEIGHT };
  if (hasItem(state, 'dice')) { weights.rare *= 1.5; weights.veryRare *= 1.5; }
  const available = Object.keys(weights).filter(
    (r) => state.period >= RARITY_UNLOCK[r]
  );
  const total = available.reduce((a, r) => a + weights[r], 0);
  let roll = rng.next() * total;
  for (const r of available) {
    roll -= weights[r];
    if (roll <= 0) return r;
  }
  return 'common';
}

export function makeOffers(state) {
  const rng = createRng(state.rngState);
  let n = DIFFICULTIES[state.difficulty].offers;
  if (hasItem(state, 'suggestbox')) n++;

  const picked = [];
  let guard = 0;
  while (picked.length < n && guard++ < 200) {
    const rarity = rarityFor(state, rng);
    const candidates = SYMBOL_LIST.filter(
      (s) => s.rarity === rarity && !picked.includes(s.id)
    );
    if (candidates.length === 0) continue;
    picked.push(rng.pick(candidates).id);
  }
  state.rngState = rng.state();
  return picked;
}

/** @param {number|null} index null なら見送り */
export function chooseOffer(state, index) {
  if (state.phase !== 'offering') return;
  if (index === null) {
    state.coins += SKIP_REWARD;
  } else {
    addSymbol(state, state.offers[index]);
  }
  state.offers = null;
  state.phase = 'idle';
}

// ───────────────────────── ショップ ─────────────────────────

export function makeShop(state) {
  const rng = createRng(state.rngState);
  const owned = new Set(state.items);
  const pool = ITEM_LIST.filter((i) => !owned.has(i.id));
  shuffle(pool, rng);
  state.rngState = rng.state();
  return { offers: pool.slice(0, 2).map((i) => i.id) };
}

export function buyItem(state, itemId) {
  const item = ITEMS[itemId];
  if (!item || state.coins < item.price) return false;
  if (state.items.length >= MAX_ITEMS) return false;
  if (state.items.includes(itemId)) return false;
  state.coins -= item.price;
  state.items.push(itemId);
  state.shop.offers = state.shop.offers.filter((i) => i !== itemId);
  return true;
}

export function removeSymbol(state, uid) {
  if (state.coins < state.removeCost) return false;
  if (state.inventory.length <= 1) return false;
  const i = state.inventory.findIndex((s) => s.uid === uid);
  if (i < 0) return false;
  state.coins -= state.removeCost;
  state.inventory.splice(i, 1);
  state.removeCost += REMOVE_COST_STEP;
  return true;
}

export function rerollShop(state) {
  if (state.coins < state.rerollCost) return false;
  state.coins -= state.rerollCost;
  state.rerollCost *= 2;
  state.shop = makeShop(state);
  return true;
}

export function leaveShop(state) {
  if (state.phase !== 'shop') return;
  state.period++;
  state.spinInPeriod = 0;
  state.periodEarned = 0;
  state.rerollCost = REROLL_COST_BASE;
  if (hasItem(state, 'mover')) state.removeCost = REMOVE_COST_BASE;
  state.shop = null;
  state.payment = null;
  state.phase = 'idle';
}

// ───────────────────────── 補助 ─────────────────────────

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 各シンボルが 1 スピンで盤面に出る確率 */
export function appearanceRate(state) {
  const n = state.inventory.length;
  return n === 0 ? 0 : Math.min(1, CELLS / n);
}

/** 敗北理由の説明（リザルト画面用） */
export function deathReason(state) {
  const last = state.history[state.history.length - 1];
  if (!last) return null;
  return {
    period: last.period,
    earned: last.earned,
    rent: last.rent,
    perSpin: Math.round(last.perSpin * 10) / 10,
    requiredPerSpin: Math.round(last.requiredPerSpin * 10) / 10,
    short: last.rent - state.coins,
  };
}
