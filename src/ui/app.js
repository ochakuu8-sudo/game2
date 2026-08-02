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
  boardArea: document.querySelector('.board-area'),
  gainArea: document.querySelector('.gain-area'),
  controls: document.querySelector('.controls'),
};

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
  c.innerHTML = '<span class="e"></span><span class="cell-gain"></span>';
  bindLongPress(c, i);
  el.board.appendChild(c);
  cells.push({ root: c, emoji: c.querySelector('.e'), gain: c.querySelector('.cell-gain') });
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
    c.gain.textContent = '';
    c.gain.classList.remove('show');
  }
}

function paintBoard(placed, { withGains = false } = {}) {
  hotCell = null;
  for (let i = 0; i < CELLS; i++) {
    const p = placed[i];
    const c = cells[i];
    if (!p) {
      c.root.className = 'cell empty';
      c.emoji.innerHTML = '';
      c.gain.textContent = '';
      continue;
    }
    c.root.className = 'cell' + (p.destroyed ? ' dead' : '');
    c.emoji.innerHTML = iconMarkup(p.def);
    if (withGains && !p.destroyed && p.gain > 0) {
      c.gain.textContent = p.gain;
      c.gain.classList.add('show');
    } else {
      c.gain.textContent = '';
      c.gain.classList.remove('show');
    }
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
 * スピンの演出。
 *
 * 肝は「どのマスがいくら入れたのか」を 1マスずつ順に見せること。
 * まとめて出すと数字が一度に増えるだけで、シナジーを組んだ実感が残らない。
 * 順番は盤面インデックスの昇順＝左上から右下への読み順で、
 * これはエンジンの効果解決順（docs/02-game-design.md 2.3）とも一致している。
 *
 * 全体で 1.2 秒前後に収める。マス数が多いほど 1マスあたりを詰めて、
 * 総尺が伸びないようにする。画面のどこかを触れば即スキップできる。
 */
async function animateSpin(result, coinsBefore) {
  skipReset();

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
  const scoring = placed.filter((p) => !p.destroyed && p.gain > 0);

  // ── 2. 壊れたシンボルを先に見せる ──────────────────
  // 「消えたから点が入らなかった」を、加算が始まる前に理解させる
  const destroyed = placed.filter((p) => p.destroyed);
  if (destroyed.length > 0 && !fast && !skipRequested) {
    for (const p of destroyed) cells[p.index].root.classList.add('dead');
    sfx.destroy();
    await wait(170);
  }

  // ── 3. 1マスずつ加算 ─────────────────────────────
  const per = fast ? 0 : clamp(620 / Math.max(1, scoring.length), 28, 95);
  let running = 0;
  let step = 0;

  for (const p of scoring) {
    if (skipRequested) break;
    running += p.gain;
    revealCellGain(p.index, p.gain);
    setGainText(`+${running.toLocaleString()}`);
    sfx.coin(step++, p.gain >= 40);
    await wait(per);
  }

  // 途中でスキップされた場合は、残りをまとめて出す
  if (running !== result.subtotal) {
    for (const p of scoring) revealCellGain(p.index, p.gain, { silent: true });
    running = result.subtotal;
    setGainText(`+${running.toLocaleString()}`);
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
  clearHot();
  setGainText(`+${result.total.toLocaleString()}`);
  el.gain.classList.toggle('big', result.totalMultiplier > 1 || result.total >= 200);
  sfx.cash();
  el.coins.classList.remove('bump');
  void el.coins.offsetWidth;
  el.coins.classList.add('bump');
  await countUp(coinsBefore, run.coins, fast ? 0 : 220);
  await wait(fast ? 0 : 80);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function setGainText(text) {
  el.gain.textContent = text;
  el.gain.classList.add('show');
}

/**
 * 1マスぶんの獲得値を出す。
 * 枠の強調は「いま加算しているマス」だけに付ける。
 * 加算済み全部に付けると、終盤には盤面のほぼ全マスが光って何も伝えなくなる。
 * 加算済みかどうかは、残る数字のほうが正確に伝えてくれる。
 */
let hotCell = null;

function revealCellGain(index, value, { silent = false } = {}) {
  const c = cells[index];
  c.gain.textContent = value;
  c.gain.classList.add('show');
  if (silent || fast) return;

  if (hotCell && hotCell !== c.root) hotCell.classList.remove('hot');
  hotCell = c.root;
  c.root.classList.add('hot');

  c.gain.classList.remove('rise');
  c.root.classList.remove('pop');
  void c.root.offsetWidth;
  c.gain.classList.add('rise');
  c.root.classList.add('pop');
}

function clearHot() {
  if (hotCell) hotCell.classList.remove('hot');
  hotCell = null;
}

function countUp(from, to, ms) {
  if (ms <= 0 || from === to) { el.coins.textContent = to.toLocaleString(); return Promise.resolve(); }
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      el.coins.textContent = Math.round(from + (to - from) * k).toLocaleString();
      if (k < 1 && !skipRequested) requestAnimationFrame(step);
      else { el.coins.textContent = to.toLocaleString(); resolve(); }
    };
    requestAnimationFrame(step);
  });
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
