import { Assets, Texture } from 'pixi.js';

/**
 * 可选的宠物贴图。
 *
 * 用 import.meta.glob 而不是 import：目录为空时它返回 {}，构建照样过；
 * 写成 `import url from '...'` 缺文件就会直接编译失败。
 */
const found = import.meta.glob('../assets/placeholder/pata.*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const PET_ART_URL: string | null = Object.values(found)[0] ?? null;

/** 处理后贴图的宽度 */
const OUT_W = 640;

/** 悬浮配饰band 占全图高度超过这个比例就不当配饰，避免误删主体 */
const FLOAT_BAND_MAX = 0.3;

let texture: Texture | null = null;

/** 在创建场景之前调用一次 */
export async function loadPetArt(): Promise<void> {
  if (!PET_ART_URL) return;
  try {
    const tex = await Assets.load<Texture>(PET_ART_URL);
    const canvas = cutout(tex.source.resource as CanvasImageSource, tex.width, tex.height);
    texture = canvas ? Texture.from(canvas) : tex;
  } catch (e) {
    console.warn('[pata] 宠物贴图处理失败，回退到矢量绘制', e);
    texture = null;
  }
}

export const petTexture = (): Texture | null => texture;

/**
 * 贴图模式下画死在图里、捏人面板要收起的项。
 *
 * 体色也在里面：tint 是正片叠底，套在手绘立绘上必然发灰发脏，
 * 与其给一个难看的换色，不如老实承认立绘的配色是固定的。
 */
export const ART_BAKED_SLOTS = ['body', 'pattern', 'eyes', 'blush'] as const;

/**
 * 浅色、低饱和 = 背景色。
 *
 * 阈值必须压到 110：墙地交界那条中灰线大约 #999，放在 160 会被判成前景，
 * 洪水填充从两侧绕过去、把线孤零零留在画面上。
 * 角色轮廓接近纯黑（亮度 ~40），毛色是暖黄（饱和度不满足），都在这个范围之外。
 */
function isBackdrop(d: Uint8ClampedArray, i: number): boolean {
  const r = d[i];
  const g = d[i + 1];
  const b = d[i + 2];
  if (r < 110 || g < 110 || b < 110) return false;
  return Math.max(r, g, b) - Math.min(r, g, b) < 26;
}

/**
 * 去背景 + 裁掉四周空白。
 *
 * 关键是**只清除与画布边缘连通的区域**，而不是把所有白色设成透明——
 * 猫的胸口绒毛也是白的，但它被深色轮廓围住、与边缘不连通，所以不会被误伤。
 */
function cutout(src: CanvasImageSource, sw: number, sh: number): HTMLCanvasElement | null {
  const W = OUT_W;
  const H = Math.max(1, Math.round((OUT_W * sh) / sw));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, sw, sh, 0, 0, W, H);

  const image = ctx.getImageData(0, 0, W, H);
  const d = image.data;
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];

  // 整圈边框像素都作为种子，不只是四个角
  for (let x = 0; x < W; x++) stack.push(x, x + (H - 1) * W);
  for (let y = 0; y < H; y++) stack.push(y * W, W - 1 + y * W);

  while (stack.length) {
    const p = stack.pop() as number;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!isBackdrop(d, i)) continue;
    d[i + 3] = 0;

    const x = p % W;
    const y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }

  // 边缘残留的半透明浅色像素会留下一圈白边，收缩一次
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (d[i + 3] === 0) continue;
    const x = p % W;
    const y = (p / W) | 0;
    const bare =
      (x > 0 && d[i - 4 + 3] === 0) ||
      (x < W - 1 && d[i + 4 + 3] === 0) ||
      (y > 0 && d[i - W * 4 + 3] === 0) ||
      (y < H - 1 && d[i + W * 4 + 3] === 0);
    if (bare && isBackdrop(d, i)) d[i + 3] = 0;
  }

  dropFloatingAccessory(d, W, H);

  ctx.putImageData(image, 0, 0);
  return trim(canvas, ctx, W, H);
}

/**
 * 去掉悬在主体上方、与主体之间隔着空白行的配饰（这张参考图里是光环）。
 *
 * 为什么必须去掉：光环是一圈闭合的黄色细环，环内那块白色属于**封闭区域**，
 * 跟画面外缘不连通，洪水填充进不去，留下来就是一块突兀的白椭圆。
 * 与其跟这圈像素较劲，不如整条裁掉，改由应用的矢量头饰去画光环——
 * 效果更干净，光环也回到「可替换配饰」的位置（想换皇冠随时换）。
 *
 * 用「找空白行」而不是写死裁切比例：换一张构图不同的立绘时，
 * 固定比例会把耳朵尖一起削掉，而空白行是图自己给出的分界。
 */
function dropFloatingAccessory(d: Uint8ClampedArray, W: number, H: number): void {
  const opaque = (y: number): boolean => {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) return true;
    }
    return false;
  };

  let top = 0;
  while (top < H && !opaque(top)) top++;
  if (top >= H) return;

  let gap = top;
  while (gap < H && opaque(gap)) gap++;
  if (gap >= H) return; // 整张图连成一片，没有独立配饰

  let main = gap;
  while (main < H && !opaque(main)) main++;
  if (main >= H) return; // 空白行之下没有主体，说明上面那块就是主体

  // 上方那条 band 太厚就不是配饰，宁可不动
  if (gap - top > H * FLOAT_BAND_MAX) return;

  for (let y = 0; y < main; y++) {
    for (let x = 0; x < W; x++) d[(y * W + x) * 4 + 3] = 0;
  }
}

/** 裁到不透明内容的包围盒，让 anchor 0.5 真正落在角色中心 */
function trim(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
): HTMLCanvasElement {
  const { data } = ctx.getImageData(0, 0, W, H);
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas;

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')?.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return out;
}
