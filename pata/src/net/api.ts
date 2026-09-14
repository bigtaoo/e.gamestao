import { S, store } from '../model/store';
import { comfortOf, levelOf } from '../systems/sim';

/** 开发期默认打本地服务；上云改这里或设 VITE_API_BASE */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:5183';

export interface FriendProfile {
  userId: string;
  name: string;
  level: number;
  avatar: unknown;
  comfort: number;
  updatedAt: number;
  isFriend?: boolean;
}

export interface InboxItem {
  from: string;
  at: number;
  kind: string;
}

/** 管理后台发的金币。取走即销账，客户端拿到就得立刻记进存档 */
export interface GrantItem {
  id: string;
  coins: number;
  note: string;
  at: number;
}

export class ApiError extends Error {}
/** 令牌失效（别处登录过，或服务端重置了）。调用方应把用户送回登录页 */
export class AuthError extends ApiError {}
/**
 * 请求没能完成：断网、服务没起、跨域被挡、超时。
 * 和「服务端返回了错误」是两回事——后者有中文文案，前者只有浏览器的英文原生消息
 * （`Failed to fetch`），直接抛给界面就是一句用户看不懂的英文。
 */
export class NetworkError extends ApiError {}

/** 超过这个时间还没响应就当连不上。没有它，半开连接会让界面永远卡在「连接中…」 */
const TIMEOUT_MS = 10_000;

/** 令牌失效时的回调，由 app 注册成「踢回登录页」 */
let onAuthLost: (() => void) | null = null;
export const setAuthLostHandler = (fn: () => void) => {
  onAuthLost = fn;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = S().auth.token;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (e) {
    // 走到这里说明请求根本没拿到响应。浏览器给的消息是英文的
    // （`Failed to fetch` / `signal timed out`），在这里就换成中文，
    // 免得每个调用方各自去判断、漏一个就漏一句英文到界面上。
    throw new NetworkError(
      (e as Error | undefined)?.name === 'TimeoutError'
        ? '服务器没有响应，请稍后再试'
        : '连不上服务器，请检查网络，或确认好友服务已经启动',
    );
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && token) {
    // 登录会轮换 token，所以这通常意味着这个号在别处登录了
    S().auth.token = null;
    store.changed();
    onAuthLost?.();
    throw new AuthError(String(body.error ?? '登录已失效'));
  }
  // body.error 是服务端给的中文文案；没有就说明服务端没按约定回，别把状态码原样抛出去
  if (!res.ok) throw new ApiError(String(body.error ?? `服务器出错了（${res.status}）`));
  return body as T;
}

/** 当前存档对应的房间快照 */
function snapshot() {
  const st = S();
  return {
    name: st.pet.name,
    level: levelOf(st.pet.intimacy).lv,
    comfort: comfortOf(st),
    avatar: st.avatar,
    room: st.room,
  };
}

export const isLoggedIn = () => !!S().auth.token;

interface AuthReply {
  userId: string;
  token: string;
  code: string;
  name: string;
  saveAt?: number;
}

function adopt(r: AuthReply): void {
  const a = S().auth;
  a.userId = r.userId;
  a.token = r.token;
  a.code = r.code;
  a.name = r.name;
  a.syncedAt = Date.now();
  store.changed();
}

/** 注册：取名 + 设密码，顺带把本地这份存档传上去当初始档 */
export async function register(name: string, password: string): Promise<void> {
  const r = await call<AuthReply>('/api/register', {
    method: 'POST',
    // snapshot() 里也有 name（宠物名），放在后面会盖掉账号名——这里要的是账号名
    body: JSON.stringify({ ...snapshot(), name, password, save: S() }),
  });
  adopt(r);
}

/** 登录。返回服务端存档的时间戳，调用方据此决定要不要覆盖本地 */
export async function login(name: string, password: string): Promise<number> {
  const r = await call<AuthReply>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ name, password }),
  });
  adopt(r);
  return r.saveAt ?? 0;
}

export function logout(): void {
  const a = S().auth;
  a.token = null;
  a.userId = null;
  a.code = null;
  store.changed();
}

/** 拉取服务端存档 */
export async function fetchSave(): Promise<{ save: unknown; saveAt: number }> {
  return call('/api/save', {});
}

/** 上传整份存档。失败不抛给调用方——离线时不该阻断本地玩法 */
export async function pushSave(): Promise<boolean> {
  if (!isLoggedIn()) return false;
  try {
    await call('/api/save', { method: 'PUT', body: JSON.stringify({ save: S() }) });
    await call('/api/me', { method: 'PUT', body: JSON.stringify(snapshot()) });
    S().auth.syncedAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

/** 注意：这是个**取走即销账**的接口，inbox 和 grants 读一次就没了。
 *  别直接调它，走 systems/mail 的 settleMail()，那里保证两样都结算到。 */
export async function fetchMe(): Promise<{
  code: string;
  inbox: InboxItem[];
  grants: GrantItem[];
}> {
  return call('/api/me');
}

export async function listFriends(): Promise<FriendProfile[]> {
  const r = await call<{ friends: FriendProfile[] }>('/api/friends');
  return r.friends;
}

export async function addFriend(code: string): Promise<FriendProfile> {
  const r = await call<{ friend: FriendProfile }>('/api/friends', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return r.friend;
}

export async function visit(id: string): Promise<FriendProfile & { room: unknown }> {
  return call(`/api/visit?id=${encodeURIComponent(id)}`);
}

export async function helpFeed(id: string): Promise<void> {
  await call('/api/help', { method: 'POST', body: JSON.stringify({ id }) });
}
