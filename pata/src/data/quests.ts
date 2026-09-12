/** 任务定义。counter 对应 systems/quests.ts 里的计数器 key。 */

export type QuestKind = 'daily' | 'achieve';

export interface QuestDef {
  id: string;
  name: string;
  icon: string;
  counter: string;
  goal: number;
  coins: number;
  kind: QuestKind;
  /** 成就额外给爱心 */
  hearts?: number;
}

export const QUESTS: QuestDef[] = [
  // ── 每日 ──────────────────────────────────────────────
  { id: 'd_feed', name: '喂 3 次饭', icon: '🍖', counter: 'feed', goal: 3, coins: 60, kind: 'daily' },
  { id: 'd_wash', name: '洗一次澡', icon: '🫧', counter: 'wash', goal: 1, coins: 45, kind: 'daily' },
  { id: 'd_play', name: '陪玩 2 次', icon: '🎾', counter: 'play', goal: 2, coins: 70, kind: 'daily' },
  { id: 'd_caress', name: '摸摸 5 次', icon: '✋', counter: 'caress', goal: 5, coins: 35, kind: 'daily' },
  { id: 'd_sleep', name: '让它睡一觉', icon: '😴', counter: 'sleep', goal: 1, coins: 40, kind: 'daily' },
  { id: 'd_diary', name: '写一篇日记', icon: '📓', counter: 'diary', goal: 1, coins: 50, kind: 'daily' },
  { id: 'd_place', name: '摆一件家具', icon: '🪑', counter: 'place', goal: 1, coins: 40, kind: 'daily' },
  { id: 'd_visit', name: '去 2 个邻居家串门', icon: '🚪', counter: 'visit', goal: 2, coins: 80, kind: 'daily' },
  { id: 'd_help', name: '帮邻居喂 2 次饭', icon: '🤝', counter: 'help', goal: 2, coins: 90, kind: 'daily' },

  // ── 成就（终身累计） ──────────────────────────────────
  { id: 'a_feed50', name: '累计喂食 50 次', icon: '🍚', counter: 'feed', goal: 50, coins: 300, kind: 'achieve', hearts: 5 },
  { id: 'a_play30', name: '累计陪玩 30 次', icon: '🧶', counter: 'play', goal: 30, coins: 300, kind: 'achieve', hearts: 5 },
  { id: 'a_diary10', name: '写满 10 篇日记', icon: '✒️', counter: 'diary', goal: 10, coins: 400, kind: 'achieve', hearts: 8 },
  { id: 'a_place20', name: '摆放 20 件家具', icon: '🛋️', counter: 'place', goal: 20, coins: 400, kind: 'achieve', hearts: 8 },
  { id: 'a_visit20', name: '串门 20 次', icon: '🧭', counter: 'visit', goal: 20, coins: 500, kind: 'achieve', hearts: 10 },
];

export const DAILY_QUESTS = QUESTS.filter((q) => q.kind === 'daily');
export const ACHIEVEMENTS = QUESTS.filter((q) => q.kind === 'achieve');
export const questById = (id: string) => QUESTS.find((q) => q.id === id);
