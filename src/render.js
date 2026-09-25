import { VIEW_W, VIEW_H, RUN_TIME, MAX_COMPANIONS, ENEMY_TYPES, NAMED, BOSS } from './config.js';
import { TIERS } from './data/weapons.js';
import { TAU, formatTime } from './util.js';

const COL = {
  bg: '#1b1d22',
  tileA: '#20232a',
  tileB: '#1d2026',
  debris: '#2b2f38',
  leader: '#ffd23f',
  edge: '#0b0c0f',
  gem: '#5ab4ff',
  gemMid: '#7bd88f',
  gemBig: '#ff6b6b',
  xp: '#4aa3ff',
  hp: '#e5484d',
};

export function render(ctx, game, scale) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const cx = game.camX;
  const cy = game.camY;
  let sx = 0;
  let sy = 0;
  if (game.shake > 0) {
    sx = (Math.random() * 2 - 1) * game.shake;
    sy = (Math.random() * 2 - 1) * game.shake;
  }
  const view = {
    x0: cx - VIEW_W / 2 - 60, y0: cy - VIEW_H / 2 - 60,
    x1: cx + VIEW_W / 2 + 60, y1: cy + VIEW_H / 2 + 60,
  };

  ctx.save();
  ctx.translate(Math.round(VIEW_W / 2 - cx + sx), Math.round(VIEW_H / 2 - cy + sy));
  drawGround(ctx, view);
  if (game.state !== 'title') {
    drawZones(ctx, game);
    drawGems(ctx, game, view);
    drawTelegraphs(ctx, game);
    drawEnemies(ctx, game, view);
    drawElites(ctx, game);
    drawUnits(ctx, game);
    drawProjectiles(ctx, game, view);
    drawLobs(ctx, game);
    drawFx(ctx, game);
    drawTexts(ctx, game);
  }
  ctx.restore();

  if (game.state !== 'title') drawHud(ctx, game);
}

function inView(v, x, y) {
  return x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1;
}

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// 무한 맵 느낌만 나게 체크 타일 + 해시 기반 잔해
function drawGround(ctx, v) {
  const T = 128;
  const ix0 = Math.floor(v.x0 / T);
  const ix1 = Math.floor(v.x1 / T);
  const iy0 = Math.floor(v.y0 / T);
  const iy1 = Math.floor(v.y1 / T);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iy = iy0; iy <= iy1; iy++) {
      ctx.fillStyle = (ix + iy) & 1 ? COL.tileA : COL.tileB;
      ctx.fillRect(ix * T, iy * T, T, T);
    }
  }
  ctx.fillStyle = COL.debris;
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iy = iy0; iy <= iy1; iy++) {
      const h = hash(ix, iy);
      if (h % 3 !== 0) continue;
      ctx.fillRect(ix * T + ((h >>> 3) % 110), iy * T + ((h >>> 10) % 110), 5 + ((h >>> 4) % 14), 3 + ((h >>> 7) % 6));
    }
  }
}

function drawZones(ctx, game) {
  for (const z of game.zones) {
    const a = Math.min(1, z.life / 0.3);
    ctx.globalAlpha = (0.28 + Math.random() * 0.08) * a;
    ctx.fillStyle = z.color;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGems(ctx, game, v) {
  const tiers = [
    [COL.gem, 4, (g) => g.v < 5],
    [COL.gemMid, 5, (g) => g.v >= 5 && g.v < 20],
    [COL.gemBig, 7, (g) => g.v >= 20],
  ];
  for (const [color, s, match] of tiers) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const g of game.gems) {
      if (!match(g) || !inView(v, g.x, g.y)) continue;
      ctx.moveTo(g.x, g.y - s - 1);
      ctx.lineTo(g.x + s, g.y);
      ctx.lineTo(g.x, g.y + s + 1);
      ctx.lineTo(g.x - s, g.y);
      ctx.closePath();
    }
    ctx.fill();
  }
}

// 돌진 예고: 돌진할 경로를 붉게 깜빡이며 보여준다
function drawTelegraphs(ctx, game) {
  for (const e of game.enemies) {
    if (e.mode !== 'windup') continue;
    const c = e.charge;
    const len = c.dashSpeed * c.dashTime;
    const k = 1 - e.modeT / c.windup;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.atan2(e.dirY, e.dirX));
    ctx.globalAlpha = 0.18 + 0.2 * k;
    ctx.fillStyle = '#ff3030';
    ctx.fillRect(0, -e.r, len, e.r * 2);
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, -e.r, len * k, e.r * 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawEnemies(ctx, game, v) {
  // 같은 종류끼리 한 번에 채워서 draw call을 줄인다
  ctx.lineWidth = 2;
  for (const [type, T] of Object.entries(ENEMY_TYPES)) {
    for (const flashing of [false, true]) {
      ctx.fillStyle = flashing ? '#ffffff' : T.color;
      ctx.strokeStyle = T.edge;
      ctx.beginPath();
      for (const e of game.enemies) {
        if (e.type !== type || e.flash > 0 !== flashing || !inView(v, e.x, e.y)) continue;
        ctx.moveTo(e.x + e.r, e.y);
        ctx.arc(e.x, e.y, e.r, 0, TAU);
      }
      ctx.fill();
      ctx.stroke();
    }
  }
}

// 네임드 / 보스: 개별로 크게 그린다
function drawElites(ctx, game) {
  for (const e of game.enemies) {
    if (e.kind === 'normal') continue;
    const S = e.kind === 'boss' ? BOSS : NAMED;
    const shake = e.mode === 'windup' ? (Math.random() - 0.5) * 4 : 0;
    const x = e.x + shake;
    const y = e.y;
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : S.color;
    ctx.strokeStyle = S.edge;
    ctx.lineWidth = e.kind === 'boss' ? 5 : 3;
    ctx.beginPath();
    ctx.arc(x, y, e.r, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // 눈: 타겟 방향을 본다
    const t = e.target;
    const ang = t ? Math.atan2(t.y - e.y, t.x - e.x) : 0;
    const ex = Math.cos(ang) * e.r * 0.35;
    const ey = Math.sin(ang) * e.r * 0.35;
    const px = -Math.sin(ang) * e.r * 0.3;
    const py = Math.cos(ang) * e.r * 0.3;
    ctx.fillStyle = e.mode === 'windup' ? '#ff3030' : '#ffe066';
    ctx.beginPath();
    ctx.arc(x + ex + px, y + ey + py, e.r * 0.13, 0, TAU);
    ctx.arc(x + ex - px, y + ey - py, e.r * 0.13, 0, TAU);
    ctx.fill();

    if (e.kind === 'named') {
      const w = 56;
      const by = y - e.r - 10;
      ctx.fillStyle = '#000a';
      ctx.fillRect(x - w / 2 - 1, by - 1, w + 2, 6);
      ctx.fillStyle = '#ff9f1c';
      ctx.fillRect(x - w / 2, by, (w * Math.max(0, e.hp)) / e.maxHp, 4);
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      label(ctx, e.name, x, by - 11, '#ffb4a8', 'center');
    }
  }
}

function drawUnits(ctx, game) {
  // 동료 먼저, 주인공은 맨 위에
  for (let i = game.units.length - 1; i >= 0; i--) {
    const u = game.units[i];
    const def = u.weapon.def;
    const blink = u.iframe > 0 && Math.floor(u.iframe * 20) % 2 === 0;
    ctx.globalAlpha = blink ? 0.45 : 1;

    // 총구 방향
    const bx = u.x + Math.cos(u.aim) * (u.r + 9);
    const by = u.y + Math.sin(u.aim) * (u.r + 9);
    ctx.lineCap = 'round';
    ctx.strokeStyle = COL.edge;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 몸통: 주인공 = 금색, 동료 = 무기 티어 색
    ctx.fillStyle = u.flash > 0 ? '#ffffff' : u.isLeader ? COL.leader : TIERS[def.tier].color;
    ctx.strokeStyle = COL.edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (u.isLeader) {
      ctx.fillStyle = TIERS[def.tier].color;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r * 0.42, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r + 4, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (!u.isLeader && u.hp < u.maxHp) {
      const w = 24;
      const x = u.x - w / 2;
      const y = u.y - u.r - 9;
      ctx.fillStyle = '#000a';
      ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = COL.hp;
      ctx.fillRect(x, y, (w * u.hp) / u.maxHp, 3);
    }

    if (u.joinFx > 0) {
      const a = u.joinFx / 0.6;
      ctx.globalAlpha = a;
      ctx.strokeStyle = TIERS[def.tier].color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r + 4 + (1 - a) * 30, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function drawProjectiles(ctx, game, v) {
  ctx.lineCap = 'round';
  for (const p of game.projectiles) {
    if (!inView(v, p.x, p.y)) continue;
    const spd = Math.hypot(p.vx, p.vy) || 1;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.r * 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x - (p.vx / spd) * p.len, p.y - (p.vy / spd) * p.len);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

function drawLobs(ctx, game) {
  for (const l of game.lobs) {
    const k = l.t / l.dur;
    const x = l.sx + (l.tx - l.sx) * k;
    const y = l.sy + (l.ty - l.sy) * k;
    const h = Math.sin(k * Math.PI) * 70;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = l.color;
    ctx.strokeStyle = COL.edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - h, 5, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

function wedge(ctx, x, y, r, ang, arc) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, ang - arc / 2, ang + arc / 2);
  ctx.closePath();
}

function drawFx(ctx, game) {
  for (const f of game.fx) {
    const a = Math.max(0, f.life / f.maxLife);
    const x = f.follow ? f.follow.x : f.x;
    const y = f.follow ? f.follow.y : f.y;
    switch (f.type) {
      case 'swing':
        ctx.globalAlpha = 0.35 * a;
        ctx.fillStyle = f.color;
        wedge(ctx, x, y, f.radius, f.ang, f.arc);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, f.radius, f.ang - f.arc / 2, f.ang + f.arc / 2);
        ctx.stroke();
        break;
      case 'saw':
        ctx.globalAlpha = 0.22 * a;
        ctx.fillStyle = f.color;
        wedge(ctx, x, y, f.radius, f.ang, f.arc);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const ang = f.ang + (Math.random() - 0.5) * f.arc;
          const r0 = f.radius * (0.3 + Math.random() * 0.4);
          ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
          ctx.lineTo(x + Math.cos(ang) * f.radius, y + Math.sin(ang) * f.radius);
        }
        ctx.stroke();
        break;
      case 'flame':
        ctx.globalAlpha = 0.18 * a;
        ctx.fillStyle = f.color;
        wedge(ctx, x, y, f.radius, f.ang, f.arc);
        ctx.fill();
        ctx.globalAlpha = 0.8 * a;
        ctx.fillStyle = Math.random() < 0.5 ? '#ffd23f' : '#ff6b1a';
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const ang = f.ang + (Math.random() - 0.5) * f.arc;
          const r0 = f.radius * Math.random();
          const px = x + Math.cos(ang) * r0;
          const py = y + Math.sin(ang) * r0;
          ctx.moveTo(px + 5, py);
          ctx.arc(px, py, 3 + Math.random() * 4, 0, TAU);
        }
        ctx.fill();
        break;
      case 'beam':
        ctx.globalAlpha = a;
        ctx.lineCap = 'round';
        ctx.strokeStyle = f.color;
        ctx.lineWidth = f.width * a;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x2, f.y2);
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = f.width * 0.3 * a;
        ctx.stroke();
        break;
      case 'chain': {
        ctx.globalAlpha = a;
        const p = f.pts;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) {
          const mx = (p[i - 2] + p[i]) / 2 + (Math.random() - 0.5) * 18;
          const my = (p[i - 1] + p[i + 1]) / 2 + (Math.random() - 0.5) * 18;
          ctx.lineTo(mx, my);
          ctx.lineTo(p[i], p[i + 1]);
        }
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case 'explosion':
        ctx.globalAlpha = 0.4 * a;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(x, y, f.radius * (0.6 + 0.4 * (1 - a)), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      case 'death':
        ctx.globalAlpha = a;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 10 + (1 - a) * 30, 0, TAU);
        ctx.stroke();
        break;
    }
  }
  ctx.globalAlpha = 1;
}

function drawTexts(ctx, game) {
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of game.texts) {
    ctx.globalAlpha = Math.min(1, t.life / 0.25);
    ctx.fillStyle = '#000';
    ctx.fillText(t.text, t.x + 1, t.y + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function label(ctx, text, x, y, color = '#fff', align = 'left') {
  ctx.textAlign = align;
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHud(ctx, game) {
  ctx.textBaseline = 'middle';

  // 경험치 바
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, VIEW_W, 10);
  ctx.fillStyle = COL.xp;
  ctx.fillRect(0, 0, (VIEW_W * game.xp) / game.xpNeed, 10);

  // 남은 시간
  ctx.font = 'bold 30px system-ui, sans-serif';
  const remain = RUN_TIME - game.time;
  label(ctx, formatTime(remain), VIEW_W / 2, 38, remain <= 30 ? '#ff6b6b' : '#fff', 'center');

  // 주인공 HP
  const L = game.leader;
  const bw = 240;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(14, 22, bw + 4, 20);
  ctx.fillStyle = COL.hp;
  ctx.fillRect(16, 24, (bw * Math.max(0, L.hp)) / L.maxHp, 16);
  ctx.font = 'bold 13px system-ui, sans-serif';
  label(ctx, `두목 HP ${Math.ceil(Math.max(0, L.hp))} / ${L.maxHp}`, 22, 32);

  ctx.font = 'bold 16px system-ui, sans-serif';
  label(ctx, `Lv ${game.level}`, 16, 60);
  label(ctx, `갱 ${game.units.length - 1} / ${MAX_COMPANIONS}`, 80, 60, '#ffd23f');
  if (game.dead.length) label(ctx, `사망 ${game.dead.length}`, 180, 60, '#ff6b6b');

  label(ctx, `처치 ${game.kills}`, VIEW_W - 16, 32, '#fff', 'right');

  // 패시브
  const ps = game.passiveList();
  if (ps.length) {
    ctx.font = 'bold 13px system-ui, sans-serif';
    label(ctx, ps.map((p) => `${p.name} ${p.level}`).join(' · '), 16, 84, '#7bd88f');
  }

  game.bosses.forEach((b, i) => drawBossBar(ctx, b, 64 + i * 30));
  if (game.bossWarn) drawBossWarn(ctx, game);

  // 알림
  ctx.font = 'bold 16px system-ui, sans-serif';
  for (let i = 0; i < game.notices.length; i++) {
    const n = game.notices[game.notices.length - 1 - i];
    ctx.globalAlpha = Math.min(1, n.life / 0.5);
    label(ctx, n.text, VIEW_W / 2, VIEW_H - 40 - i * 24, n.color, 'center');
  }
  ctx.globalAlpha = 1;

  if (game.debug.on) drawDebug(ctx, game);
}

function drawBossBar(ctx, b, y) {
  const w = 560;
  const x = (VIEW_W - w) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x - 3, y - 3, w + 6, 24);
  ctx.fillStyle = '#5a0f18';
  ctx.fillRect(x, y, w, 18);
  ctx.fillStyle = '#e5484d';
  ctx.fillRect(x, y, (w * Math.max(0, b.hp)) / b.maxHp, 18);
  ctx.font = 'bold 14px system-ui, sans-serif';
  label(ctx, `${b.name}  ${Math.ceil(Math.max(0, b.hp)).toLocaleString()} / ${Math.ceil(b.maxHp).toLocaleString()}`, VIEW_W / 2, y + 9, '#fff', 'center');
}

function drawBossWarn(ctx, game) {
  const blink = Math.floor(game.time * 4) % 2 === 0;
  ctx.fillStyle = 'rgba(120,0,0,0.35)';
  ctx.fillRect(0, 150, VIEW_W, 70);
  ctx.font = 'bold 34px system-ui, sans-serif';
  label(ctx, `WARNING — ${game.bossWarn.name} 접근 중`, VIEW_W / 2, 185, blink ? '#ff6b6b' : '#ffd23f', 'center');
}

function drawDebug(ctx, game) {
  const lines = [
    `FPS ${game.fps.toFixed(0)}`,
    `적 ${game.enemies.length}  투사체 ${game.projectiles.length}  조각 ${game.gems.length}`,
    `장판 ${game.zones.length}  연출 ${game.fx.length}  숫자 ${game.texts.length}`,
    `무적 ${game.debug.invincible ? 'ON' : 'OFF'}`,
    '[I] 무적  [L] 레벨업  [T] +30초',
    '[N] 네임드 소환  [B] 보스 소환',
  ];
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(10, VIEW_H - 20 - lines.length * 18, 360, lines.length * 18 + 10);
  ctx.font = '13px ui-monospace, monospace';
  lines.forEach((t, i) => label(ctx, t, 18, VIEW_H - 6 - (lines.length - i) * 18 + 9, '#9fe870'));
}
