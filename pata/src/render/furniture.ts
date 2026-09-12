import { Container, Graphics, Sprite } from 'pixi.js';
import type { FurniDef } from '../data/furniture';
import { footprint } from '../data/furniture';
import { FURNI_SHEET_URL, furniTexture, sheetSize } from './furniArt';
import { shade } from '../core/util';

export const TW = 56;
export const TH = 28;

export const iso = (gx: number, gy: number) => ({
  x: ((gx - gy) * TW) / 2,
  y: ((gx + gy) * TH) / 2,
});

/** 屏幕坐标 → 网格坐标（未取整） */
export const unIso = (sx: number, sy: number) => ({
  gx: (sx / (TW / 2) + sy / (TH / 2)) / 2,
  gy: (sy / (TH / 2) - sx / (TW / 2)) / 2,
});

const LINE = '#5c5047';
const STROKE = { color: LINE, width: 2, join: 'round' as const };

interface Corners {
  A: { x: number; y: number };
  B: { x: number; y: number };
  C: { x: number; y: number };
  D: { x: number; y: number };
}

/** 以 footprint 中心为原点的四角：A 后 / B 右 / C 前 / D 左 */
function corners(fw: number, fh: number, ox = 0, oy = 0): Corners {
  const shift = (p: { x: number; y: number }) => ({ x: p.x + ox, y: p.y + oy });
  return {
    A: shift(iso(-fw / 2, -fh / 2)),
    B: shift(iso(fw / 2, -fh / 2)),
    C: shift(iso(fw / 2, fh / 2)),
    D: shift(iso(-fw / 2, fh / 2)),
  };
}

/** 等距长方体：只画朝向镜头的左右两面 + 顶面 */
function prism(
  g: Graphics,
  fw: number,
  fh: number,
  height: number,
  main: string,
  ox = 0,
  oy = 0,
): Corners {
  const c = corners(fw, fh, ox, oy);
  if (height > 0) {
    g.poly([c.D.x, c.D.y, c.C.x, c.C.y, c.C.x, c.C.y - height, c.D.x, c.D.y - height])
      .fill(shade(main, -0.16))
      .stroke(STROKE);
    g.poly([c.C.x, c.C.y, c.B.x, c.B.y, c.B.x, c.B.y - height, c.C.x, c.C.y - height])
      .fill(shade(main, -0.3))
      .stroke(STROKE);
  }
  g.poly([
    c.A.x, c.A.y - height,
    c.B.x, c.B.y - height,
    c.C.x, c.C.y - height,
    c.D.x, c.D.y - height,
  ])
    .fill(main)
    .stroke(STROKE);
  return c;
}

/**
 * 生成一件家具的显示对象，原点 = 占地中心的地面点。
 * 配了 sprite 且图集在，就用贴图；否则回退到 kind 的矢量绘制。
 */
export function makeFurniNode(def: FurniDef, rot: number): Container {
  const tex = furniTexture(def.id, def.sprite);
  if (tex) {
    const fp = footprint(def, rot);
    const s = new Sprite(tex);
    // 按占地菱形的宽度定尺寸，保证视觉大小和它实际占的格子对得上
    const targetW = ((fp.w + fp.h) / 2) * TW * 1.12;
    s.scale.set(targetW / tex.width);
    // 贴图的接地点在底部偏上一点（家具底面画在图的下缘内侧）
    s.anchor.set(0.5, 0.86);
    // 只有两个朝向：贴图没有第二个视角，转 90° 只能靠水平翻转近似
    if (rot % 4 >= 2) s.scale.x *= -1;
    return s;
  }
  const g = new Graphics();
  drawFurni(g, def, rot);
  return g;
}

/** 画一件家具，原点 = 占地中心的地面点 */
export function drawFurni(g: Graphics, def: FurniDef, rot: number): void {
  const { w: fw, h: fh } = footprint(def, rot);

  switch (def.kind) {
    case 'rug': {
      const c = corners(fw, fh);
      g.poly([c.A.x, c.A.y, c.B.x, c.B.y, c.C.x, c.C.y, c.D.x, c.D.y])
        .fill(def.main)
        .stroke(STROKE);
      const i = 0.62;
      g.poly([
        c.A.x * i, c.A.y * i, c.B.x * i, c.B.y * i,
        c.C.x * i, c.C.y * i, c.D.x * i, c.D.y * i,
      ]).stroke({ color: def.accent, width: 3 });
      if (def.id === 'rug_dot') {
        for (const [px, py] of [[0, -7], [-18, 2], [18, 2], [0, 11]]) {
          g.circle(px, py, 4).fill(def.accent);
        }
      } else if (def.id === 'rug_check') {
        // 叫棋盘格就得真有格子，只画一圈内描边名不副实
        for (let gx = 0; gx < fw; gx++) {
          for (let gy = 0; gy < fh; gy++) {
            if ((gx + gy) % 2) continue;
            const a = iso(gx - fw / 2, gy - fh / 2);
            const b = iso(gx + 1 - fw / 2, gy - fh / 2);
            const cc = iso(gx + 1 - fw / 2, gy + 1 - fh / 2);
            const d = iso(gx - fw / 2, gy + 1 - fh / 2);
            g.poly([a.x, a.y, b.x, b.y, cc.x, cc.y, d.x, d.y]).fill(def.accent);
          }
        }
      }
      break;
    }

    case 'stool': {
      const c = prism(g, fw * 0.62, fh * 0.62, def.height, def.main);
      const t = -def.height;
      g.poly([
        c.A.x * 0.7, c.A.y * 0.7 + t, c.B.x * 0.7, c.B.y * 0.7 + t,
        c.C.x * 0.7, c.C.y * 0.7 + t, c.D.x * 0.7, c.D.y * 0.7 + t,
      ]).fill(shade(def.main, 0.14));
      if (def.id === 'stool_mush') {
        for (const [px, py] of [[-8, t - 3], [7, t + 3], [0, t - 9]]) {
          g.circle(px, py, 3.5).fill(def.accent);
        }
      }
      break;
    }

    case 'box': {
      const c = prism(g, fw * 0.86, fh * 0.86, def.height, def.main);
      if (def.height > 40) {
        for (const f of [0.32, 0.64]) {
          g.moveTo(c.D.x + 4, c.D.y - def.height * f)
            .lineTo(c.C.x - 2, c.C.y - def.height * f)
            .stroke({ color: def.accent, width: 3 });
        }
      } else {
        const mid = -def.height / 2;
        g.moveTo(c.D.x + 4, c.D.y + mid)
          .lineTo(c.C.x - 2, c.C.y + mid)
          .stroke({ color: def.accent, width: 2.5 });
      }
      break;
    }

    case 'sofa': {
      const seatH = def.height * 0.42;
      const c = prism(g, fw * 0.9, fh * 0.9, seatH, def.main);
      // 坐垫
      const t = -seatH;
      g.poly([
        c.A.x * 0.78, c.A.y * 0.78 + t, c.B.x * 0.78, c.B.y * 0.78 + t,
        c.C.x * 0.78, c.C.y * 0.78 + t, c.D.x * 0.78, c.D.y * 0.78 + t,
      ]).fill({ color: def.accent, alpha: 0.5 });
      // 靠背贴后侧：rot 决定贴哪条边，视觉上就是「沙发转了个向」
      const along = rot % 2 === 0;
      const bw = along ? fw * 0.9 : fh * 0.26;
      const bh = along ? fh * 0.26 : fh * 0.9;
      const off = along ? iso(0, -fh * 0.33) : iso(-fw * 0.33, 0);
      prism(g, bw, bh, def.height, shade(def.main, -0.05), off.x, off.y);
      break;
    }

    case 'bed': {
      const c = prism(g, fw * 0.92, fh * 0.92, def.height, def.main);
      const t = -def.height;
      // 被子盖住靠前的那一半
      g.poly([
        (c.A.x + c.D.x) / 2, (c.A.y + c.D.y) / 2 + t,
        (c.A.x + c.B.x) / 2, (c.A.y + c.B.y) / 2 + t,
        c.B.x, c.B.y + t, c.C.x, c.C.y + t, c.D.x, c.D.y + t,
      ])
        .fill(def.accent)
        .stroke(STROKE);
      // 枕头
      g.ellipse(c.A.x * 0.42, c.A.y * 0.42 + t - 3, 17, 9)
        .fill('#ffffff')
        .stroke(STROKE);
      break;
    }

    case 'plant': {
      const potH = def.height * 0.34;
      prism(g, fw * 0.44, fh * 0.44, potH, def.main);
      const cy = -potH;
      const r = def.height * 0.3;
      for (const [ox, oy, rr] of [
        [0, -r * 0.9, r],
        [-r * 0.7, -r * 0.3, r * 0.72],
        [r * 0.7, -r * 0.35, r * 0.66],
      ]) {
        g.circle(ox, cy + oy, rr).fill(def.accent).stroke(STROKE);
      }
      g.circle(0, cy - r * 1.1, r * 0.28).fill(shade(def.accent, 0.22));
      break;
    }

    case 'lamp': {
      prism(g, fw * 0.34, fh * 0.34, 6, shade(def.main, -0.1));
      g.rect(-2.5, -def.height, 5, def.height - 6).fill(def.main).stroke(STROKE);
      const sh = def.height * 0.3;
      g.poly([-17, -def.height, 17, -def.height, 11, -def.height - sh, -11, -def.height - sh])
        .fill(def.accent)
        .stroke(STROKE);
      g.ellipse(0, -def.height + 3, 22, 8).fill({ color: def.accent, alpha: 0.3 });
      break;
    }

    case 'shelf': {
      // 开放式格架：柜体 + 前面板挖出的暗色格口 + 层板
      const c = prism(g, fw * 0.8, fh * 0.8, def.height, def.main);
      const pad = 7;
      g.poly([
        c.D.x + pad, c.D.y - pad,
        c.C.x - pad, c.C.y - pad,
        c.C.x - pad, c.C.y - def.height + pad,
        c.D.x + pad, c.D.y - def.height + pad,
      ]).fill(shade(def.main, -0.45));
      for (let i = 1; i < 3; i++) {
        const yy = -def.height * (i / 3);
        g.moveTo(c.D.x + pad, c.D.y + yy)
          .lineTo(c.C.x - pad, c.C.y + yy)
          .stroke({ color: def.accent, width: 4 });
      }
      break;
    }

    case 'wardrobe': {
      const c = prism(g, fw * 0.8, fh * 0.8, def.height, def.main);
      const mx = (c.D.x + c.C.x) / 2;
      const my = (c.D.y + c.C.y) / 2;
      g.moveTo(mx, my - 3)
        .lineTo(mx, my - def.height + 3)
        .stroke({ color: shade(def.main, -0.42), width: 3 });
      for (const off of [-7, 7]) {
        g.circle(mx + off, my - def.height * 0.48, 2.6).fill(def.accent);
      }
      break;
    }

    case 'mirror': {
      prism(g, fw * 0.46, fh * 0.46, 6, shade(def.main, -0.12));
      const mw = fw * TW * 0.3;
      g.roundRect(-mw / 2, -def.height, mw, def.height - 4, mw / 2.2)
        .fill(def.main)
        .stroke(STROKE);
      g.roundRect(-mw / 2 + 5, -def.height + 5, mw - 10, def.height - 14, mw / 2.8).fill(def.accent);
      // 一道斜向反光，不然镜面是块死色
      g.moveTo(-mw / 2 + 9, -def.height * 0.32)
        .lineTo(mw / 2 - 11, -def.height * 0.72)
        .stroke({ color: '#ffffff', width: 3.5, alpha: 0.55, cap: 'round' });
      break;
    }

    case 'desk': {
      prism(g, fw * 0.9, fh * 0.9, def.height, def.main);
      const sw = fw * TW * 0.28;
      const sh = 24;
      g.roundRect(-sw / 2, -def.height - sh, sw, sh, 3)
        .fill(shade(def.accent, -0.55))
        .stroke(STROKE);
      g.roundRect(-sw / 2 + 3.5, -def.height - sh + 3.5, sw - 7, sh - 7, 2).fill(def.accent);
      g.rect(-5, -def.height - 4, 10, 4).fill(shade(def.accent, -0.55));
      break;
    }

    case 'screen': {
      prism(g, fw * 0.5, fh * 0.5, 8, shade(def.main, -0.2));
      const sw = fw * TW * 0.36;
      const sh = def.height * 0.78;
      g.roundRect(-sw / 2, -def.height - 4, sw, sh, 5).fill(def.main).stroke({
        color: LINE,
        width: 2.5,
      });
      g.roundRect(-sw / 2 + 5, -def.height + 1, sw - 10, sh - 10, 3).fill(def.accent);
      g.roundRect(-sw / 2 + 5, -def.height + 1, sw - 10, (sh - 10) * 0.45, 3).fill({
        color: '#ffffff',
        alpha: 0.25,
      });
      break;
    }
  }
}

/** 商店/背包缩略图。有贴图就直接裁图集，没有才画 SVG */
export function furniThumb(def: FurniDef): string {
  if (def.sprite && FURNI_SHEET_URL) {
    const { x, y, w, h } = def.sprite;
    const k = Math.min(58 / w, 54 / h);
    return `<div style="width:58px;height:54px;display:flex;align-items:center;justify-content:center;overflow:hidden">
      <div style="width:${w * k}px;height:${h * k}px;background-image:url(${FURNI_SHEET_URL});
        background-size:${sheetSize.w * k}px ${sheetSize.h * k}px;
        background-position:-${x * k}px -${y * k}px"></div>
    </div>`;
  }
  return svgThumb(def);
}

function svgThumb(def: FurniDef): string {
  const s = 0.6;
  const tw = (TW * s) / 2;
  const th = (TH * s) / 2;
  const hgt = def.height * s;
  const P = (gx: number, gy: number, lift = 0) => `${(gx - gy) * tw},${(gx + gy) * th - lift}`;
  const [ax, ay] = [-def.w / 2, -def.h / 2];
  const [bx, by] = [def.w / 2, -def.h / 2];
  const [cx, cy] = [def.w / 2, def.h / 2];
  const [dx, dy] = [-def.w / 2, def.h / 2];

  const topFace = `${P(ax, ay, hgt)} ${P(bx, by, hgt)} ${P(cx, cy, hgt)} ${P(dx, dy, hgt)}`;
  const leftFace = `${P(dx, dy)} ${P(cx, cy)} ${P(cx, cy, hgt)} ${P(dx, dy, hgt)}`;
  const rightFace = `${P(cx, cy)} ${P(bx, by)} ${P(bx, by, hgt)} ${P(cx, cy, hgt)}`;

  const extra =
    def.kind === 'plant'
      ? `<circle cx="0" cy="${-hgt - 9}" r="11" fill="${def.accent}" stroke="${LINE}" stroke-width="1.6"/>`
      : def.kind === 'lamp'
        ? `<polygon points="-11,${-hgt} 11,${-hgt} 7,${-hgt - 12} -7,${-hgt - 12}" fill="${def.accent}" stroke="${LINE}" stroke-width="1.6"/>`
        : def.kind === 'screen'
          ? `<rect x="-15" y="${-hgt - 13}" width="30" height="19" rx="3" fill="${def.accent}" stroke="${LINE}" stroke-width="1.6"/>`
          : def.kind === 'bed' || def.kind === 'sofa'
            ? `<polygon points="${topFace}" fill="${def.accent}" opacity="0.45"/>`
            : def.kind === 'shelf'
              ? `<rect x="-9" y="${-hgt + 5}" width="18" height="${Math.max(6, hgt - 10)}" fill="${shade(def.main, -0.45)}"/>
                 <rect x="-9" y="${-hgt * 0.66}" width="18" height="2.6" fill="${def.accent}"/>
                 <rect x="-9" y="${-hgt * 0.33}" width="18" height="2.6" fill="${def.accent}"/>`
              : def.kind === 'wardrobe'
                ? `<line x1="0" y1="${-hgt + 4}" x2="0" y2="-4" stroke="${shade(def.main, -0.42)}" stroke-width="2"/>
                   <circle cx="-4" cy="${-hgt * 0.5}" r="1.8" fill="${def.accent}"/>
                   <circle cx="4" cy="${-hgt * 0.5}" r="1.8" fill="${def.accent}"/>`
                : def.kind === 'mirror'
                  ? `<rect x="-8" y="${-hgt}" width="16" height="${Math.max(10, hgt - 3)}" rx="7" fill="${def.main}" stroke="${LINE}" stroke-width="1.6"/>
                     <rect x="-5" y="${-hgt + 3}" width="10" height="${Math.max(5, hgt - 9)}" rx="4.5" fill="${def.accent}"/>`
                  : def.kind === 'desk'
                    ? `<rect x="-11" y="${-hgt - 13}" width="22" height="13" rx="2.5" fill="${shade(def.accent, -0.55)}" stroke="${LINE}" stroke-width="1.4"/>
                       <rect x="-8.5" y="${-hgt - 10.5}" width="17" height="8" rx="1.5" fill="${def.accent}"/>`
                    : '';

  const body =
    def.kind === 'rug'
      ? `<polygon points="${topFace}" fill="${def.main}" stroke="${LINE}" stroke-width="1.6"/>
         <g transform="scale(0.6)"><polygon points="${topFace}" fill="none" stroke="${def.accent}" stroke-width="4"/></g>`
      : `<polygon points="${leftFace}" fill="${shade(def.main, -0.16)}" stroke="${LINE}" stroke-width="1.6"/>
         <polygon points="${rightFace}" fill="${shade(def.main, -0.3)}" stroke="${LINE}" stroke-width="1.6"/>
         <polygon points="${topFace}" fill="${def.main}" stroke="${LINE}" stroke-width="1.6"/>`;

  return `<svg viewBox="-36 -48 72 66" width="58" height="54" xmlns="http://www.w3.org/2000/svg"><g stroke-linejoin="round">${body}${extra}</g></svg>`;
}
