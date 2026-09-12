import { Container, Graphics, Matrix, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { AvatarState, PlacedItem, RoomState, Rot } from '../model/types';
import { ROOM_H, ROOM_W, S, store } from '../model/store';
import { floorById, footprint, furniById, wallById } from '../data/furniture';
import { TH, TW, iso, makeFurniNode, unIso } from './furniture';
import { surfaceTexture } from './surfaceArt';
import type { FurniDef, SurfaceDef } from '../data/furniture';
import { PataSprite } from './pata';
import { FEELING_TEXT, feelingOf } from '../systems/sim';
import { bump } from '../systems/quests';
import { clamp, pick, shade, uid } from '../core/util';

const WALL_H = 88;
const SLEEP_LINES = ['呼…呼…', 'Zzz…', '梦到小鱼干了', '别吵…再睡五分钟'];
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';

interface ItemView {
  item: PlacedItem;
  /** 贴图模式是 Sprite，矢量模式是 Graphics，所以只能按 Container 存 */
  g: Container;
}

/**
 * 房间：等距场景 + 会散步的宠物 + 说话气泡。
 * 「小窝」删掉后这里就是主场景，宠物的所有日常互动都发生在这。
 */
export class RoomScene extends Container {
  private gBackdrop = new Graphics();
  private world = new Container();
  private gRoom = new Graphics();
  /** 贴图地板。用 Sprite 而不是 Graphics 的贴图填充，理由见 drawFloorArt() */
  private floorArt = new Container();
  private items = new Container();
  private gGhost = new Graphics();
  private pet: PataSprite;

  private bubble = new Container();
  private bubbleBg = new Graphics();
  private bubbleText: Text;
  private bubbleTimer = 3;

  private views: ItemView[] = [];
  private editing = false;

  /** 选中的家具（显示旋转/收纳工具条） */
  private selected: PlacedItem | null = null;
  /** 是否正跟着手指走 */
  private dragging = false;
  private dragFrom: { x: number; y: number } | null = null;
  private movedSinceDown = false;
  private grab = { dx: 0, dy: 0 };
  private valid = true;
  private selectionCb: ((it: PlacedItem | null) => void) | null = null;
  private petTapCb: (() => void) | null = null;

  /** 串门时加载的邻居快照；非空即为只读访客模式 */
  private guest: { room: RoomState; avatar: AvatarState; name: string } | null = null;

  /** 上次绘制时用的地板/墙纸，用来发现外部改动 */
  private lastSurfaces = '';

  private t = 0;
  private zzzAcc = 0;
  private petPos = { x: 3, y: 3 };
  private petTarget = { x: 3, y: 3 };
  private petWait = 1.5;
  /** 还没走完的逐格路径（不含当前格），空表示已到站在歇着 */
  private petPath: { x: number; y: number }[] = [];

  constructor() {
    super();
    this.pet = new PataSprite(S().avatar);
    // 再大就会横跨两格，跟相邻家具怎么排序都会压到
    this.pet.scale.set(0.44);
    this.pet.eventMode = 'static';
    this.pet.cursor = 'pointer';
    this.pet.on('pointertap', () => {
      if (!this.editing) this.petTapCb?.();
    });

    this.items.sortableChildren = true;
    this.world.addChild(this.gRoom, this.floorArt, this.items);
    // ghost 要夹在「地毯」和「立体家具」之间：
    // 放在 items 外面会被地毯盖掉（地毯 zIndex 是负的但整个容器在它之上），
    // 放到家具之上又会糊住正在摆的东西。
    this.gGhost.zIndex = -50;
    this.items.addChild(this.gGhost, this.pet);

    this.bubbleText = new Text({
      text: '',
      style: { fontFamily: FONT, fontSize: 14, fill: '#3a3532', align: 'center' },
    });
    this.bubbleText.anchor.set(0.5);
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.alpha = 0;

    this.addChild(this.gBackdrop, this.world, this.bubble);

    this.world.eventMode = 'static';
    this.world.hitArea = new Rectangle(
      (-ROOM_H * TW) / 2 - 30,
      -WALL_H - 20,
      ((ROOM_W + ROOM_H) * TW) / 2 + 60,
      ((ROOM_W + ROOM_H) * TH) / 2 + WALL_H + 60,
    );
    this.world.on('pointerdown', this.onDown);
    this.world.on('globalpointermove', this.onMove);
    this.world.on('pointerup', this.onUp);
    this.world.on('pointerupoutside', this.onUp);

    // 地板/墙纸有两个入口（商店、装修条），靠调用方各自记得重绘迟早会漏，
    // 之前商店那条就漏了。改成场景自己盯着存档，任何路径改了都能跟上。
    store.subscribe(() => {
      if (this.guest) return;
      if (`${S().room.floor}|${S().room.wall}` !== this.lastSurfaces) this.drawRoom();
    });

    this.rebuild();
  }

  get sprite(): PataSprite {
    return this.pet;
  }

  /** 渲染读的房间数据：串门时是邻居的快照，平时是自己的 */
  private roomData(): RoomState {
    return this.guest?.room ?? S().room;
  }

  get visiting(): string | null {
    return this.guest?.name ?? null;
  }

  /** 进入只读访客模式 */
  enterGuest(room: RoomState, avatar: AvatarState, name: string): void {
    this.setEditMode(false);
    this.guest = { room, avatar, name };
    this.petPos = { x: 3, y: 3 };
    this.petTarget = { x: 3, y: 3 };
    this.petPath = []; // 邻居家的家具布局不一样，自己家算的路径在这儿会穿模
    this.rebuild();
    this.speak(`这是 ${name} 的房间`, 3);
  }

  exitGuest(): void {
    if (!this.guest) return;
    this.guest = null;
    this.rebuild();
  }

  onSelectionChange(fn: (it: PlacedItem | null) => void): void {
    this.selectionCb = fn;
  }

  onPetTap(fn: () => void): void {
    this.petTapCb = fn;
  }

  get selection(): PlacedItem | null {
    return this.selected;
  }

  /** 调试用：某件家具当前画在屏幕的哪个位置（原点 = 占地中心的地面点） */
  screenPosOf(defId: string): { x: number; y: number } | null {
    const view = this.views.find((v) => v.item.defId === defId);
    if (!view) return null;
    const p = view.g.getGlobalPosition();
    return { x: p.x, y: p.y };
  }

  resize(w: number, h: number): void {
    const roomW = ((ROOM_W + ROOM_H) * TW) / 2;
    const scale = Math.min(1, (w - 24) / roomW);
    this.world.scale.set(scale);
    this.world.x = w / 2 + ((ROOM_H - ROOM_W) * (TW / 2) * scale) / 2;
    this.world.y = h * 0.5 - (((ROOM_W + ROOM_H) * TH) / 2 / 2) * scale;

    // 竖屏下等距房间上下必然留白，用一圈柔光把它托住，不然像飘在空中
    const cx = w / 2;
    const cy = this.world.y + (((ROOM_W + ROOM_H) * TH) / 2 / 2) * scale;
    const g = this.gBackdrop;
    g.clear();
    for (let i = 6; i >= 1; i--) {
      const k = i / 6;
      g.ellipse(cx, cy, w * 0.62 * k, h * 0.3 * k).fill({ color: '#ffffff', alpha: 0.075 });
    }
  }

  setEditMode(on: boolean): void {
    this.editing = on;
    // 装修时宠物必须让出点击权：它个头大又到处走，站在哪儿就挡住哪儿的家具，
    // 命中判定会先撞上它，家具的 pointerdown 根本收不到。
    this.pet.eventMode = on ? 'none' : 'static';
    if (!on) {
      this.dropDragged(true);
      this.select(null);
    }
    this.gGhost.clear();
    this.bubble.visible = !on;
  }

  // ── 绘制 ────────────────────────────────────────────────

  rebuild(): void {
    this.drawRoom();
    for (const v of this.views) v.g.destroy();
    this.views = [];
    for (const item of this.roomData().items) this.addView(item);
    this.items.sortChildren();
    this.ensurePetFree();
  }

  /**
   * 宠物贴图有两格宽，但只占一格。所以落点不仅自己要空，
   * 周围一圈最好也空，否则必然和邻格家具视觉重叠（排序再对也没用）。
   * margin=1 找不到位置时退回 margin=0，免得满屋家具时无处可站。
   */
  private freeCell(x: number, y: number, occ: Map<string, PlacedItem>, margin: number): boolean {
    for (let dx = -margin; dx <= margin; dx++) {
      for (let dy = -margin; dy <= margin; dy++) {
        if (occ.has(`f:${x + dx},${y + dy}`)) return false;
      }
    }
    return true;
  }

  /** 从房间中心向外找一个站得下的格子 */
  private pickCell(occ: Map<string, PlacedItem>): { x: number; y: number } | null {
    for (const margin of [1, 0]) {
      for (let r = 0; r < ROOM_W + ROOM_H; r++) {
        for (let x = 0; x < ROOM_W; x++) {
          for (let y = 0; y < ROOM_H; y++) {
            if (Math.abs(x - 3) + Math.abs(y - 3) !== r) continue;
            if (this.freeCell(x, y, occ, margin)) return { x, y };
          }
        }
      }
    }
    return null;
  }

  /**
   * 宠物脚下（含周围一圈）被家具占了就挪开。
   * 这里必须跟散步用同一个 margin=1 标准：只查 margin=0 的话，
   * 玩家把家具摆到宠物紧邻的格子时判定「没占到它」，宠物不让位，
   * 那只有一格宽的格子装不下一格半宽的贴图，就会半个身子陷进家具里。
   */
  private ensurePetFree(): void {
    const occ = this.occupancy();
    const at = { x: Math.round(this.petPos.x), y: Math.round(this.petPos.y) };
    if (this.freeCell(at.x, at.y, occ, 1)) return;
    // 走到一半时家具落在前方，剩下的路线可能已经穿墙了，重算
    this.petPath = [];
    const spot = this.pickCell(occ);
    // 连 margin=0 的空格都没有就只能原地待着，硬挪反而会跳到更糟的位置
    if (!spot || (!this.freeCell(at.x, at.y, occ, 0) && spot.x === at.x && spot.y === at.y)) {
      this.petTarget = { ...this.petPos };
      return;
    }
    this.petPos = { ...spot };
    this.petTarget = { ...spot };
  }

  /**
   * 在「站得下」的格子上做四向 BFS，返回从 from 到 to 的逐格路径（不含起点）。
   * 之前是从当前位置朝目标格直接线性插值，中间格一个都不检查——
   * 从房间一角走到另一角会径直穿过途中所有家具，这是穿模最主要的来源。
   * 起点本身不参与合法性判定：宠物可能正被家具挤着，得允许它走出来。
   */
  private routeTo(
    from: { x: number; y: number },
    to: { x: number; y: number },
    occ: Map<string, PlacedItem>,
    margin: number,
  ): { x: number; y: number }[] | null {
    const key = (x: number, y: number) => `${x},${y}`;
    const prev = new Map<string, string | null>([[key(from.x, from.y), null]]);
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      if (cur.x === to.x && cur.y === to.y) {
        const path: { x: number; y: number }[] = [];
        for (let k: string | null = key(cur.x, cur.y); k; k = prev.get(k) ?? null) {
          const [x, y] = k.split(',').map(Number);
          path.unshift({ x, y });
        }
        path.shift(); // 去掉起点，第一步就是下一格
        return path;
      }
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= ROOM_W || ny >= ROOM_H) continue;
        if (prev.has(key(nx, ny))) continue;
        if (!this.freeCell(nx, ny, occ, margin)) continue;
        prev.set(key(nx, ny), key(cur.x, cur.y));
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  /** 挑一个走得到的目标格，铺好整条路径 */
  private repath(): void {
    const occ = this.occupancy();
    const from = { x: Math.round(this.petPos.x), y: Math.round(this.petPos.y) };
    for (const margin of [1, 0]) {
      const spots: { x: number; y: number }[] = [];
      for (let x = 0; x < ROOM_W; x++) {
        for (let y = 0; y < ROOM_H; y++) {
          if ((x !== from.x || y !== from.y) && this.freeCell(x, y, occ, margin)) spots.push({ x, y });
        }
      }
      // 随机试几个，取第一个走得到的。全试一遍在家具围死时会白算 60 多次 BFS
      for (let i = 0; i < 10 && spots.length; i++) {
        const [to] = spots.splice(Math.floor(Math.random() * spots.length), 1);
        const route = this.routeTo(from, to, occ, margin);
        if (route?.length) {
          this.petPath = route;
          this.petTarget = this.petPath.shift() as { x: number; y: number };
          return;
        }
      }
    }
  }

  private drawRoom(): void {
    const g = this.gRoom;
    g.clear();
    const data = this.roomData();
    this.lastSurfaces = `${data.floor}|${data.wall}`;
    const floor = floorById(data.floor);
    const wall = wallById(data.wall);

    const p00 = iso(0, 0);
    const pX0 = iso(ROOM_W, 0);
    const p0Y = iso(0, ROOM_H);
    const right = [p00.x, p00.y, pX0.x, pX0.y, pX0.x, pX0.y - WALL_H, p00.x, p00.y - WALL_H];
    const left = [p00.x, p00.y, p0Y.x, p0Y.y, p0Y.x, p0Y.y - WALL_H, p00.x, p00.y - WALL_H];
    const edge = { color: shade(wall.main, -0.25), width: 2 };
    const tex = surfaceTexture(wall.tex);

    if (tex) {
      // 贴图不做等距斜切：竖条纹保持屏幕垂直、星星保持正立，才像贴在墙上的墙纸。
      // 整张缩放到刚好盖住两面墙的纵向跨度（顶边 -WALL_H 到底边 pX0.y），
      // 横向一张的宽度就够 -ROOM_W..ROOM_W 两面墙，不用平铺。
      const m = new Matrix()
        .scale((WALL_H + pX0.y) / tex.height, (WALL_H + pX0.y) / tex.height)
        .translate(p0Y.x, -WALL_H);
      g.poly(right).fill({ texture: tex, matrix: m });
      g.poly(right).stroke(edge);
      g.poly(left).fill({ texture: tex, matrix: m });
      // 左墙压暗，保住转角的明暗差；纯色墙那边是 shade(-0.1) 干的同一件事
      g.poly(left).fill({ color: 0x000000, alpha: 0.1 });
      g.poly(left).stroke(edge);
    } else {
      g.poly(right).fill(wall.main).stroke(edge);
      g.poly(left).fill(shade(wall.main, -0.1)).stroke(edge);

      // 贴图墙自带花纹，再叠这套分格竖线只会更乱，所以只有纯色墙画
      for (let i = 1; i < ROOM_W; i++) {
        const p = iso(i, 0);
        g.moveTo(p.x, p.y).lineTo(p.x, p.y - WALL_H).stroke({ color: wall.accent, width: 1.5 });
      }
      for (let i = 1; i < ROOM_H; i++) {
        const p = iso(0, i);
        g.moveTo(p.x, p.y).lineTo(p.x, p.y - WALL_H).stroke({ color: wall.accent, width: 1.5 });
      }
    }
    g.poly([p00.x, p00.y, pX0.x, pX0.y, pX0.x, pX0.y - 10, p00.x, p00.y - 10]).fill(
      shade(wall.main, -0.28),
    );
    g.poly([p00.x, p00.y, p0Y.x, p0Y.y, p0Y.x, p0Y.y - 10, p00.x, p00.y - 10]).fill(
      shade(wall.main, -0.34),
    );

    const pXY = iso(ROOM_W, ROOM_H);
    this.drawFloorArt(floor);

    if (!surfaceTexture(floor.tex)) {
      for (let x = 0; x < ROOM_W; x++) {
        for (let y = 0; y < ROOM_H; y++) {
          const a = iso(x, y);
          const b = iso(x + 1, y);
          const c = iso(x + 1, y + 1);
          const d = iso(x, y + 1);
          g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill(
            (x + y) % 2 === 0 ? floor.main : floor.accent,
          );
        }
      }
    }
    g.poly([p00.x, p00.y, pX0.x, pX0.y, pXY.x, pXY.y, p0Y.x, p0Y.y]).stroke({
      color: shade(floor.accent, -0.25),
      width: 2,
    });
  }

  /**
   * 贴图地板。
   *
   * 这里不能用墙那套 `fill({ texture, matrix })`：纯缩放的矩阵它认，但带等距斜切的
   * 矩阵它不认，实测图案会被压成一层极密的纹路（Pixi 内部对填充矩阵还做了一次变换）。
   * 改成一张 Sprite 直接摆位就没有这层歧义——Container 的 transform 是确定的。
   *
   * 裁成正方形是为了免掉遮罩：边长 = k*ROOM_W = k*ROOM_H 时，贴图的四个角经
   * setFromMatrix 之后正好落在地板菱形的四个角上，一个像素都不会溢出去。
   */
  private drawFloorArt(floor: SurfaceDef): void {
    this.floorArt.removeChildren();
    const tex = surfaceTexture(floor.tex);
    if (!tex) return;

    const side = Math.min(tex.width, tex.height);
    const sq = new Texture({ source: tex.source, frame: new Rectangle(0, 0, side, side) });
    const k = side / ROOM_W;
    const sprite = new Sprite(sq);
    // 贴图像素 (u,v) 当成网格坐标走 iso()：u 沿 +x 轴，v 沿 +y 轴
    sprite.setFromMatrix(
      new Matrix(TW / (2 * k), TH / (2 * k), -TW / (2 * k), TH / (2 * k), 0, 0),
    );
    this.floorArt.addChild(sprite);
  }

  private addView(item: PlacedItem): void {
    const def = furniById(item.defId);
    if (!def) return;
    const g = makeFurniNode(def, item.rot);
    // 交给 Pixi 对实际图形做几何命中判定。
    // 之前是把点击位置反投影成地板格子再查占位，高家具（落地灯、衣柜）的
    // 视觉主体离它的地面格很远，点灯罩等于在点灯罩下方那个空格子，根本选不中。
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointerdown', (e: FederatedPointerEvent) => this.onItemDown(e, item));
    this.placeNode(g, def, item);
    this.items.addChild(g);
    this.views.push({ item, g });
  }

  /** 把节点摆到 item 对应的位置并算好层级 */
  private placeNode(g: Container, def: FurniDef, item: PlacedItem): void {
    const fp = footprint(def, item.rot);
    const p = iso(item.x + fp.w / 2, item.y + fp.h / 2);
    g.x = p.x;
    g.y = p.y;
    g.zIndex =
      def.kind === 'rug' ? -100 + item.x + item.y : (item.x + item.y + (fp.w + fp.h) / 2) * 10;
  }

  // ── 占位与合法性 ────────────────────────────────────────

  /** 地毯层与家具层分开：家具可以摆在地毯上 */
  private occupancy(ignore?: PlacedItem): Map<string, PlacedItem> {
    const map = new Map<string, PlacedItem>();
    for (const it of this.roomData().items) {
      if (it === ignore) continue;
      const def = furniById(it.defId);
      if (!def) continue;
      const fp = footprint(def, it.rot);
      const layer = def.kind === 'rug' ? 'r' : 'f';
      for (let dx = 0; dx < fp.w; dx++) {
        for (let dy = 0; dy < fp.h; dy++) {
          map.set(`${layer}:${it.x + dx},${it.y + dy}`, it);
        }
      }
    }
    return map;
  }

  private canPlace(item: PlacedItem, at: { x: number; y: number }): boolean {
    const def = furniById(item.defId);
    if (!def) return false;
    const fp = footprint(def, item.rot);
    if (at.x < 0 || at.y < 0 || at.x + fp.w > ROOM_W || at.y + fp.h > ROOM_H) return false;
    const occ = this.occupancy(item);
    const layer = def.kind === 'rug' ? 'r' : 'f';
    for (let dx = 0; dx < fp.w; dx++) {
      for (let dy = 0; dy < fp.h; dy++) {
        if (occ.has(`${layer}:${at.x + dx},${at.y + dy}`)) return false;
      }
    }
    return true;
  }

  private findSpot(item: PlacedItem): { x: number; y: number } | null {
    for (let r = 0; r < ROOM_W + ROOM_H; r++) {
      for (let x = 0; x < ROOM_W; x++) {
        for (let y = 0; y < ROOM_H; y++) {
          if (Math.abs(x - 3) + Math.abs(y - 3) !== r) continue;
          if (this.canPlace(item, { x, y })) return { x, y };
        }
      }
    }
    return null;
  }

  // ── 交互 ────────────────────────────────────────────────

  /**
   * 按下即抓起，不再是「点一下拿起 → 再点一下放下」的两段式。
   * 两段式最大的问题是中间态没有视觉锚点，手指离开屏幕后家具还粘在手上，很容易误放。
   */
  /** 点在家具本体上：选中并立刻进入拖动 */
  private onItemDown = (e: FederatedPointerEvent, item: PlacedItem): void => {
    if (!this.editing) return;
    e.stopPropagation(); // 别让 world 的「点空地取消选中」跟着触发
    const p = this.world.toLocal(e.global);
    const { gx, gy } = unIso(p.x, p.y);

    this.dragging = true;
    this.movedSinceDown = false;
    this.dragFrom = { x: item.x, y: item.y };
    // 抓握偏移必须是「按下那一刻的真实差值」，不能 clamp。
    // clamp 过的值会被 onMove 拿去反推落点，差多少就位移多少：点在铁皮柜(78px)顶部时
    // 真实偏移是 -2.29，clamp 成 -0.5，手指一抖家具就跳 2 格。
    // 高家具的反投影格子本就远在物体下方——那正是「抓住的那一点跟着手指」应有的样子。
    this.grab = { dx: gx - item.x, dy: gy - item.y };
    this.valid = true;
    this.select(item);
    this.refreshDragView();
    this.refreshGhost();
  };

  /** 点在空地上：取消选中 */
  private onDown = (): void => {
    if (!this.editing) return;
    this.select(null);
    this.refreshGhost();
  };

  private onMove = (e: FederatedPointerEvent): void => {
    if (!this.editing || !this.dragging || !this.selected) return;
    const p = this.world.toLocal(e.global);
    const { gx, gy } = unIso(p.x, p.y);
    const def = furniById(this.selected.defId);
    if (!def) return;
    const fp = footprint(def, this.selected.rot);
    const nx = clamp(Math.round(gx - this.grab.dx), 0, ROOM_W - fp.w);
    const ny = clamp(Math.round(gy - this.grab.dy), 0, ROOM_H - fp.h);
    if (nx === this.selected.x && ny === this.selected.y) return;
    this.movedSinceDown = true;
    this.selected.x = nx;
    this.selected.y = ny;
    this.valid = this.canPlace(this.selected, { x: nx, y: ny });
    this.refreshDragView();
    this.refreshGhost();
  };

  /** 松手就落位。没移动过则视为轻点，只保持选中，方便接着按旋转/收纳 */
  private onUp = (): void => {
    if (!this.editing || !this.dragging) return;
    this.dropDragged();
    void this.movedSinceDown;
  };

  private dropDragged(revert = false): void {
    const item = this.selected;
    this.dragging = false;
    if (!item) return;

    if ((!this.valid || revert) && this.dragFrom) {
      item.x = this.dragFrom.x;
      item.y = this.dragFrom.y;
      if (!this.canPlace(item, this.dragFrom)) {
        const spot = this.findSpot(item);
        if (spot) {
          item.x = spot.x;
          item.y = spot.y;
        }
      }
    }
    this.valid = true;
    this.dragFrom = { x: item.x, y: item.y };
    this.refreshDragView(true);
    this.refreshGhost(); // 落位后保持选中描边，方便接着按旋转/收纳
    this.items.sortChildren();
    this.ensurePetFree(); // 家具可能正好落在宠物脚下
    store.changed();
  }

  private select(it: PlacedItem | null): void {
    this.selected = it;
    if (!it) this.dragging = false;
    this.selectionCb?.(it);
  }

  /** settled=true 表示已落位，恢复正常层级与不透明度 */
  private refreshDragView(settled = false): void {
    const item = this.selected;
    if (!item) return;
    const view = this.views.find((v) => v.item === item);
    const def = furniById(item.defId);
    if (!view || !def) return;

    // 旋转会换朝向（贴图靠翻转、矢量靠重画），整体换掉节点比就地改省事也更可靠
    if (view.g.destroyed || (view.g as Container & { _rot?: number })._rot !== item.rot) {
      const next = makeFurniNode(def, item.rot);
      next.eventMode = 'static';
      next.cursor = 'pointer';
      next.on('pointerdown', (e: FederatedPointerEvent) => this.onItemDown(e, item));
      (next as Container & { _rot?: number })._rot = item.rot;
      this.items.removeChild(view.g);
      view.g.destroy();
      view.g = next;
      this.items.addChild(next);
    }

    this.placeNode(view.g, def, item);
    if (settled) {
      view.g.alpha = 1;
    } else {
      view.g.alpha = this.valid ? 0.95 : 0.55;
      view.g.zIndex = 9999;
    }
  }

  /**
   * 选中即画琥珀色描边，拖动时才换成绿/红的合法性提示。
   * 没有这条常驻描边，玩家点完没有任何反馈，根本不知道自己选中了没有。
   */
  private refreshGhost(): void {
    const g = this.gGhost;
    g.clear();
    const item = this.selected;
    if (!item) return;
    const def = furniById(item.defId);
    if (!def) return;
    const fp = footprint(def, item.rot);

    const A = iso(item.x, item.y);
    const B = iso(item.x + fp.w, item.y);
    const C = iso(item.x + fp.w, item.y + fp.h);
    const D = iso(item.x, item.y + fp.h);

    if (!this.dragging) {
      g.poly([A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y])
        .fill({ color: '#ffc44d', alpha: 0.2 })
        .stroke({ color: '#f5a623', width: 3 });
      return;
    }

    const color = this.valid ? '#6fd39a' : '#ff6b6b';
    for (let dx = 0; dx < fp.w; dx++) {
      for (let dy = 0; dy < fp.h; dy++) {
        const a = iso(item.x + dx, item.y + dy);
        const b = iso(item.x + dx + 1, item.y + dy);
        const c = iso(item.x + dx + 1, item.y + dy + 1);
        const d = iso(item.x + dx, item.y + dy + 1);
        g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color, alpha: 0.42 });
      }
    }
    g.poly([A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y]).stroke({ color, width: 3 });
  }

  // ── 编辑操作 ────────────────────────────────────────────

  beginPlace(defId: string): boolean {
    const def = furniById(defId);
    if (!def) return false;
    this.dropDragged(true);
    const item: PlacedItem = { uid: uid('f'), defId, x: 0, y: 0, rot: 0 };
    const spot = this.findSpot(item);
    if (!spot) return false;
    item.x = spot.x;
    item.y = spot.y;
    S().room.items.push(item);
    this.addView(item);
    bump('place');
    this.dragFrom = { ...spot };
    this.valid = true;
    this.select(item);
    this.refreshDragView(true);
    this.refreshGhost();
    this.items.sortChildren();
    this.ensurePetFree();
    store.changed();
    return true;
  }

  rotateSelected(): void {
    const item = this.selected;
    if (!item) return;
    const prev = item.rot;
    item.rot = ((item.rot + 1) % 4) as Rot;
    if (!this.canPlace(item, { x: item.x, y: item.y })) {
      const spot = this.findSpot(item);
      if (spot) {
        item.x = spot.x;
        item.y = spot.y;
      } else {
        item.rot = prev;
      }
    }
    this.valid = true;
    this.dragFrom = { x: item.x, y: item.y };
    this.refreshDragView(true);
    // 旋转会换占地格集合：描边得重画（否则停在旋转前的尺寸/位置），
    // 新占的格子也可能正压在宠物身上
    this.refreshGhost();
    this.items.sortChildren();
    this.ensurePetFree();
    store.changed();
  }

  storeSelected(): void {
    const item = this.selected;
    if (!item) return;
    const idx = S().room.items.indexOf(item);
    if (idx >= 0) S().room.items.splice(idx, 1);
    const vi = this.views.findIndex((v) => v.item === item);
    if (vi >= 0) {
      this.views[vi].g.destroy();
      this.views.splice(vi, 1);
    }
    this.dragFrom = null;
    this.gGhost.clear();
    this.select(null);
    store.changed();
  }

  storeAll(): void {
    this.dropDragged(true);
    S().room.items = [];
    this.select(null);
    this.rebuild();
    store.changed();
  }

  // ── 说话气泡 ────────────────────────────────────────────

  speak(text: string, hold = 2.6): void {
    this.bubbleText.text = text;
    const pad = 13;
    const bw = this.bubbleText.width + pad * 2;
    const bh = this.bubbleText.height + pad;
    this.bubbleBg.clear();
    this.bubbleBg
      .roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2)
      .fill('#ffffff')
      .stroke({ color: '#e8ddcd', width: 2 });
    this.bubbleBg.poly([-7, bh / 2 - 1, 7, bh / 2 - 1, 0, bh / 2 + 10]).fill('#ffffff');
    this.bubble.alpha = 0;
    this.bubble.scale.set(0.85);
    this.bubbleTimer = -hold;
  }

  // ── 逐帧 ────────────────────────────────────────────────

  update(dt: number): void {
    this.t += dt;
    // 串门时展示的是邻居家的宠物
    this.pet.setAvatar(this.guest?.avatar ?? S().avatar);
    this.pet.setFeeling(this.guest ? 'happy' : feelingOf(S()));
    this.pet.update(dt);

    // 睡着就别乱跑，定期冒 zzz，偶尔说句梦话让玩家知道它在睡。
    // 注意别在这里 return：气泡的定位在函数末尾，早退会把它永远钉在场景原点，
    // 而 sleepAt 是会存盘的——睡着时关掉页面再打开，气泡就挂在画布左上角。
    const asleep = !this.guest && S().pet.sleepAt !== null;
    if (asleep) {
      this.zzzAcc -= dt;
      if (this.zzzAcc <= 0) {
        this.pet.react('zzz');
        this.zzzAcc = 2.6;
      }
    } else {
      // 散步：走到目标格，歇一会儿，再挑下一个
      const d = { x: this.petTarget.x - this.petPos.x, y: this.petTarget.y - this.petPos.y };
      const dist = Math.hypot(d.x, d.y);
      if (dist < 0.05) {
        // 路径没走完就直接迈下一格、不歇脚，看起来才是连贯地走过去
        if (this.petPath.length) {
          this.petTarget = this.petPath.shift() as { x: number; y: number };
        } else {
          this.petWait -= dt;
          if (this.petWait <= 0) {
            this.repath();
            this.petWait = 1.5 + Math.random() * 4;
          }
        }
      } else {
        const sp = Math.min(1, (dt * 1.1) / dist);
        this.petPos.x += d.x * sp;
        this.petPos.y += d.y * sp;
      }
    }

    const p = iso(this.petPos.x + 0.5, this.petPos.y + 0.5);
    this.pet.x = p.x;
    this.pet.y = p.y;
    // 宠物画在格子中心 iso(x+.5, y+.5)，深度就得按 x+y+1 算。
    // 写成 (x+y)*10+5 会低半格，导致本该在它身后的家具盖到它脸上。
    this.pet.zIndex = (this.petPos.x + this.petPos.y + 1) * 10;

    // 气泡画在屏幕层，不随房间缩放，否则文字会跟着糊掉
    const k = this.world.scale.x;
    this.bubble.x = this.world.x + p.x * k;
    this.bubble.y = this.world.y + (p.y - 86) * k + Math.sin(this.t * 2) * 3;

    this.tickBubble(dt, asleep ? SLEEP_LINES : FEELING_TEXT[feelingOf(S())]);
  }

  /** 气泡淡入淡出 + 到点换一句。lines 为空表示这一帧不主动说话 */
  private tickBubble(dt: number, lines: readonly string[]): void {
    if (this.bubbleTimer < 0) {
      this.bubbleTimer += dt;
      this.bubble.alpha = Math.min(1, this.bubble.alpha + dt * 6);
      this.bubble.scale.set(Math.min(1, this.bubble.scale.x + dt * 1.2));
      if (this.bubbleTimer >= 0) this.bubbleTimer = 7 + Math.random() * 7;
      return;
    }
    this.bubbleTimer -= dt;
    this.bubble.alpha = Math.max(0, this.bubble.alpha - dt * 3);
    if (this.bubbleTimer <= 0 && !this.editing && !this.guest && lines.length) {
      this.speak(pick(lines), 3.2);
    }
  }
}
