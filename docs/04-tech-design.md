# 04. 技術設計

## 4.1 技術選定

| 領域 | 採用 | 理由 |
| --- | --- | --- |
| 言語 | TypeScript (strict) | シンボル効果の型安全が生命線 |
| ビルド | Vite | 起動が速い。静的出力そのままデプロイ可 |
| UI | React 19 + Zustand | 盤面20マス程度なら DOM で十分。状態は軽量ストアで |
| スタイル | Tailwind CSS | 縦持ちレイアウトの調整サイクルが速い |
| 描画 | **DOM + CSS Grid**（Canvas 不使用） | 20マスの静的グリッド。Canvas は保守コストに見合わない |
| アニメーション | Web Animations API + CSS transform | ライブラリ非依存。`prefers-reduced-motion` 対応が容易 |
| 音 | Web Audio API 直叩き（薄いラッパ自作） | 数種のSEのみ。Howler は過剰 |
| テスト | Vitest | コアが純粋関数なので単体テストが効く |
| 配信 | Cloudflare Pages または GitHub Pages | 静的・無料・サーバー費ゼロの制約に合致 |
| PWA | vite-plugin-pwa | オフライン起動とホーム画面追加 |

**重要な方針：`src/core/` は React にも DOM にも一切依存しない純粋な TypeScript とする。**
ゲームロジックがヘッドレスで動くことが、シミュレータによるバランス調整（4.7）の前提になる。

## 4.2 ディレクトリ構成

```
src/
  core/                    # 純粋ロジック層（React非依存・DOM非依存）
    rng.ts                 # mulberry32 シード付き乱数
    types.ts               # 共通型
    data/
      symbols/
        common.ts
        uncommon.ts
        rare.ts
        veryRare.ts
        index.ts           # 全定義のマージとID重複チェック
      items.ts
      rent.ts              # 家賃テーブル・難易度倍率
    engine/
      draw.ts              # インベントリ→盤面の抽選配置
      resolve.ts           # 効果パイプライン（02.3のPhase 1〜8）
      board.ts             # BoardView（adjacent/byTag/all）
      offer.ts             # 3択の生成
      shop.ts              # ショップ商品生成・購入処理
      game.ts              # ゲーム状態遷移のリデューサ（唯一の入口）
    save.ts                # シリアライズ / スキーマ移行
  ui/
    screens/               # Title / Run / Shop / Result / Collection
    components/            # Board, Cell, SpinButton, OfferSheet, RentBar...
    anim/                  # スピン演出、コイン加算演出
    store.ts               # Zustand（core の状態を保持するだけ）
  sim/
    autoplay.ts            # AIポリシー（random / greedy / axis-focused）
    run.ts                 # 1万ラン回して統計を出す CLI
tests/
  golden/                  # シード固定のスナップショット
```

## 4.3 コアのデータモデル

```ts
export type Rarity = 'common' | 'uncommon' | 'rare' | 'veryRare';
export type Tag =
  | 'food' | 'resident' | 'animal' | 'appliance'
  | 'fragile' | 'money' | 'junk' | 'water' | 'plant';

/** 静的定義（不変） */
export interface SymbolDef {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  tags: readonly Tag[];
  base: number;
  /** UI表示用の効果文。実装と一致していることをテストで担保する */
  desc: string;
  effects?: Partial<Record<Phase, EffectFn>>;
}

/** インベントリ上の実体（可変・個体差を持つ） */
export interface SymbolInstance {
  uid: string;            // 個体識別子
  defId: string;
  permanentBonus: number; // 植木鉢などの成長分（ラン内で永続）
  counter: number;        // 変身までのカウント等
}

/** 盤面に置かれた状態（1スピン限り） */
export interface Placed {
  index: number;          // 0..19
  inst: SymbolInstance;
  value: number;          // 計算中の値
  multiplier: number;     // 累積乗数
  destroyed: boolean;
  destroyedBy?: number;   // 破壊者のindex
}

export interface RunState {
  seed: number;
  rngState: number;
  difficulty: Difficulty;
  inventory: SymbolInstance[];
  items: string[];
  coins: number;
  period: number;         // 1..12
  spinInPeriod: number;
  totalSpins: number;
  removeCost: number;     // 除去コストの累進値
  phase: 'idle' | 'spinning' | 'offering' | 'shop' | 'over' | 'clear';
  log: SpinLog[];
}
```

## 4.4 効果の記述API

シンボル効果は**プリミティブ6種のみ**を使って書く。ここを増やさないことがバランス崩壊とバグの最大の防波堤。

```ts
export type Phase =
  | 'tick' | 'add' | 'transform' | 'destroy' | 'mult' | 'post';

export interface EffectCtx {
  self: Placed;
  board: BoardView;
  run: Readonly<RunState>;
  rng: Rng;

  // --- プリミティブ（これ以外を増やさない） ---
  add(target: Placed | 'self', n: number): void;
  mult(target: Placed | 'self' | 'total', n: number): void;
  destroy(target: Placed): void;
  spawn(defId: string): void;               // インベントリに追加
  addPermanent(target: Placed | 'self', n: number): void;
  transform(target: Placed | 'self', defId: string): void;
}

export interface BoardView {
  adjacent(index: number): Placed[];        // 8方向
  all(): Placed[];
  byTag(tag: Tag): Placed[];
  byId(defId: string): Placed[];
  isEdge(index: number): boolean;
  below(index: number): Placed | null;
}
```

### 記述例

```ts
// 🐈 ノラ猫: 隣接する🐁を破壊し +8
{
  id: 'stray_cat', name: 'ノラ猫', emoji: '🐈',
  rarity: 'common', tags: ['animal'], base: 2,
  desc: '隣接する🐁ネズミを破壊し、1匹につき +8',
  effects: {
    destroy: (c) => {
      for (const mouse of c.board.adjacent(c.self.index)) {
        if (mouse.inst.defId !== 'mouse') continue;
        c.destroy(mouse);
        c.add('self', 8);
      }
    },
  },
}

// 🌱 植木鉢: スピンごとに永続 +1
{
  id: 'planter', name: '植木鉢', emoji: '🌱',
  rarity: 'common', tags: ['plant'], base: 1,
  desc: 'スピンごとに永続的に +1 成長する',
  effects: {
    tick: (c) => c.addPermanent('self', 1),
  },
}
```

## 4.5 乱数と再現性

```ts
// mulberry32: 高速・状態が32bit整数1個・シリアライズが容易
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.random === undefined ? a : a; // placeholder
    t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- **`Math.random()` はゲームロジック内で禁止**（lint ルールで機械的に禁止する）。
  すべての乱数は `RunState.rngState` から派生させる。
- これにより、
  - セーブ／ロードで乱数の続きが完全に一致する
  - デイリーシード（`seed = YYYYMMDD`）で全員同じ展開になる
  - リザルトの「同じシードでもう一度」が成立する
  - ゴールデンテストが書ける

## 4.6 セーブデータ

```ts
interface SaveData {
  schemaVersion: number;   // 破壊的変更時にインクリメント
  run: RunState | null;    // 進行中のラン（なければ null）
  meta: {                  // ラン跨ぎの永続データ
    unlockedDifficulty: Difficulty[];
    seenSymbols: string[]; // 図鑑
    records: { seed: number; period: number; coins: number; date: string }[];
  };
}
```

- 保存先は `localStorage`（キー `lucky-heights/v1`）。容量は数KB。
- **保存タイミング**：スピン確定後・3択確定後・ショップ退出時。フェーズ境界のみ。
- `schemaVersion` が古い場合はマイグレーション関数を通す。移行不能なら
  進行中のランのみ破棄し `meta` は保持する（図鑑と記録は失わせない）。

## 4.7 バランスシミュレータ（この設計の肝）

`src/sim/` にヘッドレスの自動プレイヤを置き、CLI で大量試行する。

```bash
npm run sim -- --policy=greedy --difficulty=normal --runs=10000
```

出力：

```
clear rate      : 31.2%
死亡期の分布    : 1:0.1% 2:0.4% ... 6:14.2% 7:16.8% 8:13.1% ...
軸別クリア率    : A 34.1% / B 28.9% / C 30.2% / D 22.4% / E 38.8%
平均最終コイン  : 4,182
```

### AIポリシー

| ポリシー | 挙動 | 用途 |
| --- | --- | --- |
| `random` | 3択から一様ランダムに選ぶ | **下限の測定**。ここで勝てたら運ゲー |
| `greedy` | 直近5スピンの期待値増分が最大の候補を選ぶ | **標準プレイヤの代理** |
| `axis` | 特定タグを優先して集める | **ビルド軸ごとの強さ比較** |

`random` のクリア率が3%を超えたら難易度不足、`greedy` が15%を下回ったら理不尽。
02.8 の目標値に収まるまで `data/rent.ts` と各シンボルの `base` を回す。

**この仕組みを最初に作ることで、以降のバランス調整が感覚論から数値の作業になる。**

## 4.8 テスト戦略

| 種別 | 対象 | 方法 |
| --- | --- | --- |
| 単体 | 各シンボル効果 | 盤面を手で組んで期待値を検証 |
| ゴールデン | スピン解決全体 | シード固定で 30スピン回し、ログをスナップショット |
| 整合 | `desc` と実装 | 「数値が `desc` に含まれるか」の機械チェック |
| データ | 全シンボル定義 | ID重複なし・必須項目・タグの存在・emoji が1文字 |
| 移行 | セーブ | 旧バージョンの JSON を読ませてクラッシュしないこと |

## 4.9 パフォーマンス方針

| 項目 | 目標 |
| --- | --- |
| 初回ロード（gzip） | 300KB 以下 |
| TTI（4G / ミドル端末） | 2.5秒以下 |
| スピン中のフレーム | 60fps（transform / opacity のみアニメーション） |
| 1スピンの計算時間 | 1ms 以下（20マスなので余裕。シミュレータの速度に直結） |

- 盤面セルは**マウントしっぱなし**にして中身だけ差し替える（20要素の再生成を避ける）。
- 文字は絵文字フォント依存。**フォントは埋め込まない**（サイズ削減）。
  ただし端末差で絵文字が化ける可能性があるため、**将来的にSVGスプライトへ差し替え可能**な
  抽象（`<SymbolIcon def={def} />`）を最初から挟んでおく。
