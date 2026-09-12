import { Assets, Texture } from 'pixi.js';

/**
 * 可选的地板/墙纸贴图。文件名约定 `surface-<id>.*`，<id> 对应 FLOORS / WALLS 里的 `tex` 字段。
 * 跟宠物立绘/家具图集一样用 import.meta.glob：目录为空时返回 {}，构建照样过，
 * 贴图缺失就回退到 SurfaceDef 的 main/accent 纯色。
 */
const found = import.meta.glob('../assets/placeholder/surface-*.*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** tex id → 图片 URL，商店缩略图也用它 */
export const SURFACE_ART_URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(found)) {
  const id = path.match(/surface-(.+)\.[^.]+$/)?.[1];
  if (id) SURFACE_ART_URLS[id] = url;
}

const textures = new Map<string, Texture>();

/** 在创建场景之前调用一次 */
export async function loadSurfaceArt(): Promise<void> {
  await Promise.all(
    Object.entries(SURFACE_ART_URLS).map(async ([id, url]) => {
      try {
        const tex = await Assets.load<Texture>(url);
        // 房间可能比一张图大，平铺兜底（默认取值方式会把边缘像素拉成长条）
        tex.source.addressMode = 'repeat';
        textures.set(id, tex);
      } catch (e) {
        console.warn(`[pata] 贴图 ${id} 加载失败，回退到纯色`, e);
      }
    }),
  );
}

export const surfaceTexture = (tex?: string): Texture | null =>
  (tex ? textures.get(tex) : null) ?? null;
