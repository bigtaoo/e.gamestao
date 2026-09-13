/**
 * Pata 管理后台 —— 后端部分。
 *
 * 独立成一个文件，因为它和玩家 API 是两套完全不同的信任模型：
 * 玩家用自己的 token 只能动自己那份数据，管理员一把钥匙能动所有人的。
 * 混在同一张路由表里迟早会有人手滑把某个 admin 路由挂进玩家的鉴权分支。
 *
 * 口令来自环境变量，不入库也不进代码：
 *   PATA_ADMIN_PASSWORD=xxx npm run server
 * 不设的话每次启动随机生成一个，打印在控制台——不给默认口令，
 * 因为默认口令在原型里的真实下场就是永远没人改。
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(HERE, 'admin.html');

/** 令牌只活在内存里：重启即失效，不用考虑撤销和落盘 */
const SESSION_MS = 8 * 60 * 60_000;
const sessions = new Map(); // token -> expiresAt

/** 这个口令能删掉所有账号，值得一个哪怕很粗的暴力破解闸门 */
const LOCKOUT_AFTER = 8;
const LOCKOUT_MS = 5 * 60_000;
let failures = 0;
let lockedUntil = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function constantEquals(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // timingSafeEqual 要求等长，长度本身不是秘密
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function issueToken() {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}

function validSession(token) {
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/**
 * 管理接口的建立。ctx 由 index.mjs 注入，这里不直接碰文件。
 * @param {{db: object, save: () => void, hashPassword: (p: string) => string,
 *          json: (res: any, code: number, body: any) => void,
 *          readBody: (req: any) => Promise<any>, password: string|null}} ctx
 */
export function makeAdmin(ctx) {
  const { db, save, hashPassword, json, readBody } = ctx;

  // 没配就随机生成。注意不要 fallback 到空串——那等于不设防
  const password = ctx.password || randomBytes(6).toString('base64url');
  const generated = !ctx.password;

  /** 把管理员鉴权包在每个 handler 外面，而不是塞进 index.mjs 的玩家鉴权分支 */
  const guard = (fn) => async (req, res) => {
    const raw = req.headers.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    if (!validSession(token)) return json(res, 401, { error: '管理员登录已失效' });
    return fn(req, res);
  };

  /** 管理端看到的账号摘要。coins 从存档 blob 里读一个字段，读不到就算未知 */
  const row = (u) => ({
    userId: u.userId,
    name: u.name,
    code: u.code,
    level: Number(u.level) || 1,
    // save 是不透明 blob，这里只偷看一眼金币用于展示
    coins: typeof u.save?.coins === 'number' ? u.save.coins : null,
    friends: (u.friends ?? []).length,
    hasSave: !!u.save,
    saveAt: u.saveAt ?? 0,
    updatedAt: u.updatedAt ?? 0,
    online: !!u.token,
    // 已发放但玩家还没上线领取的金币
    pending: (u.grants ?? []).reduce((n, g) => n + (Number(g.coins) || 0), 0),
  });

  const routes = {
    /** 换管理员令牌。失败故意慢一点，并在连错多次后锁一段时间 */
    'POST /api/admin/login': async (req, res) => {
      const body = await readBody(req);
      if (Date.now() < lockedUntil) {
        const left = Math.ceil((lockedUntil - Date.now()) / 1000);
        return json(res, 429, { error: `错太多次了，${left} 秒后再试` });
      }
      if (!constantEquals(String(body.password ?? ''), password)) {
        failures += 1;
        if (failures >= LOCKOUT_AFTER) {
          lockedUntil = Date.now() + LOCKOUT_MS;
          failures = 0;
        }
        await sleep(400);
        return json(res, 401, { error: '口令不对' });
      }
      failures = 0;
      json(res, 200, { token: issueToken() });
    },

    'POST /api/admin/logout': guard(async (req, res) => {
      const raw = req.headers.authorization || '';
      sessions.delete(raw.startsWith('Bearer ') ? raw.slice(7) : '');
      json(res, 200, { ok: true });
    }),

    /** 全部账号 */
    'GET /api/admin/users': guard(async (_req, res) => {
      const users = Object.values(db.users)
        .map(row)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      json(res, 200, { users, total: users.length });
    }),

    /** 改密码。顺手吊销对方的登录态，否则旧设备还能继续用旧 token */
    'POST /api/admin/password': guard(async (req, res) => {
      const body = await readBody(req);
      const u = db.users[String(body.userId ?? '')];
      const password = String(body.password ?? '');
      if (!u) return json(res, 404, { error: '没有这个账号' });
      if (password.length < 4) return json(res, 400, { error: '密码至少 4 位' });
      u.pass = hashPassword(password);
      // 改密码的语义就是「把这个号收回来」，不吊销令牌等于没改
      u.token = null;
      save();
      json(res, 200, { ok: true, name: u.name });
    }),

    /** 删号。索引和别人的好友列表都要一起清，否则留下指向空洞的悬挂引用 */
    'POST /api/admin/delete': guard(async (req, res) => {
      const body = await readBody(req);
      const id = String(body.userId ?? '');
      const u = db.users[id];
      if (!u) return json(res, 404, { error: '没有这个账号' });

      delete db.users[id];
      if (u.code) delete db.byCode[u.code];
      if (u.name) delete db.byName[String(u.name).trim().toLowerCase()];
      // 别人的好友列表里还挂着这个 id，留着会让 /api/friends 拿到 undefined
      for (const other of Object.values(db.users)) {
        if (!Array.isArray(other.friends)) continue;
        const i = other.friends.indexOf(id);
        if (i >= 0) other.friends.splice(i, 1);
      }
      save();
      json(res, 200, { ok: true, name: u.name });
    }),

    /**
     * 发金币。
     *
     * 为什么是「挂单」而不是直接改存档：金币存在客户端存档里，服务端只当
     * 不透明 blob 存着，而客户端随时会把自己内存里那份整个推上来。
     * 直接改 u.save.coins 的话，玩家只要在线，下一次 pushSave 就把它盖掉了。
     * 所以写进 grants 队列，等客户端上线时自己领——和 inbox 是同一套路子。
     */
    'POST /api/admin/grant': guard(async (req, res) => {
      const body = await readBody(req);
      const coins = Math.trunc(Number(body.coins));
      const note = String(body.note ?? '').slice(0, 40);
      if (!Number.isFinite(coins) || coins === 0) {
        return json(res, 400, { error: '金币数要是个非零整数' });
      }
      if (Math.abs(coins) > 1_000_000) return json(res, 400, { error: '一次最多 100 万' });

      const targets = body.all
        ? Object.values(db.users)
        : [db.users[String(body.userId ?? '')]].filter(Boolean);
      if (!targets.length) return json(res, 404, { error: '没有这个账号' });

      const at = Date.now();
      for (const u of targets) {
        (u.grants ??= []).push({
          id: randomBytes(8).toString('hex'),
          coins,
          note,
          at,
        });
        // 挂单是有上限的，防止反复群发把 data.json 撑爆
        if (u.grants.length > 50) u.grants.splice(0, u.grants.length - 50);
      }
      save();
      json(res, 200, { ok: true, count: targets.length, coins });
    }),

    /** 撤回某人尚未领取的挂单 */
    'POST /api/admin/grant/clear': guard(async (req, res) => {
      const body = await readBody(req);
      const u = db.users[String(body.userId ?? '')];
      if (!u) return json(res, 404, { error: '没有这个账号' });
      const n = (u.grants ?? []).length;
      u.grants = [];
      save();
      json(res, 200, { ok: true, cleared: n });
    }),
  };

  /** 后台页面。原型阶段直接由这个服务端出静态页，不进游戏的构建产物 */
  function servePage(res) {
    let html;
    try {
      html = readFileSync(PAGE_PATH, 'utf8');
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('admin.html 不见了');
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  }

  function banner(port) {
    console.log(`管理后台      http://localhost:${port}/admin`);
    if (generated) {
      console.log(`管理员口令    ${password}   ← 本次随机生成，重启会变`);
      console.log('              固定口令：PATA_ADMIN_PASSWORD=你的口令 npm run server');
    } else {
      console.log('管理员口令    取自 PATA_ADMIN_PASSWORD');
    }
  }

  return { routes, servePage, banner };
}
