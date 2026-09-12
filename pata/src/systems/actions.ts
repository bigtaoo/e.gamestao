import { foodById } from '../data/food';
import { FLOORS, FURNITURE, WALLS, furniById } from '../data/furniture';
import { BLUSHES, BODIES, EYES, HATS, PATTERNS } from '../data/avatar';
import { S, store } from '../model/store';
import { clamp, dayIndex } from '../core/util';
import { hasBed, levelOf } from './sim';
import { bump } from './quests';

export type Fx = 'heart' | 'bubble' | 'crumb' | 'star' | 'note' | 'zzz';

export interface ActionResult {
  ok: boolean;
  msg: string;
  fx?: Fx;
  /** 本次是否升级 */
  levelUp?: number;
}

const COOLDOWN: Record<string, number> = {
  wash: 25 * 60_000,
  caress: 90_000,
  play: 8 * 60_000,
};

export function cooldownLeft(key: string): number {
  const until = (S().pet.cd[key] ?? 0) + (COOLDOWN[key] ?? 0);
  return Math.max(0, until - Date.now());
}

/** 加亲密度并检测升级；升级返回新等级 */
function addIntimacy(n: number): number | undefined {
  const pet = S().pet;
  const before = levelOf(pet.intimacy).lv;
  pet.intimacy += n;
  const after = levelOf(pet.intimacy).lv;
  if (after > before) {
    S().hearts += 5 * (after - before);
    return after;
  }
  return undefined;
}

/** 每天第一次互动给一份照料奖励 */
function dailyBonus(): number {
  const today = dayIndex(Date.now());
  if (S().pet.caredDay === today) return 0;
  S().pet.caredDay = today;
  const bonus = 80;
  S().coins += bonus;
  return bonus;
}

function done(res: ActionResult): ActionResult {
  const bonus = res.ok ? dailyBonus() : 0;
  store.changed();
  if (bonus) return { ...res, msg: `${res.msg}　今日照料 +${bonus} 金币` };
  return res;
}

export function feed(foodId: string): ActionResult {
  const blocked = wakeGuard();
  if (blocked) return blocked;
  const def = foodById(foodId);
  if (!def) return { ok: false, msg: '没有这种食物' };
  const n = S().bag[foodId] ?? 0;
  if (n <= 0) return { ok: false, msg: '背包里没有了，去商店买点吧' };

  const pet = S().pet;
  if (pet.hunger >= 97) return { ok: false, msg: `${pet.name} 已经撑得走不动了` };

  S().bag[foodId] = n - 1;
  if (S().bag[foodId] <= 0) delete S().bag[foodId];
  pet.hunger = clamp(pet.hunger + def.hunger);
  pet.mood = clamp(pet.mood + def.mood);
  bump('feed');
  const lv = addIntimacy(6);
  return done({ ok: true, msg: `${pet.name} 吃掉了${def.name}`, fx: 'crumb', levelUp: lv });
}

export function wash(): ActionResult {
  const blocked = wakeGuard();
  if (blocked) return blocked;
  const pet = S().pet;
  if (pet.clean >= 95) return { ok: false, msg: `${pet.name} 现在干干净净的` };
  const cd = cooldownLeft('wash');
  if (cd > 0) return { ok: false, msg: `刚洗过澡，${Math.ceil(cd / 60000)} 分钟后再来` };

  pet.clean = 100;
  pet.mood = clamp(pet.mood + 8);
  pet.cd.wash = Date.now();
  bump('wash');
  const lv = addIntimacy(8);
  return done({ ok: true, msg: `${pet.name} 被搓得香香的`, fx: 'bubble', levelUp: lv });
}

export function caress(): ActionResult {
  const pet = S().pet;
  // 摸摸不拦：轻轻碰一下正好把它叫醒，这是最自然的「唤醒」手势
  if (pet.sleepAt !== null) return toggleSleep();
  const cd = cooldownLeft('caress');
  if (cd > 0) return { ok: false, msg: `${pet.name} 刚被摸过，有点害羞` };

  pet.mood = clamp(pet.mood + 5);
  pet.cd.caress = Date.now();
  bump('caress');
  const lv = addIntimacy(3);
  return done({ ok: true, msg: `${pet.name} 蹭了蹭你的手`, fx: 'heart', levelUp: lv });
}

export function play(): ActionResult {
  const blocked = wakeGuard();
  if (blocked) return blocked;
  const pet = S().pet;
  if (pet.energy < 25) return { ok: false, msg: `${pet.name} 没力气了，让它歇会儿` };
  const cd = cooldownLeft('play');
  if (cd > 0) return { ok: false, msg: `玩累了，${Math.ceil(cd / 60000)} 分钟后再来` };

  pet.energy = clamp(pet.energy - 25);
  pet.hunger = clamp(pet.hunger - 6);
  pet.mood = clamp(pet.mood + 18);
  pet.cd.play = Date.now();
  bump('play');
  const lv = addIntimacy(10);
  return done({ ok: true, msg: `一起玩了一会儿，${pet.name} 很开心`, fx: 'note', levelUp: lv });
}

export const isAsleep = () => S().pet.sleepAt !== null;

/** 睡觉 / 叫醒。精力唯一的主动恢复手段 */
export function toggleSleep(): ActionResult {
  const pet = S().pet;
  if (pet.sleepAt !== null) {
    const mins = Math.round((Date.now() - pet.sleepAt) / 60000);
    pet.sleepAt = null;
    store.changed();
    return { ok: true, msg: mins >= 1 ? `${pet.name} 睡了 ${mins} 分钟，精神多了` : `${pet.name} 醒了` };
  }
  if (pet.energy >= 96) return { ok: false, msg: `${pet.name} 一点都不困` };
  pet.sleepAt = Date.now();
  bump('sleep');
  const lv = addIntimacy(2);
  return done({
    ok: true,
    msg: hasBed(S()) ? `${pet.name} 缩进被窝了` : `${pet.name} 就地睡着了（有张床会睡得更好）`,
    fx: 'zzz',
    levelUp: lv,
  });
}

/** 睡着时别的互动一律先叫醒，免得出现「边睡边洗澡」 */
function wakeGuard(): ActionResult | null {
  if (!isAsleep()) return null;
  return { ok: false, msg: `${S().pet.name} 睡着了，先叫醒它吧` };
}

// ── 商店 ────────────────────────────────────────────────────

export type ShopKind = 'food' | 'furni' | 'floor' | 'wall' | 'avatar';

function spend(price: number): boolean {
  if (S().coins < price) return false;
  S().coins -= price;
  return true;
}

export function buy(kind: ShopKind, id: string): ActionResult {
  const st = S();
  if (kind === 'food') {
    const def = foodById(id);
    if (!def) return { ok: false, msg: '没有这件商品' };
    if (levelOf(st.pet.intimacy).lv < def.unlockLv) return { ok: false, msg: `等级 ${def.unlockLv} 解锁` };
    if (!spend(def.price)) return { ok: false, msg: '金币不够' };
    st.bag[id] = (st.bag[id] ?? 0) + 1;
    store.changed();
    return { ok: true, msg: `买了 1 个${def.name}` };
  }

  if (kind === 'furni') {
    const def = furniById(id);
    if (!def) return { ok: false, msg: '没有这件商品' };
    if (levelOf(st.pet.intimacy).lv < def.unlockLv) return { ok: false, msg: `等级 ${def.unlockLv} 解锁` };
    if (!spend(def.price)) return { ok: false, msg: '金币不够' };
    st.owned.push(id);
    store.changed();
    return { ok: true, msg: `${def.name} 已放进家具背包` };
  }

  if (kind === 'floor' || kind === 'wall') {
    const list = kind === 'floor' ? FLOORS : WALLS;
    const def = list.find((f) => f.id === id);
    if (!def) return { ok: false, msg: '没有这件商品' };
    const key = `${kind}:${id}`;
    if (!st.owned.includes(key) && def.price > 0) {
      if (!spend(def.price)) return { ok: false, msg: '金币不够' };
      st.owned.push(key);
    }
    if (kind === 'floor') st.room.floor = id;
    else st.room.wall = id;
    store.changed();
    return { ok: true, msg: `换成了${def.name}` };
  }

  // avatar: id 形如 "body:peach"
  const [slot, partId] = id.split(':');
  const price = avatarPrice(slot, partId);
  if (price === null) return { ok: false, msg: '没有这件商品' };
  const key = `avatar:${id}`;
  if (price > 0 && !st.owned.includes(key)) {
    if (!spend(price)) return { ok: false, msg: '金币不够' };
    st.owned.push(key);
  }
  applyAvatar(slot, partId);
  store.changed();
  return { ok: true, msg: '换好啦' };
}

export function avatarPrice(slot: string, id: string): number | null {
  const table: Record<string, { id: string; price: number }[]> = {
    body: BODIES,
    eyes: EYES,
    blush: BLUSHES,
    pattern: PATTERNS,
    hat: HATS,
  };
  const found = table[slot]?.find((x) => x.id === id);
  return found ? found.price : null;
}

export function avatarOwned(slot: string, id: string): boolean {
  const price = avatarPrice(slot, id);
  if (price === null) return false;
  return price === 0 || S().owned.includes(`avatar:${slot}:${id}`);
}

export function applyAvatar(slot: string, id: string): void {
  const a = S().avatar;
  if (slot === 'body') a.body = id;
  else if (slot === 'eyes') a.eyes = id;
  else if (slot === 'blush') a.blush = id;
  else if (slot === 'pattern') a.pattern = id;
  else if (slot === 'hat') a.hat = a.hat === id ? null : id;
}

/** 家具背包：已购但未摆出来的 */
export function trayItems(): { defId: string; left: number }[] {
  const st = S();
  const placed: Record<string, number> = {};
  for (const it of st.room.items) placed[it.defId] = (placed[it.defId] ?? 0) + 1;
  const bought: Record<string, number> = {};
  for (const id of st.owned) {
    if (id.includes(':')) continue;
    bought[id] = (bought[id] ?? 0) + 1;
  }
  return FURNITURE.filter((d) => (bought[d.id] ?? 0) - (placed[d.id] ?? 0) > 0).map((d) => ({
    defId: d.id,
    left: (bought[d.id] ?? 0) - (placed[d.id] ?? 0),
  }));
}
