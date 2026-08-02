/** 家賃テーブルと難易度。docs/02-game-design.md の 2.5 に対応。 */

/** 各期のスピン数 */
export const SPINS_PER_PERIOD = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/**
 * 各期の家賃（ふつう）。
 *
 * 机上で置いた値ではなく、sim/run.mjs で実測した「貪欲AIが各期に稼ぐ額の中央値」を
 * なめらかにして 0.9 倍したもの。この係数は、クリア率が目標帯
 * （貪欲 25〜35% / ランダム 3%未満、敗北は第7〜9期に山）に入るよう探索して決めた。
 * シンボルの数値をいじったら、必ず `npm run sim` で引き直すこと。
 */
export const BASE_RENT = [25, 75, 200, 480, 1000, 1700, 2500, 3600, 5000, 7000, 10500, 16000];

export const TOTAL_PERIODS = SPINS_PER_PERIOD.length;
export const TOTAL_SPINS = SPINS_PER_PERIOD.reduce((a, b) => a + b, 0);

export const DIFFICULTIES = {
  easy: { id: 'easy', name: '気楽', multiplier: 0.8, offers: 3 },
  normal: { id: 'normal', name: 'ふつう', multiplier: 1.0, offers: 3 },
  hard: { id: 'hard', name: '修羅', multiplier: 1.25, offers: 2 },
};

/** @param {number} period 1-origin */
export function rentFor(period, difficulty = 'normal') {
  const d = DIFFICULTIES[difficulty] ?? DIFFICULTIES.normal;
  return Math.round(BASE_RENT[period - 1] * d.multiplier);
}

export function spinsFor(period) {
  return SPINS_PER_PERIOD[period - 1];
}

/** その期を乗り切るのに必要な 1スピンあたりの平均コイン（UI のヒント用） */
export function requiredPerSpin(period, difficulty = 'normal') {
  return rentFor(period, difficulty) / spinsFor(period);
}
