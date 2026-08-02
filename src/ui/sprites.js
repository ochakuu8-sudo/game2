/**
 * シンボルのスプライト（SVG）。
 *
 * 描画方針 — バラバラに描くと「素材を寄せ集めた画面」になるので、全点に同じ縛りをかける:
 *   ・座標系は 32×32 に統一。輪郭は 24×24 前後に収め、周囲に余白を残す
 *   ・アウトラインは #3b2a1a / 太さ 1.5 で全点共通（これが最も「まとまり」に効く）
 *   ・光源は左上固定。ハイライトは左上、影は右下
 *   ・パレットは下の PALETTE のみ。中間色を勝手に増やさない
 *   ・60px 相当で見てシルエットだけで判別できること（盤面のマスは実寸それくらい）
 *
 * ここは presentation 層。core/symbols.js は emoji を持ったままにしてあるので、
 * スプライト未定義のシンボルは自動的に絵文字にフォールバックする。
 */

export const PALETTE = {
  ink: '#3b2a1a',
  white: '#f6efe2', cream: '#e8dcc4', shade: '#cbbb9c',
  gold: '#e8b44a', goldLt: '#f5d98f', goldDk: '#c9873a',
  brown: '#a8703f', brownDk: '#6d452a', wood: '#c9925c',
  red: '#d1544a', redDk: '#a33a35',
  green: '#7fb069', greenDk: '#4f7a45',
  blue: '#6fa3c7', blueDk: '#3d6a8f',
  gray: '#b9bec4', grayDk: '#7d858c',
  night: '#2f2a26', skin: '#f0c9a4', pink: '#e59aa4',
  purple: '#8a6bab', orange: '#e08a3c', yellow: '#f2d06b',
};

const P = PALETTE;

/**
 * アウトラインはテーマ連動にする。
 * 暗い背景では、輪郭を「背景よりさらに暗く」しないと絵が平たく潰れて見える
 * （既定の #3b2a1a はダークテーマのマス色 #362a20 とほぼ同色で、線が消えていた）。
 * CSS カスタムプロパティは <use> のシャドウツリーにも継承されるので、
 * styles.css 側で --sp-ink を切り替えるだけで全スプライトに効く。
 */
const INK = 'var(--sp-ink, #3b2a1a)';

/** 全点に共通で掛かる線の設定 */
const G = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`;

/** id -> SVG の中身 */
const ART = {

  // ───────────── コモン ─────────────

  coin: `
    <circle cx="16" cy="16" r="11" fill="${P.gold}"/>
    <circle cx="16" cy="16" r="7" fill="none" stroke="${P.goldDk}" stroke-width="1.3"/>
    <path d="M11.5 10.5a7.5 7.5 0 0 0-3 4.2" fill="none" stroke="${P.goldLt}" stroke-width="2.2"/>`,

  onigiri: `
    <path d="M16 5.5c1.1 0 1.9.6 2.4 1.6l6.6 12.4c1.3 2.5-.3 5.5-3 5.5H10c-2.7 0-4.3-3-3-5.5L13.6 7.1c.5-1 1.3-1.6 2.4-1.6z" fill="${P.white}"/>
    <path d="M11.6 17.5h8.8v6.6c0 .5-.4.9-.9.9h-7c-.5 0-.9-.4-.9-.9z" fill="${P.night}"/>
    <path d="M13.4 10.2l-1.8 3.4" fill="none" stroke="${P.shade}" stroke-width="1.8"/>`,

  cupnoodle: `
    <path d="M9.5 12h13l-1.5 12.3c-.1 1-1 1.7-2 1.7h-6c-1 0-1.9-.7-2-1.7z" fill="${P.white}"/>
    <rect x="8" y="8.5" width="16" height="4" rx="1.6" fill="${P.red}"/>
    <path d="M11.2 16.5h9.6" fill="none" stroke="${P.redDk}" stroke-width="1.6"/>
    <path d="M13 5.5c1.5 1 .5 2.4 1.8 3.1M18 5c1.4 1.2.3 2.5 1.6 3.3" fill="none" stroke="${P.shade}" stroke-width="1.4"/>`,

  egg: `
    <path d="M16 5.5c4.3 0 7.8 5.6 7.8 10.6S20.3 25.5 16 25.5 8.2 21.1 8.2 16.1 11.7 5.5 16 5.5z" fill="${P.cream}"/>
    <ellipse cx="12.8" cy="13.5" rx="1.9" ry="2.9" fill="${P.white}" stroke="none" transform="rotate(-20 12.8 13.5)"/>`,

  planter: `
    <path d="M16 15.5V9.5" fill="none" stroke="${P.greenDk}" stroke-width="1.8"/>
    <path d="M16 11c-1-3-4-3.4-5.4-2.6C9.5 9.3 11.6 13 16 12.6z" fill="${P.green}"/>
    <path d="M16 12.6c1.2-2.8 4.2-2.8 5.4-1.8 1 .8-1 4.2-5.4 3.5z" fill="${P.green}"/>
    <rect x="8" y="15" width="16" height="4.2" rx="1.4" fill="${P.orange}"/>
    <path d="M9.6 19.2h12.8l-1.3 6.2c-.2 1-1 1.6-2 1.6h-6.2c-1 0-1.8-.6-2-1.6z" fill="${P.brown}"/>`,

  // 足首から下が右に折れた「L 字」を作らないと、靴下ではなくフラスコに見える
  sock: `
    <path d="M8 6.5A1.5 1.5 0 0 1 9.5 5h7A1.5 1.5 0 0 1 18 6.5V19h3.5a4 4 0 0 1 0 8H9.5A1.5 1.5 0 0 1 8 25.5z" fill="${P.blue}"/>
    <path d="M8 9.2h10M8 12h10" fill="none" stroke="${P.white}" stroke-width="1.7"/>
    <path d="M18 19v8" fill="none" stroke="${P.blueDk}" stroke-width="1.2"/>`,

  radio: `
    <path d="M20 9.5l4.5-4" fill="none" stroke="${P.grayDk}" stroke-width="1.6"/>
    <rect x="5.5" y="9.5" width="21" height="14" rx="2.4" fill="${P.brown}"/>
    <circle cx="12" cy="16.5" r="4.2" fill="${P.cream}"/>
    <circle cx="12" cy="16.5" r="1.6" fill="${P.brownDk}" stroke="none"/>
    <rect x="18.5" y="12.5" width="5.5" height="3" rx="1" fill="${P.goldLt}"/>
    <circle cx="21.2" cy="19.8" r="1.8" fill="${P.gold}"/>`,

  bulb: `
    <path d="M12.6 20.5h6.8v3.4c0 1.2-1 2.1-2.1 2.1h-2.6c-1.2 0-2.1-.9-2.1-2.1z" fill="${P.gray}"/>
    <circle cx="16" cy="14" r="7.6" fill="${P.yellow}"/>
    <path d="M13 10.4a4.6 4.6 0 0 0-1.6 3.4" fill="none" stroke="${P.white}" stroke-width="2"/>
    <path d="M13.4 21.5h5.2" fill="none" stroke="${P.grayDk}" stroke-width="1.4"/>`,

  mouse: `
    <path d="M24 20c2.6 0 4-1.4 3.4-3.2" fill="none" stroke="${P.pink}" stroke-width="1.8"/>
    <ellipse cx="15" cy="18.5" rx="9" ry="6.4" fill="${P.gray}"/>
    <circle cx="8.8" cy="12.8" r="4" fill="${P.pink}"/>
    <circle cx="10.4" cy="16.6" r="1.3" fill="${P.night}" stroke="none"/>
    <path d="M7.5 19.4l-3.4-1M7.5 20.6l-3 1.4" fill="none" stroke="${INK}" stroke-width="1"/>`,

  // 正面向きのお座り。横向きにすると 30px で頭と胴が団子になって判別できない
  cat: `
    <path d="M24.5 25.5c3.4-.8 4.2-4.8 1.8-6.8" fill="none" stroke="${P.orange}" stroke-width="2.6"/>
    <path d="M9.4 27c-1.8-3.6-1-8.4 3-10.8 2.4-1.4 5.8-1.4 8.2 0 4 2.4 4.8 7.2 3 10.8z" fill="${P.orange}"/>
    <path d="M10.4 8.4L9 3.4l5 2.6zM21.6 8.4L23 3.4l-5 2.6z" fill="${P.orange}"/>
    <circle cx="16" cy="12" r="6.2" fill="${P.orange}"/>
    <circle cx="13.7" cy="11.4" r="1.05" fill="${P.night}" stroke="none"/>
    <circle cx="18.3" cy="11.4" r="1.05" fill="${P.night}" stroke="none"/>
    <path d="M14.9 14.2c.6.7 1.6.7 2.2 0" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <path d="M12.4 19.5v3.2M16 19v3.6M19.6 19.5v3.2" fill="none" stroke="${P.goldDk}" stroke-width="1.5"/>`,

  // 車輪をアウトライン色で描くと暗い背景に溶けるので、必ず明るい色で描く
  bicycle: `
    <circle cx="8.5" cy="20" r="6" fill="none" stroke="${P.gray}" stroke-width="2.2"/>
    <circle cx="23.5" cy="20" r="6" fill="none" stroke="${P.gray}" stroke-width="2.2"/>
    <path d="M8.5 20l5-9h6l4 9M13.5 11h-3M19.5 11l-1.5 9" fill="none" stroke="${P.red}" stroke-width="2.2"/>
    <path d="M21.5 9h4" fill="none" stroke="${P.brownDk}" stroke-width="2"/>
    <path d="M11.6 9.6h3.4" fill="none" stroke="${P.brownDk}" stroke-width="2.4"/>`,

  // 缶ビールと並ぶので、へこみ + 口の空いた暗い開口部で「空き缶」だと分かるようにする
  can: `
    <path d="M9.5 11h13v12.5c0 1.4-1.1 2.5-2.5 2.5h-8c-1.4 0-2.5-1.1-2.5-2.5z" fill="${P.gray}"/>
    <path d="M9.5 16l3.5 1.6-3.5 1.8zM22.5 16L19 17.6l3.5 1.8z" fill="${P.grayDk}" stroke="none"/>
    <path d="M9.5 16l3.5 1.6-3.5 1.8M22.5 16L19 17.6l3.5 1.8" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="16" cy="11" rx="6.5" ry="2.6" fill="${P.night}"/>
    <path d="M11 22h10" fill="none" stroke="${P.grayDk}" stroke-width="1.4"/>`,

  leak: `
    <path d="M16 4.5c4.2 5.4 7 9.3 7 12.6a7 7 0 0 1-14 0c0-3.3 2.8-7.2 7-12.6z" fill="${P.blue}"/>
    <path d="M12.6 17.4a3.6 3.6 0 0 0 1.4 4" fill="none" stroke="${P.white}" stroke-width="1.8"/>`,

  bucket: `
    <path d="M7 11h18l-2 13.4c-.2 1.5-1.5 2.6-3 2.6H12c-1.5 0-2.8-1.1-3-2.6z" fill="${P.gray}"/>
    <path d="M8.5 11a7.5 7 0 0 1 15 0" fill="none" stroke="${P.grayDk}" stroke-width="1.8"/>
    <path d="M8.4 18h15.2" fill="none" stroke="${P.blue}" stroke-width="4"/>
    <path d="M8.2 18h15.6" fill="none" stroke="${INK}" stroke-width="1.1"/>`,

  umbrella: `
    <path d="M16 26.5c2.4 0 3.4-1.4 3.4-3.2v-9" fill="none" stroke="${P.brown}" stroke-width="1.9"/>
    <path d="M3.5 15C4.5 8.6 9.8 5 16 5s11.5 3.6 12.5 10c-2-1.6-4.2-1.6-6.2 0-2.1-1.6-4.2-1.6-6.3 0-2.1-1.6-4.2-1.6-6.3 0-2-1.6-4.2-1.6-6.2 0z" fill="${P.purple}"/>
    <path d="M16 5v10" fill="none" stroke="${INK}" stroke-width="1.2"/>`,

  bowl: `
    <path d="M6 13h20c0 6.6-4.2 11.5-10 11.5S6 19.6 6 13z" fill="${P.white}"/>
    <path d="M7.6 15.4h16.8c-1.2 2-3.2 3.4-8.4 3.4s-7.2-1.4-8.4-3.4z" fill="${P.green}" stroke="none"/>
    <path d="M6 13h20" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <path d="M13 10.4c-1.6-1.4-.2-2.6.6-4M19 10.4c-1.6-1.4-.2-2.6.6-4" fill="none" stroke="${P.shade}" stroke-width="1.4"/>`,

  student: `
    <path d="M6 27v-3.4C6 20 9.4 18 16 18s10 2 10 5.6V27z" fill="${P.blueDk}"/>
    <circle cx="16" cy="11" r="6.2" fill="${P.skin}"/>
    <path d="M9.9 10.2C9.5 6.4 12.4 4.4 16 4.4s6.5 2 6.1 5.8c-1.6-1.4-3.6-2-6.1-2s-4.5.6-6.1 2z" fill="${P.night}"/>
    <circle cx="13.6" cy="11.4" r="1" fill="${P.night}" stroke="none"/>
    <circle cx="18.4" cy="11.4" r="1" fill="${P.night}" stroke="none"/>
    <path d="M11.5 19.5L13 27M20.5 19.5L19 27" fill="none" stroke="${P.gold}" stroke-width="1.6"/>`,

  grandma: `
    <path d="M6 27v-3.2C6 20.2 9.4 18 16 18s10 2.2 10 5.8V27z" fill="${P.red}"/>
    <circle cx="16" cy="11.5" r="6" fill="${P.skin}"/>
    <path d="M10 11.2C9.6 7.2 12.5 5 16 5s6.4 2.2 6 6.2c-1.6-1.4-3.5-2-6-2s-4.4.6-6 2z" fill="${P.gray}"/>
    <circle cx="16" cy="4.6" r="2.4" fill="${P.gray}"/>
    <circle cx="13.4" cy="12" r="2.1" fill="none" stroke="${INK}" stroke-width="1.1"/>
    <circle cx="18.6" cy="12" r="2.1" fill="none" stroke="${INK}" stroke-width="1.1"/>
    <path d="M15.5 12h1" fill="none" stroke="${INK}" stroke-width="1.1"/>`,

  // ───────────── アンコモン ─────────────

  chicken: `
    <path d="M13.5 25v2.4M18.5 25v2.4" fill="none" stroke="${P.orange}" stroke-width="1.9"/>
    <ellipse cx="17" cy="19.5" rx="8.4" ry="6" fill="${P.white}"/>
    <path d="M18 16.4c2.8 0 4.8 1.8 4.8 3.8s-1.8 3.4-4.2 3.4z" fill="${P.cream}"/>
    <circle cx="10.8" cy="11.6" r="4.8" fill="${P.white}"/>
    <path d="M7.6 7.8c.2-1.6 1.6-1.8 2.2-.6.6-1.6 2.2-1.4 2.4.2.8-1 2.2-.4 1.8 1z" fill="${P.red}"/>
    <path d="M6.2 11.4L2.6 12.8l3.6 1.5z" fill="${P.orange}"/>
    <circle cx="9.6" cy="11" r="1" fill="${P.night}" stroke="none"/>
    <path d="M8.4 14.6c-.4 1.4 0 2.2.8 2.8" fill="none" stroke="${P.red}" stroke-width="1.5"/>`,

  beer: `
    <path d="M10 8h12v16.5c0 1.4-1.1 2.5-2.5 2.5h-7c-1.4 0-2.5-1.1-2.5-2.5z" fill="${P.gray}"/>
    <rect x="10" y="13" width="12" height="6.5" fill="${P.gold}" stroke="none"/>
    <path d="M10 13h12M10 19.5h12" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="16" cy="8" rx="6" ry="2.2" fill="${P.cream}"/>
    <path d="M14 7.4h4" fill="none" stroke="${P.grayDk}" stroke-width="1.3"/>`,

  tv: `
    <path d="M11 8.5L15.5 12M21 8.5L16.5 12" fill="none" stroke="${P.grayDk}" stroke-width="1.6"/>
    <rect x="4.5" y="11.5" width="23" height="15" rx="2.4" fill="${P.brown}"/>
    <rect x="7" y="14" width="13" height="10.5" rx="1.6" fill="${P.blue}"/>
    <path d="M8.6 15.6l3 2.6" fill="none" stroke="${P.white}" stroke-width="1.8"/>
    <circle cx="23.6" cy="16.4" r="1.8" fill="${P.cream}"/>
    <circle cx="23.6" cy="21.6" r="1.8" fill="${P.cream}"/>`,

  guitar: `
    <path d="M20.5 12.5L26 6" fill="none" stroke="${P.brownDk}" stroke-width="2.6"/>
    <path d="M24.4 4.4l3 3" fill="none" stroke="${P.gold}" stroke-width="2.2"/>
    <path d="M13 10.5c3 0 5 1.6 5 4 0 1.6-1 2.6-1 4s1.4 2.4 1.4 4.4c0 3-2.6 5-6.2 5S5 25.4 5 21.6c0-2.4 1.6-3.6 1.6-5.2 0-1.4-.8-2.2-.8-3.6 0-1.4 1.6-2.3 3.4-2.3z" fill="${P.wood}"/>
    <circle cx="11.6" cy="20" r="2.8" fill="${P.brownDk}" stroke="none"/>
    <path d="M9.8 12.4l9-8" fill="none" stroke="${INK}" stroke-width="1"/>`,

  toolbox: `
    <path d="M12 9.5a4 4 0 0 1 8 0" fill="none" stroke="${P.grayDk}" stroke-width="1.8"/>
    <path d="M4.5 12h23v11.5c0 1.4-1.1 2.5-2.5 2.5H7c-1.4 0-2.5-1.1-2.5-2.5z" fill="${P.red}"/>
    <rect x="13" y="15" width="6" height="4.5" rx="1" fill="${P.gray}"/>
    <path d="M4.5 17.5h23" fill="none" stroke="${P.redDk}" stroke-width="1.4"/>`,

  pochi: `
    <rect x="7.5" y="5" width="17" height="22" rx="2" fill="${P.red}"/>
    <rect x="7.5" y="12" width="17" height="4.6" fill="${P.gold}" stroke="none"/>
    <path d="M7.5 12h17M7.5 16.6h17" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="16" cy="9" r="2.2" fill="${P.goldLt}"/>`,

  broom: `
    <path d="M20 5.5L13.5 16" fill="none" stroke="${P.wood}" stroke-width="2.6"/>
    <path d="M9 15l7 4-3.4 8.2c-3.6-.4-6.4-2.4-7.4-4.6z" fill="${P.gold}"/>
    <path d="M11.4 16.4l-3.2 8M14 17.8l-3 8.4" fill="none" stroke="${P.goldDk}" stroke-width="1.2"/>`,

  moon: `
    <circle cx="16" cy="16" r="11" fill="${P.cream}"/>
    <circle cx="12" cy="12.5" r="2.6" fill="${P.shade}" stroke="none"/>
    <circle cx="19.5" cy="18.5" r="3.2" fill="${P.shade}" stroke="none"/>
    <circle cx="12.5" cy="20.5" r="1.6" fill="${P.shade}" stroke="none"/>`,

  sake: `
    <path d="M13.5 4.5h5v5.2l3 4.4v10.4c0 1.4-1.1 2.5-2.5 2.5h-6c-1.4 0-2.5-1.1-2.5-2.5V14.1l3-4.4z" fill="${P.greenDk}"/>
    <rect x="11.5" y="16" width="9" height="7" rx="1" fill="${P.white}"/>
    <path d="M13.5 18.4h5M13.5 20.6h5" fill="none" stroke="${P.redDk}" stroke-width="1.2"/>
    <path d="M14.6 6.5v3" fill="none" stroke="${P.green}" stroke-width="1.4"/>`,

  // ───────────── レア ─────────────

  landlord: `
    <path d="M5.5 27v-3C5.5 20.2 9.6 18 16 18s10.5 2.2 10.5 6v3z" fill="${P.brownDk}"/>
    <circle cx="16" cy="11.5" r="6.4" fill="${P.skin}"/>
    <path d="M10.4 9.6c1-2.6 3-3.6 5.6-3.6s4.6 1 5.6 3.6" fill="none" stroke="${P.gray}" stroke-width="1.6"/>
    <circle cx="13.4" cy="11.6" r="1.9" fill="none" stroke="${INK}" stroke-width="1.1"/>
    <circle cx="18.6" cy="11.6" r="1.9" fill="none" stroke="${INK}" stroke-width="1.1"/>
    <path d="M15.3 11.6h1.4" fill="none" stroke="${INK}" stroke-width="1.1"/>
    <path d="M12.6 15.6h6.8" fill="none" stroke="${P.gray}" stroke-width="2.4"/>`,

  shortcircuit: `
    <path d="M18.5 3l-9.5 14h5.5l-2 12 10.5-15h-6z" fill="${P.yellow}"/>
    <path d="M16.6 6.4l-4.6 7" fill="none" stroke="${P.white}" stroke-width="1.6"/>`,

  banknote: `
    <rect x="3.5" y="9" width="25" height="14" rx="2" fill="${P.green}"/>
    <rect x="6.5" y="11.6" width="19" height="8.8" rx="1.2" fill="none" stroke="${P.greenDk}" stroke-width="1.2"/>
    <circle cx="16" cy="16" r="3.2" fill="${P.cream}"/>
    <path d="M14.6 16h2.8M16 14.6v2.8" fill="none" stroke="${P.greenDk}" stroke-width="1.2"/>`,

  pachinko: `
    <circle cx="16" cy="16" r="10" fill="${P.gray}"/>
    <path d="M11.6 10.4a6.4 6.4 0 0 0-2.6 4.4" fill="none" stroke="${P.white}" stroke-width="2.6"/>
    <circle cx="19.6" cy="20" r="2.2" fill="${P.grayDk}" stroke="none"/>`,

  trophy: `
    <path d="M7 6h18v5.5c0 5-4 9-9 9s-9-4-9-9z" fill="${P.gold}"/>
    <path d="M7 8.5H4.4c0 3.6 1.6 5.4 4 5.8M25 8.5h2.6c0 3.6-1.6 5.4-4 5.8" fill="none" stroke="${P.goldDk}" stroke-width="1.8"/>
    <path d="M14 20.5h4v3.5h-4z" fill="${P.goldDk}"/>
    <path d="M9.5 24h13v3.5h-13z" fill="${P.brown}"/>
    <path d="M11 8.4a6 6 0 0 0 1 6" fill="none" stroke="${P.goldLt}" stroke-width="2"/>`,

  sacredtree: `
    <path d="M13.5 18h5v9h-5z" fill="${P.brownDk}"/>
    <circle cx="16" cy="11.5" r="9" fill="${P.green}"/>
    <circle cx="10" cy="14" r="4.6" fill="${P.green}"/>
    <circle cx="22" cy="14" r="4.6" fill="${P.green}"/>
    <path d="M11 19.5h10" fill="none" stroke="${P.white}" stroke-width="2.6"/>
    <path d="M13.5 21.5l-1 2.4M18.5 21.5l1 2.4" fill="none" stroke="${P.white}" stroke-width="1.4"/>`,

  // ───────────── ベリーレア ─────────────

  // 横向きの胴を描くと 30px では蛇にしか見えないので、正面顔にする
  dragon: `
    <path d="M8.6 6.2l2 5.4 4-3.2zM23.4 6.2l-2 5.4-4-3.2z" fill="${P.gold}"/>
    <path d="M4 19.5c-1.8.8-2.6 2.4-2.4 4.2M28 19.5c1.8.8 2.6 2.4 2.4 4.2" fill="none" stroke="${P.gold}" stroke-width="1.5"/>
    <circle cx="16" cy="16.5" r="9" fill="${P.green}"/>
    <path d="M11.4 11.8c1-1 2.4-1 3.2.2M20.6 11.8c-1-1-2.4-1-3.2.2" fill="none" stroke="${P.greenDk}" stroke-width="1.4"/>
    <circle cx="12.6" cy="15" r="2.2" fill="${P.gold}"/>
    <circle cx="19.4" cy="15" r="2.2" fill="${P.gold}"/>
    <circle cx="12.6" cy="15" r=".9" fill="${P.night}" stroke="none"/>
    <circle cx="19.4" cy="15" r=".9" fill="${P.night}" stroke="none"/>
    <path d="M12.4 20.6c2.2 1.8 5 1.8 7.2 0" fill="none" stroke="${INK}" stroke-width="1.5"/>`,

  // 「上げた前足」が最大の識別要素なので、体からはっきり離して大きく出す
  manekineko: `
    <path d="M21.6 17.5l3-4.4" fill="none" stroke="${P.white}" stroke-width="3.4"/>
    <circle cx="25.4" cy="10.4" r="3.2" fill="${P.white}"/>
    <path d="M9.5 27v-6.2c0-3.9 2.9-6.8 6.5-6.8s6.5 2.9 6.5 6.8V27z" fill="${P.white}"/>
    <path d="M10.6 5.4l.8 4.4 3.4-2.4zM21.4 5.4l-.8 4.4-3.4-2.4z" fill="${P.white}"/>
    <circle cx="16" cy="10.2" r="6.2" fill="${P.white}"/>
    <path d="M12.6 9.4c.7-.9 1.7-.9 2.4 0M17 9.4c.7-.9 1.7-.9 2.4 0" fill="none" stroke="${INK}" stroke-width="1.3"/>
    <path d="M15.2 12.4c.5.6 1.1.6 1.6 0" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <path d="M10.6 19.5h10.8" fill="none" stroke="${P.red}" stroke-width="2.6"/>
    <circle cx="16" cy="20.4" r="2" fill="${P.gold}"/>`,

  // ───────────── アイテム ─────────────

  wallet: `
    <path d="M6 13h20v11c0 1.7-1.3 3-3 3H9c-1.7 0-3-1.3-3-3z" fill="${P.pink}"/>
    <path d="M10.5 13a5.5 5 0 0 1 11 0" fill="none" stroke="${P.grayDk}" stroke-width="1.8"/>
    <circle cx="16" cy="19" r="2.4" fill="${P.gold}"/>`,

  suggestbox: `
    <path d="M5.5 12h21v12.5c0 1.4-1.1 2.5-2.5 2.5H8c-1.4 0-2.5-1.1-2.5-2.5z" fill="${P.wood}"/>
    <rect x="10" y="15.5" width="12" height="2.6" rx="1" fill="${P.brownDk}"/>
    <path d="M4 12l12-6.5L28 12z" fill="${P.red}"/>`,

  tea: `
    <path d="M7 13h14v6.5c0 3.6-3 6.5-7 6.5s-7-2.9-7-6.5z" fill="${P.white}"/>
    <path d="M21 15h2.5a3 3 0 0 1 0 6H21" fill="none" stroke="${INK}" stroke-width="1.6"/>
    <path d="M8.6 15h10.8c0 1.6-2 2.6-5.4 2.6S8.6 16.6 8.6 15z" fill="${P.greenDk}" stroke="none"/>
    <path d="M11 6.5c1.4 1.2.3 2.4 1.6 3.4M16 6c1.4 1.3.3 2.5 1.6 3.6" fill="none" stroke="${P.shade}" stroke-width="1.4"/>`,

  dice: `
    <rect x="5.5" y="5.5" width="21" height="21" rx="4" fill="${P.white}"/>
    <circle cx="11.5" cy="11.5" r="1.9" fill="${P.night}" stroke="none"/>
    <circle cx="20.5" cy="11.5" r="1.9" fill="${P.red}" stroke="none"/>
    <circle cx="16" cy="16" r="1.9" fill="${P.night}" stroke="none"/>
    <circle cx="11.5" cy="20.5" r="1.9" fill="${P.night}" stroke="none"/>
    <circle cx="20.5" cy="20.5" r="1.9" fill="${P.night}" stroke="none"/>`,

  mover: `
    <path d="M2.5 11h15v10h-15z" fill="${P.cream}"/>
    <path d="M17.5 14h5.5l4 4v3h-9.5z" fill="${P.blue}"/>
    <circle cx="8" cy="22.5" r="3.4" fill="${P.night}"/>
    <circle cx="22" cy="22.5" r="3.4" fill="${P.night}"/>
    <path d="M5 14h8v4H5z" fill="${P.brown}" stroke="none"/>`,

  receipt: `
    <path d="M7 5h18v20l-3-2-3 2-3-2-3 2-3-2-3 2z" fill="${P.white}"/>
    <path d="M11 10h10M11 14h10M11 18h6" fill="none" stroke="${P.grayDk}" stroke-width="1.4"/>`,

  guarantee: `
    <path d="M7 4.5h13l5.5 5.5v17.5H7z" fill="${P.white}"/>
    <path d="M20 4.5V10h5.5" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <path d="M11 14h10M11 18h10" fill="none" stroke="${P.grayDk}" stroke-width="1.4"/>
    <circle cx="20.5" cy="21.5" r="4" fill="none" stroke="${P.red}" stroke-width="1.8"/>`,
};

/** スプライトが用意されている id かどうか */
export function hasSprite(id) {
  return Object.hasOwn(ART, id);
}

/** 全スプライトを <symbol> として 1 回だけ DOM に流し込む */
export function injectSprites() {
  if (document.getElementById('sprite-sheet')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'sprite-sheet';
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'none';
  svg.innerHTML = Object.entries(ART)
    .map(([id, art]) => `<symbol id="sp-${id}" viewBox="0 0 32 32"><g ${G} fill="none">${art}</g></symbol>`)
    .join('');
  document.body.appendChild(svg);
}

/**
 * シンボル / アイテムのアイコン markup。
 * スプライトが無いものは絵文字にフォールバックするので、描き足しは段階的にできる。
 */
export function iconMarkup(def, extraClass = '') {
  const cls = `sp ${extraClass}`.trim();
  return hasSprite(def.id)
    ? `<svg class="${cls}" viewBox="0 0 32 32" role="img" aria-label="${def.name}"><use href="#sp-${def.id}"/></svg>`
    : `<span class="${cls} sp-emoji" role="img" aria-label="${def.name}">${def.emoji}</span>`;
}
