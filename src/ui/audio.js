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
   * （＝マスの並び順の音階）。金額の大小では音を変えない。
   * 主役は今は burstCoins の coinPop/coinLand なので、ここは控えめな
   * トリガー音（「このマスの番が来た」の合図）に留める。
   */
  coin(step = 0) {
    const n = LADDER[Math.min(step, LADDER.length - 1)];
    tone({ freq: note(n), type: 'triangle', dur: 0.05, gain: 0.16 });
  },

  /**
   * ②特殊効果。①のコイン音とは意図的に違う音色にする
   * ── 「値が並ぶ」①と「効果が連鎖して発動する」②を耳でも区別できるようにするため。
   * アタック（短いクリック）で「ヒットした」感を作る。
   *
   * index はそのスピン内で通したコンボの順番。進むほど音程が上がり、
   * コンボが繋がっている実感を出す ── **表現はこの音程の軸だけに絞る**。
   * こちらも主役は coinPop/coinLand。ここは「発動した」トリガー音のみ。
   */
  combo(index = 0) {
    const n = LADDER[Math.min(index, LADDER.length - 1)];
    noise({ dur: 0.02, gain: 0.13, from: 4200, to: 1800, q: 5 });
    tone({ freq: note(n), type: 'sawtooth', dur: 0.06, gain: 0.15 });
  },

  /**
   * コイン1枚が盤面から弾け出る、ごく短い「ポッ」という音。
   * 何枚も束になって鳴るので、1枚あたりは目立たせすぎない。
   */
  coinPop() {
    const wobble = 1 + (Math.random() - 0.5) * 0.08;
    tone({ freq: 1500 * wobble, type: 'sine', dur: 0.03, gain: 0.07 });
  },

  /**
   * コイン1枚が合計へ吸い込まれて着地する「チッ」という短い打音。
   * 音程を上げ下げするメロディックな要素は持たせず、毎回ほぼ同じ高さの
   * 打撃音にする ── ABSORB_STAGGER_MS（32ms）間隔で連続して鳴らした時に
   * 「チッチッチッ…」と粒が重なって聞こえることを狙った音作りのため、
   * 1音ごとに音程が動くと逆にその重なりが濁って聞こえる。
   * ごく小さいランダムなゆらぎだけを掛け、無機質になりすぎないようにする。
   */
  coinLand() {
    const wobble = 1 + (Math.random() - 0.5) * 0.06;
    noise({ dur: 0.03, gain: 0.22, from: 6500 * wobble, to: 3000 * wobble, q: 5 });
    tone({ freq: 1800 * wobble, type: 'square', dur: 0.018, gain: 0.09 });
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
