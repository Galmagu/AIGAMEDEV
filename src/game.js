import * as C from './config.js';
import { SpatialHash } from './spatial.js';
import { rollWeapon, TIERS } from './data/weapons.js';
import { PASSIVES, PASSIVE_BY_ID, computeMods } from './data/passives.js';
import { makeName } from './data/names.js';
import { createWeapon, setWeaponLevel, updateWeapon } from './weapons.js';
import { TAU, rand, shuffle, segDist2, compact } from './util.js';

// state: title → playing ⇄ (choice | paused) → gameover | victory
// choice = 레벨업 / 네임드 패시브 / 보스 보상 선택 중 (게임 일시정지)
export class Game {
  constructor(ui, input) {
    this.ui = ui;
    this.input = input;
    this.grid = new SpatialHash(C.GRID_CELL);
    this.tmp = []; // 쿼리 결과 버퍼 (중첩 쿼리 금지)
    this.tmp2 = []; // 폭발 전용 버퍼 (투사체 루프 안에서 불리므로 분리)
    this.projPool = [];
    this.textPool = [];
    this.fps = 60;
    this.debug = { on: false, invincible: false };
    this.reset();
  }

  get leader() {
    return this.units[0];
  }

  // 먼저 나온 보스가 안 죽었는데 다음 보스가 나올 수 있어서 목록으로 관리
  get boss() {
    return this.bosses[0] || null;
  }

  reset() {
    this.state = 'title';
    this.time = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = C.XP_CURVE.first;
    this.queue = []; // 대기 중인 선택창: { kind: 'level' | 'passive' | 'boss', ... }
    this.kills = 0;
    this.namedKills = 0;
    this.bossKills = 0;
    this.nextId = 1;
    this.units = []; // 살아있는 갱. units[0] = 주인공
    this.roster = []; // 거쳐간 모든 유닛 (결과 화면용)
    this.dead = []; // 사망 명단 (보스 보상으로 부활)
    this.usedNames = new Set();
    this.passives = {}; // id → 레벨
    this.mods = computeMods(this.passives);
    this.enemies = [];
    this.normalCount = 0;
    this.bosses = [];
    this.bossWarn = null;
    this.events = this.buildSchedule();
    this.projectiles = [];
    this.lobs = [];
    this.zones = [];
    this.gems = [];
    this.fx = [];
    this.texts = [];
    this.notices = [];
    this.spawnAcc = 0;
    this.shake = 0;
    this.camX = 0;
    this.camY = 0;
  }

  // 네임드/보스 등장 시간표
  buildSchedule() {
    const ev = [];
    C.NAMED.times.forEach((t, i) => ev.push({ t, run: () => this.spawnNamed(C.NAMED.names[i % C.NAMED.names.length]) }));
    for (const b of C.BOSS.list) {
      ev.push({ t: b.time - C.BOSS.warn, run: () => this.warnBoss(b) });
      ev.push({ t: b.time, run: () => this.spawnBoss(b) });
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  start() {
    this.reset();
    const leader = this.createUnit(true, rollWeapon(), 0, 0);
    const t = TIERS[leader.weapon.def.tier];
    this.notice(`시작 무기: ${leader.weapon.def.name} [${t.label}]`, t.color);
    this.state = 'playing';
    this.ui.hide();
  }

  baseHp(u) {
    return u.isLeader ? C.LEADER.hp : C.COMPANION.hp;
  }

  createUnit(isLeader, def, x, y, name) {
    const base = isLeader ? C.LEADER : C.COMPANION;
    const maxHp = Math.round(base.hp * this.mods.hpMul);
    const u = {
      id: this.nextId++,
      isLeader,
      name: isLeader ? '두목 (나)' : name || makeName(this.usedNames),
      x, y, vx: 0, vy: 0,
      r: base.radius,
      hp: maxHp,
      maxHp,
      iframe: 0,
      flash: 0,
      joinFx: isLeader ? 0 : 0.6,
      aim: 0,
      weapon: createWeapon(def),
      dmgDealt: 0,
      alive: true,
    };
    this.usedNames.add(u.name);
    this.units.push(u);
    this.roster.push(u);
    return u;
  }

  // ─── 입력 (렌더 프레임마다 1회) ───────────────────────────
  handleInput() {
    const inp = this.input;
    if (inp.consume('F1') || inp.consume('Backquote')) this.debug.on = !this.debug.on;
    if (inp.consume('Escape') || inp.consume('KeyP')) this.togglePause();
    if (this.debug.on && this.state === 'playing') {
      if (inp.consume('KeyI')) this.debug.invincible = !this.debug.invincible;
      if (inp.consume('KeyL')) this.gainXp(this.xpNeed - this.xp);
      if (inp.consume('KeyT')) this.time = Math.min(C.RUN_TIME - 1, this.time + 30);
      if (inp.consume('KeyN')) this.spawnNamed('디버그 네임드');
      if (inp.consume('KeyB') && !this.boss) this.spawnBoss(C.BOSS.list[0]);
    }
    inp.endFrame();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.ui.showPause(this, () => this.togglePause());
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.hide();
    }
  }

  pause() {
    if (this.state === 'playing') this.togglePause();
  }

  // ─── 메인 업데이트 ───────────────────────────────────────
  update(dt) {
    if (this.state !== 'playing') return;
    this.updateNotices(dt);

    this.time += dt;
    if (this.time >= C.RUN_TIME) {
      this.finish(true);
      return;
    }
    while (this.events.length && this.events[0].t <= this.time) this.events.shift().run();
    if (this.bossWarn && this.time >= this.bossWarn.until) this.bossWarn = null;

    this.updateLeader(dt);
    this.updateCompanions(dt);
    this.spawnEnemies(dt);
    this.updateEnemies(dt);
    this.rebuildGrid();
    this.separateEnemies();
    this.contactDamage();
    if (this.state !== 'playing') return; // 주인공 사망

    for (let i = 0; i < this.units.length; i++) updateWeapon(this, this.units[i], dt);
    this.updateProjectiles(dt);
    this.updateLobs(dt);
    this.updateZones(dt);
    compact(this.enemies);

    this.updateGems(dt);
    this.updateFx(dt);
    this.shake = Math.max(0, this.shake - dt * 30);

    if (this.queue.length) this.openNext();
  }

  // ─── 갱 ─────────────────────────────────────────────────
  leaderSpeed() {
    return C.LEADER.speed * this.mods.speed;
  }

  updateLeader(dt) {
    const L = this.leader;
    const a = this.input.axis();
    const speed = this.leaderSpeed();
    L.vx = a.x * speed;
    L.vy = a.y * speed;
    L.x += L.vx * dt;
    L.y += L.vy * dt;
    this.camX = L.x;
    this.camY = L.y;
    this.tickUnit(L, dt);
  }

  // 군집 이동: 주인공 쪽으로 끌림 + 동료끼리 밀어냄 + 속도 보간(지연감)
  updateCompanions(dt) {
    const L = this.leader;
    const G = C.GANG;
    const maxSpeed = this.leaderSpeed() * G.speedMul;
    const a = Math.min(1, dt * G.accel);
    for (let i = 1; i < this.units.length; i++) {
      const u = this.units[i];
      const dx = L.x - u.x;
      const dy = L.y - u.y;
      const d = Math.hypot(dx, dy) || 1;

      if (d > G.teleportDist) {
        const ang = rand(0, TAU);
        u.x = L.x + Math.cos(ang) * G.minDist;
        u.y = L.y + Math.sin(ang) * G.minDist;
        u.vx = u.vy = 0;
        continue;
      }

      let tx = 0;
      let ty = 0;
      if (d > G.minDist) {
        const k = Math.min(1, (d - G.minDist) / (G.maxDist - G.minDist));
        tx = (dx / d) * maxSpeed * k;
        ty = (dy / d) * maxSpeed * k;
      }
      for (let j = 0; j < this.units.length; j++) {
        if (j === i) continue;
        const o = this.units[j];
        const ox = u.x - o.x;
        const oy = u.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od < G.separation && od > 0.001) {
          const push = ((G.separation - od) / G.separation) * maxSpeed * 1.2;
          tx += (ox / od) * push;
          ty += (oy / od) * push;
        }
      }
      u.vx += (tx - u.vx) * a;
      u.vy += (ty - u.vy) * a;
      u.x += u.vx * dt;
      u.y += u.vy * dt;
      this.tickUnit(u, dt);
    }
  }

  tickUnit(u, dt) {
    if (u.iframe > 0) u.iframe -= dt;
    if (u.flash > 0) u.flash -= dt;
    if (u.joinFx > 0) u.joinFx -= dt;
    if (this.mods.regen > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + this.mods.regen * dt);
  }

  contactDamage() {
    // 뒤에서부터 돌아야 동료가 죽어서 빠져도 안전
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const list = this.queryRadius(u.x, u.y, u.r + C.BOSS.radius, this.tmp);
      let hitBy = null;
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.dead) continue;
        const dx = e.x - u.x;
        const dy = e.y - u.y;
        const rr = u.r + e.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        // 적을 유닛 바깥으로 밀어내서 갱이 단단한 몸처럼 느껴지게
        const d = Math.sqrt(d2) || 1;
        e.x += (dx / d) * (rr - d);
        e.y += (dy / d) * (rr - d);
        if (!hitBy || e.damage > hitBy.damage) hitBy = e;
      }
      if (hitBy && u.iframe <= 0) {
        this.hurtUnit(u, hitBy.damage);
        if (this.state !== 'playing') return;
      }
    }
  }

  hurtUnit(u, dmg) {
    if (this.debug.invincible) return;
    u.hp -= Math.max(1, dmg - this.mods.armor);
    u.iframe = C.HIT_IFRAME;
    u.flash = 0.15;
    if (u.isLeader) this.shake = Math.max(this.shake, 6);
    if (u.hp <= 0) this.killUnit(u);
  }

  killUnit(u) {
    u.alive = false;
    u.hp = 0;
    this.addFx('death', u.x, u.y, { color: '#ff4d4d', life: 0.5 });
    if (u.isLeader) {
      this.finish(false);
      return;
    }
    this.units.splice(this.units.indexOf(u), 1);
    this.dead.push(u);
    this.notice(`${u.name} 사망`, '#ff6b6b');
  }

  // ─── 적 스폰 ────────────────────────────────────────────
  spawnRing() {
    return Math.hypot(C.VIEW_W / 2, C.VIEW_H / 2) + C.SPAWN.ringMargin;
  }

  ringPos() {
    const L = this.leader;
    const ang = rand(0, TAU);
    const r = this.spawnRing();
    return { x: L.x + Math.cos(ang) * r, y: L.y + Math.sin(ang) * r };
  }

  hpScale() {
    return 1 + C.ENEMY_HP_GROWTH_PER_MIN * (this.time / 60);
  }

  spawnEnemies(dt) {
    const min = this.time / 60;
    const S = C.SPAWN;
    const mul = this.boss ? C.BOSS.spawnRateMul : 1;
    this.spawnAcc += (S.baseRate + S.ratePerMin * min) * mul * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.spawnNormal();
    }
    const minAlive = (S.baseMinAlive + S.minAlivePerMin * min) * mul;
    for (let guard = 0; guard < 10 && this.normalCount < minAlive; guard++) this.spawnNormal();
  }

  pickNormalType() {
    let wave = C.WAVES[0];
    for (const w of C.WAVES) if (this.time >= w.from) wave = w;
    let r = Math.random();
    for (const [type, w] of Object.entries(wave.weights)) {
      if ((r -= w) < 0) return type;
    }
    return 'walker';
  }

  makeEnemy(x, y, props) {
    const e = {
      id: this.nextId++,
      x, y, kbx: 0, kby: 0,
      target: null,
      retarget: rand(0, 0.25),
      flash: 0,
      dead: false,
      mode: 'chase',
      modeT: 0,
      dirX: 0, dirY: 0,
      charge: null,
      summon: null,
      ...props,
    };
    e.maxHp = e.hp;
    if (e.charge) e.chargeCd = e.charge.cd * 0.6;
    if (e.summon) e.summonCd = e.summon.cd * 0.5;
    this.enemies.push(e);
    return e;
  }

  spawnNormal(x, y) {
    if (this.normalCount >= C.ENEMY_CAP) return;
    const type = x === undefined ? this.pickNormalType() : 'walker';
    const T = C.ENEMY_TYPES[type];
    if (x === undefined) ({ x, y } = this.ringPos());
    this.normalCount++;
    this.makeEnemy(x, y, {
      kind: 'normal', type,
      hp: T.hp * this.hpScale(),
      speed: T.speed * rand(0.9, 1.1),
      damage: T.damage, r: T.radius, xp: T.xp, kb: T.kb,
    });
  }

  spawnNamed(name) {
    const N = C.NAMED;
    const { x, y } = this.ringPos();
    this.makeEnemy(x, y, {
      kind: 'named', name,
      hp: C.ENEMY_TYPES.walker.hp * this.hpScale() * N.hpMul,
      speed: N.speed, damage: N.damage, r: N.radius, kb: N.kb,
      charge: N.charge,
    });
    this.notice(`네임드 출현: ${name}`, N.color);
  }

  warnBoss(b) {
    this.bossWarn = { name: b.name, until: this.time + C.BOSS.warn };
  }

  spawnBoss(b) {
    const B = C.BOSS;
    const { x, y } = this.ringPos();
    const boss = this.makeEnemy(x, y, {
      kind: 'boss', name: b.name,
      hp: C.ENEMY_TYPES.walker.hp * this.hpScale() * b.hpMul,
      speed: B.speed, damage: B.damage, r: B.radius, kb: B.kb,
      charge: B.charge, summon: B.summon,
    });
    this.bosses.push(boss);
    this.bossWarn = null;
    this.shake = Math.max(this.shake, 10);
    this.notice(`보스 출현: ${b.name}`, '#ff6b6b');
  }

  // ─── 적 AI ──────────────────────────────────────────────
  nearestUnit(x, y) {
    let best = null;
    let bestD2 = Infinity;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      const d2 = (u.x - x) ** 2 + (u.y - y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = u;
      }
    }
    return best;
  }

  updateEnemies(dt) {
    const L = this.leader;
    const relocate2 = C.SPAWN.relocateDist ** 2;
    const kbDecay = Math.exp(-8 * dt);
    const n = this.enemies.length; // 소환으로 늘어난 적은 다음 프레임부터
    for (let i = 0; i < n; i++) {
      const e = this.enemies[i];
      e.retarget -= dt;
      if (e.mode === 'chase' && (e.retarget <= 0 || !e.target || !e.target.alive)) {
        e.target = this.nearestUnit(e.x, e.y);
        e.retarget = 0.25;
      }
      const t = e.target;
      const dx = t.x - e.x;
      const dy = t.y - e.y;
      const d = Math.hypot(dx, dy) || 1;

      // 돌진: 추적 → 예고(정지) → 직선 돌진 → 추적
      let vx = (dx / d) * e.speed;
      let vy = (dy / d) * e.speed;
      if (e.charge) {
        const c = e.charge;
        if (e.mode === 'chase') {
          e.chargeCd -= dt;
          if (e.chargeCd <= 0 && d < c.range) {
            e.mode = 'windup';
            e.modeT = c.windup;
            e.dirX = dx / d;
            e.dirY = dy / d;
          }
        } else if (e.mode === 'windup') {
          vx = vy = 0;
          e.modeT -= dt;
          if (e.modeT <= 0) {
            e.mode = 'dash';
            e.modeT = c.dashTime;
          }
        } else {
          vx = e.dirX * c.dashSpeed;
          vy = e.dirY * c.dashSpeed;
          e.modeT -= dt;
          if (e.modeT <= 0) {
            e.mode = 'chase';
            e.chargeCd = c.cd;
          }
        }
      }
      if (e.summon) {
        e.summonCd -= dt;
        if (e.summonCd <= 0) {
          e.summonCd = e.summon.cd;
          const s = e.summon;
          for (let k = 0; k < s.count; k++) {
            const a = (k / s.count) * TAU;
            this.spawnNormal(e.x + Math.cos(a) * s.radius, e.y + Math.sin(a) * s.radius);
          }
          this.addFx('explosion', e.x, e.y, { radius: s.radius, color: C.BOSS.color, life: 0.4 });
        }
      }

      e.x += (vx + e.kbx) * dt;
      e.y += (vy + e.kby) * dt;
      e.kbx *= kbDecay;
      e.kby *= kbDecay;
      if (e.flash > 0) e.flash -= dt;

      // 너무 멀어진 적은 주인공 반대편(진행 방향 앞쪽)으로 재배치
      const lx = e.x - L.x;
      const ly = e.y - L.y;
      const l2 = lx * lx + ly * ly;
      if (l2 > relocate2) {
        const ld = Math.sqrt(l2);
        const r = this.spawnRing();
        e.x = L.x - (lx / ld) * r;
        e.y = L.y - (ly / ld) * r;
        if (e.mode !== 'chase') {
          e.mode = 'chase';
          e.chargeCd = e.charge.cd;
        }
      }
    }
  }

  rebuildGrid() {
    this.grid.clear();
    for (let i = 0; i < this.enemies.length; i++) this.grid.insert(this.enemies[i]);
  }

  // 적끼리 겹침 완화. 큰 적일수록 덜 밀린다.
  separateEnemies() {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const list = this.queryRadius(e.x, e.y, e.r + C.BOSS.radius, this.tmp);
      for (let k = 0; k < list.length; k++) {
        const o = list[k];
        if (o.id <= e.id) continue; // 쌍마다 한 번만
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        const rr = e.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const we = (o.r * o.r) / (e.r * e.r + o.r * o.r); // e가 밀리는 비율
        e.x -= (dx / d) * push * we;
        e.y -= (dy / d) * push * we;
        o.x += (dx / d) * push * (1 - we);
        o.y += (dy / d) * push * (1 - we);
      }
    }
  }

  queryRadius(x, y, r, out) {
    return this.grid.queryRect(x - r, y - r, x + r, y + r, out);
  }

  queryRect(x0, y0, x1, y1, out) {
    return this.grid.queryRect(x0, y0, x1, y1, out);
  }

  findTarget(u, range) {
    return this.grid.nearest(u.x, u.y, range);
  }

  damageEnemy(e, dmg, owner, kx, ky, knock) {
    if (e.dead) return;
    dmg *= this.mods.dmg;
    owner.dmgDealt += Math.min(dmg, e.hp);
    e.hp -= dmg;
    e.flash = 0.08;
    if (knock) {
      e.kbx += kx * knock * e.kb;
      e.kby += ky * knock * e.kb;
    }
    this.addText(e.x, e.y - e.r, dmg);
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.kills++;
    if (e.kind === 'normal') {
      this.normalCount--;
      this.dropGem(e.x, e.y, e.xp);
    } else if (e.kind === 'named') {
      this.namedKills++;
      this.scatterGems(e.x, e.y, C.NAMED.gems, C.NAMED.gemValue);
      this.addFx('explosion', e.x, e.y, { radius: 60, color: C.NAMED.color, life: 0.5 });
      this.notice(`${e.name} 처치!`, '#ffd23f');
      this.queue.push({ kind: 'passive', from: e.name });
    } else {
      this.bossKills++;
      this.bosses.splice(this.bosses.indexOf(e), 1);
      this.scatterGems(e.x, e.y, C.BOSS.gems, C.BOSS.gemValue);
      this.addFx('explosion', e.x, e.y, { radius: 160, color: '#ffd23f', life: 0.8 });
      this.shake = Math.max(this.shake, 12);
      this.notice(`${e.name} 처치!`, '#ffd23f');
      this.queue.push({ kind: 'boss', from: e.name });
    }
  }

  // ─── 투사체 / 투척 / 장판 / 폭발 ─────────────────────────
  spawnProjectile(x, y, vx, vy, s, color, owner) {
    const p = this.projPool.pop() || { hit: [] };
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.dmg = s.dmg;
    p.pierce = s.pierce;
    p.life = s.range / s.speed;
    p.r = s.size;
    p.len = s.len;
    p.knock = s.knock;
    p.explode = s.explode;
    p.color = color;
    p.owner = owner;
    p.hit.length = 0;
    p.dead = false;
    this.projectiles.push(p);
  }

  updateProjectiles(dt) {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const pad = p.r + C.BOSS.radius;
      // 이번 프레임 이동 경로(선분) 전체로 판정해서 빠른 탄이 적을 뚫고 지나가지 않게
      const list = this.queryRect(
        Math.min(p.x, nx) - pad, Math.min(p.y, ny) - pad,
        Math.max(p.x, nx) + pad, Math.max(p.y, ny) + pad, this.tmp,
      );
      const spd = Math.hypot(p.vx, p.vy) || 1;
      const kx = p.vx / spd;
      const ky = p.vy / spd;
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.dead || p.hit.includes(e.id)) continue;
        const rr = e.r + p.r;
        if (segDist2(e.x, e.y, p.x, p.y, nx, ny) > rr * rr) continue;
        if (p.explode) {
          this.explode(e.x, e.y, p.explode, p.dmg, p.owner, p.color, p.knock);
          p.dead = true;
          break;
        }
        this.damageEnemy(e, p.dmg, p.owner, kx, ky, p.knock);
        if (p.pierce <= 0) {
          p.dead = true;
          break;
        }
        p.pierce--;
        p.hit.push(e.id);
      }
      if (p.dead) continue;
      p.x = nx;
      p.y = ny;
      p.life -= dt;
      if (p.life <= 0) {
        if (p.explode) this.explode(p.x, p.y, p.explode, p.dmg, p.owner, p.color, p.knock);
        p.dead = true;
      }
    }
    compact(this.projectiles, this.projPool);
  }

  updateLobs(dt) {
    for (let i = 0; i < this.lobs.length; i++) {
      const l = this.lobs[i];
      l.t += dt;
      if (l.t < l.dur) continue;
      l.dead = true;
      const s = l.s;
      if (s.zone) {
        this.zones.push({
          x: l.tx, y: l.ty, r: s.radius, life: s.duration, maxLife: s.duration,
          tick: s.tick, timer: 0, dmg: s.dmg, owner: l.owner, color: l.color, dead: false,
        });
      } else {
        this.explode(l.tx, l.ty, s.radius, s.dmg, l.owner, l.color, s.knock);
      }
    }
    compact(this.lobs);
  }

  updateZones(dt) {
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      z.timer -= dt;
      if (z.timer <= 0) {
        z.timer += z.tick;
        const list = this.queryRadius(z.x, z.y, z.r + C.BOSS.radius, this.tmp);
        for (let k = 0; k < list.length; k++) {
          const e = list[k];
          if (e.dead) continue;
          const rr = z.r + e.r * 0.5;
          if ((e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= rr * rr) this.damageEnemy(e, z.dmg, z.owner, 0, 0, 0);
        }
      }
      z.life -= dt;
      if (z.life <= 0) z.dead = true;
    }
    compact(this.zones);
  }

  explode(x, y, r, dmg, owner, color, knock) {
    const list = this.queryRadius(x, y, r + C.BOSS.radius, this.tmp2);
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r + e.r) continue;
      this.damageEnemy(e, dmg, owner, dx / (d || 1), dy / (d || 1), knock);
    }
    this.addFx('explosion', x, y, { radius: r, color, life: 0.3 });
  }

  // ─── 경험치 ─────────────────────────────────────────────
  dropGem(x, y, v, force = false) {
    if (!force && this.gems.length >= C.GEM_CAP) {
      // 너무 많으면 기존 조각에 합쳐서 개수를 묶어둔다
      this.gems[(Math.random() * this.gems.length) | 0].v += v;
      return;
    }
    this.gems.push({ x, y, v, mag: null, spd: 0, dead: false });
  }

  scatterGems(x, y, count, value) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const r = rand(10, 40);
      this.dropGem(x + Math.cos(a) * r, y + Math.sin(a) * r, value, true);
    }
  }

  updateGems(dt) {
    const pr = C.PICKUP_RADIUS * this.mods.pickup;
    const pr2 = pr * pr;
    for (let i = 0; i < this.gems.length; i++) {
      const g = this.gems[i];
      if (g.mag && !g.mag.alive) g.mag = null;
      if (!g.mag) {
        // 갱 유닛 누구든 가까이 오면 끌려간다
        for (let k = 0; k < this.units.length; k++) {
          const u = this.units[k];
          if ((u.x - g.x) ** 2 + (u.y - g.y) ** 2 < pr2) {
            g.mag = u;
            g.spd = 120;
            break;
          }
        }
        if (!g.mag) continue;
      }
      const u = g.mag;
      const dx = u.x - g.x;
      const dy = u.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      g.spd = Math.min(g.spd + 900 * dt, 900);
      if (d < u.r + 6 || d < g.spd * dt) {
        this.gainXp(g.v * this.mods.xp);
        g.dead = true;
        continue;
      }
      g.x += (dx / d) * g.spd * dt;
      g.y += (dy / d) * g.spd * dt;
    }
    compact(this.gems);
  }

  gainXp(v) {
    this.xp += v;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = C.XP_CURVE.first + (this.level - 1) * C.XP_CURVE.step;
      this.queue.push({ kind: 'level', level: this.level });
    }
  }

  // ─── 선택창 (레벨업 / 패시브 / 보스 보상) ─────────────────
  upgradeCards(levels, cap, count) {
    return shuffle(this.units.filter((u) => u.weapon.level < cap))
      .slice(0, count)
      .map((unit) => ({ type: 'upgrade', unit, levels, cap }));
  }

  healCard() {
    return { type: 'heal' };
  }

  makeOffer(req) {
    if (req.kind === 'level') {
      const title = `Lv ${req.level} 달성`;
      if (this.units.length - 1 < C.MAX_COMPANIONS) {
        const used = new Set(this.usedNames);
        const cards = [];
        for (let i = 0; i < 3; i++) {
          const name = makeName(used);
          used.add(name);
          cards.push({ type: 'recruit', def: rollWeapon(), name });
        }
        return { title: `${title} — 동료를 영입하라`, sub: `갱 ${this.units.length - 1} / ${C.MAX_COMPANIONS}`, cards };
      }
      const cards = this.upgradeCards(1, C.WEAPON_MAX_LEVEL, 3);
      if (cards.length) return { title: `${title} — 갱이 꽉 찼다`, sub: '한 명의 무기를 +1레벨', cards };
      return { title: `${title} — 전원 최대 강화`, sub: '갱 전원 회복', cards: [this.healCard()] };
    }

    if (req.kind === 'passive') {
      const cards = shuffle(PASSIVES.filter((p) => (this.passives[p.id] || 0) < C.PASSIVE_MAX_LEVEL))
        .slice(0, 3)
        .map((p) => ({ type: 'passive', passive: p, level: (this.passives[p.id] || 0) + 1 }));
      return {
        title: `${req.from} 처치 — 패시브 강화`,
        sub: '갱 전원에게 적용된다',
        cards: cards.length ? cards : [this.healCard()],
      };
    }

    // 보스 보상: 죽은 동료가 있고 자리가 있으면 [부활 + 대강화 2], 아니면 [대강화 3]
    const free = C.MAX_COMPANIONS - (this.units.length - 1);
    const cards = [];
    if (this.dead.length && free > 0) cards.push({ type: 'revive', targets: this.dead.slice(0, free) });
    cards.push(...this.upgradeCards(C.BOSS_UPGRADE_LEVELS, C.WEAPON_BOSS_MAX_LEVEL, 3 - cards.length));
    return {
      title: `${req.from} 처치 — 보스 보상`,
      sub: '죽은 동료 부활 또는 무기 대강화',
      cards: cards.length ? cards : [this.healCard()],
    };
  }

  openNext() {
    this.state = 'choice';
    const offer = this.makeOffer(this.queue.shift());
    this.ui.showChoice(offer, this, (i) => this.applyChoice(offer.cards[i]));
  }

  applyChoice(c) {
    const L = this.leader;
    switch (c.type) {
      case 'recruit': {
        const ang = rand(0, TAU);
        const u = this.createUnit(false, c.def, L.x + Math.cos(ang) * 50, L.y + Math.sin(ang) * 50, c.name);
        const t = TIERS[c.def.tier];
        this.notice(`${u.name} 합류 — ${c.def.name} [${t.label}]`, t.color);
        break;
      }
      case 'upgrade': {
        const w = c.unit.weapon;
        setWeaponLevel(w, w.level + c.levels, c.cap);
        c.unit.joinFx = 0.6;
        this.notice(`${c.unit.name}의 ${w.def.name} Lv${w.level}`, TIERS[w.def.tier].color);
        break;
      }
      case 'passive':
        this.passives[c.passive.id] = c.level;
        this.applyMods();
        this.notice(`${c.passive.name} Lv${c.level} — ${c.passive.desc}`, '#7bd88f');
        break;
      case 'revive':
        for (const u of c.targets) {
          const ang = rand(0, TAU);
          u.alive = true;
          u.hp = u.maxHp;
          u.x = L.x + Math.cos(ang) * 50;
          u.y = L.y + Math.sin(ang) * 50;
          u.vx = u.vy = 0;
          u.iframe = 1.5;
          u.joinFx = 0.6;
          this.units.push(u);
          this.dead.splice(this.dead.indexOf(u), 1);
        }
        this.notice(`동료 ${c.targets.length}명 부활!`, '#7bd88f');
        break;
      default:
        for (const u of this.units) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3);
        this.notice('갱 전원 HP 30% 회복', '#7bd88f');
    }
    if (this.queue.length) {
      this.openNext();
    } else {
      this.state = 'playing';
      this.ui.hide();
    }
  }

  // 패시브 반영. 최대 HP가 늘면 늘어난 만큼 현재 HP도 채워준다.
  applyMods() {
    this.mods = computeMods(this.passives);
    for (const u of [...this.units, ...this.dead]) {
      const maxHp = Math.round(this.baseHp(u) * this.mods.hpMul);
      if (u.alive) u.hp += maxHp - u.maxHp;
      u.maxHp = maxHp;
    }
  }

  passiveList() {
    return PASSIVES.filter((p) => this.passives[p.id]).map((p) => ({ ...PASSIVE_BY_ID[p.id], level: this.passives[p.id] }));
  }

  finish(victory) {
    this.state = victory ? 'victory' : 'gameover';
    this.ui.showResult(this, victory, () => this.start());
  }

  // ─── 연출 ───────────────────────────────────────────────
  addFx(type, x, y, props) {
    this.fx.push({ type, x, y, maxLife: props.life, dead: false, ...props });
  }

  updateFx(dt) {
    for (let i = 0; i < this.fx.length; i++) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) f.dead = true;
    }
    compact(this.fx);
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      t.y -= 40 * dt;
      t.life -= dt;
      if (t.life <= 0) t.dead = true;
    }
    compact(this.texts, this.textPool);
  }

  addText(x, y, value) {
    if (this.texts.length >= C.MAX_DAMAGE_TEXTS) return;
    const t = this.textPool.pop() || {};
    t.x = x + rand(-6, 6);
    t.y = y;
    t.text = String(Math.max(1, Math.round(value)));
    t.life = 0.5;
    t.dead = false;
    this.texts.push(t);
  }

  notice(text, color) {
    this.notices.push({ text, color, life: 3 });
    if (this.notices.length > 5) this.notices.shift();
  }

  updateNotices(dt) {
    for (const n of this.notices) n.life -= dt;
    while (this.notices.length && this.notices[0].life <= 0) this.notices.shift();
  }
}
