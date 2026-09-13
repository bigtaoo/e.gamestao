import { S, store } from '../model/store';
import { fetchMe, isLoggedIn } from '../net/api';

/**
 * 结算服务端攒下的「信件」：好友帮喂的饭 + 管理员发的金币。
 *
 * 为什么必须收敛成一个函数：`GET /api/me` 是**取走即销账**的——读一次，
 * 服务端那边的 inbox 和 grants 就清空了。要是启动时和好友面板各自去调一次
 * fetchMe，先跑的那个会把另一个要结算的东西一起冲掉（金币到账了但没加饱食度，
 * 或者反过来）。所以两处都走这里，拿到什么就一次性全结算掉。
 */

const COINS_PER_FEED = 15;

export interface MailResult {
  /** 给用户看的提示，按发生顺序 */
  messages: string[];
  /** 本次到账的金币净额 */
  coins: number;
}

export async function settleMail(): Promise<MailResult> {
  const out: MailResult = { messages: [], coins: 0 };
  if (!isLoggedIn()) return out;

  const me = await fetchMe();
  const st = S();
  let dirty = false;

  // 好友帮喂的饭
  const inbox = me.inbox ?? [];
  if (inbox.length) {
    st.pet.hunger = Math.min(100, st.pet.hunger + inbox.length * 8);
    st.pet.mood = Math.min(100, st.pet.mood + inbox.length * 4);
    const coins = inbox.length * COINS_PER_FEED;
    st.coins += coins;
    out.coins += coins;
    out.messages.push(`${inbox.map((i) => i.from).join('、')} 帮你喂了饭`);
    dirty = true;
  }

  // 管理员发的金币
  const grants = me.grants ?? [];
  for (const g of grants) {
    const n = Math.trunc(Number(g.coins)) || 0;
    if (!n) continue;
    // 扣款可能扣成负数，兜到 0——负金币会让商店的判断全乱套
    st.coins = Math.max(0, st.coins + n);
    out.coins += n;
    const label = n > 0 ? `收到 ${n} 金币` : `被扣除 ${-n} 金币`;
    out.messages.push(g.note ? `${label}：${g.note}` : label);
    dirty = true;
  }

  if (dirty) {
    // 立刻落盘。服务端那份已经销账了，这里要是只放在内存里，
    // 用户直接关掉标签页这笔钱就凭空消失了
    store.flush();
    store.changed();
  }
  return out;
}
