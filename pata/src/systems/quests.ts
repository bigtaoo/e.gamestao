import { QUESTS, questById, type QuestDef } from '../data/quests';
import { S, store } from '../model/store';
import { dayIndex } from '../core/util';

export interface QuestView {
  def: QuestDef;
  progress: number;
  done: boolean;
  claimed: boolean;
}

/** 跨自然日时清空当日计数与当日已领标记 */
function rollover(): void {
  const q = S().quests;
  const today = dayIndex(Date.now());
  if (q.day === today) return;
  q.day = today;
  q.daily = {};
  q.claimed = q.claimed.filter((id) => questById(id)?.kind === 'achieve');
}

/** 动作系统的埋点入口：同时累计「今日」和「终身」 */
export function bump(counter: string, n = 1): void {
  rollover();
  const q = S().quests;
  q.daily[counter] = (q.daily[counter] ?? 0) + n;
  q.total[counter] = (q.total[counter] ?? 0) + n;
}

function progressOf(def: QuestDef): number {
  const q = S().quests;
  return def.kind === 'daily' ? (q.daily[def.counter] ?? 0) : (q.total[def.counter] ?? 0);
}

export function viewOf(def: QuestDef): QuestView {
  const progress = Math.min(progressOf(def), def.goal);
  return {
    def,
    progress,
    done: progress >= def.goal,
    claimed: S().quests.claimed.includes(def.id),
  };
}

export function questViews(kind: 'daily' | 'achieve'): QuestView[] {
  rollover();
  return QUESTS.filter((q) => q.kind === kind).map(viewOf);
}

/** 可领取但还没领的数量，用于导航红点 */
export function claimableCount(): number {
  rollover();
  return QUESTS.reduce((n, def) => {
    const v = viewOf(def);
    return n + (v.done && !v.claimed ? 1 : 0);
  }, 0);
}

export interface ClaimResult {
  ok: boolean;
  msg: string;
}

export function claim(id: string): ClaimResult {
  rollover();
  const def = questById(id);
  if (!def) return { ok: false, msg: '没有这个任务' };
  const v = viewOf(def);
  if (v.claimed) return { ok: false, msg: '已经领过了' };
  if (!v.done) return { ok: false, msg: '还没完成' };

  S().coins += def.coins;
  if (def.hearts) S().hearts += def.hearts;
  S().quests.claimed.push(id);
  store.changed();
  return {
    ok: true,
    msg: def.hearts ? `+${def.coins} 金币　♥ ${def.hearts}` : `+${def.coins} 金币`,
  };
}

/** 一键领取所有已完成的 */
export function claimAll(): ClaimResult {
  rollover();
  let coins = 0;
  let hearts = 0;
  for (const def of QUESTS) {
    const v = viewOf(def);
    if (!v.done || v.claimed) continue;
    coins += def.coins;
    hearts += def.hearts ?? 0;
    S().quests.claimed.push(def.id);
  }
  if (!coins && !hearts) return { ok: false, msg: '没有可领取的任务' };
  S().coins += coins;
  S().hearts += hearts;
  store.changed();
  return { ok: true, msg: hearts ? `+${coins} 金币　♥ ${hearts}` : `+${coins} 金币` };
}
