import { BLUSHES, BODIES, EYES, HATS, PATTERNS } from '../data/avatar';
import { FLOORS, FURNITURE, SETS, WALLS, type SurfaceDef } from '../data/furniture';
import { FOODS, foodById } from '../data/food';
import { S, store } from '../model/store';
import { avatarOwned, avatarPrice, buy, feed } from '../systems/actions';
import { levelOf } from '../systems/sim';
import { bump, claim, claimAll, questViews } from '../systems/quests';
import { furniThumb } from '../render/furniture';
import { ART_BAKED_SLOTS, PET_ART_URL } from '../render/petArt';
import { fmtDate, uid } from '../core/util';
import type { AvatarState, DiaryEntry, MoodTag, RoomState } from '../model/types';
import { bodyById } from '../data/avatar';
import {
  addFriend, helpFeed, isLoggedIn, listFriends, logout, pushSave, visit,
  type FriendProfile,
} from '../net/api';
import { settleMail, type MailResult } from '../systems/mail';
import { reopenGate } from './gate';
import { SURFACE_ART_URLS } from '../render/surfaceArt';
import { cell, clear, el, emojiThumb, sheet, tabs, toast } from './dom';
import { bodySwatch, colorSwatch, eyeSwatch, hatSwatch, patternSwatch } from './swatch';

/** 地板/墙纸的商店缩略图：贴图墙直接给原图，纯色的还是画色块 */
function surfaceThumb(def: SurfaceDef): string {
  const url = def.tex ? SURFACE_ART_URLS[def.tex] : undefined;
  if (url) {
    return `<img src="${url}" width="46" height="46" style="border-radius:9px;object-fit:cover;display:block">`;
  }
  return `<svg viewBox="0 0 40 40" width="46" height="46"><rect width="40" height="40" rx="9" fill="${def.main}"/><path d="M0 26 H40 M0 33 H40" stroke="${def.accent}" stroke-width="4"/></svg>`;
}

// ── 喂食 ──────────────────────────────────────────────────

export function openFeed(after: (msg: string, fx: 'crumb') => void): void {
  sheet('喂点什么', (body, close) => {
    const render = () => {
      clear(body);
      const entries = Object.entries(S().bag).filter(([, n]) => n > 0);
      if (!entries.length) {
        body.append(
          el('div.empty', null, '背包空空的…', el('br'), '去商店买点吃的吧'),
          el('button.btn.wide', {
            onclick: () => {
              close();
              openShop(1);
            },
          }, '去商店'),
        );
        return;
      }
      const grid = el('div.grid');
      for (const [id, n] of entries) {
        const def = foodById(id);
        if (!def) continue;
        grid.append(
          cell({
            thumb: emojiThumb(def.icon),
            name: def.name,
            count: n,
            onclick: () => {
              const r = feed(id);
              toast(r.msg);
              if (r.ok) {
                after(r.msg, 'crumb');
                close();
              } else {
                render();
              }
            },
          }),
        );
      }
      body.append(grid);
    };
    render();
  });
}

// ── 商店 ──────────────────────────────────────────────────

export function openShop(startTab = 0): void {
  let tab = startTab;
  let body: HTMLElement;

  const bar = tabs(['食物', '家具', '地板', '墙纸'], (i) => {
    tab = i;
    render();
  }, startTab);

  const render = () => {
    clear(body);
    const lv = levelOf(S().pet.intimacy).lv;
    const grid = el('div.grid');

    if (tab === 0) {
      for (const def of FOODS) {
        const locked = lv < def.unlockLv;
        grid.append(
          cell({
            thumb: emojiThumb(def.icon),
            name: def.name,
            price: def.price,
            count: S().bag[def.id] ?? 0,
            locked: locked ? `Lv.${def.unlockLv} 解锁` : undefined,
            onclick: () => {
              const r = buy('food', def.id);
              toast(r.ok ? `${r.msg}　${def.desc}` : r.msg);
              if (r.ok) render();
            },
          }),
        );
      }
    } else if (tab === 1) {
      const owned: Record<string, number> = {};
      for (const id of S().owned) {
        if (!id.includes(':')) owned[id] = (owned[id] ?? 0) + 1;
      }
      const bySet: Record<string, typeof FURNITURE> = {};
      for (const def of FURNITURE) (bySet[def.set] ??= []).push(def);
      for (const [setId, list] of Object.entries(bySet)) {
        body.append(el('div', { style: 'font-size:12px;color:var(--ink-soft);margin:6px 0 8px' }, SETS[setId] ?? setId));
        const g = el('div.grid');
        for (const def of list) {
          const locked = lv < def.unlockLv;
          g.append(
            cell({
              thumb: furniThumb(def),
              name: def.name,
              price: def.price,
              count: owned[def.id] ?? 0,
              locked: locked ? `Lv.${def.unlockLv} 解锁` : undefined,
              onclick: () => {
                const r = buy('furni', def.id);
                toast(r.ok ? `${r.msg}（舒适度 +${def.comfort}）` : r.msg);
                if (r.ok) render();
              },
            }),
          );
        }
        body.append(g);
      }
      return;
    } else {
      const isFloor = tab === 2;
      const list = isFloor ? FLOORS : WALLS;
      const cur = isFloor ? S().room.floor : S().room.wall;
      for (const def of list) {
        const key = `${isFloor ? 'floor' : 'wall'}:${def.id}`;
        const has = def.price === 0 || S().owned.includes(key);
        grid.append(
          cell({
            thumb: surfaceThumb(def),
            name: def.name,
            price: has ? undefined : def.price,
            owned: has,
            selected: cur === def.id,
            onclick: () => {
              const r = buy(isFloor ? 'floor' : 'wall', def.id);
              toast(r.msg);
              if (r.ok) render();
            },
          }),
        );
      }
    }
    body.append(grid);
  };

  sheet('商店', (b) => {
    body = b;
    render();
  }, { tabs: bar });
}

// ── 捏人 ──────────────────────────────────────────────────

const ALL_SLOTS = [
  { key: 'body', label: '体色' },
  { key: 'pattern', label: '花纹' },
  { key: 'eyes', label: '眼睛' },
  { key: 'blush', label: '腮红' },
  { key: 'hat', label: '头饰' },
] as const;

export function openWardrobe(onClose: () => void): void {
  // 用了立绘贴图时，花纹/眼睛/腮红是画死在图里的，留着就是三个点不动的死控件
  const SLOTS = PET_ART_URL
    ? ALL_SLOTS.filter((s) => !ART_BAKED_SLOTS.includes(s.key as never))
    : ALL_SLOTS;

  let tab = 0;
  let body: HTMLElement;

  const bar = tabs(SLOTS.map((s) => s.label), (i) => {
    tab = i;
    render();
  });

  const render = () => {
    clear(body);
    const slot = SLOTS[tab].key;
    const a = S().avatar;
    const grid = el('div.grid');

    const add = (id: string, name: string, thumb: string, selected: boolean) => {
      const price = avatarPrice(slot, id) ?? 0;
      const has = avatarOwned(slot, id);
      grid.append(
        cell({
          thumb,
          name,
          price: has ? undefined : price,
          owned: has && price > 0,
          selected,
          onclick: () => {
            const r = buy('avatar', `${slot}:${id}`);
            toast(r.ok ? (has ? '换好啦' : `解锁了${name}`) : r.msg);
            if (r.ok) render();
          },
        }),
      );
    };

    if (slot === 'body') {
      for (const d of BODIES) add(d.id, d.name, bodySwatch(d), a.body === d.id);
    } else if (slot === 'pattern') {
      for (const d of PATTERNS) add(d.id, d.name, patternSwatch(d.id, a.body), a.pattern === d.id);
    } else if (slot === 'eyes') {
      for (const d of EYES) add(d.id, d.name, eyeSwatch(d.id), a.eyes === d.id);
    } else if (slot === 'blush') {
      for (const d of BLUSHES) add(d.id, d.name, colorSwatch(d.color), a.blush === d.id);
    } else {
      for (const d of HATS) add(d.id, d.name, hatSwatch(d), a.hat === d.id);
      grid.append(
        cell({
          thumb: colorSwatch('#00000000'),
          name: '不戴',
          selected: a.hat === null,
          onclick: () => {
            S().avatar.hat = null;
            store.changed();
            render();
          },
        }),
      );
    }
    body.append(grid);

    body.append(
      el('div.field', { style: 'margin-top:18px' },
        el('label', null, '给它取个名字'),
        el('input.input', {
          value: S().pet.name,
          maxlength: 12,
          input: (e: Event) => {
            const v = (e.target as HTMLInputElement).value.trim();
            S().pet.name = v || 'Pata';
            store.changed();
          },
        }),
      ),
    );
  };

  sheet('装扮', (b) => {
    body = b;
    render();
  }, { tabs: bar, onClose, light: true });
}

// ── 好友 ──────────────────────────────────────────────────

export interface VisitTarget {
  room: RoomState;
  avatar: AvatarState;
  name: string;
}

export function openFriends(onVisit: (t: VisitTarget) => void): void {
  let body: HTMLElement;

  const loading = (msg: string) =>
    el('div.empty', null, msg);

  const offline = (retry: () => void) =>
    el('div.empty', null,
      '连不上好友服务',
      el('br'),
      el('span', { style: 'font-size:11px' }, `在 pata/ 下跑 npm run server 试试`),
      el('br'),
      el('button.btn', { style: 'margin-top:14px', onclick: retry }, '重试'),
    );

  const render = async () => {
    clear(body).append(loading('加载中…'));

    // 登录闸门允许「离线玩本地档」，所以这里可能是没登录的状态
    if (!isLoggedIn()) {
      clear(body).append(
        el('div.empty', null,
          '你现在是离线玩本地存档',
          el('br'),
          '登录后才能加好友、串门',
        ),
        el('button.btn.wide', { onclick: () => void reopenGate() }, '去登录'),
      );
      return;
    }

    let friends: FriendProfile[];
    let mail: MailResult = { messages: [], coins: 0 };
    try {
      // 好友帮喂的饭、管理员发的金币，一次结算掉
      mail = await settleMail();
      friends = await listFriends();
    } catch {
      clear(body).append(offline(() => void render()));
      return;
    }

    for (const m of mail.messages) toast(m);

    clear(body);

    const code = S().auth.code ?? '';
    body.append(
      el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:12px' },
        el('span', { style: 'font-size:12px;color:var(--ink-soft);flex:1' },
          `已登录：${S().auth.name ?? ''}`),
        el('button.btn.ghost', {
          style: 'padding:6px 12px;font-size:11px;flex:0 0 auto',
          onclick: async () => {
            // 退出前先把当前进度推上去，否则这台设备上的进度就留在本地了
            await pushSave();
            logout();
            void reopenGate();
          },
        }, '退出登录'),
      ),
      el('div.codecard', null,
        el('span', null, '我的好友码'),
        el('b', null, code),
        el('button.btn.ghost', {
          style: 'padding:7px 14px;font-size:12px',
          onclick: () => {
            void navigator.clipboard?.writeText(code);
            toast('已复制');
          },
        }, '复制'),
      ),
    );

    const input = el('input.input', {
      placeholder: '输入对方的好友码',
      maxlength: 12,
      style: 'text-transform:uppercase',
    }) as HTMLInputElement;
    body.append(
      el('div.field', null,
        el('div', { style: 'display:flex;gap:8px' },
          input,
          el('button.btn', {
            style: 'flex:0 0 auto',
            onclick: async () => {
              const v = input.value.trim().toUpperCase();
              if (!v) return;
              try {
                const f = await addFriend(v);
                toast(`加上了 ${f.name}`);
                input.value = '';
                void render();
              } catch (e) {
                toast(e instanceof Error ? e.message : '添加失败');
              }
            },
          }, '添加'),
        ),
      ),
    );

    if (!friends.length) {
      body.append(el('div.empty', null, '还没有好友', el('br'), '把好友码发给朋友吧'));
      return;
    }

    for (const f of friends) {
      body.append(
        el('div.friend', null,
          el('div.friend-av', { html: bodySwatch(bodyById((f.avatar as AvatarState)?.body ?? 'angel')) }),
          el('div.friend-main', null,
            el('b', null, f.name),
            el('span', null, `Lv.${f.level}　舒适度 ${f.comfort}`),
          ),
          el('button.btn.ghost', {
            style: 'padding:8px 12px;font-size:12px;flex:0 0 auto',
            onclick: async () => {
              try {
                await helpFeed(f.userId);
                bump('help');
                S().coins += 20;
                store.changed();
                toast(`帮 ${f.name} 喂了饭　+20 金币`);
              } catch (e) {
                toast(e instanceof Error ? e.message : '操作失败');
              }
            },
          }, '帮喂饭'),
          el('button.btn', {
            style: 'padding:8px 12px;font-size:12px;flex:0 0 auto',
            onclick: async () => {
              try {
                const data = await visit(f.userId);
                bump('visit');
                store.changed();
                onVisit({
                  room: data.room as RoomState,
                  avatar: data.avatar as AvatarState,
                  name: data.name,
                });
              } catch (e) {
                toast(e instanceof Error ? e.message : '串门失败');
              }
            },
          }, '串门'),
        ),
      );
    }
  };

  sheet('好友', (b) => {
    body = b;
    void render();
  });
}

// ── 任务 ──────────────────────────────────────────────────

export function openQuests(): void {
  let tab: 'daily' | 'achieve' = 'daily';
  let body: HTMLElement;

  const bar = tabs(['每日任务', '成就'], (i) => {
    tab = i === 0 ? 'daily' : 'achieve';
    render();
  });

  const render = () => {
    clear(body);
    const views = questViews(tab);
    const pending = views.filter((v) => v.done && !v.claimed).length;

    if (pending > 0) {
      body.append(
        el('button.btn.wide', {
          style: 'margin-bottom:14px',
          onclick: () => {
            const r = claimAll();
            toast(r.msg);
            render();
          },
        }, `一键领取 ${pending} 个`),
      );
    }

    for (const v of views) {
      const pct = Math.round((v.progress / v.def.goal) * 100);
      // 未完成时用纯文字而不是禁用按钮：按钮外形会让人以为点了有用
      const btn = v.claimed
        ? el('span', { style: 'font-size:12px;color:var(--mint);flex:0 0 auto' }, '已领取')
        : v.done
          ? el('button.btn', {
              style: 'flex:0 0 auto;padding:8px 16px;font-size:12px',
              onclick: () => {
                const r = claim(v.def.id);
                toast(r.msg);
                render();
              },
            }, '领取')
          : el('span', {
              style: 'font-size:12px;color:var(--ink-soft);flex:0 0 auto;min-width:34px;text-align:right',
            }, `${v.progress}/${v.def.goal}`);

      body.append(
        el('div.quest', null,
          el('em', null, v.def.icon),
          el('div.quest-main', null,
            el('b', null, v.def.name),
            el('div.quest-bar', null,
              el('i', { style: `width:${pct}%` }),
            ),
            el('span', null,
              `+${v.def.coins} 金币${v.def.hearts ? `　♥ ${v.def.hearts}` : ''}`),
          ),
          btn,
        ),
      );
    }

    if (tab === 'daily') {
      body.append(
        el('div', { style: 'font-size:11px;color:var(--ink-soft);text-align:center;padding:14px 0' },
          '每日任务次日 0 点重置'),
      );
    }
  };

  sheet('任务', (b) => {
    body = b;
    render();
  }, { tabs: bar });
}

// ── 日记 ──────────────────────────────────────────────────

const MOODS: { tag: MoodTag; icon: string }[] = [
  { tag: '开心', icon: '😊' },
  { tag: '平静', icon: '😌' },
  { tag: '兴奋', icon: '🤩' },
  { tag: '疲惫', icon: '😮‍💨' },
  { tag: '难过', icon: '🥺' },
];

export function openDiary(): void {
  let body: HTMLElement;
  let mood: MoodTag = '平静';

  const render = () => {
    clear(body);
    const ta = el('textarea.input', {
      rows: 3,
      maxlength: 300,
      placeholder: `今天和 ${S().pet.name} 发生了什么…`,
    }) as HTMLTextAreaElement;

    const moodRow = el('div.moods');
    for (const m of MOODS) {
      const b = el('button', {
        onclick: () => {
          mood = m.tag;
          for (const c of Array.from(moodRow.children)) c.classList.remove('on');
          b.classList.add('on');
        },
      }, m.icon);
      if (m.tag === mood) b.classList.add('on');
      moodRow.append(b);
    }

    body.append(
      el('div.field', null, el('label', null, '今天的心情'), moodRow),
      el('div.field', null, ta),
      el('button.btn.wide', {
        onclick: () => {
          const text = ta.value.trim();
          if (!text) {
            toast('写点什么再保存吧');
            return;
          }
          const entry: DiaryEntry = { id: uid('d'), at: Date.now(), mood, text };
          S().diary.unshift(entry);
          if (S().diary.length > 200) S().diary.length = 200;
          S().coins += 20;
          bump('diary');
          store.changed();
          toast('记下来了　+20 金币');
          render();
        },
      }, '保存'),
    );

    const list = S().diary;
    body.append(
      el('div', { style: 'font-size:12px;color:var(--ink-soft);margin:20px 0 10px' },
        list.length ? `一共 ${list.length} 篇` : ''),
    );
    if (!list.length) {
      body.append(el('div.empty', null, '还没有日记', el('br'), '记录一下今天吧'));
      return;
    }
    for (const e of list) {
      const icon = MOODS.find((m) => m.tag === e.mood)?.icon ?? '😌';
      body.append(
        el('div.diary-item', null,
          el('div.meta', null,
            el('span.mood', null, icon),
            el('span', null, e.mood),
            el('span', { style: 'margin-left:auto' }, fmtDate(e.at)),
            el('button.x', {
              style: 'width:22px;height:22px;font-size:11px',
              onclick: () => {
                const i = S().diary.indexOf(e);
                if (i >= 0) S().diary.splice(i, 1);
                store.changed();
                render();
              },
            }, '✕'),
          ),
          el('p', null, e.text),
        ),
      );
    }
  };

  sheet('日记', (b) => {
    body = b;
    render();
  });
}
