import { Assets, Rectangle, Texture } from 'pixi.js';
import type { SpriteRect } from '../data/furniture';

/**
 * 可选的家具图集。跟宠物立绘一样用 import.meta.glob，目录为空时返回 {}，构建照样过。
 */
const found = import.meta.glob('../assets/placeholder/furni-sheet.*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const FURNI_SHEET_URL: string | null = Object.values(found)[0] ?? null;

let sheet: Texture | null = null;
export const sheetSize = { w: 0, h: 0 };
const frames = new Map<string, Texture>();

// 背景判定收得很紧：图集白底实测 R-B≈0.1（中性），而奶油地毯、床品这类
// 浅色美术是暖白，R-B≈3。饱和度阈值必须压在两者之间，否则填充会顺着美术钻进去。
const BG_MIN = 248;
const BG_SAT = 3;
// 反锯齿过渡带：只在背景外沿这么多像素内做羽化。**有界**是关键——
// 无界的软阈值填充会一路啃穿浅色家具（试过，圆地毯被吃成只剩描边的兔子）。
const EDGE_MIN = 206;
const EDGE_SAT = 40;
const FEATHER = 3;
const SPAN = 255 - EDGE_MIN;

/**
 * 去掉图集白底。
 *
 * 两步：先从画布四边对「几乎纯白且几乎无彩」的像素做洪水填充，得到背景；
 * 再从背景外沿向内最多 FEATHER 像素做羽化，按白度给 alpha 并反预乘，消掉毛边。
 *
 * 只清除与画布边缘连通的区域——家具内部大量浅色/白色块（白书架、奶油地毯、
 * 床单高光）被描边围住，不会被误伤。代价是梯形置物架这类**封闭**空隙里的白留着。
 * 试过自动识别「封闭白洞」（纯度 / 边界深浅 / RGB 色偏三种判据都试了），
 * 和真·白色美术的分布严重重叠，每种都会把地毯打成麻点——次要问题不值得拿主要资产冒险。
 *
 * 注意这里必须整张图一次性处理：逐个 frame 裁完再抠，frame 边界会变成"边缘"，
 * 白色家具的内部就会被从切口灌进去掏空。
 */
function cutout(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0);

  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const n = w * h;

  // 逐像素的最小通道值（白度）与饱和度，后面三步都要用
  const lum = new Uint8Array(n);
  const isBg = new Uint8Array(n);
  const isSoft = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lo = r < g ? (b < r ? b : r) : b < g ? b : g;
    const hi = r > g ? (b > r ? b : r) : b > g ? b : g;
    const sat = hi - lo;
    lum[p] = lo;
    if (lo >= BG_MIN && sat <= BG_SAT) isBg[p] = 1;
    if (lo >= EDGE_MIN && sat <= EDGE_SAT) isSoft[p] = 1;
  }

  // ① 从四边洪水填充出背景
  const bg = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const push = (p: number, mask: Uint8Array, mark: Uint8Array) => {
    if (mask[p] && !mark[p]) {
      mark[p] = 1;
      stack[top++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, isBg, bg);
    push(x + (h - 1) * w, isBg, bg);
  }
  for (let y = 0; y < h; y++) {
    push(y * w, isBg, bg);
    push(w - 1 + y * w, isBg, bg);
  }
  while (top > 0) {
    const p = stack[--top];
    const x = p % w;
    if (x > 0) push(p - 1, isBg, bg);
    if (x < w - 1) push(p + 1, isBg, bg);
    if (p >= w) push(p - w, isBg, bg);
    if (p < n - w) push(p + w, isBg, bg);
  }

  // ② 从背景外沿向内 BFS 最多 FEATHER 层，记下层数
  const dist = new Uint8Array(n);
  let frontier: number[] = [];
  for (let p = 0; p < n; p++) if (bg[p]) frontier.push(p);
  for (let step = 1; step <= FEATHER && frontier.length; step++) {
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % w;
      const around = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < n - w ? p + w : -1];
      for (const q of around) {
        if (q < 0 || !isSoft[q] || bg[q] || dist[q]) continue;
        dist[q] = step;
        next.push(q);
      }
    }
    frontier = next;
  }

  // ③ 落 alpha。过渡带按白度取 alpha 并反预乘，把混进来的白底除掉，边缘才不发灰
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (bg[p]) {
      d[i + 3] = 0;
      continue;
    }
    const step = dist[p];
    if (!step) continue;
    // 离背景越远越不敢动，免得啃进美术
    const a = (255 - lum[p]) / SPAN + (step - 1) * 0.34;
    if (a >= 1) continue;
    if (a < 0.004) {
      d[i + 3] = 0;
      continue;
    }
    const inv = (1 - a) * 255;
    for (let k = 0; k < 3; k++) d[i + k] = (d[i + k] - inv) / a;
    d[i + 3] = a * 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** 在创建场景之前调用一次 */
export async function loadFurniArt(): Promise<void> {
  if (!FURNI_SHEET_URL) return;
  try {
    const tex = await Assets.load<Texture>(FURNI_SHEET_URL);
    sheetSize.w = tex.width;
    sheetSize.h = tex.height;
    const cut = cutout(tex.source.resource as CanvasImageSource, tex.width, tex.height);
    sheet = cut ? Texture.from(cut) : tex;
  } catch (e) {
    console.warn('[pata] 家具图集处理失败，回退到矢量绘制', e);
    sheet = null;
  }
}

/** 取某件家具的贴图；没有图集或没配 sprite 时返回 null，调用方回退到矢量绘制 */
export function furniTexture(defId: string, rect?: SpriteRect): Texture | null {
  if (!sheet || !rect) return null;
  const hit = frames.get(defId);
  if (hit) return hit;
  const tex = new Texture({
    source: sheet.source,
    frame: new Rectangle(rect.x, rect.y, rect.w, rect.h),
  });
  frames.set(defId, tex);
  return tex;
}
