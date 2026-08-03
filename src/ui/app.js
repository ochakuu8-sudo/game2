/**
 * UI 層。ゲームのルールはここには一切書かない（すべて src/core にある）。
 * ここがやるのは「core の状態を DOM に写す」ことと「入力を core に渡す」ことだけ。
 */

import {
  newRun, spin, chooseOffer, buyItem, removeSymbol, rerollShop, leaveShop,
  appearanceRate, deathReason, SKIP_REWARD,
} from '../core/engine.js';
import { getDef, RARITY_LABEL, SYMBOLS } from '../core/symbols.js';
import { ITEMS } from '../core/items.js';
import { CELLS } from '../core/board.js';
import { injectSprites, iconMarkup } from './sprites.js';
import { sfx, unlockAudio, isMuted, toggleMuted } from './audio.js';
import { DIFFICULTIES, TOTAL_PERIODS, rentFor, spinsFor } from '../core/rent.js';
import { dailySeed } from '../core/rng.js';
import { load, save } from '../core/save.js';

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'), board: $('board'), gain: $('gain'), coins: $('coins'),
  periodNum: $('period-num'), spinDots: $('spin-dots'),
  rentFill: $('rent-fill'), rentAmount: $('rent-amount'), rentShort: $('rent-short'),
  btnSpin: $('btn-spin'), btnDeck: $('btn-deck'), btnSound: $('btn-sound'), btnAuto: $('btn-auto'),
  deckCount: $('deck-count'),
  offer: $('offer'), offerCards: $('offer-cards'), btnSkip: $('btn-skip'),
  shop: $('shop'), shopHead: $('shop-head'), shopSub: $('shop-sub'),
  shopItems: $('shop-items'), shopRemove: $('shop-remove'),
  removeHint: $('remove-hint'), btnReroll: $('btn-reroll'), btnNext: $('btn-next'),
  deck: $('deck'), deckList: $('deck-list'), deckSub: $('deck-sub'), btnDeckClose: $('btn-deck-close'),
  result: $('result'), resultTitle: $('result-title'), resultSub: $('result-sub'),
  resultChart: $('result-chart'), resultReason: $('result-reason'), resultDeck: $('result-deck'),
  btnSameSeed: $('btn-same-seed'), btnNewRun: $('btn-new-run'),
  menu: $('menu'), menuSeed: $('menu-seed'), diffRow: $('diff-row'),
  btnMenu: $('btn-menu'), btnMenuClose: $('btn-menu-close'), btnRestart: $('btn-restart'),
  tip: $('tip'),
  coinLayer: $('coin-layer'),
  boardArea: document.querySelector('.board-area'),
  gainArea: document.querySelector('.gain-area'),
  controls: document.querySelector('.controls'),
};

const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

let run = null;
let meta = null;
let busy = false;
let fast = false;
let skipResolve = null;
let selectedCard = -1;
let armedChip = null;

// ───────────────────────── 盤面セル ─────────────────────────

const cells = [];
for (let i = 0; i < CELLS; i++) {
  const c = document.createElement('div');
  c.className = 'cell empty';
  c.innerHTML = '<span class="e"></span>';
  bindLongPress(c, i);
  el.board.appendChild(c);
  cells.push({ root: c, emoji: c.querySelector('.e') });
}

// ───────────────────────── 起動 ─────────────────────────

init();

function init() {
  injectSprites();
  const data = load();
  meta = data.meta;
  run = data.run && data.run.phase !== 'over' && data.run.phase !== 'clear'
    ? data.run
    : newRun(Math.floor(Math.random() * 1e9));
  restoreView();
}

function startRun(seed, difficulty = run?.difficulty ?? 'normal') {
  run = newRun(seed, difficulty);
  hideAll();
  clearBoard();
  el.gain.classList.remove('show', 'big');
  renderAll();
  persist();
}

function restoreView() {
  clearBoard();
  renderAll();
  if (run.phase === 'offering') showOffer();
  else if (run.phase === 'shop') showShop();
}

function persist() {
  meta.seenSymbols = Array.from(new Set([...meta.seenSymbols, ...run.seen]));
  save(run.phase === 'over' || run.phase === 'clear' ? null : run, meta);
}

// ───────────────────────── 描画 ─────────────────────────

function renderAll() {
  const rent = rentFor(run.period, run.difficulty);
  const spins = spinsFor(run.period);

  el.periodNum.textContent = run.period;
  el.rentAmount.textContent = rent.toLocaleString();
  el.coins.textContent = run.coins.toLocaleString();
  el.deckCount.textContent = run.inventory.length;

  const pct = Math.min(100, (run.coins / rent) * 100);
  el.rentFill.style.width = `${pct}%`;
  el.rentFill.classList.toggle('full', run.coins >= rent);
  const short = rent - run.coins;
  el.rentShort.textContent = short > 0 ? `あと ${short.toLocaleString()}` : '支払い可';
  el.rentShort.classList.toggle('ok', short <= 0);

  el.spinDots.innerHTML = '';
  for (let i = 0; i < spins; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i >= run.spinInPeriod ? ' left' : '');
    el.spinDots.appendChild(d);
  }

  el.btnSpin.disabled = run.phase !== 'idle' || busy;
}

function clearBoard() {
  for (const c of cells) {
    c.root.className = 'cell empty';
    c.emoji.innerHTML = '';
  }
}

/**
 * 盤面を描く。
 * 破壊されたマスもここでは「生きている」状態で描く。
 * 落ちてきた時点でグレーにしてしまうと、壊した側が動く前に結末が見えてしまい、
 * 演出②の見せ場が消える。グレーにするのは実際に破壊の一手を再生したとき。
 */
function paintBoard(placed) {
  hotCell = null;
  for (let i = 0; i < CELLS; i++) {
    const p = placed[i];
    const c = cells[i];
    if (!p) {
      c.root.className = 'cell empty';
      c.emoji.innerHTML = '';
      continue;
    }
    c.root.className = 'cell';
    c.emoji.innerHTML = iconMarkup(p.def);
  }
}

// ───────────────────────── スピン ─────────────────────────

el.btnSpin.addEventListener('click', doSpin);

async function doSpin() {
  if (busy || run.phase !== 'idle') return;
  busy = true;
  el.btnSpin.disabled = true;
  hideTip();
  el.gain.classList.remove('show', 'big');

  const before = run.coins;
  const result = spin(run);
  if (navigator.vibrate) navigator.vibrate(8);

  await animateSpin(result, before);

  busy = false;
  renderAll();
  persist();

  if (run.phase === 'offering') { showOffer(); }
  else if (run.phase === 'shop') { sfx.rentOk(); showShop(); }
  else if (run.phase === 'clear') { sfx.clear(); showResult(); }
  else if (run.phase === 'over') { sfx.rentFail(); showResult(); }
}

/**
 * スピンの演出。2段構えにする。
 *
 *   ① 基礎金額     … 盤面のシンボルの素の値ぶんのコインを、読み順に 1マス 0.1 秒で飛ばす
 *   ② 特殊効果     … 効果を持つシンボルが 1つずつ発動する。1コンボ 0.2 秒。
 *                     発動したシンボルと、その計算に使われたシンボルを同時に光らせ、
 *                     増えたぶんのコインを飛ばす
 *
 * 金額は数字では出さない。マスの上にも合計にも数字バッジは置かず、
 * 「コインが飛んで、合計表示（gain-area）へ吸い込まれる」動きと枚数だけで
 * 増加を伝える。数字が残るのは gain-area の合計金額と、上のコイン残高だけ。
 *
 * ②で再生しているのは、エンジンが残した実行ログ（result.steps）そのもの。
 * 演出側でルールを再現しないので、効果を足しても演出コードは変えなくてよい。
 *
 * 順番はどちらも盤面インデックス昇順＝左上から右下の読み順で、
 * エンジンの効果解決順（docs/02-game-design.md 2.3）と一致している。
 * 画面のどこかを触れば残りを一括表示してスキップできる。
 */
async function animateSpin(result, coinsBefore) {
  skipReset();
  // 前のスピンの吸収状態を持ち越さない。前のスピンの回収漏れがもし残っていても、
  // このスピンの新しいバーストと混ざらないよう、ここで必ず「未吸収」に戻す
  absorbing = null;

  // ── 1. 落ちてくる ────────────────────────────────
  paintBoard(result.placed);
  sfx.spin();
  for (let i = 0; i < CELLS; i++) {
    const c = cells[i].root;
    if (!result.placed[i]) continue;
    c.classList.remove('drop');
    void c.offsetWidth;
    c.style.animationDelay = `${(i % 4) * 34 + Math.floor(i / 4) * 14}ms`;
    c.classList.add('drop');
  }
  if (!fast) for (let col = 0; col < 4; col++) sfx.reel(col);
  await wait(fast ? 0 : 260);

  const placed = result.placed.filter(Boolean);
  /** 各マスにいま表示している金額 */
  const shown = new Map();
  const total = () => [...shown.values()].reduce((a, b) => a + b, 0);

  // ── 2. 基礎金額ぶんのコインを飛ばす（1マスあたり 0.1 秒基準） ──
  // ②のコンボ間隔と同じ理屈：固定のBASE_STEP_MSと、コインが出きるまでの
  // 時間の長い方を待つ。①も「1マスにつき1コンボ」という認識に合わせた。
  let step = 0;
  for (const p of placed) {
    if (skipRequested) break;
    if (p.base <= 0) continue;
    shown.set(p.index, p.base);
    pulseCell(p.index);
    const burst = burstCoins(p.index, p.base, 'add');
    setGainText(`+${total().toLocaleString()}`);
    // sfx.coin(step++); // 一時的に無効化 ── coinPop/coinLandだけの音と聴き比べ中
    step++;
    await Promise.all([wait(fast ? 0 : BASE_STEP_MS), burst]);
  }
  clearHot();

  // ── 3. 特殊効果を 1コンボずつ（1つあたり 0.2 秒） ─────
  // エンジンが残した実行ログを再生するだけ。ここでルールを再現しない。
  let comboIndex = 0;
  for (const beat of groupSteps(result.steps)) {
    if (skipRequested) break;
    await playBeat(beat, shown, comboIndex++);
    setGainText(`+${total().toLocaleString()}`);
  }
  clearMarks();

  let running;
  if (skipRequested) {
    // スキップされた場合は、残りをすべて即座に確定値へ合わせる。
    // 散らばって待っているコインも、飛ばしている暇はないので即座に片付ける
    for (const p of placed) {
      if (p.destroyed) cells[p.index].root.classList.add('dead');
    }
    clearScatteredCoins();
    running = result.subtotal;
    setGainText(`+${running.toLocaleString()}`);
  } else {
    // ①②のマス表示だけでは説明できない差分（ボロ財布の定額ボーナス等、
    // 盤面のどのマスの手柄でもない加算）が残っていたら、最後にもう1段
    // アニメーションで足す。ここを無音で飛ばすと、アイテム所持時だけ
    // 「合計金額になるまで一つずつ」の流れが最後に無言でジャンプして壊れる。
    const bonus = result.subtotal - total();
    running = result.subtotal;
    if (bonus !== 0) {
      setGainText(`+${running.toLocaleString()}`);
      sfx.cash();
      await wait(fast ? 0 : EFFECT_STEP_MS);
    }
  }

  // ── 4. 合計への倍率（龍神など） ────────────────────
  if (result.totalMultiplier > 1) {
    el.gain.classList.add('big');
    if (!fast && !skipRequested) {
      setGainText(`+${running.toLocaleString()} × ${result.totalMultiplier}`);
      sfx.multiply();
      await wait(340);
    }
  }

  // ── 5. 財布に入る ────────────────────────────────
  // ここまで散らばって待機していたコインを、全部まとめて合計へ吸い込む。
  // 「①②の演出中はコインは画面に散らばるだけ、全部終わってから一気に集まる」
  // absorbAllCoins() が返す Promise を待つことで、3択・ショップ等の次の
  // 画面は、コインが画面上から全部消えるまで絶対に出ないようにする。
  const absorbed = absorbAllCoins(coinsBefore);
  clearHot();
  setGainText(`+${result.total.toLocaleString()}`);
  el.gain.classList.toggle('big', result.totalMultiplier > 1 || result.total >= 200);
  sfx.cash();
  el.coins.classList.remove('bump');
  void el.coins.offsetWidth;
  el.coins.classList.add('bump');
  await absorbed;
  await wait(fast ? 0 : 80);
}

/**
 * 演出のテンポ。ここだけ触れば全体の尺が変わる。
 * ①基礎金額・②特殊効果とも、1つあたり 0.1 秒（①②で揃える）。
 */
const BASE_STEP_MS = 100;
const EFFECT_STEP_MS = 100;

/**
 * 実行ログを「1コンボ」の単位にまとめる。
 *
 * 1コンボ = 1つのシンボルが、1つの相手に対して起こす一連の作用。
 * エンジン側が付けた comboKey（相手が誰か）が変われば新しいコンボとして区切る。
 * これにより、おばあちゃんが隣の住人3人を強化するなら3コンボに分かれ、
 * ノラ猫がネズミを2匹食べるなら（破壊→死亡時効果→報酬、という3操作が1匹分）2コンボに分かれる。
 *
 * comboKey が null（相手が特定できない自己完結の操作）の場合は、常に単独の1コンボにする。
 * 同じ主体・同じ null キーの操作を安易に束ねると、無関係な操作まで混ざる恐れがあるため。
 */
function groupSteps(steps) {
  const beats = [];
  let lastSource = null;
  let lastKey = null;
  for (const s of steps ?? []) {
    if (s.silent || s.source == null) continue;
    const sameCombo = s.comboKey != null && s.source === lastSource && s.comboKey === lastKey;
    if (sameCombo) beats[beats.length - 1].steps.push(s);
    else beats.push({ source: s.source, steps: [s] });
    lastSource = s.source;
    lastKey = s.comboKey;
  }
  return beats;
}

/**
 * 1コンボを再生する。効果の主体と、その相手（計算に使われたシンボル）を同時に光らせる。
 *
 * 「いくら増えたか」は数字では出さない。増えたぶんのコインを飛ばすことだけで伝える
 * （burstCoins）。0.1秒ペースで数字バッジを切り替えるより、飛んでいくコインの
 * 枚数のほうが「何がどれだけ増えたか」を感覚的に残せる。
 */
async function playBeat(beat, shown, comboIndex) {
  clearMarks();
  const src = cells[beat.source];
  src.root.classList.add('acting');
  markedCells.push(src.root);

  let sound = 'coin';
  const bursts = [];
  for (const s of beat.steps) {
    for (const ci of s.causes ?? []) {
      if (ci === beat.source || cells[ci].root.classList.contains('involved')) continue;
      cells[ci].root.classList.add('involved');
      markedCells.push(cells[ci].root);
    }
    if (s.kind === 'destroy') {
      shown.delete(s.target);
      cells[s.target].root.classList.add('dead');
      sound = 'destroy';
    } else if (s.kind === 'mult') {
      const before = shown.get(s.target) ?? 0;
      bursts.push(burstCoins(s.target, s.after - before, 'mult'));
      shown.set(s.target, s.after);
      sound = 'multiply';
    } else if (s.kind === 'add') {
      const before = shown.get(s.target) ?? 0;
      const delta = s.after - before;
      if (delta > 0) bursts.push(burstCoins(s.target, delta, 'add'));
      shown.set(s.target, s.after);
    } else if (s.kind === 'totalMult') {
      sound = 'multiply';
    }
  }

  if (sound === 'destroy') sfx.destroy();
  else if (sound === 'multiply') sfx.multiply();
  // else sfx.combo(comboIndex); // 一時的に無効化 ── coinPop/coinLandだけの音と聴き比べ中

  // 固定の EFFECT_STEP_MS と、コインが出きるまでの時間の長い方を待つ。
  // 小さい効果はこれまでどおり0.1秒テンポのまま、コインの枚数が多い
  // （＝金額が大きい）効果だけ、出きるまで自然と間隔が伸びる。
  await Promise.all([wait(fast ? 0 : EFFECT_STEP_MS), ...bursts]);
}

/**
 * 増えた金額を「コインが飛び散って合計へ吸い込まれる」演出で表す。
 * マス上には実額の `+N` バッジも同時に出るため（showScoreBadge）、
 * コインの枚数はその数字と一致していないと「合ってない」ように見えて
 * しまう。そのため**枚数=金額そのまま**にする（平方根で圧縮していた
 * 当初案は、+10 なのにコインが4枚しか出ないなど表示中の数字と
 * 食い違って見えたため撤回した）。上限も設けない ── 「何枚でも出る演出が
 * 続いて良い」という要望どおり、非常に大きい効果は非常に長い演出になる
 * （コンボの間隔もバースト終了まで伸びるため、これ自体が破綻しない）。
 *
 * ①②の演出中は、コインは散らばって画面の中に留まるだけ。
 * 合計表示への吸い込みはここでは行わない ── スピン全体の演出が
 * すべて終わった後、animateSpin の「財布に入る」段で absorbAllCoins() が
 * まとめて回収する。バーストごとにバラバラ回収するより、
 * 「最後に画面じゅうのコインが一気に集まる」ほうが締めの一撃として気持ちいい。
 *
 * このバーストが全部出きるまでの時間は、呼び出し側（playBeat）が
 * 待てるように Promise で返す。「コインの出る音の長さでスコアの大きさを
 * 感じられるようにしたい」という要望を受けて、枚数が多いバーストほど
 * 次のコンボまでの間隔も伸びるようにするため。
 */
function burstCoins(index, amount, kind) {
  // コインの飛翔は CSS アニメーションではなく JS の rAF で動かしているので、
  // styles.css の prefers-reduced-motion だけでは止まらない。ここで別途弾く。
  // 情報としては欠落しない ── gain-area の合計金額は変わらず更新されるため。
  if (fast || amount <= 0 || REDUCED_MOTION) return Promise.resolve();
  const count = Math.max(1, Math.round(amount));
  showScoreBadge(index, amount);

  const from = centerOf(cells[index].root);
  const scale = Math.min(1, count / 10);
  const rests = pickScatterPositions(from, count, scale);
  return new Promise((resolve) => {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        spawnCoin(from, kind, rests[i]);
        if (i === count - 1) resolve();
      }, i * COIN_STAGGER_MS);
    }
  });
}

/**
 * 既に画面に散らばって静止しているコインと、なるべく被らない位置を選ぶ。
 * 完全な重なり回避（衝突判定で押し出す等）はやり過ぎで散らばり方が不自然に
 * なるため、「候補をいくつか出して、一番マシなものを選ぶ」というブルー
 * ノイズ的なゆるい間引きに留める ── 見た目の自由さは保ちつつ、真上に
 * 重なるような一番目立つ被りだけを避ける。
 *
 * 半径（scale）は基本の見た目（枚数が少なければマスの真上に軽く、多ければ
 * 広く）を決めるためのものだが、コインの枚数に上限が無くなったため、その
 * 半径の中だけでは物理的に空きが無くなることがある。その場合は**半径の
 * 外へはみ出してでも、空いている場所を優先する**（「半径からはみ出ても
 * いいので、既存のコインと被りすぎないように配置することを優先して
 * ほしい」という要望）。RADIUS_RINGS の倍率を内側から順に試し、
 * MIN_GAP 以上離れた候補が見つかった時点でそのリングで確定する ──
 * 混んでいなければ従来どおり内側の輪だけで決まり、混んでいる時だけ
 * 外側までじわじわ広がっていく。
 */
const SCATTER_CANDIDATES = 6;
const SCATTER_MIN_GAP = 16; // コイン本体の直径（1.1em≒16.5px）とだいたい揃える
const SCATTER_RADIUS_RINGS = [1, 1.8, 3, 5, 8];

function pickScatterPositions(from, count, scale) {
  const existing = scatteredCoins.map((c) => ({ x: c.x, y: c.y }));
  const picked = [];
  for (let i = 0; i < count; i++) {
    picked.push(pickOneScatterPosition(from, scale, existing, picked));
  }
  return picked;
}

function pickOneScatterPosition(from, scale, existing, picked) {
  let best = null;
  let bestScore = -Infinity;
  for (const ringMult of SCATTER_RADIUS_RINGS) {
    for (let k = 0; k < SCATTER_CANDIDATES; k++) {
      const angle = Math.random() * Math.PI * 2;
      const spread = (16 + Math.random() * 22) * scale * ringMult;
      const cand = { x: from.x + Math.cos(angle) * spread, y: from.y + Math.sin(angle) * spread - 8 * scale };
      const score = Math.min(nearestDist(cand, existing), nearestDist(cand, picked));
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    if (bestScore >= SCATTER_MIN_GAP) break; // 十分空いていれば、それ以上は広げない
  }
  return best;
}

function nearestDist(pt, pts) {
  let m = Infinity;
  for (const p of pts) m = Math.min(m, Math.hypot(pt.x - p.x, pt.y - p.y));
  return m;
}

/**
 * コインの生成間隔。散らばり方向にはランダム性があるが、時間軸は常に固定。
 * 「1枚ずつ高速でジャラララと出てくる感じにしたい」という要望を受けて
 * 45ms→24msに短縮。吸い込み側（ABSORB_STAGGER_MS）と同じ理屈で、詰めすぎると
 * coinPop の音が塊に潰れるが、24msなら短い「ジャッ」音（dur 20〜30ms）どうしが
 * ほぼ隙間なく連なりつつ1発ずつ聞き取れる範囲に収まる。
 * その後「もう少しだけ間隔を広げて」との要望を受けて30msに微調整。
 */
const COIN_STAGGER_MS = 30;
const COIN_SCATTER_MS = 130;
const COIN_SUCK_MS = 400;
/**
 * 最後の一斉回収で、コインを吸い込み始めるタイミングをずらす間隔。
 * 小さすぎる（例: 16ms）と複数枚がほぼ同時に着地してしまい、音が1つの塊に
 * 潰れて聞こえる。「1枚ずつ、ジャラッ、ジャラッ」と聞き取れる間隔まで開ける。
 */
const ABSORB_STAGGER_MS = 32;

/** #app を基準にした要素中心の座標（コイン要素をそこに絶対配置するため） */
function centerOf(node) {
  const r = node.getBoundingClientRect();
  const a = el.app.getBoundingClientRect();
  return { x: r.left + r.width / 2 - a.left, y: r.top + r.height / 2 - a.top };
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t * t * t;

/** 散らばって、その場に留まっているコイン。absorbAllCoins() が回収するまでここに積む */
let scatteredCoins = [];

/**
 * 生成されてから消えるまでの全コイン要素。散らばり待ちか吸い込み中かを問わない。
 * スキップ時、この Set に載っているものを全部消せば「今生きているコインを漏れなく片付ける」
 * ことになる ── scatteredCoins だけを見ていると、散らばりアニメーションの
 * 途中（まだ scatteredCoins に積まれる前）のコインを取りこぼす。
 */
let activeCoins = new Set();

/**
 * 「吸収はもう始まっているか」の状態。
 * nextSlotAt は「次にコインを出発させてよい絶対時刻」で、1枚出発させるたびに
 * ABSORB_STAGGER_MS だけ先へ進める。これにより、最初からあったコインも、
 * 後から遅れて散らばり終えたコイン（下記コメント参照）も、**同じ規則正しい
 * 間隔のスケジュールに乗る**。合流のたびに独自のタイミングで出発させてしまうと、
 * その部分だけ間隔が乱れて「ジャラッ、ジャラッ」のリズムが崩れる。
 *
 * ①②とも、次へ進む前にバーストが最後の1枚をトリガーするまでは待つ
 * （burstCoins() が返す Promise）。ただし「トリガーした瞬間」であって
 * 「散らばり終える（COIN_SCATTER_MS＝130ms後）」までは待たないため、
 * 次のマス／次のコンボが始まった直後の最大130msだけ、前のバーストの
 * 最後の数枚がまだ散らばり中ということがあり得る。さらに、①②の演出
 * 全体が終わって absorbAllCoins() が呼ばれた瞬間にも同様のことが起こりうる。
 * その場合に「まだ散らばり中だったコイン」を取りこぼさないよう、absorbAllCoins()
 * 呼び出し後に散らばり終えたコインも、この共有スケジュールに乗せて出発させる。
 */
let absorbing = null; // null か { to, nextSlotAt, onLand }

/**
 * コイン1枚を生成し、散らばるところまでを再生する。
 * rest（散らばり終える位置）は burstCoins 側の pickScatterPositions() で
 * 既に決まっている ── 半径をこのバーストの枚数に比例させるのと、既存の
 * コインとなるべく被らない位置を選ぶのを、まとめてそちらで行っているため。
 */
function spawnCoin(from, kind, rest) {
  const coin = document.createElement('div');
  coin.className = `coin-fly coin-fly-${kind}`;
  el.coinLayer.appendChild(coin);
  activeCoins.add(coin);
  sfx.coinPop();

  const t0 = performance.now();
  const scatterStep = (t) => {
    if (!activeCoins.has(coin)) return; // clearScatteredCoins 等で既に片付け済み
    const k = easeOutCubic(Math.min(1, (t - t0) / COIN_SCATTER_MS));
    setCoinPos(coin, lerp(from.x, rest.x, k), lerp(from.y, rest.y, k), 0.55 + k * 0.55, 1);
    if (k < 1) { requestAnimationFrame(scatterStep); return; }
    if (absorbing) scheduleAbsorb(coin, rest);
    else scatteredCoins.push({ el: coin, x: rest.x, y: rest.y });
  };
  requestAnimationFrame(scatterStep);
}

/**
 * その時点までに散らばって待機している全コインを、合計表示へ吸い込む。
 * 1枚ずつ ABSORB_STAGGER_MS の等間隔で吸い込み始めることで、
 * 「チッ、チッ、チッ」と1枚ずつ聞き分けられる連続音にする。
 * 呼び出し後に散らばり終える遅れてきたコインも absorbing フラグを見て自動的に合流する。
 *
 * **全部吸い込み終わるまで待てるように Promise を返す。**
 * 「3択選択はコインの演出が全て完全に終わってからにしてください」という
 * 要望を受けた変更 ── 以前はここを待たずに次の画面（3択・ショップ等）へ
 * 進んでいたため、コインがまだ画面を飛んでいる最中に3択が出てしまっていた。
 *
 * 合わせて、着地するたびに家賃ゲージ（rent-fill）と所持コイン表示
 * （#coins）の両方を少しずつ増やす。「コインが吸い込まれるタイミングに
 * 合わせて数字が増える」演出のため、どちらも独立した固定尺のタイマー
 * （以前は #coins 側だけ countUp() という別のアニメーションを持っていた）
 * ではなく、この同じ着地イベントを共通の駆動源にする。呼び出し時点の値
 * （coinsBefore）→このスピン確定後の値（run.coins）を、「今まで何枚の
 * うち何枚が着地したか」の比率で線形補間する。所持コイン表示は、
 * 最初の1枚が着地するまでは coinsBefore のまま動かない（＝合計は
 * 演出の開始時点ではまだ表示しない）。
 *
 * 画面タップでのスキップは、wait() と同じ `skipResolve` の1枠を共有する。
 * ここが「待っている最中」に呼ばれる唯一の処理なので、他の wait() 呼び出しと
 * 競合することはない（常に直列に実行されるため）。
 */
function absorbAllCoins(coinsBefore) {
  const coins = scatteredCoins;
  scatteredCoins = [];
  const totalToLand = activeCoins.size; // 散らばり中のstragglerも含めた総数
  const pctBefore = rentPct(coinsBefore);
  const pctAfter = rentPct(run.coins);

  return new Promise((resolve) => {
    let landed = 0;
    // スキップ時：見た目が伸びきるのを待たず、即座に確定する
    const forceFinish = () => {
      clearScatteredCoins();
      setRentFillPct(pctAfter);
      el.coins.textContent = run.coins.toLocaleString();
      skipResolve = null;
      resolve();
    };
    // 通常時：最後の1枚が着地した後も、rent-fillのCSSトランジション
    // （styles.css の `.rent-fill { transition: width 24ms }`）が
    // 見た目に追いつくまで待ってから resolve する。ここを待たないと、
    // ゲージがまだ視覚的に伸びている途中で3択が出てしまう。
    // wait() を使うので、この待ち時間中のタップでも即座にスキップできる。
    const naturalFinish = async () => {
      clearScatteredCoins();
      setRentFillPct(pctAfter);
      el.coins.textContent = run.coins.toLocaleString();
      skipResolve = null;
      await wait(fast ? 0 : RENT_FILL_TRANSITION_MS);
      resolve();
    };
    if (totalToLand === 0) { forceFinish(); return; }
    skipResolve = forceFinish;
    absorbing = {
      to: centerOf(el.gain),
      nextSlotAt: performance.now(),
      onLand: () => {
        landed++;
        const k = landed / totalToLand;
        setRentFillPct(lerp(pctBefore, pctAfter, k));
        el.coins.textContent = Math.round(lerp(coinsBefore, run.coins, k)).toLocaleString();
        if (landed >= totalToLand) naturalFinish();
      },
    };
    for (const c of coins) scheduleAbsorb(c.el, { x: c.x, y: c.y });
  });
}

/** styles.css の `.rent-fill { transition: width 24ms }` と揃える */
const RENT_FILL_TRANSITION_MS = 24;

/** 家賃ゲージの割合（%、100で頭打ち）。renderAll() の計算式と揃えてある */
function rentPct(coins) {
  const rent = rentFor(run.period, run.difficulty);
  return Math.min(100, (coins / rent) * 100);
}

function setRentFillPct(pct) {
  el.rentFill.style.width = `${pct}%`;
}

/**
 * コイン1枚を、共有スケジュールの「次の出発枠」に乗せて吸い込ませる。
 * to は必ずローカル変数に取ってから setTimeout の中で使うこと ── absorbing は
 * 次のスピン開始時に null へリセットされる（animateSpin 冒頭）ので、
 * コールバックの中で `absorbing.to` を直接読むと、そのスピンの吸収が
 * 終わり切る前に次のスピンが始まった場合に落ちる。
 */
function scheduleAbsorb(coinEl, restPos) {
  const { to } = absorbing;
  const delay = Math.max(0, absorbing.nextSlotAt - performance.now());
  absorbing.nextSlotAt += ABSORB_STAGGER_MS;
  setTimeout(() => suckIn(coinEl, restPos, to), delay);
}

/**
 * スキップ時など、飛ばしている暇がない時にコインを即座に片付ける。
 * 散らばり待機中だけでなく、散らばりアニメーションの途中のものも含めて全部消す
 * （activeCoins が生成〜消滅までの全コインを持っているので、これで漏れがない）。
 */
function clearScatteredCoins() {
  for (const c of activeCoins) c.remove();
  activeCoins = new Set();
  scatteredCoins = [];
  absorbing = null;
}

/**
 * 静止していたコインを、合計表示へ吸い込む。
 */
function suckIn(coin, from, to) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const t0 = performance.now();
  const step = (t) => {
    if (!activeCoins.has(coin)) return; // clearScatteredCoins で既に片付け済み
    const el0 = t - t0;
    if (el0 < COIN_SUCK_MS) {
      const k = easeInCubic(el0 / COIN_SUCK_MS);
      // mid を制御点にした2次ベジェで、合計表示へ吸い込まれる弧を描く
      const x = bezier2(from.x, mid.x, to.x, k);
      const y = bezier2(from.y, mid.y, to.y, k);
      setCoinPos(coin, x, y, 1.1 - k * 0.95, 1 - k * 0.85);
      requestAnimationFrame(step);
    } else {
      sfx.coinLand();
      activeCoins.delete(coin);
      coin.remove();
      absorbing?.onLand?.();
    }
  };
  requestAnimationFrame(step);
}

/**
 * そのマスでこの一手が実際に稼いだ金額を、スコア風のフォントで一瞬表示する。
 * コインの飛翔枚数（sqrt圧縮・最大7枚）はあくまで見た目の演出量であって
 * 金額そのものではないため、実額はここで別途はっきり数字にする。
 * 使い捨てのDOM要素として都度生成し、アニメーション終了で自分から消える。
 */
function showScoreBadge(index, amount) {
  const host = cells[index].root;
  const badge = document.createElement('span');
  badge.className = 'coin-score';
  badge.textContent = `+${amount.toLocaleString()}`;
  host.appendChild(badge);
  badge.addEventListener('animationend', () => badge.remove(), { once: true });
}

function setCoinPos(node, x, y, scale, opacity) {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.transform = `translate(-50%, -50%) scale(${scale})`;
  node.style.opacity = opacity;
}

const lerp = (a, b, k) => a + (b - a) * k;
const bezier2 = (p0, p1, p2, k) => (1 - k) ** 2 * p0 + 2 * (1 - k) * k * p1 + k ** 2 * p2;

const markedCells = [];
function clearMarks() {
  for (const c of markedCells) c.classList.remove('acting', 'involved');
  markedCells.length = 0;
  clearHot();
}

function setGainText(text) {
  el.gain.textContent = text;
  el.gain.classList.add('show');
}

/**
 * 「いまこのマスがカウントされている」ことを、数字を出さずに枠のハイライトと
 * 一瞬のバウンスだけで示す。強調は「いま加算しているマス」だけに付ける ──
 * 加算済み全部に付けると、終盤には盤面のほぼ全マスが光って何も伝えなくなる。
 */
let hotCell = null;

function pulseCell(index) {
  if (fast) return;
  const c = cells[index];
  if (hotCell && hotCell !== c.root) hotCell.classList.remove('hot');
  hotCell = c.root;
  c.root.classList.add('hot');
  c.root.classList.remove('pop');
  void c.root.offsetWidth;
  c.root.classList.add('pop');
}

function clearHot() {
  if (hotCell) hotCell.classList.remove('hot');
  hotCell = null;
}

// 画面のどこかを触ると演出を飛ばす
let skipRequested = false;
function skipReset() { skipRequested = false; skipResolve = null; }
function wait(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    skipResolve = resolve;
    const timer = setTimeout(() => { skipResolve = null; resolve(); }, ms);
    skipResolve = () => { clearTimeout(timer); resolve(); };
  });
}
document.addEventListener('pointerdown', (e) => {
  if (!busy) return;
  if (e.target.closest('.overlay, .sheet')) return;
  skipRequested = true;
  if (skipResolve) { const r = skipResolve; skipResolve = null; r(); }
});

// ───────────────────────── 3択 ─────────────────────────

function showOffer() {
  selectedCard = -1;
  el.offerCards.innerHTML = '';
  run.offers.forEach((id, i) => {
    const def = getDef(id);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-emoji">${iconMarkup(def)}</div>
      <div class="card-name">${def.name}</div>
      <div class="card-desc">${def.desc}</div>
      <div class="card-stars">${'★'.repeat(RARITY_LABEL[def.rarity])}${'☆'.repeat(4 - RARITY_LABEL[def.rarity])}</div>
      <div class="card-confirm"></div>`;
    card.addEventListener('click', () => onCardTap(i, card, def));
    el.offerCards.appendChild(card);
  });
  el.btnSkip.textContent = `見送る（+${SKIP_REWARD} コイン）`;
  el.offer.hidden = false;
  el.app.classList.add('offering');
  requestAnimationFrame(fitSheet);
}

/**
 * シートが盤面に被らないよう、盤面をちょうど必要なぶんだけ縮める。
 * 端末の高さもカードの文章量も変わるので、固定値ではなく実測から出す。
 */
function fitSheet() {
  const below = el.gainArea.offsetHeight + el.controls.offsetHeight;
  const overlap = Math.max(0, el.offer.offsetHeight - below);
  el.app.style.setProperty('--sheet-overlap', `${overlap}px`);
}
window.addEventListener('resize', () => { if (!el.offer.hidden) fitSheet(); });

/** 1タップ目で選択（相性のよい所持シンボルを盤面で光らせる）、2タップ目で確定 */
function onCardTap(i, card, def) {
  if (selectedCard === i) { sfx.buy(); commitOffer(i); return; }
  selectedCard = i;
  sfx.tap();
  for (const c of el.offerCards.children) {
    c.classList.remove('selected');
    c.querySelector('.card-confirm').textContent = '';
  }
  card.classList.add('selected');
  card.querySelector('.card-confirm').textContent = 'もう一度で決定';
  highlightSynergy(def);
}

function highlightSynergy(def) {
  const last = run.lastSpin;
  for (let i = 0; i < CELLS; i++) cells[i].root.classList.remove('match');
  if (!last) return;
  for (let i = 0; i < CELLS; i++) {
    const p = last.placed[i];
    if (!p || p.destroyed) continue;
    if (isRelated(def, p.def)) cells[i].root.classList.add('match');
  }
}

/** タグが重なるか、互いの説明文に相手の名前が出てくるなら「相性がある」とみなす */
function isRelated(a, b) {
  if (a.id === b.id) return true;
  if (a.tags.some((t) => b.tags.includes(t))) return true;
  return a.desc.includes(b.name) || b.desc.includes(a.name);
}

function commitOffer(i) {
  chooseOffer(run, i);
  closeOffer();
}
el.btnSkip.addEventListener('click', () => { sfx.tap(); chooseOffer(run, null); closeOffer(); });

function closeOffer() {
  el.offer.hidden = true;
  el.app.classList.remove('offering');
  for (const c of cells) c.root.classList.remove('match');
  renderAll();
  persist();
}

// ───────────────────────── ショップ ─────────────────────────

function showShop() {
  const pay = run.payment ?? {};
  el.shopHead.textContent = pay.rescued ? '家賃保証書で救われた' : '家賃を払いました';
  el.shopSub.textContent =
    `第${run.period}期 家賃 ${(pay.rent ?? 0).toLocaleString()} / 残り ${run.coins.toLocaleString()} コイン`;
  renderShopItems();
  renderRemoveGrid();
  el.btnReroll.textContent = `引き直す（${run.rerollCost}）`;
  el.btnReroll.disabled = run.coins < run.rerollCost;
  el.shop.hidden = false;
}

function renderShopItems() {
  el.shopItems.innerHTML = '';
  if (run.shop.offers.length === 0) {
    el.shopItems.innerHTML = '<p class="overlay-sub">売り切れ</p>';
    return;
  }
  for (const id of run.shop.offers) {
    const it = ITEMS[id];
    const b = document.createElement('button');
    b.className = 'shop-item';
    b.disabled = run.coins < it.price;
    b.innerHTML = `<span class="ico">${iconMarkup(it)}</span>
      <span><span class="nm">${it.name}</span><br><span class="ds">${it.desc}</span></span>
      <span class="pr">${it.price}</span>`;
    b.addEventListener('click', () => {
      if (buyItem(run, id)) { sfx.buy(); renderShopItems(); renderRemoveGrid(); showShop(); persist(); }
    });
    el.shopItems.appendChild(b);
  }
}

function renderRemoveGrid() {
  armedChip = null;
  el.removeHint.textContent = `1つ ${run.removeCost} コイン`;
  const groups = groupInventory();
  el.shopRemove.innerHTML = '';
  for (const g of groups) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.innerHTML = `${iconMarkup(g.def)}${g.count > 1 ? `<span class="n">${g.count}</span>` : ''}`;
    chip.addEventListener('click', () => {
      if (armedChip !== chip) {
        if (armedChip) armedChip.classList.remove('armed');
        armedChip = chip;
        chip.classList.add('armed');
        sfx.tap();
        return;
      }
      if (removeSymbol(run, g.uids[0])) { sfx.discard(); renderRemoveGrid(); showShop(); persist(); }
    });
    el.shopRemove.appendChild(chip);
  }
}

function groupInventory() {
  const map = new Map();
  for (const inst of run.inventory) {
    if (!map.has(inst.defId)) map.set(inst.defId, { def: getDef(inst.defId), count: 0, uids: [] });
    const g = map.get(inst.defId);
    g.count++;
    g.uids.push(inst.uid);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

el.btnReroll.addEventListener('click', () => { if (rerollShop(run)) { sfx.tap(); showShop(); persist(); } });
el.btnNext.addEventListener('click', () => {
  sfx.tap();
  leaveShop(run);
  el.shop.hidden = true;
  clearBoard();
  el.gain.classList.remove('show', 'big');
  renderAll();
  persist();
});

// ───────────────────────── デッキ ─────────────────────────

function showDeck() {
  const rate = Math.round(appearanceRate(run) * 100);
  el.deckSub.innerHTML =
    `${run.inventory.length} 個 ／ 1スピンに出る確率 <b>${rate}%</b><br>` +
    (run.items.length
      ? '持ち物 ' + run.items.map((i) => `${iconMarkup(ITEMS[i], 'sp-inline')}${ITEMS[i].name}`).join('・')
      : '持ち物なし');
  el.deckList.innerHTML = '';
  for (const g of groupInventory()) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.innerHTML = `${iconMarkup(g.def)}${g.count > 1 ? `<span class="n">${g.count}</span>` : ''}`;
    chip.addEventListener('click', (e) => showTipFor(g.def, e.currentTarget));
    el.deckList.appendChild(chip);
  }
  el.deck.hidden = false;
}
el.btnDeck.addEventListener('click', () => { sfx.tap(); showDeck(); });
el.btnDeckClose.addEventListener('click', () => { el.deck.hidden = true; hideTip(); });

// ───────────────────────── リザルト ─────────────────────────

function showResult() {
  const cleared = run.phase === 'clear';
  el.resultTitle.textContent = cleared ? '完済しました' : '家賃、払えませんでした';
  el.resultSub.textContent = cleared
    ? `全 ${TOTAL_PERIODS} 期 クリア（${DIFFICULTIES[run.difficulty].name}）`
    : `第 ${run.period} 期 で終了（${DIFFICULTIES[run.difficulty].name}）`;

  // 期ごとの「必要額に対してどれだけ稼げたか」
  el.resultChart.innerHTML = '';
  const ratios = run.history.map((h) => h.earned / h.rent);
  const max = Math.max(1.2, ...ratios);
  run.history.forEach((h, i) => {
    const bar = document.createElement('div');
    bar.className = 'bar' + (!cleared && i === run.history.length - 1 ? ' fail' : '');
    bar.style.height = `${Math.max(6, (ratios[i] / max) * 100)}%`;
    // 家賃ちょうど（比 1.0）の高さに目安線を引く。バーの内側での相対位置に直す
    const need = document.createElement('div');
    need.className = 'need';
    need.style.bottom = `${Math.min(100, (1 / ratios[i]) * 100)}%`;
    bar.appendChild(need);
    el.resultChart.appendChild(bar);
  });

  const r = deathReason(run);
  el.resultReason.innerHTML = cleared || !r
    ? `最終資産 <b>${run.coins.toLocaleString()}</b> コイン`
    : `第${r.period}期は 1スピン平均 <b>${r.perSpin}</b> コイン。<br>` +
      `必要だったのは <b>${r.requiredPerSpin}</b>。<br>` +
      `<span style="color:var(--danger)">${r.short.toLocaleString()} コイン足りませんでした。</span>`;

  el.resultDeck.innerHTML = groupInventory()
    .map((g) => `<span>${iconMarkup(g.def, 'sp-inline')}${g.count > 1 ? `<b>${g.count}</b>` : ''}</span>`)
    .join('');

  meta.records.unshift({
    seed: run.seed, period: run.period, coins: run.coins,
    cleared, difficulty: run.difficulty, date: new Date().toISOString().slice(0, 10),
  });
  meta.records = meta.records.slice(0, 30);
  if (cleared && !meta.clearedDifficulties.includes(run.difficulty)) {
    meta.clearedDifficulties.push(run.difficulty);
  }
  persist();

  el.result.hidden = false;
}

el.btnSameSeed.addEventListener('click', () => { el.result.hidden = true; startRun(run.seed); });
el.btnNewRun.addEventListener('click', () => {
  el.result.hidden = true;
  startRun(Math.floor(Math.random() * 1e9));
});

// ───────────────────────── メニュー ─────────────────────────

el.btnMenu.addEventListener('click', () => {
  el.menuSeed.textContent = run.seed;
  el.diffRow.innerHTML = '';
  for (const d of Object.values(DIFFICULTIES)) {
    const b = document.createElement('button');
    b.className = 'diff-btn' + (d.id === run.difficulty ? ' on' : '');
    b.textContent = d.name;
    b.addEventListener('click', () => { el.menu.hidden = true; startRun(run.seed, d.id); });
    el.diffRow.appendChild(b);
  }
  el.menu.hidden = false;
});
el.btnMenuClose.addEventListener('click', () => { el.menu.hidden = true; });
el.btnRestart.addEventListener('click', () => {
  el.menu.hidden = true;
  startRun(Math.floor(Math.random() * 1e9));
});

el.btnSound.addEventListener('click', () => {
  const m = toggleMuted();
  syncSoundButton();
  if (!m) sfx.tap();
});

function syncSoundButton() {
  const m = isMuted();
  el.btnSound.textContent = m ? '🔇 音' : '🔊 音';
  el.btnSound.classList.toggle('on', !m);
}
syncSoundButton();

// ブラウザの自動再生制限は、最初のユーザー操作でしか外せない
document.addEventListener('pointerdown', unlockAudio, { once: true });

el.btnAuto.addEventListener('click', () => {
  fast = !fast;
  el.btnAuto.classList.toggle('on', fast);
  el.btnAuto.textContent = fast ? '⏩ 高速 ON' : '⏩ 高速';
});

// ───────────────────────── ツールチップ ─────────────────────────

function bindLongPress(node, index) {
  let timer = null;
  const start = () => {
    timer = setTimeout(() => {
      const p = run?.lastSpin?.placed[index];
      if (p) showTipFor(p.def, node);
    }, 350);
  };
  const cancel = () => { clearTimeout(timer); };
  node.addEventListener('pointerdown', start);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('pointercancel', cancel);
}

function showTipFor(def, anchor) {
  el.tip.innerHTML = `<div class="t">${iconMarkup(def, 'sp-inline')} ${def.name}</div>${def.desc}`;
  el.tip.hidden = false;
  const r = anchor.getBoundingClientRect();
  const a = el.app.getBoundingClientRect();
  const w = el.tip.offsetWidth;
  let x = r.left - a.left + r.width / 2 - w / 2;
  x = Math.max(8, Math.min(a.width - w - 8, x));
  let y = r.top - a.top - el.tip.offsetHeight - 8;
  if (y < 8) y = r.bottom - a.top + 8;
  el.tip.style.left = `${x}px`;
  el.tip.style.top = `${y}px`;
  clearTimeout(showTipFor._t);
  showTipFor._t = setTimeout(hideTip, 2600);
}
function hideTip() { el.tip.hidden = true; }
document.addEventListener('pointerdown', (e) => {
  if (!el.tip.hidden && !e.target.closest('.chip, .cell')) hideTip();
});

function hideAll() {
  for (const o of [el.offer, el.shop, el.deck, el.result, el.menu]) o.hidden = true;
  el.app.classList.remove('offering');
}

// デバッグ用（コンソールから触れるように）
window.__game = { get run() { return run; }, SYMBOLS, startRun, dailySeed };
