// 게임 전역 상수. 밸런싱은 대부분 여기와 data/weapons.js에서 한다.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60; // 고정 타임스텝

export const RUN_TIME = 480; // 8분 생존

export const MAX_COMPANIONS = 10;

export const LEADER = { hp: 100, speed: 150, radius: 13 };
export const COMPANION = { hp: 60, radius: 10 };

// 동료 군집 이동
export const GANG = {
  minDist: 40, // 이 거리 안쪽에선 주인공 쪽으로 안 끌려감
  maxDist: 120, // 이 거리부터 최대 속도로 따라옴
  speedMul: 1.2, // 동료 최대 속도 = 주인공 속도 × 1.2
  separation: 28, // 동료끼리 이 거리 안쪽이면 밀어냄
  accel: 6, // 속도 보간 계수 (낮을수록 굼뜨게 따라옴)
  teleportDist: 700, // 이보다 멀어지면 주인공 옆으로 순간이동 (끼임 방지)
};

export const HIT_IFRAME = 0.5;
export const PICKUP_RADIUS = 60;
export const GEM_CAP = 500;

// 레벨 L → L+1 필요 경험치 = first + (L - 1) × step
export const XP_CURVE = { first: 5, step: 8 };

export const ENEMY_CAP = 300; // 일반 몬스터만 센다 (네임드/보스 제외)
export const ENEMY_HP_GROWTH_PER_MIN = 0.12;

// 일반 몬스터. kb = 넉백 배율 (낮을수록 안 밀림)
export const ENEMY_TYPES = {
  walker: { hp: 10, speed: 60, damage: 5, radius: 11, xp: 1, kb: 1, color: '#5f8f3e', edge: '#34521f' },
  runner: { hp: 5, speed: 130, damage: 4, radius: 9, xp: 1, kb: 1.2, color: '#a3c45a', edge: '#5b7327' },
  fatty: { hp: 50, speed: 40, damage: 10, radius: 17, xp: 5, kb: 0.3, color: '#40602c', edge: '#223417' },
};

// 시간대별 일반 몬스터 구성 비율 (from = 초)
export const WAVES = [
  { from: 0, weights: { walker: 1 } },
  { from: 60, weights: { walker: 0.7, runner: 0.3 } },
  { from: 150, weights: { walker: 0.55, runner: 0.3, fatty: 0.15 } },
];

// 네임드: 처치 시 경험치 다량 + 패시브 3택1
export const NAMED = {
  times: [60, 120, 240, 300, 420],
  names: ['정육점 주인', '배달부', '경비원', '택시기사', '청소부'],
  hpMul: 30, // 그 시점 걷는 좀비 HP × 30
  radius: 22,
  speed: 70,
  damage: 15,
  kb: 0.2,
  gems: 4, // 경험치 조각 4개 × 10 = 40
  gemValue: 10,
  color: '#b5483b',
  edge: '#5a1f18',
  charge: { cd: 5, windup: 0.8, dashSpeed: 460, dashTime: 0.5, range: 380 },
};

// 보스: 전용 HP 바, 처치 시 경험치 대량 + 부활/대강화 3택1
export const BOSS = {
  list: [
    { time: 180, name: '거대 도살자', hpMul: 150 },
    { time: 360, name: '변이체 원장', hpMul: 300 },
  ],
  warn: 3, // 등장 몇 초 전 경고
  radius: 40,
  speed: 55,
  damage: 25,
  kb: 0.05,
  gems: 10, // 10개 × 20 = 200
  gemValue: 20,
  spawnRateMul: 0.5, // 보스 생존 중 일반 스폰량
  color: '#7a1f2b',
  edge: '#2a0a0e',
  charge: { cd: 4, windup: 1.0, dashSpeed: 520, dashTime: 0.6, range: 450 },
  summon: { cd: 8, count: 8, radius: 110 },
};

export const SPAWN = {
  baseRate: 1.2, // 초당 스폰 수 (0분)
  ratePerMin: 1.6, // 분당 증가량
  baseMinAlive: 15, // 필드 최소 유지 수 (0분)
  minAlivePerMin: 25,
  ringMargin: 60, // 화면 대각선 밖 여유 거리
  relocateDist: 1150, // 이보다 멀어진 적은 반대편으로 재배치
};

// 티어 먼저 추첨 → 티어 안에서 균등 랜덤
export const TIER_WEIGHTS = [
  ['normal', 70],
  ['rare', 20],
  ['legendary', 10],
];

export const WEAPON_MAX_LEVEL = 5; // 레벨업으로 도달 가능한 최대
export const WEAPON_BOSS_MAX_LEVEL = 7; // 보스 대강화로만 도달
export const BOSS_UPGRADE_LEVELS = 2;
export const WEAPON_DMG_PER_LEVEL = 0.25;

export const PASSIVE_MAX_LEVEL = 5;

export const GRID_CELL = 64;
export const MAX_DAMAGE_TEXTS = 120;
