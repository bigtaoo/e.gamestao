export type Rot = 0 | 1 | 2 | 3;

export interface PetState {
  name: string;
  bornAt: number;
  /** 四维状态，0–100 */
  hunger: number; // 饱食度：100 = 吃饱
  clean: number; // 清洁度
  energy: number; // 精力
  mood: number; // 心情
  intimacy: number; // 亲密度累计值
  /** 上次状态演算的 UTC 毫秒时间戳 */
  tickedAt: number;
  /** 入睡时刻；null = 醒着。睡觉时精力回得快、掉饱食慢 */
  sleepAt: number | null;
  /** 各互动的上次时间，用于冷却 */
  cd: Record<string, number>;
  /** 已领取每日照料奖励的日序号 */
  caredDay: number;
}

export interface AvatarState {
  body: string;
  eyes: string;
  blush: string;
  pattern: string;
  hat: string | null;
}

export interface PlacedItem {
  uid: string;
  defId: string;
  x: number;
  y: number;
  rot: Rot;
}

export interface RoomState {
  floor: string;
  wall: string;
  items: PlacedItem[];
}

export type MoodTag = '开心' | '平静' | '疲惫' | '难过' | '兴奋';

export interface DiaryEntry {
  id: string;
  at: number;
  mood: MoodTag;
  text: string;
}

export interface QuestState {
  /** 当日计数所属的日历日序号 */
  day: number;
  /** 今日计数，跨日清空 */
  daily: Record<string, number>;
  /** 终身累计，用于成就 */
  total: Record<string, number>;
  /** 已领取的任务 id（跨日只保留成就） */
  claimed: string[];
}

export interface AuthState {
  /** 服务端分配的账号 id 与令牌。token 为空 = 未登录 */
  userId: string | null;
  token: string | null;
  /** 账号名（= Pata 的名字），登录页回填用 */
  name: string | null;
  /** 自己的好友码，给别人添加用 */
  code: string | null;
  /** 上次成功上传存档的时间 */
  syncedAt: number;
}

export interface GameState {
  schemaVersion: number;
  createdAt: number;
  /** 上次退出时间，用于离线结算 */
  leftAt: number;
  coins: number;
  /** 金币的小数余量，避免高频小步结算被 floor 抹成 0 */
  coinFrac: number;
  hearts: number;
  pet: PetState;
  avatar: AvatarState;
  room: RoomState;
  /** 消耗品：食物/道具 → 数量 */
  bag: Record<string, number>;
  /** 已拥有的家具与配饰 defId */
  owned: string[];
  diary: DiaryEntry[];
  quests: QuestState;
  auth: AuthState;
  introDone: boolean;
}

export interface OfflineReport {
  awayMs: number;
  coins: number;
  cappedHours: number;
  hungerLost: number;
  cleanLost: number;
  moodDelta: number;
}
