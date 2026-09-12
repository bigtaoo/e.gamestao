/** 家具定义。全部程序化绘制：kind 决定绘制例程，w/h 是占地格数，height 是视觉高度(px)。 */

export type FurniKind =
  | 'rug' | 'box' | 'sofa' | 'bed' | 'plant' | 'lamp' | 'screen' | 'stool'
  | 'shelf' | 'wardrobe' | 'mirror' | 'desk';

/** 在家具图集里的裁切框。配了就用贴图，没配就走 kind 的矢量绘制 */
export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FurniDef {
  id: string;
  name: string;
  kind: FurniKind;
  sprite?: SpriteRect;
  /** 占地：默认朝向下的格子数 */
  w: number;
  h: number;
  /** 视觉高度，像素 */
  height: number;
  main: string;
  accent: string;
  comfort: number;
  price: number;
  unlockLv: number;
  set: string;
}

export const SETS: Record<string, string> = {
  basic: '基础',
  cream: '奶油屋',
  forest: '森林系',
  zen: '和风',
  neon: '赛博夜',
  candy: '糖果屋',
  ocean: '海边',
  game: '电竞房',
  punk: '暗黑房',
  bunny: '兔兔屋',
};

export const FURNITURE: FurniDef[] = [
  // ── 基础 ──────────────────────────────────────────────
  { id: 'stool_wood', name: '小木凳', kind: 'stool', w: 1, h: 1, height: 20, main: '#d9a86c', accent: '#b3823f', comfort: 4, price: 40, unlockLv: 1, set: 'basic' },
  { id: 'rug_dot', name: '圆点地毯', kind: 'rug', w: 2, h: 2, height: 0, main: '#ffd9de', accent: '#ff9aa6', comfort: 8, price: 90, unlockLv: 1, set: 'basic' },
  { id: 'box_crate', name: '收纳木箱', kind: 'box', w: 1, h: 1, height: 26, main: '#e0b48a', accent: '#c08e5e', comfort: 5, price: 60, unlockLv: 1, set: 'basic' },
  { id: 'plant_small', name: '小绿植', kind: 'plant', w: 1, h: 1, height: 34, main: '#d98b5f', accent: '#6fbf7f', comfort: 9, price: 110, unlockLv: 1, set: 'basic' },
  { id: 'lamp_floor', name: '落地灯', kind: 'lamp', w: 1, h: 1, height: 62, main: '#bfae96', accent: '#ffe6a8', comfort: 11, price: 150, unlockLv: 2, set: 'basic' },

  // ── 奶油屋 ────────────────────────────────────────────
  { id: 'sofa_cream', name: '奶油沙发', kind: 'sofa', w: 2, h: 1, height: 34, main: '#ffe9c9', accent: '#f2cf9c', comfort: 22, price: 320, unlockLv: 2, set: 'cream' },
  { id: 'table_cream', name: '奶油茶几', kind: 'box', w: 2, h: 1, height: 20, main: '#fff2dd', accent: '#e8d2ae', comfort: 14, price: 200, unlockLv: 2, set: 'cream' },
  { id: 'bed_cream', name: '云朵小床', kind: 'bed', w: 2, h: 2, height: 26, main: '#fff6ea', accent: '#ffd5dd', comfort: 34, price: 560, unlockLv: 4, set: 'cream' },
  { id: 'rug_cream', name: '羊毛地毯', kind: 'rug', w: 3, h: 2, height: 0, main: '#fff3e2', accent: '#f0d9b8', comfort: 16, price: 260, unlockLv: 3, set: 'cream' },
  { id: 'shelf_cream', name: '奶油书架', kind: 'box', w: 1, h: 1, height: 58, main: '#f7e6cd', accent: '#d9b98c', comfort: 18, price: 300, unlockLv: 4, set: 'cream' },
  { id: 'lamp_cream', name: '奶油台灯', kind: 'lamp', w: 1, h: 1, height: 48, main: '#f2dcc0', accent: '#fff0c4', comfort: 13, price: 220, unlockLv: 3, set: 'cream' },

  // ── 森林系 ────────────────────────────────────────────
  { id: 'sofa_forest', name: '苔藓长椅', kind: 'sofa', w: 2, h: 1, height: 34, main: '#a8cfa0', accent: '#7aa872', comfort: 24, price: 360, unlockLv: 3, set: 'forest' },
  { id: 'table_stump', name: '树桩矮桌', kind: 'box', w: 1, h: 1, height: 22, main: '#c89a68', accent: '#a2743f', comfort: 12, price: 170, unlockLv: 2, set: 'forest' },
  { id: 'plant_big', name: '大盆栽', kind: 'plant', w: 1, h: 1, height: 66, main: '#c98b5f', accent: '#4f9e62', comfort: 20, price: 330, unlockLv: 3, set: 'forest' },
  { id: 'bed_moss', name: '草窝床', kind: 'bed', w: 2, h: 2, height: 24, main: '#cfe6c2', accent: '#8fc48a', comfort: 32, price: 540, unlockLv: 5, set: 'forest' },
  { id: 'rug_leaf', name: '落叶地毯', kind: 'rug', w: 2, h: 2, height: 0, main: '#e4efd6', accent: '#a9c98e', comfort: 14, price: 230, unlockLv: 3, set: 'forest' },
  { id: 'stool_mush', name: '蘑菇凳', kind: 'stool', w: 1, h: 1, height: 24, main: '#ff9a8b', accent: '#fff0e4', comfort: 10, price: 140, unlockLv: 2, set: 'forest' },

  // ── 和风 ──────────────────────────────────────────────
  { id: 'table_zen', name: '矮几', kind: 'box', w: 2, h: 1, height: 16, main: '#c8a273', accent: '#8d6a42', comfort: 15, price: 240, unlockLv: 4, set: 'zen' },
  { id: 'bed_futon', name: '榻榻米被褥', kind: 'bed', w: 2, h: 2, height: 16, main: '#f0e4c8', accent: '#d3b98c', comfort: 30, price: 500, unlockLv: 5, set: 'zen' },
  { id: 'rug_tatami', name: '榻榻米', kind: 'rug', w: 3, h: 2, height: 0, main: '#e8dfba', accent: '#b9a978', comfort: 18, price: 300, unlockLv: 4, set: 'zen' },
  { id: 'lamp_paper', name: '纸灯笼', kind: 'lamp', w: 1, h: 1, height: 54, main: '#8d6a42', accent: '#ffe9b0', comfort: 16, price: 280, unlockLv: 4, set: 'zen' },
  { id: 'plant_bonsai', name: '小盆景', kind: 'plant', w: 1, h: 1, height: 40, main: '#8d6a42', accent: '#6b9c5a', comfort: 17, price: 290, unlockLv: 5, set: 'zen' },

  // ── 赛博夜 ────────────────────────────────────────────
  { id: 'screen_tv', name: '悬浮屏', kind: 'screen', w: 2, h: 1, height: 46, main: '#3a4360', accent: '#5cf2e0', comfort: 26, price: 480, unlockLv: 6, set: 'neon' },
  { id: 'sofa_neon', name: '霓虹沙发', kind: 'sofa', w: 2, h: 1, height: 34, main: '#4a4370', accent: '#ff6fd8', comfort: 28, price: 520, unlockLv: 6, set: 'neon' },
  { id: 'lamp_neon', name: '霓虹灯柱', kind: 'lamp', w: 1, h: 1, height: 70, main: '#39364f', accent: '#7af2ff', comfort: 22, price: 420, unlockLv: 6, set: 'neon' },
  { id: 'rug_grid', name: '网格地垫', kind: 'rug', w: 3, h: 3, height: 0, main: '#2f3350', accent: '#6fe6ff', comfort: 24, price: 460, unlockLv: 7, set: 'neon' },
  { id: 'bed_pod', name: '休眠舱', kind: 'bed', w: 2, h: 2, height: 30, main: '#3b4166', accent: '#9b7bff', comfort: 40, price: 780, unlockLv: 8, set: 'neon' },

  // ── 糖果屋 ────────────────────────────────────────────
  { id: 'stool_candy', name: '棉花糖凳', kind: 'stool', w: 1, h: 1, height: 22, main: '#ffd3e2', accent: '#ffffff', comfort: 9, price: 90, unlockLv: 1, set: 'candy' },
  { id: 'rug_candy', name: '糖霜地毯', kind: 'rug', w: 2, h: 2, height: 0, main: '#fff0f6', accent: '#ffb3d1', comfort: 12, price: 150, unlockLv: 1, set: 'candy' },
  { id: 'table_candy', name: '马卡龙桌', kind: 'box', w: 2, h: 1, height: 20, main: '#ffe8b8', accent: '#ffc4dd', comfort: 15, price: 210, unlockLv: 2, set: 'candy' },
  { id: 'sofa_candy', name: '草莓沙发', kind: 'sofa', w: 2, h: 1, height: 34, main: '#ffc2d4', accent: '#fff6fa', comfort: 25, price: 380, unlockLv: 3, set: 'candy' },
  { id: 'lamp_candy', name: '棒棒糖灯', kind: 'lamp', w: 1, h: 1, height: 56, main: '#f2b8cd', accent: '#fff2b8', comfort: 17, price: 290, unlockLv: 3, set: 'candy' },
  { id: 'bed_candy', name: '奶昔床', kind: 'bed', w: 2, h: 2, height: 26, main: '#ffeef5', accent: '#ffc2d4', comfort: 33, price: 560, unlockLv: 5, set: 'candy' },
  { id: 'plant_candy', name: '糖果树', kind: 'plant', w: 1, h: 1, height: 44, main: '#f4a7c0', accent: '#8fd9b6', comfort: 16, price: 260, unlockLv: 4, set: 'candy' },

  // ── 海边 ──────────────────────────────────────────────
  { id: 'box_shell', name: '贝壳收纳', kind: 'box', w: 1, h: 1, height: 24, main: '#fdf0dc', accent: '#e4c79b', comfort: 7, price: 80, unlockLv: 1, set: 'ocean' },
  { id: 'rug_wave', name: '浪花地毯', kind: 'rug', w: 3, h: 2, height: 0, main: '#e2f3fb', accent: '#7fc4e8', comfort: 17, price: 270, unlockLv: 2, set: 'ocean' },
  { id: 'stool_buoy', name: '浮标凳', kind: 'stool', w: 1, h: 1, height: 26, main: '#ff8f7a', accent: '#fff3e6', comfort: 11, price: 160, unlockLv: 2, set: 'ocean' },
  { id: 'sofa_drift', name: '浮木长椅', kind: 'sofa', w: 2, h: 1, height: 32, main: '#dcc7a8', accent: '#8fc7e0', comfort: 23, price: 350, unlockLv: 3, set: 'ocean' },
  { id: 'plant_coral', name: '珊瑚盆', kind: 'plant', w: 1, h: 1, height: 48, main: '#f0ded0', accent: '#ff9c8a', comfort: 19, price: 310, unlockLv: 4, set: 'ocean' },
  { id: 'lamp_light', name: '小灯塔', kind: 'lamp', w: 1, h: 1, height: 72, main: '#f5f0e6', accent: '#ffd98a', comfort: 24, price: 450, unlockLv: 6, set: 'ocean' },
  { id: 'bed_hammock', name: '吊床', kind: 'bed', w: 2, h: 2, height: 22, main: '#f3e7d0', accent: '#9fd4e8', comfort: 31, price: 520, unlockLv: 5, set: 'ocean' },

  // ── 基础补档：早期能买得起的东西太少 ──────────────────
  { id: 'rug_small', name: '小方垫', kind: 'rug', w: 1, h: 1, height: 0, main: '#efe4d2', accent: '#d3bfa0', comfort: 4, price: 30, unlockLv: 1, set: 'basic' },
  { id: 'stool_round', name: '圆坐垫', kind: 'stool', w: 1, h: 1, height: 14, main: '#e8d7bd', accent: '#c9b190', comfort: 6, price: 55, unlockLv: 1, set: 'basic' },
  { id: 'table_low', name: '小方桌', kind: 'box', w: 1, h: 1, height: 22, main: '#e7cba6', accent: '#c6a678', comfort: 8, price: 85, unlockLv: 1, set: 'basic' },
  { id: 'lamp_desk', name: '小台灯', kind: 'lamp', w: 1, h: 1, height: 38, main: '#d8cbb6', accent: '#ffeec2', comfort: 10, price: 120, unlockLv: 1, set: 'basic' },

  // ── 电竞房 ────────────────────────────────────────────
  { id: 'desk_game', name: '电竞桌', kind: 'desk', w: 2, h: 1, height: 26, main: '#3e4358', accent: '#5cf2e0', comfort: 24, price: 420, unlockLv: 4, set: 'game' },
  { id: 'stool_game', name: '电竞椅', kind: 'stool', w: 1, h: 1, height: 34, main: '#4a4a63', accent: '#ff6fd8', comfort: 18, price: 300, unlockLv: 4, set: 'game' },
  { id: 'shelf_game', name: '金属格架', kind: 'shelf', w: 1, h: 1, height: 62, main: '#5a6079', accent: '#7af2ff', comfort: 21, price: 390, unlockLv: 5, set: 'game' },
  { id: 'screen_wide', name: '宽屏电视', kind: 'screen', w: 2, h: 1, height: 48, main: '#33384d', accent: '#8fd4ff', comfort: 27, price: 500, unlockLv: 5, set: 'game' },
  { id: 'bed_game', name: '低床垫', kind: 'bed', w: 2, h: 2, height: 20, main: '#474d68', accent: '#9b7bff', comfort: 30, price: 520, unlockLv: 6, set: 'game' },
  { id: 'rug_game', name: '像素地垫', kind: 'rug', w: 2, h: 2, height: 0, main: '#3a3f55', accent: '#5cf2e0', comfort: 15, price: 240, unlockLv: 4, set: 'game' },
  { id: 'wardrobe_game', name: '储物柜', kind: 'wardrobe', w: 1, h: 1, height: 74, main: '#525872', accent: '#7af2ff', comfort: 23, price: 460, unlockLv: 6, set: 'game' },

  // ── 暗黑房 ────────────────────────────────────────────
  { id: 'wardrobe_punk', name: '铁皮柜', kind: 'wardrobe', w: 1, h: 1, height: 78, main: '#464b57', accent: '#c9ccd4', comfort: 22, price: 430, unlockLv: 5, set: 'punk' },
  { id: 'shelf_punk', name: '唱片架', kind: 'shelf', w: 1, h: 1, height: 56, main: '#3f3a44', accent: '#b57edc', comfort: 20, price: 370, unlockLv: 5, set: 'punk' },
  { id: 'rug_check', name: '棋盘格地毯', kind: 'rug', w: 3, h: 2, height: 0, main: '#e8e8ea', accent: '#2f2f36', comfort: 19, price: 330, unlockLv: 4, set: 'punk' },
  { id: 'lamp_lava', name: '熔岩灯', kind: 'lamp', w: 1, h: 1, height: 50, main: '#3a3540', accent: '#ff7aa8', comfort: 18, price: 320, unlockLv: 5, set: 'punk' },
  { id: 'sofa_punk', name: '深色长椅', kind: 'sofa', w: 2, h: 1, height: 34, main: '#4b4653', accent: '#7f8796', comfort: 26, price: 450, unlockLv: 6, set: 'punk' },
  { id: 'bed_bunk', name: '铁架床', kind: 'bed', w: 2, h: 2, height: 32, main: '#4a4552', accent: '#6f7684', comfort: 34, price: 620, unlockLv: 7, set: 'punk' },
  { id: 'stool_amp', name: '音箱凳', kind: 'stool', w: 1, h: 1, height: 28, main: '#33313a', accent: '#d9d2c4', comfort: 13, price: 200, unlockLv: 4, set: 'punk' },

  // ── 新品类补进已有套装 ────────────────────────────────
  { id: 'mirror_cream', name: '穿衣镜', kind: 'mirror', w: 1, h: 1, height: 76, main: '#f2dcc0', accent: '#eaf3f8', comfort: 20, price: 340, unlockLv: 4, set: 'cream' },
  { id: 'wardrobe_cream', name: '奶油衣柜', kind: 'wardrobe', w: 1, h: 1, height: 76, main: '#f7e6cd', accent: '#c9a274', comfort: 24, price: 480, unlockLv: 5, set: 'cream' },
  { id: 'shelf_forest', name: '木格架', kind: 'shelf', w: 1, h: 1, height: 58, main: '#c8a273', accent: '#8fc48a', comfort: 19, price: 350, unlockLv: 4, set: 'forest' },
  { id: 'mirror_ocean', name: '贝壳镜', kind: 'mirror', w: 1, h: 1, height: 70, main: '#f3e7d0', accent: '#d6f0fa', comfort: 18, price: 330, unlockLv: 5, set: 'ocean' },
  // desk 例程一定会在桌面画一块屏幕，所以这里不能叫「化妆台」——名实不符
  { id: 'desk_candy', name: '糖果书桌', kind: 'desk', w: 2, h: 1, height: 24, main: '#fff0f6', accent: '#ffd98a', comfort: 21, price: 400, unlockLv: 5, set: 'candy' },

  // ── 兔兔屋（走 assets/placeholder/furni-sheet 贴图；图集缺失时按 kind 回退矢量）──
  { id: 'b_mirror', name: '花边镜', kind: 'mirror', sprite: { x: 482, y: 63, w: 127, h: 184 }, w: 1, h: 1, height: 70, main: '#fdf3e4', accent: '#cfe6f5', comfort: 20, price: 330, unlockLv: 3, set: 'bunny' },
  { id: 'b_tv', name: '奶油电视柜', kind: 'screen', sprite: { x: 16, y: 318, w: 208, h: 237 }, w: 2, h: 1, height: 46, main: '#f6ece0', accent: '#8fd4ff', comfort: 26, price: 460, unlockLv: 4, set: 'bunny' },
  { id: 'b_vase', name: '双层花架', kind: 'plant', sprite: { x: 215, y: 312, w: 186, h: 191 }, w: 1, h: 1, height: 48, main: '#c89a68', accent: '#e39ec2', comfort: 16, price: 280, unlockLv: 3, set: 'bunny' },
  { id: 'b_chest', name: '粉收纳箱', kind: 'box', sprite: { x: 413, y: 391, w: 91, h: 102 }, w: 1, h: 1, height: 26, main: '#f5cddb', accent: '#dda6bb', comfort: 10, price: 150, unlockLv: 1, set: 'bunny' },
  { id: 'b_bed_v', name: '紫格子床', kind: 'bed', sprite: { x: 517, y: 286, w: 319, h: 245 }, w: 2, h: 2, height: 28, main: '#cbb9e8', accent: '#f2ecfb', comfort: 34, price: 560, unlockLv: 4, set: 'bunny' },
  { id: 'b_chair', name: '兔耳扶手椅', kind: 'sofa', sprite: { x: 411, y: 505, w: 172, h: 164 }, w: 1, h: 1, height: 34, main: '#f6c8d6', accent: '#fdeaf0', comfort: 22, price: 380, unlockLv: 3, set: 'bunny' },
  { id: 'b_rug_round', name: '兔子圆毯', kind: 'rug', sprite: { x: 499, y: 581, w: 391, h: 274 }, w: 2, h: 2, height: 0, main: '#fdf6ea', accent: '#f0d9b8', comfort: 18, price: 300, unlockLv: 3, set: 'bunny' },
  { id: 'b_rug_oval', name: '蕾丝椭圆毯', kind: 'rug', sprite: { x: 921, y: 670, w: 454, h: 173 }, w: 3, h: 2, height: 0, main: '#fdf2e2', accent: '#f2c9d6', comfort: 20, price: 340, unlockLv: 3, set: 'bunny' },
  { id: 'b_rack_v', name: '紫格架', kind: 'shelf', sprite: { x: 608, y: 888, w: 107, h: 172 }, w: 1, h: 1, height: 56, main: '#c3b0e4', accent: '#efe8fa', comfort: 20, price: 350, unlockLv: 3, set: 'bunny' },
  { id: 'b_rack_p', name: '粉格架', kind: 'shelf', sprite: { x: 725, y: 888, w: 109, h: 172 }, w: 1, h: 1, height: 56, main: '#f0aec1', accent: '#fdebf0', comfort: 20, price: 350, unlockLv: 3, set: 'bunny' },
  { id: 'b_rack_o', name: '橙格架', kind: 'shelf', sprite: { x: 845, y: 886, w: 113, h: 172 }, w: 1, h: 1, height: 56, main: '#f0a98c', accent: '#fde9e0', comfort: 20, price: 350, unlockLv: 3, set: 'bunny' },
  { id: 'b_rack_y', name: '黄格架', kind: 'shelf', sprite: { x: 968, y: 885, w: 113, h: 171 }, w: 1, h: 1, height: 56, main: '#efcf8c', accent: '#fdf3e0', comfort: 20, price: 350, unlockLv: 3, set: 'bunny' },
  { id: 'b_ott_p', name: '粉软凳', kind: 'stool', sprite: { x: 1166, y: 851, w: 118, h: 107 }, w: 1, h: 1, height: 22, main: '#f5c6d5', accent: '#fdeaf0', comfort: 11, price: 160, unlockLv: 1, set: 'bunny' },
  { id: 'b_shelf_w', name: '白书架', kind: 'shelf', sprite: { x: 1307, y: 850, w: 128, h: 189 }, w: 1, h: 1, height: 60, main: '#fbf4ec', accent: '#e6d3c2', comfort: 22, price: 380, unlockLv: 4, set: 'bunny' },
  { id: 'b_ott_v', name: '紫软凳', kind: 'stool', sprite: { x: 1121, y: 949, w: 121, h: 109 }, w: 1, h: 1, height: 22, main: '#cfbfe8', accent: '#efe8fa', comfort: 11, price: 160, unlockLv: 1, set: 'bunny' },
];

export interface SurfaceDef {
  id: string;
  name: string;
  main: string;
  accent: string;
  comfort: number;
  price: number;
  /** 配了就找 assets/placeholder/surface-<tex>.* 当贴图铺面，缺图时回退到 main/accent 纯色 */
  tex?: string;
}

export const FLOORS: SurfaceDef[] = [
  { id: 'wood', name: '原木地板', main: '#e8c9a0', accent: '#d4ad7e', comfort: 0, price: 0 },
  { id: 'tile', name: '奶白瓷砖', main: '#f5eee3', accent: '#e3d8c6', comfort: 4, price: 120 },
  { id: 'grass', name: '草皮地面', main: '#cfe6b8', accent: '#b3d398', comfort: 6, price: 200 },
  { id: 'mat', name: '灰调水泥', main: '#dcdcd8', accent: '#c7c7c2', comfort: 4, price: 200 },
  { id: 'pink', name: '草莓格纹', main: '#fbe0e4', accent: '#f4c3cb', comfort: 8, price: 320 },
  { id: 'dark', name: '深色地板', main: '#6e5a4b', accent: '#5b4a3d', comfort: 8, price: 380 },
  // 贴图地板：main/accent 只是缺图时的兜底色
  { id: 'panel', name: '粉调拼花', main: '#f8d3de', accent: '#f0c2d1', comfort: 6, price: 200, tex: 'pink-panel' },
  { id: 'grid', name: '雪白细格', main: '#fdf5f5', accent: '#f5e2e5', comfort: 6, price: 200, tex: 'white-grid' },
];

export const WALLS: SurfaceDef[] = [
  { id: 'cream', name: '奶油墙', main: '#fdf1de', accent: '#efe0c6', comfort: 0, price: 0 },
  { id: 'sky', name: '天空蓝', main: '#dcefff', accent: '#c4e2f8', comfort: 4, price: 120 },
  { id: 'mint', name: '薄荷绿', main: '#dff3e6', accent: '#c6e6d3', comfort: 6, price: 200 },
  { id: 'rose', name: '蜜桃粉', main: '#ffe6e9', accent: '#f8cfd5', comfort: 6, price: 200 },
  { id: 'night', name: '夜色紫', main: '#3b3a5c', accent: '#2f2e4a', comfort: 10, price: 400 },
  { id: 'wood', name: '木纹墙', main: '#e3c9a8', accent: '#cdae89', comfort: 8, price: 340 },
  // 贴图墙：main/accent 只是缺图时的兜底色，取彩条的平均调子
  { id: 'star', name: '星星彩条', main: '#f7e2ef', accent: '#e9cbe0', comfort: 6, price: 200, tex: 'star-stripe' },
];

export const furniById = (id: string) => FURNITURE.find((f) => f.id === id);
export const floorById = (id: string) => FLOORS.find((f) => f.id === id) ?? FLOORS[0];
export const wallById = (id: string) => WALLS.find((f) => f.id === id) ?? WALLS[0];

/** 旋转后的实际占地 */
export function footprint(def: FurniDef, rot: number): { w: number; h: number } {
  return rot % 2 === 0 ? { w: def.w, h: def.h } : { w: def.h, h: def.w };
}
