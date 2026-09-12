import type { GameState } from './types';
import { uid } from '../core/util';

const KEY = 'pata.save.v1';
/** 2: 团子换成垂耳兔，体色改为渐变，新增 gentle 眼型与 halo 头饰 */
const SCHEMA = 3;

/** v3 删掉的兔兔屋家具。留着不会崩（取不到 def 的地方都有守卫），但会变成永远清不掉的死条目 */
const REMOVED_V3 = [
  'b_house_y', 'b_house_p', 'b_house_v',
  'b_bed_p', 'b_bed_y', 'b_table',
  'b_stool_y', 'b_stool_p',
  'b_sofa_v', 'b_sofa_p', 'b_sofa_y',
];

export const ROOM_W = 8;
export const ROOM_H = 8;

export function createDefault(now = Date.now()): GameState {
  return {
    schemaVersion: SCHEMA,
    createdAt: now,
    leftAt: now,
    coins: 320,
    coinFrac: 0,
    hearts: 0,
    pet: {
      name: 'Pata',
      bornAt: now,
      hunger: 78,
      clean: 85,
      energy: 90,
      mood: 76,
      intimacy: 0,
      tickedAt: now,
      sleepAt: null,
      cd: {},
      caredDay: -1,
    },
    avatar: {
      body: 'angel',
      eyes: 'gentle',
      blush: 'gold',
      pattern: 'plain',
      // 不自动戴配饰：立绘自带光环时会叠成两个
      hat: null,
    },
    room: {
      floor: 'wood',
      wall: 'cream',
      items: [
        { uid: uid('f'), defId: 'rug_dot', x: 3, y: 3, rot: 0 },
        { uid: uid('f'), defId: 'stool_wood', x: 6, y: 2, rot: 0 },
        { uid: uid('f'), defId: 'plant_small', x: 0, y: 6, rot: 0 },
      ],
    },
    bag: { biscuit: 3, fish: 1 },
    owned: ['rug_dot', 'stool_wood', 'plant_small'],
    diary: [],
    quests: { day: -1, daily: {}, total: {}, claimed: [] },
    auth: { userId: null, token: null, name: null, code: null, syncedAt: 0 },
    introDone: false,
  };
}

/** 旧档迁移链 */
function migrate(raw: Record<string, unknown>): GameState {
  const v = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (v > SCHEMA) throw new Error('存档来自更新的版本');
  // 用默认值补齐缺失字段，避免加字段就炸档
  const base = createDefault();
  const s = { ...base, ...(raw as Partial<GameState>) } as GameState;
  s.pet = { ...base.pet, ...(raw.pet as object) };
  s.avatar = { ...base.avatar, ...(raw.avatar as object) };
  s.room = { ...base.room, ...(raw.room as object) };
  s.pet.cd ??= {};
  s.bag ??= {};
  s.owned ??= [];
  s.diary ??= [];
  s.quests = { ...base.quests, ...(raw.quests as object) };
  // v4 前这块字段叫 friend（那时只是匿名好友身份），现在装的是账号凭据
  s.auth = { ...base.auth, ...((raw.auth ?? raw.friend) as object) };

  if (v < 2) {
    // 'cream' 体色已被渐变版取代
    if (s.avatar.body === 'cream') s.avatar.body = 'angel';
    // 只改「从没主动挑过」的默认项，已买的装扮一律保留
    if (s.avatar.eyes === 'happy' || s.avatar.eyes === 'dot') s.avatar.eyes = 'gentle';
  }

  if (v < 3) {
    // 摆出来的和背包里的一起清；不退钱，这批本来就是占位美术
    s.room.items = s.room.items.filter((it) => !REMOVED_V3.includes(it.defId));
    s.owned = s.owned.filter((id) => !REMOVED_V3.includes(id));
  }

  s.schemaVersion = SCHEMA;
  return s;
}

/**
 * 用服务端拉下来的存档替换本地档。
 *
 * 关键：**auth 必须保留当前这份**。上传的 blob 里带着上传当时的 token，
 * 而登录会轮换 token——照搬下来等于把自己刚拿到的令牌换成一个已失效的，
 * 下一次请求就 401 被踢回登录页。
 */
export function applyRemoteSave(raw: Record<string, unknown>): void {
  const keep = { ...store.state.auth };
  const next = migrate(raw);
  next.auth = keep;
  // tickedAt 来自另一台设备，可能远在未来或过去；按本地时钟重新起算，
  // 否则 advance() 会一次性结算出一大笔离线收益或倒扣一堆状态
  next.pet.tickedAt = Date.now();
  next.leftAt = Date.now();
  store.state = next;
  store.flush();
  store.changed();
}

type Listener = () => void;

class Store {
  state: GameState;
  private listeners = new Set<Listener>();
  private flushTimer: number | null = null;

  constructor() {
    this.state = this.load();
  }

  private load(): GameState {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return createDefault();
      return migrate(JSON.parse(raw) as Record<string, unknown>);
    } catch (e) {
      console.warn('[pata] 存档损坏，已重置', e);
      return createDefault();
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 状态变了：通知 UI 重绘 + 排队落盘 */
  changed(): void {
    for (const fn of this.listeners) fn();
    this.queueSave();
  }

  private queueSave(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 1200);
  }

  flush(): void {
    try {
      this.state.leftAt = Date.now();
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[pata] 存档写入失败', e);
    }
  }

  reset(): void {
    this.state = createDefault();
    this.flush();
    this.changed();
  }
}

export const store = new Store();
export const S = () => store.state;

// 切后台 / 关页面时强制落盘
window.addEventListener('pagehide', () => store.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
});
