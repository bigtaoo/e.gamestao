import { Application } from 'pixi.js';
import { RoomScene } from './render/roomScene';
import { loadPetArt } from './render/petArt';
import { loadFurniArt } from './render/furniArt';
import { loadSurfaceArt } from './render/surfaceArt';
import { furniThumb } from './render/furniture';
import { FLOORS, WALLS, furniById } from './data/furniture';
import { FEELING_TEXT, MAX_LEVEL, advance, comfortOf, feelingOf, levelOf } from './systems/sim';
import { caress, cooldownLeft, isAsleep, play, toggleSleep, trayItems, wash } from './systems/actions';
import type { ActionResult } from './systems/actions';
import { claimableCount } from './systems/quests';
import { pushSave, setAuthLostHandler } from './net/api';
import { needsGate, openGate, reopenGate } from './ui/gate';
import { S, store } from './model/store';
import type { PlacedItem } from './model/types';
import { clear, el, sheet, toast, ui } from './ui/dom';
import {
  openDiary, openFeed, openFriends, openQuests, openShop, openWardrobe,
  type VisitTarget,
} from './ui/panels';
import { fmtDuration, pick } from './core/util';

const NAV_ICONS: Record<string, string> = {
  room: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  quest: '<path d="M5 4h14v17l-7-4-7 4z"/><path d="M9 9.5l2 2 4-4"/>',
  friend: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0111 0"/><path d="M16 5.5a3 3 0 010 5.5"/><path d="M17.5 14.5A5.5 5.5 0 0121 20"/>',
  dress: '<path d="M12 3l2.1 5.2L19.5 10l-5.4 1.8L12 17l-2.1-5.2L4.5 10l5.4-1.8z"/><path d="M18 16l.8 2L21 19l-2.2.9L18 22l-.8-2.1L15 19l2.2-1z"/>',
  shop: '<path d="M6 8h12l-1 12H7z"/><path d="M9.5 8V6a2.5 2.5 0 015 0v2"/>',
  diary: '<path d="M6 4h11a2 2 0 012 2v14H8a2 2 0 01-2-2z"/><path d="M9 4v14"/><path d="M12 9h5"/>',
  brush: '<path d="M4 20s3-1 3-3.5S9 12 12 12l4-4 4 4-4 4c0 3-2.5 4-5 4z"/><path d="M14 6l4 4"/>',
};

const STAT_META = [
  { key: 'hunger', label: '饱食', color: '#ffb14d' },
  { key: 'clean', label: '清洁', color: '#6fc9f0' },
  { key: 'energy', label: '精力', color: '#8fd9b6' },
  { key: 'mood', label: '心情', color: '#ff9aa6' },
] as const;

export class App {
  private pixi = new Application();
  private room!: RoomScene;
  private editing = false;

  private elHud = el('div.hud');
  private elStats = el('div.stats');
  private elActions = el('div.actions');
  private elRail = el('div.rail');
  private elEdit = el('div.editbar');
  private elNav = el('div.nav');
  private elGuest = el('div.guestbar');

  // 家具托盘展开成网格后的状态。renderEditBar 每次摆放都整块重建，
  // 不记着这两个值的话展开会被收起、滚动位置会跳回顶部。
  private trayOpen = false;
  private trayScroll = 0;

  // HUD 的四块文字。整块重建会 1 秒 4 次换掉改名按钮，mousedown/mouseup 之间
  // 撞上就不派发 click——点名字改名会随机失灵。建一次，之后只改 textContent。
  private elPetName = el('b');
  private elPetLv = el('span');
  private elHearts = el('span');
  private elCoins = el('span');

  private simAcc = 0;
  private saveAcc = 0;
  private syncAcc = 0;
  private syncDirty = false;

  /** 给 ?dev 调试控制台用，正式流程不要依赖 */
  get debug() {
    return { room: this.room, pixi: this.pixi };
  }

  async init(): Promise<void> {
    const host = document.getElementById('stage') as HTMLElement;
    await this.pixi.init({
      background: '#f3e9da',
      resizeTo: host,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    host.append(this.pixi.canvas);

    // 贴图必须在建场景之前就位：PataSprite 和家具节点都在构造时决定走贴图还是矢量
    await Promise.all([loadPetArt(), loadFurniArt(), loadSurfaceArt()]);

    this.room = new RoomScene();
    this.pixi.stage.addChild(this.room);
    this.room.onPetTap(() => this.act(caress));
    this.room.onSelectionChange(() => this.renderEditBar());

    this.buildChrome();
    this.layout();
    window.addEventListener('resize', () => this.layout());

    // 登录闸门要在离线结算之前过：登录可能把整份存档换掉，
    // 先结算等于拿旧档算了一遍，拉下新档后那笔收益凭空消失
    if (needsGate()) await openGate();
    setAuthLostHandler(() => {
      toast('这个账号在别处登录了');
      void reopenGate();
    });

    // 离线结算：必须在启动帧循环之前跑一次
    const report = advance(S(), Date.now());
    store.changed();

    this.pixi.ticker.add((t) => this.tick(t.deltaMS / 1000));

    if (!S().introDone) this.showIntro();
    else if (report.awayMs > 5 * 60_000) this.showOfflineReport(report.awayMs, report.coins);
  }

  // ── 布局 ────────────────────────────────────────────────

  /**
   * 桌面窗口比手机框大得多时，把整个框等比放大，别让它缩在中间一小块。
   * 放大用的是 CSS transform，布局尺寸不变（UI 照 430×932 设计），
   * 所以要把 Pixi 的渲染分辨率乘上去，否则画布会被拉伸得发虚。
   */
  private fitPhone(): number {
    const phone = document.getElementById('phone') as HTMLElement;
    const BASE_W = 430;
    const BASE_H = 932;
    // 窗口装不下一个整框时（手机/窄窗）就不缩放，让它按 100vw/100dvh 铺满
    if (window.innerWidth < BASE_W || window.innerHeight < BASE_H) {
      phone.style.setProperty('--phone-scale', '1');
      return 1;
    }
    const k = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H, 2);
    phone.style.setProperty('--phone-scale', k.toFixed(3));
    return k;
  }

  private layout(): void {
    const scale = this.fitPhone();
    const host = document.getElementById('stage') as HTMLElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const want = Math.min(3, dpr * scale);
    if (Math.abs(this.pixi.renderer.resolution - want) > 0.01) {
      this.pixi.renderer.resolution = want;
    }
    this.pixi.renderer.resize(host.clientWidth, host.clientHeight);
    this.room.resize(host.clientWidth, host.clientHeight);
  }

  private tick(dt: number): void {
    this.simAcc += dt;
    if (this.simAcc >= 0.25) {
      advance(S(), Date.now());
      this.simAcc = 0;
      // 只刷数值，不要重建编辑条：那会 1 秒 4 次打断点击、重置家具栏滚动
      this.refresh(false);
    }
    this.saveAcc += dt;
    if (this.saveAcc >= 20) {
      this.saveAcc = 0;
      store.flush();
    }
    // 房间/形象变了才推快照，且最多 15 秒一次
    this.syncAcc += dt;
    if (this.syncDirty && this.syncAcc >= 15) {
      this.syncAcc = 0;
      this.syncDirty = false;
      void pushSave();
    }
    this.room.update(dt);
  }

  // ── 外壳 ────────────────────────────────────────────────

  private buildChrome(): void {
    ui().append(
      this.elHud, this.elStats, this.elRail, this.elActions,
      this.elEdit, this.elGuest, this.elNav,
    );

    const navItems = [
      { id: 'room', icon: 'room', label: '房间', onclick: () => this.backToRoom() },
      { id: 'quest', icon: 'quest', label: '任务', onclick: () => this.openPanel('quest', openQuests) },
      {
        id: 'friend',
        icon: 'friend',
        label: '好友',
        onclick: () => this.openPanel('friend', () => openFriends((t) => this.visitFriend(t))),
      },
      { id: 'dress', icon: 'dress', label: '装扮', onclick: () => this.openPanel('dress', () => openWardrobe(() => {})) },
      { id: 'shop', icon: 'shop', label: '商店', onclick: () => this.openPanel('shop', openShop) },
    ];

    for (const it of navItems) {
      this.elNav.append(
        el('button', { 'data-nav': it.id, onclick: it.onclick },
          el('span', { html: `<svg viewBox="0 0 24 24">${NAV_ICONS[it.icon]}</svg>` }),
          el('span', null, it.label),
          el('i.dot-badge', { 'data-badge': it.id }),
        ),
      );
    }

    // 次要功能走右侧竖排，把底部导航的 5 个位置留给主要模块
    const railItems = [
      { id: 'brush', label: '装修', onclick: () => this.setEditing(true) },
      { id: 'diary', label: '日记', onclick: () => this.openPanel('room', openDiary) },
    ];
    for (const it of railItems) {
      this.elRail.append(
        el('button.rail-btn', {
          title: it.label,
          onclick: it.onclick,
        },
          el('span', { html: `<svg viewBox="0 0 24 24">${NAV_ICONS[it.id]}</svg>` }),
          el('span', null, it.label),
        ),
      );
    }

    // HUD 只建这一次，之后 refresh() 只改四块文字
    this.elHud.append(
      // 改名藏在装扮面板里太深，点名字直接改最直觉
      el('button.hud-name', { onclick: () => this.showRename() }, this.elPetName, this.elPetLv),
      el('div.hud-spacer'),
      el('div.coin.heart', null, el('i', null, '♥'), this.elHearts),
      el('div.coin', null, el('i'), this.elCoins),
    );

    this.elStats.append(
      ...STAT_META.map((m) =>
        el('div.stat', { 'data-stat': m.key },
          el('label', null, m.label),
          el('div.bar', null, el('i', { style: `background:${m.color}` })),
        ),
      ),
    );

    const actions: { label: string; icon: string; run: () => void }[] = [
      { label: '喂食', icon: '🍖', run: () => openFeed((msg) => this.afterFeed(msg)) },
      { label: '洗澡', icon: '🫧', run: () => this.act(wash) },
      { label: '摸摸', icon: '✋', run: () => this.act(caress) },
      { label: '玩耍', icon: '🎾', run: () => this.act(play) },
      { label: '睡觉', icon: '😴', run: () => this.act(toggleSleep) },
    ];
    for (const a of actions) {
      this.elActions.append(
        el('button.act', { 'data-act': a.label, onclick: a.run },
          el('em', null, a.icon),
          el('span', null, a.label),
        ),
      );
    }

    store.subscribe(() => {
      this.syncDirty = true;
      this.refresh();
    });
    this.setEditing(false);
    this.refresh();
  }

  /** 打开弹层：先关掉已开的，避免导航叠层 */
  private openPanel(navId: string, open: () => void): void {
    for (const n of Array.from(document.querySelectorAll('.sheet, .sheet-mask'))) n.remove();
    this.setNav(navId);
    open();
    const back = () => {
      if (!document.querySelector('.sheet')) this.setNav('room');
      else setTimeout(back, 250);
    };
    setTimeout(back, 250);
  }

  private setNav(id: string): void {
    for (const b of Array.from(this.elNav.children)) {
      b.classList.toggle('on', b.getAttribute('data-nav') === id);
    }
  }

  private backToRoom(): void {
    for (const n of Array.from(document.querySelectorAll('.sheet, .sheet-mask'))) n.remove();
    if (this.room.visiting) this.leaveGuest();
    this.setEditing(false);
  }

  // ── 装修模式 ────────────────────────────────────────────

  private setEditing(on: boolean): void {
    if (on && this.room.visiting) return;
    this.editing = on;
    this.room.setEditMode(on);
    this.elActions.style.display = on ? 'none' : 'flex';
    this.elStats.style.display = on ? 'none' : 'grid';
    this.elRail.style.display = on ? 'none' : 'flex';
    this.elEdit.style.display = on ? 'block' : 'none';
    this.elNav.style.display = on ? 'none' : 'flex';
    this.setNav('room');
    this.renderEditBar();
  }

  // ── 串门 ────────────────────────────────────────────────

  private visitFriend(t: VisitTarget): void {
    for (const n of Array.from(document.querySelectorAll('.sheet, .sheet-mask'))) n.remove();
    this.room.enterGuest(t.room, t.avatar, t.name);
    this.elActions.style.display = 'none';
    this.elStats.style.display = 'none';
    this.elRail.style.display = 'none';
    this.elGuest.style.display = 'flex';
    clear(this.elGuest).append(
      el('span', null, `在 ${t.name} 家做客`),
      el('button.btn', { style: 'padding:8px 18px;font-size:12px', onclick: () => this.leaveGuest() }, '回家'),
    );
    this.setNav('room');
  }

  private leaveGuest(): void {
    this.room.exitGuest();
    this.elGuest.style.display = 'none';
    this.setEditing(false);
  }

  // ── 刷新 ────────────────────────────────────────────────

  /** full=false 时只更新 HUD 与状态条，不动编辑条这类带交互的 DOM */
  private refresh(full = true): void {
    const st = S();
    const { lv, cur, need } = levelOf(st.pet.intimacy);

    // 只改文字，节点是 buildHud() 建的。整块重建会把改名按钮 1 秒换掉 4 次，
    // mousedown 和 mouseup 之间撞上一次，这一下点击就丢了。
    this.elPetName.textContent = st.pet.name;
    // 满级时 need 是个十几位的天文数字，显示出来只会挤爆 HUD
    this.elPetLv.textContent =
      lv >= MAX_LEVEL ? `Lv.${lv}　亲密 MAX` : `Lv.${lv}　亲密 ${cur}/${need}`;
    this.elHearts.textContent = String(st.hearts);
    this.elCoins.textContent = String(st.coins);

    for (const m of STAT_META) {
      const node = this.elStats.querySelector(`[data-stat="${m.key}"]`) as HTMLElement | null;
      if (!node) continue;
      const v = Math.round(st.pet[m.key]);
      (node.querySelector('i') as HTMLElement).style.width = `${v}%`;
      node.classList.toggle('low', v < 25);
    }

    const claimable = claimableCount();
    const badge = this.elNav.querySelector('[data-badge="quest"]') as HTMLElement | null;
    if (badge) badge.style.display = claimable > 0 ? 'block' : 'none';

    const asleep = isAsleep();
    const urge: Record<string, boolean> = {
      喂食: !asleep && st.pet.hunger < 35,
      洗澡: !asleep && st.pet.clean < 35 && cooldownLeft('wash') === 0,
      摸摸: false,
      玩耍: !asleep && st.pet.mood < 45 && st.pet.energy >= 25 && cooldownLeft('play') === 0,
      睡觉: !asleep && st.pet.energy < 30,
    };
    for (const b of Array.from(this.elActions.children)) {
      const label = b.getAttribute('data-act') ?? '';
      b.classList.toggle('urge', !!urge[label]);
      // 睡着时按钮要能把自己变成「起床」，否则玩家找不到怎么叫醒
      if (label === '睡觉') {
        const em = b.querySelector('em') as HTMLElement;
        const tx = b.querySelectorAll('span')[0] as HTMLElement;
        em.textContent = asleep ? '⏰' : '😴';
        tx.textContent = asleep ? '起床' : '睡觉';
      }
    }

    if (full && this.editing) this.renderEditBar();
  }

  // ── 互动 ────────────────────────────────────────────────

  private act(fn: () => ActionResult): void {
    if (this.room.visiting) return;
    const r = fn();
    toast(r.msg);
    if (!r.ok) return;
    if (r.fx) this.room.sprite.react(r.fx);
    this.room.speak(pick(FEELING_TEXT[feelingOf(S())]), 2.4);
    if (r.levelUp) this.showLevelUp(r.levelUp);
  }

  private afterFeed(msg: string): void {
    this.room.sprite.react('crumb');
    this.room.speak(msg.split('　')[0], 2.4);
  }

  // ── 房间编辑条 ──────────────────────────────────────────

  private renderEditBar(): void {
    if (!this.editing) return;
    const bar = clear(this.elEdit);
    const sel: PlacedItem | null = this.room.selection;

    if (sel) {
      const def = furniById(sel.defId);
      bar.append(
        el('div.hint', null, `${def?.name ?? ''}　按住可以拖动`),
        el('div.row', null,
          el('button.btn.ghost', { style: 'flex:1', onclick: () => this.room.rotateSelected() }, '旋转'),
          el('button.btn.ghost', { style: 'flex:1', onclick: () => this.room.storeSelected() }, '收纳'),
          el('button.btn', { style: 'flex:1', onclick: () => this.setEditing(false) }, '完成'),
        ),
      );
      return;
    }

    const tray = trayItems();
    const trayRow = el(this.trayOpen ? 'div.tray.open' : 'div.tray');
    // 展开后是可纵向滚动的网格，重建时把滚动位置接回去
    trayRow.addEventListener('scroll', () => {
      if (this.trayOpen) this.trayScroll = trayRow.scrollTop;
    });
    if (!tray.length) {
      trayRow.append(
        el('div', { style: 'font-size:11px;color:var(--ink-soft);padding:14px 4px' },
          '家具都摆出来了，去商店买点新的吧'),
      );
    }
    for (const t of tray) {
      const def = furniById(t.defId);
      if (!def) continue;
      trayRow.append(
        el('button.cell', {
          onclick: () => {
            if (!this.room.beginPlace(def.id)) toast('房间里放不下了');
            this.renderEditBar();
          },
        },
          el('div.thumb', { html: furniThumb(def) }),
          el('div.nm', null, `${def.name}${t.left > 1 ? ` ×${t.left}` : ''}`),
        ),
      );
    }

    // 一键清空整屋布局，误触代价太大，做成两段确认
    const wipe = el('button.btn.ghost', null, '全部收纳');
    wipe.addEventListener('click', () => {
      if (wipe.dataset.armed) {
        this.room.storeAll();
        this.renderEditBar();
        return;
      }
      wipe.dataset.armed = '1';
      wipe.textContent = '确认清空？';
      wipe.style.color = 'var(--danger)';
      setTimeout(() => {
        if (!wipe.isConnected) return;
        delete wipe.dataset.armed;
        wipe.textContent = '全部收纳';
        wipe.style.color = '';
      }, 3000);
    });

    // 托盘默认是一条横排，家具一多就只能横着刮。展开后变成可纵向滚动的网格。
    const toggle = el('button.tray-toggle', {
      onclick: () => {
        this.trayOpen = !this.trayOpen;
        if (!this.trayOpen) this.trayScroll = 0;
        this.renderEditBar();
      },
    }, this.trayOpen ? '收起 ▾' : `展开 ▴　${tray.length} 件`);

    bar.append(
      el('div.tray-head', null,
        el('span.hint', null, `按住家具拖动　·　舒适度 ${comfortOf(S())}`),
        tray.length > 0 && toggle,
      ),
      trayRow,
      el('div.row', { style: 'margin-top:8px' },
        wipe,
        el('button.btn.ghost', { onclick: () => this.openSurfacePicker() }, '地板/墙纸'),
        el('button.btn', { style: 'flex:1', onclick: () => this.setEditing(false) }, '完成'),
      ),
    );

    // 必须在挂进 DOM 之后设——没布局的元素 scrollTop 写不进去
    if (this.trayOpen) trayRow.scrollTop = this.trayScroll;
  }

  private openSurfacePicker(): void {
    sheet('地板 / 墙纸', (body) => {
      const render = () => {
        clear(body);
        for (const [label, list, kind] of [
          ['地板', FLOORS, 'floor'],
          ['墙纸', WALLS, 'wall'],
        ] as const) {
          body.append(el('div', { style: 'font-size:12px;color:var(--ink-soft);margin:8px 0' }, label));
          const grid = el('div.grid');
          for (const def of list) {
            const key = `${kind}:${def.id}`;
            const has = def.price === 0 || S().owned.includes(key);
            const on = (kind === 'floor' ? S().room.floor : S().room.wall) === def.id;
            const node = el('button.cell', {
              onclick: () => {
                if (!has && S().coins < def.price) {
                  toast('金币不够');
                  return;
                }
                if (!has) {
                  S().coins -= def.price;
                  S().owned.push(key);
                }
                if (kind === 'floor') S().room.floor = def.id;
                else S().room.wall = def.id;
                store.changed();
                render();
              },
            },
              el('div.thumb', {
                html: `<svg viewBox="0 0 40 40" width="46" height="46"><rect width="40" height="40" rx="9" fill="${def.main}"/><path d="M0 26 H40 M0 33 H40" stroke="${def.accent}" stroke-width="4"/></svg>`,
              }),
              el('div.nm', null, def.name),
              has
                ? el('div.pr.owned', null, on ? '使用中' : '已拥有')
                : el('div.pr', null, el('i.dot'), String(def.price)),
            );
            if (on) node.classList.add('on');
            grid.append(node);
          }
          body.append(grid);
        }
      };
      render();
    });
  }

  // ── 弹窗 ────────────────────────────────────────────────

  private modal(build: (card: HTMLElement, close: () => void) => void): void {
    const mask = el('div.modal');
    const card = el('div.card');
    const close = () => mask.remove();
    mask.append(card);
    build(card, close);
    ui().append(mask);
  }

  private showRename(): void {
    this.modal((card, close) => {
      const input = el('input.input', {
        value: S().pet.name,
        maxlength: 12,
        style: 'text-align:center',
      }) as HTMLInputElement;
      card.append(
        el('h2', null, '改个名字'),
        el('div.field', { style: 'margin-bottom:12px' }, input),
        el('div', { style: 'display:flex;gap:8px' },
          el('button.btn.ghost', { style: 'flex:1', onclick: close }, '取消'),
          el('button.btn', {
            style: 'flex:1',
            onclick: () => {
              const v = input.value.trim();
              if (v) {
                S().pet.name = v;
                store.changed();
                void pushSave();
              }
              close();
            },
          }, '好了'),
        ),
      );
      setTimeout(() => input.select(), 60);
    });
  }

  private showIntro(): void {
    this.modal((card, close) => {
      const input = el('input.input', {
        value: 'Pata',
        maxlength: 12,
        style: 'text-align:center',
      }) as HTMLInputElement;
      card.append(
        el('h2', null, '一只小家伙住进来了'),
        el('p', null, '它会饿、会脏、会无聊。\n照顾它，把房间装成你喜欢的样子。'),
        el('div.field', null, el('label', null, '给它取个名字'), input),
        el('button.btn.wide', {
          onclick: () => {
            S().pet.name = input.value.trim() || 'Pata';
            S().introDone = true;
            store.changed();
            close();
            this.room.speak(`我叫 ${S().pet.name}，请多指教！`, 3.5);
          },
        }, '开始'),
      );
    });
  }

  private showOfflineReport(awayMs: number, coins: number): void {
    const st = S();
    this.modal((card, close) => {
      card.append(
        el('h2', null, `${st.pet.name} 等你回来`),
        el('p', null, `你离开了 ${fmtDuration(awayMs)}`),
        el('div.lines', null,
          el('div', null, el('span', null, '攒到的金币'), el('b', null, `+${coins}`)),
          el('div', null, el('span', null, '现在的心情'), el('b', null, `${Math.round(st.pet.mood)}/100`)),
          el('div', null, el('span', null, '饱食度'), el('b', null, `${Math.round(st.pet.hunger)}/100`)),
        ),
        el('button.btn.wide', { onclick: close }, '去看看它'),
      );
    });
  }

  private showLevelUp(lv: number): void {
    this.modal((card, close) => {
      card.append(
        el('h2', null, `亲密度 Lv.${lv}`),
        el('p', null, `和 ${S().pet.name} 更亲近了一点。\n解锁了新的食物和家具，去商店看看吧。`),
        el('div.lines', null, el('div', null, el('span', null, '获得'), el('b', null, '♥ 5'))),
        el('button.btn.wide', { onclick: close }, '好'),
      );
    });
  }
}
