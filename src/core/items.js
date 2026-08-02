/** ショップで買える恒久パッシブ。盤面には並ばない。所持上限 5。 */

export const ITEMS = {
  wallet: {
    id: 'wallet', name: 'ボロ財布', emoji: '👛', price: 30,
    desc: 'スピンするたび +3 コイン',
  },
  suggestbox: {
    id: 'suggestbox', name: '大家の目安箱', emoji: '📮', price: 60,
    desc: 'シンボルの選択肢が 1つ増える',
  },
  tea: {
    id: 'tea', name: '大家のお茶', emoji: '☕', price: 60,
    desc: '各期の最初のスピンの合計を ×2',
  },
  dice: {
    id: 'dice', name: '縁起のいいサイコロ', emoji: '🎲', price: 60,
    desc: 'レア以上が出やすくなる',
  },
  mover: {
    id: 'mover', name: '引っ越し業者', emoji: '🚚', price: 60,
    desc: '除去コストが毎期リセットされる',
  },
  receipt: {
    id: 'receipt', name: '領収書', emoji: '🧾', price: 120,
    desc: '家賃を払うと 10% 戻ってくる',
  },
  guarantee: {
    id: 'guarantee', name: '家賃保証書', emoji: '📄', price: 120,
    desc: '支払いの失敗を 1回だけ帳消しにする',
  },
};

export const ITEM_LIST = Object.values(ITEMS);
export const MAX_ITEMS = 5;

export function hasItem(state, id) {
  return state.items.includes(id);
}
