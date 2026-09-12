/** 捏人配置：体色 / 眼型 / 腮红 / 花纹 / 头饰。全部程序化绘制，无美术资源。 */

export interface BodyDef {
  id: string;
  name: string;
  /** 身体渐变：main = 头顶，tip = 耳尖/下摆。belly = 胸口绒毛 */
  main: string;
  tip: string;
  belly: string;
  price: number;
}

export interface EyeDef {
  id: string;
  name: string;
  price: number;
}

export interface BlushDef {
  id: string;
  name: string;
  color: string;
  price: number;
}

export interface PatternDef {
  id: string;
  name: string;
  price: number;
}

export interface HatDef {
  id: string;
  name: string;
  color: string;
  price: number;
}

export const BODIES: BodyDef[] = [
  { id: 'angel', name: '奶油天使', main: '#fffcee', tip: '#efc142', belly: '#ffffff', price: 0 },
  { id: 'snow', name: '初雪白', main: '#ffffff', tip: '#dde7f0', belly: '#ffffff', price: 0 },
  { id: 'peach', name: '蜜桃粉', main: '#fff6f4', tip: '#f7b3bf', belly: '#fffafb', price: 180 },
  { id: 'mint', name: '薄荷绿', main: '#f7fdf9', tip: '#9fdcbb', belly: '#ffffff', price: 260 },
  { id: 'sky', name: '晴空蓝', main: '#f6fbff', tip: '#9ecdee', belly: '#ffffff', price: 260 },
  { id: 'lilac', name: '香芋紫', main: '#fbf9ff', tip: '#bcaae8', belly: '#ffffff', price: 340 },
  { id: 'cocoa', name: '可可棕', main: '#fdf6ec', tip: '#cfa375', belly: '#fffaf2', price: 340 },
  { id: 'ink', name: '墨团灰', main: '#fbfcfd', tip: '#9aa5b1', belly: '#ffffff', price: 420 },
];

export const EYES: EyeDef[] = [
  { id: 'gentle', name: '温柔眼', price: 0 },
  { id: 'dot', name: '圆豆豆', price: 0 },
  { id: 'happy', name: '眯眯眼', price: 0 },
  { id: 'sleepy', name: '困困眼', price: 120 },
  { id: 'sparkle', name: '闪亮眼', price: 260 },
  { id: 'wink', name: '俏皮眨', price: 260 },
  { id: 'star', name: '星星眼', price: 420 },
];

export const BLUSHES: BlushDef[] = [
  { id: 'gold', name: '蜜糖橙', color: '#ffc44d', price: 0 },
  { id: 'rose', name: '草莓粉', color: '#ff9aa6', price: 0 },
  { id: 'coral', name: '珊瑚橘', color: '#ff9c6e', price: 120 },
  { id: 'berry', name: '莓果紫', color: '#c89bf0', price: 180 },
  { id: 'aqua', name: '海盐蓝', color: '#7fd2f0', price: 180 },
  { id: 'none', name: '不要腮红', color: '#00000000', price: 0 },
];

export const PATTERNS: PatternDef[] = [
  { id: 'plain', name: '素净', price: 0 },
  { id: 'belly', name: '奶泡肚', price: 0 },
  { id: 'spot', name: '呆毛点', price: 160 },
  { id: 'stripe', name: '小虎纹', price: 240 },
  { id: 'freckle', name: '小雀斑', price: 240 },
];

export const HATS: HatDef[] = [
  { id: 'halo', name: '天使圈', color: '#ffd45e', price: 0 },
  { id: 'bow', name: '蝴蝶结', color: '#ff8fa3', price: 200 },
  { id: 'cap', name: '小鸭舌', color: '#6fc3ef', price: 260 },
  { id: 'flower', name: '一朵花', color: '#ffd166', price: 300 },
  { id: 'crown', name: '小皇冠', color: '#ffc44d', price: 520 },
  { id: 'leaf', name: '一片叶', color: '#8fd9b6', price: 300 },
  { id: 'horn', name: '呆呆角', color: '#e0b48a', price: 380 },
];

export const bodyById = (id: string) => BODIES.find((b) => b.id === id) ?? BODIES[0];
export const blushById = (id: string) => BLUSHES.find((b) => b.id === id) ?? BLUSHES[0];
export const hatById = (id: string | null) => (id ? HATS.find((h) => h.id === id) ?? null : null);
