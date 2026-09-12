export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export const clamp = (v: number, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 指数趋近，与帧率无关：每秒收敛 rate 的比例 */
export const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

export const randInt = (n: number) => Math.floor(Math.random() * n);
export const pick = <T>(arr: readonly T[]): T => arr[randInt(arr.length)];

let uidSeq = 0;
export const uid = (p = 'i') => `${p}_${Date.now().toString(36)}_${(uidSeq++).toString(36)}`;

export function fmtDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} 小时 ${m % 60} 分钟` : `${h} 小时`;
  return `${Math.floor(h / 24)} 天 ${h % 24} 小时`;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 本地日历日的序号，用于「每日一次」判断 */
export function dayIndex(ts: number): number {
  const d = new Date(ts);
  return Math.floor(
    (ts - d.getTimezoneOffset() * 60000) / DAY,
  );
}

export function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** 按比例把颜色推向白/黑，用于生成明暗面 */
export function shade(hex: string, amt: number): string {
  const n = hexToNum(hex);
  const to = amt > 0 ? 255 : 0;
  const p = Math.abs(amt);
  const ch = (sh: number) => {
    const c = (n >> sh) & 0xff;
    return Math.round(lerp(c, to, p));
  };
  return `#${[ch(16), ch(8), ch(0)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
