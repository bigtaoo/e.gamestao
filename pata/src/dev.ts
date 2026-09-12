/**
 * 调试控制台。只在 URL 带 `?dev` 时挂载，正常进入的玩家碰不到。
 *
 * 为什么需要它：直接改 localStorage 没用——退出时 store 会把内存里的状态
 * 原样写回去，把手改的值盖掉。要生效就必须改内存里的 state 再走正常存档流程。
 *
 * 用法（浏览器控制台）：
 *   pata.coins(999999)      给钱
 *   pata.level(99)          升到指定等级
 *   pata.unlockAll()        解锁所有家具/地板/墙纸/装扮
 *   pata.fill()             四维状态拉满
 *   pata.state              直接看存档
 *   pata.surfaces           地板/墙纸贴图有没有真的加载进来
 *   pata.reset()            清档重来
 */
import { BLUSHES, BODIES, EYES, HATS, PATTERNS } from './data/avatar';
import { FLOORS, FURNITURE, WALLS } from './data/furniture';
import { S, store } from './model/store';
import { SURFACE_ART_URLS, surfaceTexture } from './render/surfaceArt';
import { MAX_LEVEL, intimacyForLevel } from './systems/sim';

interface DevHost {
  debug: { room: { screenPosOf(defId: string): { x: number; y: number } | null } };
}

export function installDevConsole(host?: DevHost): void {
  const api = {
    get state() {
      return S();
    },

    /** 场景对象，调试命中判定、层级之类的问题时用 */
    get room() {
      return host?.debug.room;
    },

    /** 贴图有没有真的进来。铺面回退到纯色时先看这里，别靠肉眼猜 */
    get surfaces() {
      return Object.fromEntries(
        Object.keys(SURFACE_ART_URLS).map((id) => {
          const t = surfaceTexture(id);
          return [id, t ? `${t.width}x${t.height}` : 'MISSING'];
        }),
      );
    },

    coins(n: number) {
      S().coins = Math.max(0, Math.floor(n));
      store.changed();
      return S().coins;
    },

    hearts(n: number) {
      S().hearts = Math.max(0, Math.floor(n));
      store.changed();
      return S().hearts;
    },

    level(n = MAX_LEVEL) {
      S().pet.intimacy = intimacyForLevel(n);
      store.changed();
      return n;
    },

    /** 家具每种给 3 件，够摆满一屋子 */
    unlockAll(copies = 3) {
      const owned = S().owned;
      for (const f of FURNITURE) {
        for (let i = 0; i < copies; i++) owned.push(f.id);
      }
      for (const f of FLOORS) owned.push(`floor:${f.id}`);
      for (const w of WALLS) owned.push(`wall:${w.id}`);
      for (const [slot, list] of [
        ['body', BODIES], ['eyes', EYES], ['blush', BLUSHES],
        ['pattern', PATTERNS], ['hat', HATS],
      ] as const) {
        for (const it of list) owned.push(`avatar:${slot}:${it.id}`);
      }
      store.changed();
      return owned.length;
    },

    fill() {
      const p = S().pet;
      p.hunger = 100;
      p.clean = 100;
      p.energy = 100;
      p.mood = 100;
      p.sleepAt = null;
      store.changed();
    },

    reset() {
      localStorage.removeItem('pata.save.v1');
      location.reload();
    },
  };

  (window as unknown as { pata: typeof api }).pata = api;
  console.log('%c[pata] 调试控制台已挂载，试试 pata.coins(999999)', 'color:#2f9fd0');
}
