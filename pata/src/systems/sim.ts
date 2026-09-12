import { FURNITURE, floorById, wallById } from '../data/furniture';
import type { GameState, OfflineReport } from '../model/types';
import { HOUR, clamp } from '../core/util';

/** 离线收益最多累计的小时数 */
export const OFFLINE_CAP_H = 8;

/** 每小时衰减速率 */
const RATE = {
  hunger: 6.5,
  clean: 4,
  /** 精力是「休息回复」，不活动就涨 */
  energyRegen: 9,
  /** 心情向目标值收敛的速度 */
  moodConverge: 14,
};

/** 房间舒适度 = 家具 + 地板 + 墙纸 + 齐套加成 */
export function comfortOf(state: GameState): number {
  let base = 0;
  const bySet: Record<string, number> = {};
  for (const it of state.room.items) {
    const def = FURNITURE.find((f) => f.id === it.defId);
    if (!def) continue;
    base += def.comfort;
    bySet[def.set] = (bySet[def.set] ?? 0) + 1;
  }
  base += floorById(state.room.floor).comfort;
  base += wallById(state.room.wall).comfort;
  // 同套装每满 3 件 +15%
  let bonus = 0;
  for (const [set, n] of Object.entries(bySet)) {
    if (set !== 'basic' && n >= 3) bonus += 0.15;
  }
  return Math.round(base * (1 + bonus));
}

/** 房间里有没有床 */
export function hasBed(state: GameState): boolean {
  return state.room.items.some((it) => FURNITURE.find((f) => f.id === it.defId)?.kind === 'bed');
}

/** 舒适度 → 心情上限（100 需要约 220 舒适度） */
export function comfortMoodCap(comfort: number): number {
  return clamp(55 + comfort * 0.2, 55, 100);
}

/** 每小时金币产出 */
export function coinRate(state: GameState): number {
  const comfort = comfortOf(state);
  const { lv } = levelOf(state.pet.intimacy);
  return (4 + comfort * 0.06 + lv * 1.2) * (0.35 + (state.pet.mood / 100) * 0.65);
}

export interface LevelInfo {
  lv: number;
  cur: number;
  need: number;
}

export const MAX_LEVEL = 99;
/** 首级门槛压低：新用户前几次互动就该看到解锁，否则商店里几乎全是锁 */
const FIRST_NEED = 35;
const NEED_GROWTH = 1.35;

/** 亲密度 → 等级。每级所需递增 35%。 */
export function levelOf(intimacy: number): LevelInfo {
  let lv = 1;
  let need = FIRST_NEED;
  let rest = Math.max(0, Math.floor(intimacy));
  while (rest >= need && lv < MAX_LEVEL) {
    rest -= need;
    lv++;
    need = Math.round(need * NEED_GROWTH);
  }
  return { lv, cur: rest, need };
}

/** 升到指定等级刚好需要的亲密度累计值 */
export function intimacyForLevel(target: number): number {
  let total = 0;
  let need = FIRST_NEED;
  for (let lv = 1; lv < Math.min(target, MAX_LEVEL); lv++) {
    total += need;
    need = Math.round(need * NEED_GROWTH);
  }
  return total;
}

/**
 * 把状态推进到 now。纯时间戳差值驱动，前台每帧调用和离线几小时后调用走的是同一条路径。
 * 返回本次推进的结算信息（前台调用时数值极小，调用方自行判断是否展示）。
 */
export function advance(state: GameState, now: number): OfflineReport {
  const pet = state.pet;
  const awayMs = Math.max(0, now - pet.tickedAt);
  pet.tickedAt = now;

  const h = awayMs / HOUR;
  if (h <= 0) {
    return { awayMs: 0, coins: 0, cappedHours: 0, hungerLost: 0, cleanLost: 0, moodDelta: 0 };
  }

  const before = { hunger: pet.hunger, clean: pet.clean, mood: pet.mood };

  // 睡觉：精力回得快、饿得慢。有床再加成——这是「装修有用」的又一条落点。
  // 倍率要够大：按 3.5 倍算，从 20 睡到满要两个多小时，玩家点完看不到任何变化，
  // 反馈等于零。14 倍下一觉约半小时回满，有床约 20 分钟，一次游玩内能感知到。
  const asleep = pet.sleepAt !== null;
  const bed = asleep && hasBed(state) ? 1.5 : 1;
  const energyMul = asleep ? 14 * bed : 1;
  const hungerMul = asleep ? 0.45 : 1;

  pet.hunger = clamp(pet.hunger - RATE.hunger * hungerMul * h);
  pet.clean = clamp(pet.clean - RATE.clean * h);
  pet.energy = clamp(pet.energy + RATE.energyRegen * energyMul * h);

  // 心情目标由「照顾得好不好」+「住得舒不舒服」共同决定
  const comfort = comfortOf(state);
  const care = pet.hunger * 0.55 + pet.clean * 0.45;
  const target = clamp(Math.min(care, comfortMoodCap(comfort)));
  // 指数收敛，与步长无关
  pet.mood = clamp(target + (pet.mood - target) * Math.exp(-(RATE.moodConverge / 100) * h));

  // 金币按「结算前后心情的均值」估算产出，离线封顶。
  // 前台每帧步长极小，小数余量必须留着，否则 floor 会把收益全部抹成 0。
  const earnH = Math.min(h, OFFLINE_CAP_H);
  const avgMood = (before.mood + pet.mood) / 2;
  const rate = coinRate({ ...state, pet: { ...pet, mood: avgMood } });
  const raw = rate * earnH + (state.coinFrac ?? 0);
  const coins = Math.floor(raw);
  state.coinFrac = raw - coins;
  state.coins += coins;

  return {
    awayMs,
    coins,
    cappedHours: h > OFFLINE_CAP_H ? OFFLINE_CAP_H : 0,
    hungerLost: Math.round(before.hunger - pet.hunger),
    cleanLost: Math.round(before.clean - pet.clean),
    moodDelta: Math.round(pet.mood - before.mood),
  };
}

/** 综合状态 → 表情，驱动宠物的眼睛和嘴 */
export type PetFeeling = 'happy' | 'ok' | 'hungry' | 'dirty' | 'tired' | 'sad';

export function feelingOf(state: GameState): PetFeeling {
  const p = state.pet;
  if (p.sleepAt !== null) return 'tired';
  if (p.mood < 25) return 'sad';
  if (p.hunger < 25) return 'hungry';
  if (p.clean < 25) return 'dirty';
  if (p.energy < 20) return 'tired';
  if (p.mood >= 72) return 'happy';
  return 'ok';
}

export const FEELING_TEXT: Record<PetFeeling, string[]> = {
  happy: ['今天也超喜欢你！', '哼哼～心情特别好', '想跟你一起发呆', '房间好舒服呀'],
  ok: ['在发呆…', '有点无聊诶', '要摸摸我吗', '你回来啦'],
  hungry: ['肚子在叫了…', '有吃的吗', '饿饿，想吃东西'],
  dirty: ['身上黏黏的…', '想洗个澡', '有点脏脏的'],
  tired: ['困了…想睡觉', '眼皮好重', '让我歇一会儿', '点「睡觉」让我躺会儿吧'],
  sad: ['你好久没来了…', '有点难过', '抱抱我好不好'],
};
