import { BODIES, type BodyDef, type HatDef } from '../data/avatar';
import { shade } from '../core/util';

const INK = '#4a423c';
const box = (inner: string, bg = '#fff') =>
  `<svg viewBox="0 0 40 40" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
     <rect width="40" height="40" rx="10" fill="${bg}"/>${inner}
   </svg>`;

/** 眼型预览 */
export function eyeSwatch(id: string): string {
  const L = 12.5;
  const R = 27.5;
  const y = 21;
  const dot = (x: number) =>
    `<circle cx="${x}" cy="${y}" r="5.2" fill="${INK}"/><circle cx="${x - 1.8}" cy="${y - 1.8}" r="1.9" fill="#fff"/>`;
  const arc = (x: number) =>
    `<path d="M${x - 6} ${y + 2.5} Q${x} ${y - 6} ${x + 6} ${y + 2.5}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  const sleepy = (x: number) =>
    `<path d="M${x - 6} ${y - 1} Q${x} ${y + 3.5} ${x + 6} ${y - 1}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
     <path d="M${x - 3} ${y + 3} L${x - 4.4} ${y + 6}" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
  const star = (x: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 6.4 : 2.7;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(`${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="#ffd45e" stroke="${INK}" stroke-width="1.4"/>`;
  };
  const sparkle = (x: number) =>
    `<circle cx="${x}" cy="${y}" r="5.6" fill="${INK}"/><circle cx="${x - 2}" cy="${y - 2}" r="2.2" fill="#fff"/><circle cx="${x + 2}" cy="${y + 2}" r="1.1" fill="#fff"/>`;
  const gentle = (x: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="5.4" ry="6.6" fill="#3f2d20"/>
     <ellipse cx="${x}" cy="${y + 2.9}" rx="4.3" ry="2.9" fill="#c98b45"/>
     <circle cx="${x - 1.9}" cy="${y - 2.4}" r="1.8" fill="#fff"/>
     <path d="M${x - 6.8} ${y - 4.1} Q${x} ${y - 9.5} ${x + 6.8} ${y - 3.4}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;

  const map: Record<string, string> = {
    gentle: gentle(L) + gentle(R),
    dot: dot(L) + dot(R),
    happy: arc(L) + arc(R),
    sleepy: sleepy(L) + sleepy(R),
    sparkle: sparkle(L) + sparkle(R),
    wink: dot(L) + arc(R),
    star: star(L) + star(R),
  };
  return box(map[id] ?? map.dot, '#fdf6ea');
}

/** 渐变定义 + 一只小兔轮廓，体色/花纹预览共用 */
function bunny(def: BodyDef, uid: string, marks = ''): string {
  return `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${def.main}"/>
      <stop offset="0.45" stop-color="${def.main}"/>
      <stop offset="1" stop-color="${def.tip}"/>
    </linearGradient></defs>
    <ellipse cx="9.5" cy="24" rx="4.6" ry="11" fill="url(#${uid})" stroke="${INK}" stroke-width="1.8"/>
    <ellipse cx="30.5" cy="24" rx="4.6" ry="11" fill="url(#${uid})" stroke="${INK}" stroke-width="1.8"/>
    <ellipse cx="20" cy="20.5" rx="10.5" ry="11" fill="url(#${uid})" stroke="${INK}" stroke-width="1.8"/>
    ${marks}`;
}

/** 体色预览 */
export function bodySwatch(def: BodyDef): string {
  return box(bunny(def, `sw_b_${def.id}`), '#fdf6ea');
}

/** 花纹预览：当前体色的小兔 + 花纹 */
export function patternSwatch(id: string, bodyId: string): string {
  const b = BODIES.find((x) => x.id === bodyId) ?? BODIES[0];
  const mark = shade(b.tip, -0.1);
  let marks = '';
  switch (id) {
    case 'belly':
      marks = `<ellipse cx="20" cy="25" rx="6.5" ry="5" fill="${b.belly}"/>`;
      break;
    case 'spot':
      marks = `<circle cx="15" cy="16" r="4" fill="${mark}" opacity="0.7"/><circle cx="26" cy="20" r="2.4" fill="${mark}" opacity="0.7"/>`;
      break;
    case 'stripe':
      marks = [15, 21, 27]
        .map(
          (y) =>
            `<path d="M25 ${y} q3.5 1.8 1.8 4.4" fill="none" stroke="${mark}" stroke-width="2.4" stroke-linecap="round" opacity="0.75"/>`,
        )
        .join('');
      break;
    case 'freckle':
      marks = [14, 17, 20, 23, 26]
        .map((x, i) => `<circle cx="${x}" cy="${24 + (i % 2) * 2}" r="1.1" fill="${mark}" opacity="0.8"/>`)
        .join('');
      break;
    default:
      break;
  }
  return box(bunny(b, `sw_p_${id}_${b.id}`, marks), '#fdf6ea');
}

/** 头饰预览 */
export function hatSwatch(def: HatDef): string {
  const c = def.color;
  const map: Record<string, string> = {
    halo: `<ellipse cx="20" cy="20" rx="13" ry="5" fill="none" stroke="${c}" stroke-width="4.5"/>
           <ellipse cx="20" cy="19.4" rx="13" ry="5" fill="none" stroke="#fff3c4" stroke-width="1.6"/>`,
    bow: `<ellipse cx="11" cy="20" rx="8" ry="6" fill="${c}" stroke="${INK}" stroke-width="2"/>
          <ellipse cx="29" cy="20" rx="8" ry="6" fill="${c}" stroke="${INK}" stroke-width="2"/>
          <circle cx="20" cy="20" r="4" fill="${shade(c, -0.15)}" stroke="${INK}" stroke-width="2"/>`,
    cap: `<path d="M7 24 a13 13 0 0 1 26 0 z" fill="${c}" stroke="${INK}" stroke-width="2"/>
          <ellipse cx="20" cy="25" rx="16" ry="3.6" fill="${c}" stroke="${INK}" stroke-width="2"/>
          <circle cx="20" cy="11" r="2.6" fill="${shade(c, -0.2)}" stroke="${INK}" stroke-width="1.6"/>`,
    flower: [0, 1, 2, 3, 4]
      .map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return `<circle cx="${20 + Math.cos(a) * 8}" cy="${20 + Math.sin(a) * 8}" r="6" fill="${c}" stroke="${INK}" stroke-width="1.8"/>`;
      })
      .join('') + `<circle cx="20" cy="20" r="4.4" fill="#fff4d0" stroke="${INK}" stroke-width="1.8"/>`,
    crown: `<polygon points="8,27 8,13 15,20 20,10 25,20 32,13 32,27" fill="${c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="20" cy="22" r="2.4" fill="#ff8fa3"/>`,
    leaf: `<ellipse cx="22" cy="19" rx="11" ry="6" fill="${c}" stroke="${INK}" stroke-width="2" transform="rotate(-18 22 19)"/>
           <path d="M8 26 q8 -5 24 -10" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
    horn: `<polygon points="10,30 15,10 21,27" fill="${c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
           <polygon points="30,30 25,10 19,27" fill="${c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
  };
  return box(map[def.id] ?? '', '#fdf6ea');
}

/** 纯色块（体色 / 腮红） */
export function colorSwatch(color: string, label?: string): string {
  if (color === '#00000000') {
    return box(
      `<path d="M10 10 L30 30 M30 10 L10 30" stroke="#c9bfb2" stroke-width="3" stroke-linecap="round"/>`,
      '#fdf6ea',
    );
  }
  return box(
    `<circle cx="20" cy="20" r="13" fill="${color}" stroke="${INK}" stroke-width="2"/>` +
      (label ? '' : ''),
    '#fdf6ea',
  );
}
