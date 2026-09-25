import { TIER_WEIGHTS } from '../config.js';
import { pick } from '../util.js';

export const TIERS = {
  normal: { label: '노멀', color: '#c9ced6' },
  rare: { label: '레어', color: '#4aa3ff' },
  legendary: { label: '전설', color: '#ff9f1c' },
};

// 유형별 기본값. 무기 정의에서 필요한 것만 덮어쓴다.
const PROJ = { count: 1, spread: 0, jitter: 0, pierce: 0, knock: 30, size: 3, len: 8, burst: 1, burstInterval: 0, explode: 0 };

const proj = (stats) => ({ type: 'projectile', stats: { ...PROJ, ...stats } });
const melee = (fx, stats) => ({ type: 'melee', fx, stats });
const lob = (stats) => ({ type: 'lob', stats: { flight: 0.55, knock: 0, ...stats } });

// 기준 DPS: 노멀 15 / 레어 45 / 전설 135 (1 : 3 : 9)
// 한 번 발동에 나가는 피해가 전부 한 대상에 맞는다고 가정한 값이다.
export const WEAPONS = [
  // ── 노멀 ──
  {
    id: 'pistol', name: '권총', tier: 'normal', color: '#e8e8e8',
    desc: '가장 가까운 적에게 한 발씩 쏜다',
    ...proj({ cd: 0.6, dmg: 9, speed: 600, range: 350, knock: 40 }),
  },
  {
    id: 'shotgun', name: '샷건', tier: 'normal', color: '#f4d35e',
    desc: '5발을 부채꼴로 흩뿌린다. 가까이서 강하다',
    ...proj({ cd: 1.2, dmg: 3.6, speed: 550, range: 220, count: 5, spread: 30, jitter: 3, knock: 90, len: 6 }),
  },
  {
    id: 'smg', name: '기관단총', tier: 'normal', color: '#e0e0a0',
    desc: '약한 탄을 쉴 새 없이 연사한다',
    ...proj({ cd: 0.12, dmg: 1.8, speed: 700, range: 300, jitter: 6, knock: 10, size: 2, len: 6 }),
  },
  {
    id: 'bat', name: '야구방망이', tier: 'normal', color: '#d9a066',
    desc: '앞쪽을 크게 휘둘러 적을 날려버린다',
    ...melee('swing', { cd: 0.8, dmg: 12, radius: 70, arc: 110, knock: 220 }),
  },
  {
    id: 'molotov', name: '화염병', tier: 'normal', color: '#ff6b1a',
    desc: '적 위치에 던져 2초간 불바다를 만든다',
    ...lob({ cd: 2.0, dmg: 3.75, range: 300, zone: true, radius: 50, duration: 2, tick: 0.25 }),
  },
  {
    id: 'crossbow', name: '석궁', tier: 'normal', color: '#b5895a',
    desc: '화살이 적 2명을 꿰뚫는다',
    ...proj({ cd: 1.0, dmg: 15, speed: 750, range: 420, pierce: 2, knock: 60, len: 12 }),
  },

  // ── 레어 ──
  {
    id: 'sniper', name: '저격소총', tier: 'rare', color: '#9be7ff',
    desc: '먼 거리의 적을 일직선으로 전부 관통한다',
    ...proj({ cd: 1.6, dmg: 72, speed: 1600, range: 650, pierce: Infinity, knock: 80, len: 26 }),
  },
  {
    id: 'rifle', name: '돌격소총', tier: 'rare', color: '#ffe066',
    desc: '3점사로 빠르게 몰아친다',
    ...proj({ cd: 0.5, dmg: 7.5, speed: 850, range: 380, burst: 3, burstInterval: 0.08, jitter: 2, knock: 20, size: 2.5, len: 10 }),
  },
  {
    id: 'chainsaw', name: '전기톱', tier: 'rare', color: '#ff4d4d',
    desc: '근처의 적을 쉬지 않고 갈아버린다',
    ...melee('saw', { cd: 0.1, dmg: 4.5, radius: 55, arc: 120, knock: 15 }),
  },
  {
    id: 'grenade', name: '수류탄', tier: 'rare', color: '#7bd88f',
    desc: '적 무리에 던져 폭발시킨다',
    ...lob({ cd: 1.2, dmg: 54, range: 320, flight: 0.6, zone: false, radius: 80, knock: 150 }),
  },

  // ── 전설 ──
  {
    id: 'minigun', name: '미니건', tier: 'legendary', color: '#ffd23f',
    desc: '탄막으로 앞을 쓸어버린다',
    ...proj({ cd: 0.05, dmg: 6.75, speed: 900, range: 400, jitter: 7, knock: 12, size: 2.5, len: 10 }),
  },
  {
    id: 'rpg', name: '로켓런처', tier: 'legendary', color: '#ff7043',
    desc: '첫 적중 시 큰 폭발을 일으킨다',
    ...proj({ cd: 1.2, dmg: 162, speed: 450, range: 450, explode: 110, knock: 180, size: 5, len: 14 }),
  },
  {
    id: 'flamethrower', name: '화염방사기', tier: 'legendary', color: '#ff9f1c',
    desc: '원뿔 범위를 계속 불태운다',
    ...melee('flame', { cd: 0.1, dmg: 13.5, radius: 170, arc: 40, knock: 5 }),
  },
  {
    id: 'railgun', name: '레일건', tier: 'legendary', color: '#c77dff',
    desc: '화면 끝까지 닿는 관통 빔을 쏜다',
    type: 'beam', stats: { cd: 1.0, dmg: 135, range: 800, width: 18, knock: 60 },
  },
  {
    id: 'tesla', name: '테슬라 코일', tier: 'legendary', color: '#7df9ff',
    desc: '번개가 적 사이를 4번 튀어 다닌다',
    type: 'chain', stats: { cd: 0.4, dmg: 54, range: 320, chainRange: 150, jumps: 4 },
  },
];

const BY_TIER = {};
for (const w of WEAPONS) (BY_TIER[w.tier] ||= []).push(w);

export function rollTier() {
  const total = TIER_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [tier, w] of TIER_WEIGHTS) {
    if ((r -= w) < 0) return tier;
  }
  return TIER_WEIGHTS[0][0];
}

export function rollWeapon() {
  return pick(BY_TIER[rollTier()]);
}

// 단일 대상 기준 명목 DPS
export function nominalDps(type, s) {
  switch (type) {
    case 'projectile':
      return (s.dmg * s.count * s.burst) / s.cd;
    case 'lob':
      return s.zone ? (s.dmg * (s.duration / s.tick)) / s.cd : s.dmg / s.cd;
    default:
      return s.dmg / s.cd;
  }
}

// Lv3 / Lv5 추가 강화 설명
export const LEVEL_BONUS_TEXT = {
  projectile: '발사 수 +1',
  melee: '범위 +20%',
  lob: '폭발/장판 범위 +30%',
  beam: '쿨다운 -20%',
  chain: '연쇄 +2',
};
