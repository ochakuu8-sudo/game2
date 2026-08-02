/**
 * ヘッドレス・バランスシミュレータ。
 * ブラウザで動いているのと同一の src/core をそのまま import して大量に回す。
 *
 *   npm run sim
 *   npm run sim -- --runs=10000 --policy=greedy --difficulty=normal
 *
 * 目標値（docs/02-game-design.md 2.8）:
 *   random のクリア率 < 3%   … 運ゲーではないことの確認
 *   greedy のクリア率 25〜35% … 判断ゲームとして成立しているかの確認
 */

import {
  newRun, spin, chooseOffer, buyItem, removeSymbol, leaveShop,
} from '../src/core/engine.js';
import { getDef } from '../src/core/symbols.js';
import { ITEMS } from '../src/core/items.js';
import { TOTAL_PERIODS } from '../src/core/rent.js';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--'))
    .map((a) => a.replace(/^--/, '').split('='))
);
const RUNS = Number(args.runs ?? 2000);
const DIFFICULTY = args.difficulty ?? 'normal';
const POLICIES = args.policy ? [args.policy] : ['random', 'greedy'];
const LOOKAHEAD = Number(args.lookahead ?? 4);

// ───────────────────────── AI ポリシー ─────────────────────────

/** 一様ランダム。ここで勝ててしまうなら難易度が足りない */
function policyRandom(state, rand) {
  return rand() < 0.1 ? null : Math.floor(rand() * state.offers.length);
}

/**
 * 貪欲。候補を実際に入れて数スピン先読みし、合計が最大のものを選ぶ。
 * 標準的なプレイヤーの代理として使う。
 */
function policyGreedy(state) {
  let best = null;
  let bestScore = evaluate(state, null);
  for (let i = 0; i < state.offers.length; i++) {
    const score = evaluate(state, i);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function evaluate(state, offerIndex) {
  const probe = clone(state);
  chooseOffer(probe, offerIndex);
  let sum = 0;
  for (let i = 0; i < LOOKAHEAD && probe.phase === 'idle'; i++) {
    const r = spin(probe);
    sum += r.total;
    if (probe.phase === 'offering') chooseOffer(probe, null);
    else break;
  }
  return sum;
}

/**
 * 状態は素のオブジェクトなので、構造化コピーで安全に分岐できる。
 * lastSpin だけはシンボル定義（＝関数を持つ）への参照を含むので落とす。
 */
const clone = ({ lastSpin, ...rest }) => structuredClone(rest);

// ───────────────────────── ショップの方針 ─────────────────────────

function shopPolicy(state) {
  // 安い買い物は先に済ませ、余剰があればデッキを絞る
  for (const id of [...state.shop.offers].sort((a, b) => ITEMS[a].price - ITEMS[b].price)) {
    if (state.coins - ITEMS[id].price > nextRentBuffer(state)) buyItem(state, id);
  }
  // 出現率を上げるため、いちばん弱い（base が低く効果なしの）シンボルを捨てる
  while (state.coins - state.removeCost > nextRentBuffer(state) && state.inventory.length > 12) {
    const worst = [...state.inventory].sort(
      (a, b) => score(a) - score(b)
    )[0];
    if (!removeSymbol(state, worst.uid)) break;
  }
}

function score(inst) {
  const d = getDef(inst.defId);
  return d.base + inst.permanentBonus + (Object.keys(d.effects).length ? 3 : 0);
}

const nextRentBuffer = () => 0;

// ───────────────────────── 1ラン ─────────────────────────

function playOnce(seed, policy) {
  const state = newRun(seed, DIFFICULTY);
  let rand = mulberry(seed ^ 0x9e3779b9);
  let guard = 0;

  while (state.phase !== 'over' && state.phase !== 'clear' && guard++ < 5000) {
    if (state.phase === 'idle') { spin(state); continue; }
    if (state.phase === 'offering') {
      chooseOffer(state, policy === 'greedy' ? policyGreedy(state) : policyRandom(state, rand));
      continue;
    }
    if (state.phase === 'shop') { shopPolicy(state); leaveShop(state); continue; }
  }
  return state;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── 実行 ─────────────────────────

console.log(`難易度 ${DIFFICULTY} / ${RUNS} ラン\n`);

for (const policy of POLICIES) {
  const t0 = performance.now();
  const deaths = new Array(TOTAL_PERIODS + 1).fill(0);
  let cleared = 0;
  let deckSum = 0;

  for (let i = 0; i < RUNS; i++) {
    const s = playOnce(i + 1, policy);
    if (s.phase === 'clear') cleared++;
    else deaths[s.period]++;
    deckSum += s.inventory.length;
  }

  const ms = performance.now() - t0;
  const rate = (cleared / RUNS) * 100;
  console.log(`■ ${policy}`);
  console.log(`  クリア率    ${rate.toFixed(1)}%`);
  console.log(`  平均デッキ  ${(deckSum / RUNS).toFixed(1)} 個`);
  console.log(`  敗北の期    ${deaths.map((n, p) => (p && n ? `${p}期:${((n / RUNS) * 100).toFixed(0)}%` : null)).filter(Boolean).join(' ')}`);
  console.log(`  所要時間    ${ms.toFixed(0)}ms（1ラン ${(ms / RUNS).toFixed(2)}ms）\n`);
}
