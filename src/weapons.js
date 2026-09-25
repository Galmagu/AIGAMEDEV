// 무기 런타임: 레벨 반영 스탯 계산 + 쿨다운 관리 + 유형별 발동 처리
import { WEAPON_DMG_PER_LEVEL } from './config.js';
import { DEG, rand, angleDiff, segDist2 } from './util.js';

export function computeStats(def, level) {
  const s = { ...def.stats };
  const bonus = (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + (level >= 7 ? 1 : 0);
  s.dmg *= 1 + WEAPON_DMG_PER_LEVEL * (level - 1);
  switch (def.type) {
    case 'projectile':
      s.count += bonus;
      // 원래 단발인 무기는 추가 탄을 10° 간격으로 벌린다
      if (def.stats.spread === 0 && s.count > 1) s.spread = 10 * (s.count - 1);
      break;
    case 'melee':
      s.radius *= 1 + 0.2 * bonus;
      break;
    case 'lob':
      s.radius *= 1 + 0.3 * bonus;
      break;
    case 'beam':
      s.cd *= Math.pow(0.8, bonus);
      break;
    case 'chain':
      s.jumps += 2 * bonus;
      break;
  }
  // 근접 무기는 닿기 조금 전부터 휘두르기 시작
  s.targetRange = def.type === 'melee' ? s.radius + 25 : s.range;
  return s;
}

export function createWeapon(def) {
  return {
    def,
    level: 1,
    stats: computeStats(def, 1),
    cd: Math.random() * 0.3, // 동료들이 동시에 쏘지 않게 살짝 어긋나게
    burstLeft: 0,
    burstTimer: 0,
  };
}

export function setWeaponLevel(w, level, cap) {
  w.level = Math.min(level, cap);
  w.stats = computeStats(w.def, w.level);
}

export function updateWeapon(game, u, dt) {
  const w = u.weapon;
  const s = w.stats;

  // 점사 진행 중
  if (w.burstLeft > 0) {
    w.burstTimer -= dt;
    if (w.burstTimer <= 0) {
      const t = game.findTarget(u, s.targetRange);
      if (t) fire(game, u, w, t);
      w.burstLeft--;
      w.burstTimer += s.burstInterval;
    }
  }

  if (w.cd > 0) w.cd -= dt;
  if (w.cd > 0) return;

  const target = game.findTarget(u, s.targetRange);
  if (!target) {
    w.cd = 0; // 적이 사거리에 들어오면 바로 쏠 수 있게 대기
    return;
  }
  fire(game, u, w, target);
  w.cd += s.cd * game.mods.cd;
  if (s.burst > 1) {
    w.burstLeft = s.burst - 1;
    w.burstTimer = s.burstInterval;
  }
}

function fire(game, u, w, t) {
  const ang = Math.atan2(t.y - u.y, t.x - u.x);
  u.aim = ang;
  switch (w.def.type) {
    case 'projectile': return fireProjectile(game, u, w, ang);
    case 'melee': return fireMelee(game, u, w, ang);
    case 'lob': return fireLob(game, u, w, t);
    case 'beam': return fireBeam(game, u, w, ang);
    case 'chain': return fireChain(game, u, w, t);
  }
}

function fireProjectile(game, u, w, ang) {
  const s = w.stats;
  for (let i = 0; i < s.count; i++) {
    const off = s.count > 1 ? -s.spread / 2 + (s.spread * i) / (s.count - 1) : 0;
    const a = ang + (off + rand(-s.jitter, s.jitter)) * DEG;
    game.spawnProjectile(u.x, u.y, Math.cos(a) * s.speed, Math.sin(a) * s.speed, s, w.def.color, u);
  }
}

function fireMelee(game, u, w, ang) {
  const s = w.stats;
  const half = (s.arc * DEG) / 2;
  const list = game.queryRadius(u.x, u.y, s.radius + 20, game.tmp);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const dx = e.x - u.x;
    const dy = e.y - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > s.radius + e.r) continue;
    // 몸에 붙은 적은 각도와 상관없이 맞는다
    if (dist > u.r + e.r && Math.abs(angleDiff(Math.atan2(dy, dx), ang)) > half) continue;
    game.damageEnemy(e, s.dmg, u, dx / dist, dy / dist, s.knock);
  }
  game.addFx(w.def.fx, u.x, u.y, {
    ang, radius: s.radius, arc: s.arc * DEG, color: w.def.color, follow: u,
    life: w.def.fx === 'swing' ? 0.16 : 0.12,
  });
}

function fireLob(game, u, w, t) {
  game.lobs.push({
    sx: u.x, sy: u.y, tx: t.x, ty: t.y, t: 0, dur: w.stats.flight,
    s: w.stats, color: w.def.color, owner: u, dead: false,
  });
}

function fireBeam(game, u, w, ang) {
  const s = w.stats;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const ex = u.x + cos * s.range;
  const ey = u.y + sin * s.range;
  const pad = s.width / 2 + 16;
  const list = game.queryRect(
    Math.min(u.x, ex) - pad, Math.min(u.y, ey) - pad,
    Math.max(u.x, ex) + pad, Math.max(u.y, ey) + pad, game.tmp,
  );
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const rr = s.width / 2 + e.r;
    if (segDist2(e.x, e.y, u.x, u.y, ex, ey) <= rr * rr) game.damageEnemy(e, s.dmg, u, cos, sin, s.knock);
  }
  game.addFx('beam', u.x, u.y, { x2: ex, y2: ey, width: s.width, color: w.def.color, life: 0.2 });
}

function fireChain(game, u, w, first) {
  const s = w.stats;
  const hit = new Set();
  const pts = [u.x, u.y];
  let cur = first;
  for (let i = 0; i <= s.jumps && cur; i++) {
    pts.push(cur.x, cur.y);
    hit.add(cur);
    game.damageEnemy(cur, s.dmg, u, 0, 0, 0);
    cur = game.grid.nearest(cur.x, cur.y, s.chainRange, hit);
  }
  game.addFx('chain', u.x, u.y, { pts, color: w.def.color, life: 0.15 });
}
