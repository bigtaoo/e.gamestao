import { Container, FillGradient, Graphics, Sprite } from 'pixi.js';
import { petTexture } from './petArt';
import type { AvatarState } from '../model/types';
import type { PetFeeling } from '../systems/sim';
import type { Fx } from '../systems/actions';
import type { BodyDef } from '../data/avatar';
import { blushById, bodyById, hatById } from '../data/avatar';
import { pick, shade } from '../core/util';

const INK = '#2e2723';
/** 名义占位尺寸，外部（气泡偏移、粒子范围）按它来算 */
const W = 150;
const H = 152;
/** 贴图模式下立绘的目标宽度 */
const ART_W = 205;
/** 尾巴根部 */
const TAIL_X = 52;
const TAIL_Y = 24;

/** 坐姿猫的身体：脑袋和身子连成一团，脸颊最宽，下摆外扩 */
function bodyPath(g: Graphics): void {
  g.moveTo(0, -62);
  g.bezierCurveTo(42, -64, 70, -42, 72, -8);
  g.bezierCurveTo(74, 24, 68, 52, 60, 66);
  g.bezierCurveTo(40, 75, -40, 75, -60, 66);
  g.bezierCurveTo(-68, 52, -74, 24, -72, -8);
  g.bezierCurveTo(-70, -42, -42, -64, 0, -62);
  g.closePath();
}

/** 三角猫耳。先画耳朵后画身体，耳根被身体填充盖住，轮廓才连得上 */
function earPath(g: Graphics, side: number): void {
  const s = side;
  g.moveTo(s * 64, -32);
  g.quadraticCurveTo(s * 58, -84, s * 46, -101);
  g.quadraticCurveTo(s * 34, -88, s * 14, -58);
  g.closePath();
}

function innerEarPath(g: Graphics, side: number): void {
  const s = side;
  g.moveTo(s * 55, -40);
  g.quadraticCurveTo(s * 51, -76, s * 44, -88);
  g.quadraticCurveTo(s * 37, -78, s * 25, -57);
  g.closePath();
}

/** 蓬松的卷尾巴，原点在尾根 */
function tailPath(g: Graphics): void {
  g.moveTo(0, -14);
  g.bezierCurveTo(36, -30, 72, -8, 70, 26);
  g.bezierCurveTo(68, 58, 44, 76, 22, 70);
  g.bezierCurveTo(8, 66, 4, 50, 16, 44);
  g.bezierCurveTo(28, 39, 40, 30, 38, 16);
  g.bezierCurveTo(35, -2, 18, -6, 0, 6);
  g.closePath();
}

/** 胸口白绒毛：一片带鼓包的云，单条外轮廓 */
function fluffPath(g: Graphics, cy: number, k: number): void {
  const p = (x: number, y: number): [number, number] => [x * k, cy + y * k];
  const c = (a: number[], b: number[], d: number[]) =>
    g.bezierCurveTo(
      ...(p(a[0], a[1]) as [number, number]),
      ...(p(b[0], b[1]) as [number, number]),
      ...(p(d[0], d[1]) as [number, number]),
    );
  g.moveTo(...(p(-32, 2) as [number, number]));
  c([-38, -18], [-14, -28], [-4, -14]);
  c([6, -28], [34, -18], [31, 0]);
  c([42, 14], [28, 30], [12, 28]);
  c([-4, 36], [-27, 26], [-32, 2]);
  g.closePath();
}

export type EyeMode =
  | 'gentle' | 'dot' | 'happy' | 'sleepy' | 'sparkle' | 'wink' | 'star' | 'closed' | 'sad';

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  spin: number;
}

/** 渐变对象按体色缓存：每次重绘都 new 会漏纹理 */
const gradients = new Map<string, FillGradient>();
function bodyFill(def: BodyDef): FillGradient {
  let grad = gradients.get(def.id);
  if (!grad) {
    grad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: def.main },
        { offset: 0.32, color: def.main },
        { offset: 1, color: def.tip },
      ],
      textureSpace: 'local',
    });
    gradients.set(def.id, grad);
  }
  return grad;
}

/**
 * 程序化绘制的 Pata（坐姿猫）。
 * 分 尾巴/身体(含耳)/前景(绒毛·前爪)/脸/头饰 五层，
 * 只在配置或表情变化时重绘，逐帧只改变换——尾巴因此能单独摇。
 */
export class PataSprite extends Container {
  private gShadow = new Graphics();
  private body = new Container();
  private gTail = new Graphics();
  private gBody = new Graphics();
  private gFront = new Graphics();
  private gFace = new Graphics();
  private gHat = new Graphics();
  private fxLayer = new Container();
  /** 有贴图时用它顶替上面那堆矢量图层 */
  private art: Sprite | null = null;

  private avatar!: AvatarState;
  private feeling: PetFeeling = 'ok';

  private t = 0;
  private blinkAt = 2;
  private blinking = false;
  private lastEyeMode: EyeMode | null = null;

  private reactT = 0;
  private reactKind: 'hop' | 'chew' | 'shiver' | 'wiggle' | null = null;

  private particles: Particle[] = [];

  constructor(avatar: AvatarState) {
    super();
    this.addChild(this.gShadow, this.body, this.fxLayer);

    const tex = petTexture();
    if (tex) {
      const art = new Sprite(tex);
      art.anchor.set(0.5);
      art.scale.set(ART_W / tex.width);
      // 裁切后的宽高比未知，按实际高度把脚底对到阴影上
      art.y = 84 - art.height / 2;
      this.art = art;
      this.body.addChild(art, this.gHat);
    } else {
      this.body.addChild(this.gTail, this.gBody, this.gFront, this.gFace, this.gHat);
      this.gTail.position.set(TAIL_X, TAIL_Y);
    }

    this.setAvatar(avatar);
    this.drawShadow();
  }

  /** 贴图模式下，花纹/眼睛/腮红是画死在图里的 */
  get usesArt(): boolean {
    return this.art !== null;
  }

  setAvatar(avatar: AvatarState): void {
    const prev = this.avatar;
    this.avatar = { ...avatar };

    if (this.art) {
      // 不做 tint：正片叠底染手绘立绘只会发灰。立绘的配色就是它本来的样子。
      if (!prev || prev.hat !== avatar.hat) this.drawHat();
      return;
    }

    if (!prev || prev.body !== avatar.body || prev.pattern !== avatar.pattern) {
      this.drawBody();
    }
    if (!prev || prev.eyes !== avatar.eyes || prev.blush !== avatar.blush) {
      this.lastEyeMode = null;
      this.drawFace();
    }
    if (!prev || prev.hat !== avatar.hat) this.drawHat();
  }

  setFeeling(f: PetFeeling): void {
    if (this.feeling === f) return;
    this.feeling = f;
    if (!this.art) this.drawFace();
  }

  // ── 绘制 ────────────────────────────────────────────────

  private drawShadow(): void {
    this.gShadow.clear();
    this.gShadow.ellipse(4, 80, 62, 11).fill({ color: '#2e2a26', alpha: 0.12 });
  }

  private drawBody(): void {
    const def = bodyById(this.avatar.body);
    const fill = bodyFill(def);
    const stroke = { color: INK, width: 5, join: 'round' as const };

    // 尾巴（在身体之后，所以画在最底层）
    const t = this.gTail;
    t.clear();
    tailPath(t);
    t.fill(fill).stroke(stroke);

    const g = this.gBody;
    g.clear();

    // 耳朵先画，耳根随后被身体盖掉，轮廓才是连续的
    for (const side of [-1, 1]) {
      earPath(g, side);
      g.fill(fill).stroke(stroke);
    }
    bodyPath(g);
    g.fill(fill).stroke(stroke);
    // 内耳粉色三角要压在身体之后，否则会被身体填充盖住
    for (const side of [-1, 1]) {
      innerEarPath(g, side);
      g.fill('#f7b8bd');
    }

    this.drawPattern(g, def);

    // 前景：胸口绒毛 + 两只前爪
    const f = this.gFront;
    f.clear();
    // 绒毛要落在胸口，往上挪一点就会盖住嘴、变成一把白胡子
    fluffPath(f, 42, 0.85);
    f.fill(def.belly).stroke({ color: INK, width: 4, join: 'round' });
    for (const sx of [-1, 1]) {
      f.roundRect(sx * 18 - 16, 50, 32, 24, 12)
        .fill(def.belly)
        .stroke({ color: INK, width: 4 });
    }
    // 脚趾缝
    for (const tx of [-25, -11, 11, 25]) {
      f.moveTo(tx, 62).lineTo(tx, 72).stroke({ color: INK, width: 3, cap: 'round' });
    }
  }

  private drawPattern(g: Graphics, def: BodyDef): void {
    const mark = shade(def.tip, -0.12);
    switch (this.avatar.pattern) {
      case 'belly':
        g.ellipse(0, 40, 30, 22).fill({ color: def.belly, alpha: 0.85 });
        break;
      case 'spot':
        g.circle(-42, -34, 15).fill({ color: mark, alpha: 0.65 });
        g.circle(40, -18, 9).fill({ color: mark, alpha: 0.65 });
        break;
      case 'stripe':
        for (let i = 0; i < 3; i++) {
          const y = -36 + i * 17;
          g.moveTo(50, y)
            .quadraticCurveTo(66, y + 7, 56, y + 17)
            .stroke({ color: mark, width: 5.5, cap: 'round', alpha: 0.7 });
        }
        break;
      case 'freckle':
        for (const sx of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            g.circle(sx * (40 + i * 8), 2 + (i % 2) * 6, 2.6).fill({ color: mark, alpha: 0.75 });
          }
        }
        break;
      default:
        break;
    }
  }

  private eyeMode(): EyeMode {
    if (this.blinking) return 'closed';
    if (this.feeling === 'tired') return 'sleepy';
    if (this.feeling === 'sad') return 'sad';
    if (this.feeling === 'happy' && this.avatar.eyes === 'dot') return 'sparkle';
    return this.avatar.eyes as EyeMode;
  }

  private drawFace(): void {
    const g = this.gFace;
    const mode = this.eyeMode();
    this.lastEyeMode = mode;
    g.clear();

    const ex = 27;
    const ey = -6;

    const blush = blushById(this.avatar.blush);
    if (blush.id !== 'none') {
      for (const sx of [-1, 1]) {
        g.ellipse(sx * 46, ey + 18, 14, 9).fill({ color: blush.color, alpha: 0.45 });
      }
    }

    // 胡须：从脸颊向外甩，是猫最强的识别特征
    for (const sx of [-1, 1]) {
      for (const [y0, y1] of [[8, 0], [17, 15], [26, 30]]) {
        g.moveTo(sx * 40, ey + y0)
          .quadraticCurveTo(sx * 60, ey + (y0 + y1) / 2, sx * 78, ey + y1)
          .stroke({ color: INK, width: 2.6, cap: 'round' });
      }
    }

    this.drawEye(g, -ex, ey, mode, -1);
    this.drawEye(g, ex, ey, mode === 'wink' ? 'happy' : mode, 1);
    this.drawMouth(g, 0, ey + 22);
  }

  private drawEye(g: Graphics, x: number, y: number, mode: EyeMode, side: number): void {
    switch (mode) {
      case 'gentle': {
        // 猫眼：棕色虹膜 + 压在上面的粗黑眼睑，眼睑向外侧延伸出一截
        const rx = 15;
        const ry = 12.5;
        g.ellipse(x, y + 2, rx, ry).fill('#7a4d26');
        g.circle(x + side * 7, y + 4, 3.6).fill('#ffffff');
        // 眼睑要压在虹膜上沿、跟它咬合；留出缝隙就成了一条独立的眉毛
        g.moveTo(x - rx - side * 2, y + 2)
          .quadraticCurveTo(x, y - ry - 2, x + rx + side * 3, y)
          .stroke({ color: '#241d1a', width: 9, cap: 'round' });
        break;
      }
      case 'happy':
        g.moveTo(x - 13, y + 5)
          .quadraticCurveTo(x, y - 13, x + 13, y + 5)
          .stroke({ color: INK, width: 5, cap: 'round' });
        break;
      case 'closed':
        g.moveTo(x - 13, y).quadraticCurveTo(x, y + 7, x + 13, y).stroke({
          color: INK,
          width: 5,
          cap: 'round',
        });
        break;
      case 'sleepy':
        g.moveTo(x - 13, y).quadraticCurveTo(x, y + 7, x + 13, y).stroke({
          color: INK,
          width: 5,
          cap: 'round',
        });
        g.moveTo(x - 7, y + 8).lineTo(x - 9, y + 14).stroke({ color: INK, width: 3, cap: 'round' });
        break;
      case 'sad':
        g.circle(x, y + 3, 9).fill(INK);
        g.moveTo(x - 13, y - 12)
          .quadraticCurveTo(x - 2 * side, y - 17, x + 12, y - 6)
          .stroke({ color: INK, width: 4, cap: 'round' });
        break;
      case 'sparkle':
        g.circle(x, y, 11).fill(INK);
        g.circle(x - 4, y - 4, 4).fill('#ffffff');
        g.circle(x + 4, y + 4, 2).fill({ color: '#ffffff', alpha: 0.8 });
        break;
      case 'star': {
        const pts: number[] = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 13 : 5.5;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.poly(pts).fill('#ffd45e').stroke({ color: INK, width: 2.5, join: 'round' });
        break;
      }
      default:
        g.circle(x, y, 10).fill(INK);
        g.circle(x - 3.5, y - 3.5, 3.5).fill('#ffffff');
        break;
    }
  }

  private drawMouth(g: Graphics, x: number, y: number): void {
    if (this.reactKind === 'chew') {
      g.ellipse(x, y + 2, 9, 7).fill('#e07b7b').stroke({ color: INK, width: 3 });
      return;
    }
    switch (this.feeling) {
      case 'sad':
        g.moveTo(x - 9, y + 4).quadraticCurveTo(x, y - 5, x + 9, y + 4).stroke({
          color: INK,
          width: 3.5,
          cap: 'round',
        });
        break;
      case 'hungry':
        g.ellipse(x, y + 1, 7, 6).fill('#e07b7b').stroke({ color: INK, width: 3 });
        break;
      default:
        // 猫嘴：ω 形
        g.moveTo(x - 12, y - 3)
          .quadraticCurveTo(x - 6, y + 6, x, y - 1)
          .quadraticCurveTo(x + 6, y + 6, x + 12, y - 3)
          .stroke({ color: INK, width: 3.6, cap: 'round' });
        break;
    }
  }

  private drawHat(): void {
    const g = this.gHat;
    g.clear();
    const def = hatById(this.avatar.hat);
    if (!def) return;
    // 贴图的头顶位置跟矢量版不同，头饰要挂到实际的上边缘
    const top = this.art ? this.art.y - this.art.height / 2 + 10 : -104;

    switch (def.id) {
      case 'halo':
        g.ellipse(4, top - 22, 40, 11).stroke({ color: def.color, width: 9 });
        g.ellipse(4, top - 24, 40, 11).stroke({ color: '#fffbe8', width: 3 });
        break;
      case 'bow':
        g.ellipse(-18, top + 6, 15, 11).fill(def.color).stroke({ color: INK, width: 3.5 });
        g.ellipse(18, top + 6, 15, 11).fill(def.color).stroke({ color: INK, width: 3.5 });
        g.circle(0, top + 6, 7).fill(shade(def.color, -0.15)).stroke({ color: INK, width: 3.5 });
        break;
      case 'cap':
        g.ellipse(0, top + 14, 40, 24).fill(def.color).stroke({ color: INK, width: 4 });
        g.ellipse(0, top + 24, 50, 11).fill(def.color).stroke({ color: INK, width: 4 });
        g.circle(0, top - 6, 5).fill(shade(def.color, -0.2)).stroke({ color: INK, width: 3 });
        break;
      case 'flower':
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          g.circle(-30 + Math.cos(a) * 11, top + 12 + Math.sin(a) * 11, 8)
            .fill(def.color)
            .stroke({ color: INK, width: 3 });
        }
        g.circle(-30, top + 12, 6).fill('#fff4d0').stroke({ color: INK, width: 3 });
        break;
      case 'crown':
        g.poly([-26, top + 16, -26, top - 8, -13, top + 6, 0, top - 14, 13, top + 6, 26, top - 8, 26, top + 16])
          .fill(def.color)
          .stroke({ color: INK, width: 4, join: 'round' });
        g.circle(0, top + 10, 4).fill('#ff8fa3');
        break;
      case 'leaf':
        g.ellipse(18, top + 4, 20, 11).fill(def.color).stroke({ color: INK, width: 3.5 });
        g.moveTo(2, top + 10).quadraticCurveTo(14, top + 4, 34, top).stroke({
          color: INK,
          width: 3,
          cap: 'round',
        });
        break;
      case 'horn':
        for (const sx of [-1, 1]) {
          g.poly([sx * 16, top + 22, sx * 26, top - 6, sx * 34, top + 16])
            .fill(def.color)
            .stroke({ color: INK, width: 3.5, join: 'round' });
        }
        break;
      default:
        break;
    }
  }

  // ── 动画 ────────────────────────────────────────────────

  react(fx: Fx): void {
    const kind =
      fx === 'crumb' ? 'chew' : fx === 'bubble' ? 'shiver' : fx === 'note' ? 'hop' : 'wiggle';
    this.reactKind = kind;
    this.reactT = kind === 'chew' ? 1.6 : 1.0;
    this.spawn(fx);
    if (kind === 'chew' && !this.art) this.drawFace();
  }

  private spawn(fx: Fx): void {
    const n = fx === 'bubble' ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const g = new Graphics();
      const s = 0.6 + Math.random() * 0.7;
      switch (fx) {
        case 'heart':
          g.moveTo(0, 5)
            .bezierCurveTo(-9, -3, -5, -11, 0, -6)
            .bezierCurveTo(5, -11, 9, -3, 0, 5)
            .fill('#ff8fa3');
          break;
        case 'bubble':
          g.circle(0, 0, 6).fill({ color: '#bfe9ff', alpha: 0.75 }).stroke({
            color: '#ffffff',
            width: 2,
          });
          break;
        case 'crumb':
          g.roundRect(-3, -3, 6, 6, 2).fill('#d9a86c');
          break;
        case 'note':
          g.circle(-3, 4, 4).fill('#8fd9b6');
          g.rect(0, -10, 3, 14).fill('#8fd9b6');
          break;
        case 'zzz':
          g.rect(-5, -5, 10, 3).fill('#9aa7b5');
          g.rect(-5, 2, 10, 3).fill('#9aa7b5');
          break;
        default:
          g.star(0, 0, 5, 7, 3).fill('#ffd45e');
          break;
      }
      g.scale.set(s);
      // zzz 要从头顶冒，其它特效围着身体中段
      g.x = (Math.random() - 0.5) * (fx === 'zzz' ? W * 0.4 : W * 0.8);
      g.y = fx === 'zzz' ? -H * 0.55 - Math.random() * 20 : -H * 0.1 + (Math.random() - 0.5) * 40;
      this.fxLayer.addChild(g);
      this.particles.push({
        g,
        vx: (Math.random() - 0.5) * 50,
        vy: -50 - Math.random() * 70,
        life: 0,
        ttl: 0.9 + Math.random() * 0.5,
        spin: (Math.random() - 0.5) * 5,
      });
    }
  }

  /** dt 单位：秒 */
  update(dt: number): void {
    this.t += dt;

    // 贴图是死的，眨眼和表情切换只在矢量模式下有意义
    if (!this.art) {
      this.blinkAt -= dt;
      if (this.blinkAt <= 0) {
        if (!this.blinking) {
          this.blinking = true;
          this.blinkAt = 0.12;
        } else {
          this.blinking = false;
          this.blinkAt = 2.2 + Math.random() * 3.4;
        }
        this.drawFace();
      } else if (this.lastEyeMode !== this.eyeMode()) {
        this.drawFace();
      }
    }

    const breathe = Math.sin(this.t * 1.7);
    let sx = 1 + breathe * 0.02;
    let sy = 1 - breathe * 0.026;
    let oy = breathe * 2.5;
    let rot = 0;
    let tailKick = 0;

    if (this.reactKind && this.reactT > 0) {
      this.reactT -= dt;
      const p = this.reactT;
      switch (this.reactKind) {
        case 'hop': {
          const hop = Math.abs(Math.sin(p * 9)) * 24 * Math.min(1, p);
          oy -= hop;
          sy += hop * 0.002;
          tailKick = hop * 0.012;
          break;
        }
        case 'chew': {
          const c = Math.sin(p * 22);
          sx += c * 0.045;
          sy -= c * 0.045;
          break;
        }
        case 'shiver':
          rot = Math.sin(p * 30) * 0.06 * Math.min(1, p);
          tailKick = Math.sin(p * 30) * 0.2;
          break;
        case 'wiggle':
          rot = Math.sin(p * 12) * 0.09 * Math.min(1, p);
          tailKick = Math.sin(p * 10) * 0.28;
          break;
      }
      if (this.reactT <= 0) {
        const was = this.reactKind;
        this.reactKind = null;
        if (was === 'chew' && !this.art) this.drawFace();
      }
    }

    this.body.scale.set(sx, sy);
    this.body.y = oy;
    this.body.rotation = rot;

    // 尾巴慢悠悠地摇，比呼吸慢一点才显得松弛
    if (!this.art) {
      this.gTail.rotation = Math.sin(this.t * 1.05) * 0.1 + tailKick;
    }

    this.gShadow.scale.set(1 - oy * 0.006, 1);
    this.gShadow.alpha = 1 - Math.abs(oy) * 0.012;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.ttl) {
        p.g.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 40 * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.rotation += p.spin * dt;
      p.g.alpha = 1 - p.life / p.ttl;
    }
  }

  static line(lines: string[]): string {
    return pick(lines);
  }
}
