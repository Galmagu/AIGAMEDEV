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

export const ENEMY_CAP = 300;
export const WALKER = { hp: 10, speed: 60, damage: 5, radius: 11, xp: 1 };
export const ENEMY_HP_GROWTH_PER_MIN = 0.12;

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

export const WEAPON_MAX_LEVEL = 5;
export const WEAPON_DMG_PER_LEVEL = 0.25;

export const GRID_CELL = 64;
export const MAX_DAMAGE_TEXTS = 120;
