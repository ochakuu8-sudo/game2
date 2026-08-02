/**
 * 効果音。音声ファイルは使わず、Web Audio でその場で合成する。
 *
 * ファイルを持たない理由:
 *   ・ビルド不要・アセット0 という今の構成を崩さない
 *   ・初回ロードが増えない（合成なので実質 0 バイト）
 *   ・オフラインでも鳴る
 *   ・加算のたびに音程を変える、といった動的な鳴らし方が素直に書ける
 *
 * 設計上の約束（docs/05-ui-ux.md 5.8）:
 *   音は完全に任意。無音で情報が欠落してはいけない。
 *   よってここが全部 no-op でもゲームは成立する。
 */

const MUTE_KEY = 'lucky-heights/muted';

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.3;
  master.connect(ctx.destination);

  // ノイズ系（破壊音・レバー音）で使い回す 1 秒ぶんのホワイトノイズ
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** ブラウザの自動再生制限を外す。最初のタップで必ず呼ぶこと */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function isMuted() { return muted; }

export function toggleMuted() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* 無視 */ }
  if (!muted) unlockAudio();
  return muted;
}

// ───────────────────────── 音の部品 ─────────────────────────

function tone({ freq, type = 'triangle', dur = 0.09, gain = 0.5, glide = 0, delay = 0 }) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * glide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function noise({ dur = 0.12, gain = 0.35, from = 2000, to = 400, q = 1, delay = 0 }) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** 加算音を積み上げるときの音階（ペンタトニック）。上がっていくほど気持ちいい */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const note = (semitone) => 440 * Math.pow(2, semitone / 12);

/**
 * 金額の大きさを 0〜4 の5段階に落とす。
 * 「音だけで大きい金額とわかる」ためには、真偽値では足りない。
 * 家賃10期前後の1マスの値（数十〜100超）まで見越して、対数的に境界を切る。
 */
function tierFor(amount) {
  if (amount >= 60) return 4;
  if (amount >= 25) return 3;
  if (amount >= 10) return 2;
  if (amount >= 4) return 1;
  return 0;
}

// ───────────────────────── 効果音 ─────────────────────────

export const sfx = {
  /** UI の軽いタップ */
  tap() {
    tone({ freq: 620, type: 'triangle', dur: 0.045, gain: 0.25 });
  },

  /** レバーを引く */
  spin() {
    noise({ dur: 0.22, gain: 0.3, from: 3000, to: 300 });
    tone({ freq: 220, type: 'sawtooth', dur: 0.18, gain: 0.18, glide: 0.6 });
  },

  /** 列が止まる */
  reel(i = 0) {
    tone({ freq: 180, type: 'square', dur: 0.035, gain: 0.16, delay: i * 0.045 });
  },

  /**
   * ①基礎金額。1マスぶんの加算。step が進むほど音程が上がっていく
   * （＝マスの並び順の音階）のに加えて、amount が大きいほど段階的に厚みが増す
   * （＝その1マスの金額そのものの派手さ）。2つの軸は独立している。
   */
  coin(step = 0, amount = 0) {
    const n = LADDER[Math.min(step, LADDER.length - 1)];
    const tier = tierFor(amount);
    tone({ freq: note(n), type: 'square', dur: 0.05 + tier * 0.008, gain: 0.18 + tier * 0.045 });
    tone({ freq: note(n + 12), type: 'triangle', dur: 0.045, gain: 0.1 + tier * 0.03 });
    if (tier >= 2) tone({ freq: note(n + 19), type: 'triangle', dur: 0.06, gain: 0.13, delay: 0.02 });
    if (tier >= 3) noise({ dur: 0.05, gain: 0.14, from: 5200, to: 2600, q: 2 });
    if (tier >= 4) tone({ freq: note(n + 24), type: 'sawtooth', dur: 0.09, gain: 0.18, delay: 0.032 });
  },

  /**
   * ②特殊効果。①のコイン音とは意図的に違う音色にする
   * ── 「値が並ぶ」①と「効果が連鎖して発動する」②を耳でも区別できるようにするため。
   * アタック（短いクリック）＋和音的に重ねた層で「ヒットした」感を作る。
   *
   * index はそのスピン内で通したコンボの順番（音程を積み上げる軸）。
   * amount はそのコンボで実際に増えた金額（派手さを積み上げる軸）。
   * 「音だけで大きい金額が当たったとわかる」を担うのは amount 側で、
   * tier が上がるごとに 音量・和音の層数・アタックのノイズ質感 が明確に変わる。
   */
  combo(index = 0, amount = 0) {
    const n = LADDER[Math.min(index, LADDER.length - 1)];
    const tier = tierFor(amount);
    noise({ dur: 0.02 + tier * 0.012, gain: 0.13 + tier * 0.035, from: 4200, to: 1800, q: 5 });
    tone({ freq: note(n), type: 'sawtooth', dur: 0.07 + tier * 0.01, gain: 0.16 + tier * 0.045 });
    tone({ freq: note(n + 7), type: 'sine', dur: 0.09, gain: 0.1 + tier * 0.035, delay: 0.014 });
    if (tier >= 2) tone({ freq: note(n + 12), type: 'triangle', dur: 0.1, gain: 0.16, delay: 0.026 });
    if (tier >= 3) tone({ freq: note(n + 16), type: 'triangle', dur: 0.11, gain: 0.15, delay: 0.038 });
    if (tier >= 4) {
      noise({ dur: 0.09, gain: 0.24, from: 6000, to: 700, q: 1.6, delay: 0.01 });
      tone({ freq: note(n + 24), type: 'sawtooth', dur: 0.13, gain: 0.2, delay: 0.05 });
    }
  },

  /** シンボルが壊れた */
  destroy() {
    noise({ dur: 0.16, gain: 0.4, from: 1400, to: 180, q: 3 });
    tone({ freq: 130, type: 'square', dur: 0.1, gain: 0.2, glide: 0.5 });
  },

  /** 合計に倍率が乗った */
  multiply() {
    for (let i = 0; i < 4; i++) {
      tone({ freq: note(12 + i * 4), type: 'square', dur: 0.09, gain: 0.24, delay: i * 0.055 });
    }
  },

  /** コインが財布に入る */
  cash() {
    tone({ freq: note(12), type: 'triangle', dur: 0.12, gain: 0.22 });
    tone({ freq: note(19), type: 'triangle', dur: 0.14, gain: 0.18, delay: 0.05 });
  },

  /** 家賃を払えた */
  rentOk() {
    [0, 4, 7, 12].forEach((n, i) =>
      tone({ freq: note(n), type: 'triangle', dur: 0.16, gain: 0.26, delay: i * 0.075 }));
  },

  /** 家賃を払えなかった */
  rentFail() {
    [0, -3, -7, -12].forEach((n, i) =>
      tone({ freq: note(n), type: 'sawtooth', dur: 0.3, gain: 0.2, delay: i * 0.13 }));
  },

  /** 完済 */
  clear() {
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) =>
      tone({ freq: note(n), type: 'triangle', dur: 0.22, gain: 0.26, delay: i * 0.09 }));
  },

  /** 買い物 */
  buy() {
    tone({ freq: note(7), type: 'square', dur: 0.06, gain: 0.22 });
    tone({ freq: note(14), type: 'square', dur: 0.09, gain: 0.2, delay: 0.06 });
  },

  /** シンボルを捨てた */
  discard() {
    noise({ dur: 0.14, gain: 0.28, from: 900, to: 200 });
  },
};
