/**
 * Pata 好友服务 —— 零依赖，只用 node 内置模块。
 *
 * 设计取舍：**存档仍以客户端 localStorage 为准**，这里只保存一份「房间快照」
 * （昵称 / 等级 / 形象 / 房间布局）供好友查看。异步社交不需要实时状态同步，
 * 也就不需要把整个存档搬上服务端——那会立刻引出冲突合并、防作弊、账号找回一堆问题。
 *
 *   npm run server        默认 5183 端口，数据落在 server/data.json
 *   PORT=8080 npm run server
 */
import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAdmin } from './admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, 'data.json');
const TMP_PATH = `${DB_PATH}.tmp`;
const LOCK_PATH = `${DB_PATH}.lock`;
const PORT = Number(process.env.PORT) || 5183;

/**
 * 只有「成功载入过一次」才允许落盘。
 * bail() 退出时内存里的 db 还是空的，这时候要是让退出钩子跑一遍 flushNow()，
 * 就正好把空库盖到原文件上——那恰恰是本次要修掉的毁档路径。
 */
let ready = false;

// ── 单实例锁 ────────────────────────────────────────────────
// db 是一份内存对象、整文件覆盖式落盘，两个实例共用 data.json 会互相
// 整体覆盖（后写的赢，先写的那份用户凭空消失）。端口冲突挡不住这件事：
// `PORT=8080 npm run server` 时两个进程端口不同，照样共用同一个文件。
if (existsSync(LOCK_PATH)) {
  const holder = Number(readFileSync(LOCK_PATH, 'utf8').trim());
  let alive = false;
  try {
    process.kill(holder, 0); // 只探测存活，不发信号
    alive = true;
  } catch {
    alive = false; // 进程没了，锁是上次没清干净的残留
  }
  if (alive) {
    console.error(`[pata] 已有实例在跑（pid ${holder}），拒绝启动。`);
    console.error('[pata] 两个实例共用 data.json 会互相覆盖数据。先停掉那个再来。');
    process.exit(1);
  }
  console.warn(`[pata] 清掉残留的锁（pid ${holder} 已不存在）`);
  unlinkSync(LOCK_PATH);
}
writeFileSync(LOCK_PATH, String(process.pid));

// ── 载入 ────────────────────────────────────────────────────
/** @type {{users: Record<string, any>, byCode: Record<string,string>}} */
let db = { users: {}, byCode: {} };
if (existsSync(DB_PATH)) {
  let raw;
  try {
    raw = readFileSync(DB_PATH, 'utf8');
  } catch (e) {
    bail('读不了 data.json', e);
  }
  try {
    db = JSON.parse(raw);
  } catch (e) {
    // 这里绝不能「从空库启动」：下一次 save() 会把空库写回去，
    // 原文件里还能抢救的内容就彻底没了。宁可起不来，也别毁档。
    bail(
      'data.json 解析失败。已停止启动，原文件原封不动。\n' +
        `        修好或改名后再启动：${DB_PATH}`,
      e,
    );
  }
}
db.users ??= {};
db.byCode ??= {};
// 名字 → userId 的索引。老库里没有这张表，用现有用户补建
db.byName ??= {};
for (const u of Object.values(db.users)) {
  if (u.name) db.byName[String(u.name).trim().toLowerCase()] ??= u.userId;
}
ready = true;

function bail(msg, e) {
  console.error(`[pata] ${msg}`);
  if (e) console.error(`        ${e.message || e}`);
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    /* 锁没建起来就没得删 */
  }
  process.exit(1);
}

// 写入节流：好友操作很稀疏，1 秒合批足够，避免每次请求都同步落盘
let flushTimer = null;
function save() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushNow, 1000);
}

/**
 * 立刻落盘。先写 .tmp 再 rename——rename 在同一文件系统上是原子的，
 * 所以读到的 data.json 要么是旧的完整版、要么是新的完整版，
 * 不会是半截文件（半截文件下次启动解析失败，正是上面 bail 的那条路）。
 */
function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!ready) return;
  try {
    writeFileSync(TMP_PATH, JSON.stringify(db, null, 2));
    renameSync(TMP_PATH, DB_PATH);
  } catch (e) {
    console.error('[pata] 落盘失败', e);
  }
}

// 退出前必须同步落盘：save() 压着 1 秒的防抖，而 Ctrl-C 是停服的常规方式，
// 没有这段的话「注册 / 加好友 / 收 inbox」只要发生在最后一秒就凭空消失。
let exiting = false;
function shutdown(signal) {
  if (exiting) return;
  exiting = true;
  flushNow();
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    /* 已经被清掉了 */
  }
  if (signal) {
    console.log(`\n[pata] 收到 ${signal}，已落盘退出`);
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => shutdown(null));

// ── 口令 ────────────────────────────────────────────────────
// scrypt 加随机盐。明文存密码是原型里最不该省的一步：这个库将来
// 大概率会被随手拷贝、上传、共享，而用户的密码往往是复用的。
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `${salt}:${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, expect] = stored.split(':');
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  const a = Buffer.from(expect, 'hex');
  // 定长比较，别用 === 泄漏匹配前缀长度
  return a.length === key.length && timingSafeEqual(a, key);
}

/** 名字大小写不敏感地唯一，避免「Pata」和「pata」两个账号 */
const nameKey = (name) => String(name).trim().toLowerCase();

/** 好友码：去掉容易看错的 0/O/1/I */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  for (;;) {
    let code = '';
    for (const b of randomBytes(6)) code += ALPHABET[b % ALPHABET.length];
    if (!db.byCode[code]) return code;
  }
}

function publicProfile(u, viewerId) {
  return {
    userId: u.userId,
    name: u.name,
    level: u.level,
    avatar: u.avatar,
    comfort: u.comfort,
    updatedAt: u.updatedAt,
    isFriend: viewerId ? (db.users[viewerId]?.friends ?? []).includes(u.userId) : false,
  };
}

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

function auth(req) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  if (!token) return null;
  return Object.values(db.users).find((u) => u.token === token) ?? null;
}

/** 带 HTTP 状态码的错误，文案会原样发给客户端，所以必须是中文 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', (c) => {
      // 超限后只是不再累积（剩下的字节收下就扔），不能 destroy 掉请求——
      // 那会把响应通道一起掐断，客户端拿到的是连接被重置而不是 413。
      // 真正要防的是内存无限增长，丢掉 data 就够了。
      if (tooBig) return;
      data += c;
      if (data.length > 512 * 1024) {
        tooBig = true;
        data = '';
        reject(new HttpError(413, '请求内容太大了'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new HttpError(400, '请求格式不对'));
      }
    });
    req.on('error', reject);
  });
}

const routes = {
  /** 注册：取名 + 设密码。同时把客户端带上来的存档一起收下 */
  'POST /api/register': async (req, res) => {
    const body = await readBody(req);
    const name = String(body.name ?? '').trim().slice(0, 16);
    const password = String(body.password ?? '');
    if (name.length < 1) return json(res, 400, { error: '名字不能为空' });
    if (password.length < 4) return json(res, 400, { error: '密码至少 4 位' });
    if (db.byName?.[nameKey(name)]) return json(res, 409, { error: '这个名字已经有人用了' });

    const userId = randomUUID();
    const code = makeCode();
    const user = {
      userId,
      token: randomBytes(24).toString('hex'),
      code,
      name,
      pass: hashPassword(password),
      // 注册时客户端已经带上了完整快照，别在这里写死成初始值
      level: Number(body.level) || 1,
      avatar: body.avatar ?? null,
      room: body.room ?? null,
      comfort: Number(body.comfort) || 0,
      // 整份存档。服务端只当不透明 blob 存，不解释内容
      save: body.save ?? null,
      saveAt: body.save ? Date.now() : 0,
      friends: [],
      // 收到的帮忙记录，客户端下次上线时结算
      inbox: [],
      updatedAt: Date.now(),
    };
    db.users[userId] = user;
    db.byCode[code] = userId;
    (db.byName ??= {})[nameKey(name)] = userId;
    save();
    json(res, 200, { userId, token: user.token, code, name });
  },

  /** 登录：名字 + 密码换 token */
  'POST /api/login': async (req, res) => {
    const body = await readBody(req);
    const name = String(body.name ?? '').trim();
    const password = String(body.password ?? '');
    const id = db.byName?.[nameKey(name)];
    const user = id ? db.users[id] : null;
    // 名字不存在和密码错给同一句提示，别帮人枚举账号
    if (!user || !verifyPassword(password, user.pass)) {
      return json(res, 401, { error: '名字或密码不对' });
    }
    // 每次登录换新 token，旧设备自然失效
    user.token = randomBytes(24).toString('hex');
    save();
    json(res, 200, {
      userId: user.userId,
      token: user.token,
      code: user.code,
      name: user.name,
      saveAt: user.saveAt ?? 0,
    });
  },

  /** 拉取整份存档 */
  'GET /api/save': async (_req, res, me) => {
    json(res, 200, { save: me.save ?? null, saveAt: me.saveAt ?? 0 });
  },

  /** 上传整份存档 */
  'PUT /api/save': async (req, res, me) => {
    const body = await readBody(req);
    if (body.save === undefined) return json(res, 400, { error: '缺少 save' });
    me.save = body.save;
    me.saveAt = Date.now();
    save();
    json(res, 200, { saveAt: me.saveAt });
  },

  /** 上传房间快照 */
  'PUT /api/me': async (req, res, me) => {
    const body = await readBody(req);
    if (body.name !== undefined) me.name = String(body.name).slice(0, 16);
    if (body.level !== undefined) me.level = Number(body.level) || 1;
    if (body.comfort !== undefined) me.comfort = Number(body.comfort) || 0;
    if (body.avatar !== undefined) me.avatar = body.avatar;
    if (body.room !== undefined) me.room = body.room;
    me.updatedAt = Date.now();
    save();
    json(res, 200, { ok: true });
  },

  /** 自己的资料 + 待结算的好友帮忙 + 管理员发的金币 */
  'GET /api/me': async (_req, res, me) => {
    const inbox = me.inbox;
    const grants = me.grants ?? [];
    me.inbox = [];
    // 取走即销账。客户端拿到后立刻加进存档并落盘，和 inbox 一个待遇
    me.grants = [];
    save();
    json(res, 200, { ...publicProfile(me), code: me.code, inbox, grants });
  },

  'GET /api/friends': async (_req, res, me) => {
    const list = me.friends
      .map((id) => db.users[id])
      .filter(Boolean)
      .map((u) => publicProfile(u, me.userId));
    json(res, 200, { friends: list });
  },

  /** 用好友码加好友，双向建立 */
  'POST /api/friends': async (req, res, me) => {
    const body = await readBody(req);
    const code = String(body.code ?? '').toUpperCase().trim();
    const otherId = db.byCode[code];
    if (!otherId) return json(res, 404, { error: '好友码不存在' });
    if (otherId === me.userId) return json(res, 400, { error: '不能加自己' });
    const other = db.users[otherId];
    if (!me.friends.includes(otherId)) me.friends.push(otherId);
    if (!other.friends.includes(me.userId)) other.friends.push(me.userId);
    save();
    json(res, 200, { friend: publicProfile(other, me.userId) });
  },

  /** 串门：拿对方的房间快照 */
  'GET /api/visit': async (req, res, me) => {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const u = db.users[id];
    if (!u) return json(res, 404, { error: '没有这个邻居' });
    json(res, 200, { ...publicProfile(u, me.userId), room: u.room });
  },

  /** 帮邻居喂饭：写进对方 inbox，对方下次上线结算 */
  'POST /api/help': async (req, res, me) => {
    const body = await readBody(req);
    const u = db.users[body.id];
    if (!u) return json(res, 404, { error: '没有这个邻居' });
    if (!me.friends.includes(u.userId)) return json(res, 403, { error: '还不是好友' });
    u.inbox.push({ from: me.name, at: Date.now(), kind: 'feed' });
    if (u.inbox.length > 50) u.inbox.splice(0, u.inbox.length - 50);
    save();
    json(res, 200, { ok: true });
  },
};

// 管理接口自带一套鉴权（口令换内存令牌），所以对下面这张玩家鉴权表来说
// 它们全是「公开」的——千万别理解成不设防，admin.mjs 里每个 handler 都包了 guard()
const admin = makeAdmin({ db, save, hashPassword, json, readBody, password: process.env.PATA_ADMIN_PASSWORD });
Object.assign(routes, admin.routes);

const PUBLIC = new Set(['POST /api/register', 'POST /api/login', ...Object.keys(admin.routes)]);
const NEEDS_AUTH = new Set(Object.keys(routes).filter((k) => !PUBLIC.has(k)));

http
  .createServer(async (req, res) => {
    // 开发期客户端和服务端不同端口，必须放行跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();

    const path = new URL(req.url, 'http://x').pathname;

    // 后台页面是这个服务端唯一的静态资源，不走 JSON 路由表
    if (req.method === 'GET' && (path === '/admin' || path === '/admin/')) {
      return admin.servePage(res);
    }

    const key = `${req.method} ${path}`;
    const handler = routes[key];
    if (!handler) return json(res, 404, { error: '没有这个接口' });

    let me = null;
    if (NEEDS_AUTH.has(key)) {
      me = auth(req);
      if (!me) return json(res, 401, { error: '未登录' });
    }

    try {
      await handler(req, res, me);
    } catch (e) {
      console.error('[pata]', key, e);
      // HttpError 的文案是写给用户看的中文；其它异常是代码 bug，
      // 它的 message 是英文的运行时报错，只进日志，不发给客户端
      if (e instanceof HttpError) json(res, e.status, { error: e.message });
      else json(res, 500, { error: '服务器出错了' });
    }
  })
  .listen(PORT, () => {
    console.log(`pata 好友服务  http://localhost:${PORT}`);
    console.log(`数据文件      ${DB_PATH}`);
    console.log(`已注册用户    ${Object.keys(db.users).length}`);
    admin.banner(PORT);
  });
