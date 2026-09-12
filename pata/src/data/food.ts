/** 食物与护理道具。emoji 当图标，省掉一整套美术。 */

export interface FoodDef {
  id: string;
  name: string;
  icon: string;
  price: number;
  /** 恢复饱食度 */
  hunger: number;
  /** 附带心情 */
  mood: number;
  unlockLv: number;
  desc: string;
}

export const FOODS: FoodDef[] = [
  { id: 'biscuit', name: '小饼干', icon: '🍪', price: 15, hunger: 16, mood: 2, unlockLv: 1, desc: '最便宜的填肚子办法' },
  { id: 'fish', name: '小鱼干', icon: '🐟', price: 32, hunger: 30, mood: 4, unlockLv: 1, desc: '嚼起来咔滋咔滋' },
  { id: 'milk', name: '热牛奶', icon: '🥛', price: 45, hunger: 24, mood: 9, unlockLv: 2, desc: '喝完会打一个满足的嗝' },
  { id: 'pudding', name: '焦糖布丁', icon: '🍮', price: 70, hunger: 40, mood: 12, unlockLv: 3, desc: '晃一晃，Pata 眼睛会跟着转' },
  { id: 'cake', name: '草莓蛋糕', icon: '🍰', price: 120, hunger: 58, mood: 20, unlockLv: 5, desc: '过节才舍得买' },
  { id: 'hotpot', name: '一人食小火锅', icon: '🍲', price: 200, hunger: 90, mood: 28, unlockLv: 8, desc: '吃完直接原地躺平' },
];

export const foodById = (id: string) => FOODS.find((f) => f.id === id);
