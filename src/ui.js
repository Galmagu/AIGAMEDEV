// DOM 오버레이: 타이틀 / 선택창(레벨업·패시브·보스 보상) / 일시정지 / 결과 화면
import { TIERS, nominalDps, LEVEL_BONUS_TEXT } from './data/weapons.js';
import { computeStats } from './weapons.js';
import { WEAPON_MAX_LEVEL, WEAPON_BOSS_MAX_LEVEL, PASSIVE_MAX_LEVEL } from './config.js';
import { formatTime } from './util.js';

const PICK_LOCK_MS = 250; // 창이 뜨자마자 실수로 고르는 것 방지
const GREEN = '#7bd88f';
const RED = '#ff6b6b';

export class UI {
  constructor(root) {
    this.root = root;
    this.onKey = null;
    window.addEventListener('keydown', (e) => {
      if (this.onKey) this.onKey(e);
    });
  }

  show(html, onKey) {
    this.root.innerHTML = html;
    this.root.classList.add('show');
    this.onKey = onKey || null;
  }

  hide() {
    this.root.classList.remove('show');
    this.root.innerHTML = '';
    this.onKey = null;
  }

  showTitle(onStart) {
    const t = TIERS;
    this.show(
      `<div class="panel">
        <h1>갱 서바이버</h1>
        <p class="sub">좀비 떼 속에서 8분을 버텨라. 레벨업마다 동료를 영입해 갱을 키워라.</p>
        <ul class="help">
          <li><b>WASD / 방향키</b> 이동 — 공격은 전부 자동</li>
          <li><b>1 · 2 · 3 / 클릭</b> 선택지 고르기</li>
          <li><b>ESC</b> 일시정지 · <b>F1</b> 또는 <b>\`</b> 디버그</li>
        </ul>
        <ul class="help small">
          <li>레벨업 → <b>동료 영입</b> · 네임드 처치 → <b>패시브 강화</b> · 보스 처치 → <b>부활 / 무기 대강화</b></li>
        </ul>
        <p class="odds">무기 등급 확률
          <span style="color:${t.normal.color}">노멀 70%</span> ·
          <span style="color:${t.rare.color}">레어 20%</span> ·
          <span style="color:${t.legendary.color}">전설 10%</span></p>
        <button class="btn" data-act="start">시작 (Enter)</button>
      </div>`,
      (e) => {
        if (e.code === 'Enter' || e.code === 'Space') onStart();
      },
    );
    this.root.querySelector('[data-act=start]').onclick = onStart;
  }

  showChoice(offer, game, onPick) {
    const cards = offer.cards.map((c, i) => this.cardHtml(c, i)).join('');
    this.show(
      `<div class="panel wide">
        <h2>${offer.title}</h2>
        <p class="sub">${offer.sub}</p>
        <div class="cards">${cards}</div>
      </div>`,
      (e) => {
        const m = /^(Digit|Numpad)([1-3])$/.exec(e.code);
        if (m) pick(Number(m[2]) - 1);
      },
    );
    const shownAt = performance.now();
    let done = false;
    const pick = (i) => {
      if (done || i >= offer.cards.length || performance.now() - shownAt < PICK_LOCK_MS) return;
      done = true;
      onPick(i);
    };
    this.root.querySelectorAll('.card').forEach((el) => {
      el.onclick = () => pick(Number(el.dataset.i));
    });
  }

  card(i, color, { tier, head, name, desc, foot }) {
    return `<button class="card" style="--tc:${color}" data-i="${i}">
      <span class="c-key">${i + 1}</span>
      <span class="c-tier">${tier}</span>
      <span class="c-weapon">${head}</span>
      ${name ? `<span class="c-name">${name}</span>` : ''}
      <span class="c-desc">${desc}</span>
      ${foot ? `<span class="c-dps">${foot}</span>` : ''}
    </button>`;
  }

  cardHtml(c, i) {
    switch (c.type) {
      case 'recruit': {
        const t = TIERS[c.def.tier];
        return this.card(i, t.color, {
          tier: t.label, head: c.def.name, name: c.name, desc: c.def.desc,
          foot: `DPS ${Math.round(nominalDps(c.def.type, c.def.stats))}`,
        });
      }
      case 'upgrade': {
        const w = c.unit.weapon;
        const t = TIERS[w.def.tier];
        const next = Math.min(w.level + c.levels, c.cap);
        const bonuses = [3, 5, 7].filter((lv) => lv > w.level && lv <= next);
        const extra = bonuses.length ? `<br>+ ${LEVEL_BONUS_TEXT[w.def.type]}${bonuses.length > 1 ? ` ×${bonuses.length}` : ''}` : '';
        const big = c.levels > 1 ? '대강화 · ' : '';
        return this.card(i, t.color, {
          tier: `${big}${t.label} · Lv ${w.level} → ${next}`,
          head: w.def.name, name: c.unit.name,
          desc: `피해 +${25 * (next - w.level)}%${extra}`,
          foot: `DPS ${Math.round(nominalDps(w.def.type, w.stats))} → ${Math.round(nominalDps(w.def.type, computeStats(w.def, next)))}`,
        });
      }
      case 'passive':
        return this.card(i, GREEN, {
          tier: c.level === 1 ? '새 패시브' : `Lv ${c.level - 1} → ${c.level}`,
          head: c.passive.name, desc: c.passive.desc,
          foot: c.level === PASSIVE_MAX_LEVEL ? 'MAX' : '',
        });
      case 'revive':
        return this.card(i, RED, {
          tier: '부활', head: `동료 ${c.targets.length}명 부활`,
          desc: c.targets.map((u) => `${u.name} <small>(${u.weapon.def.name})</small>`).join('<br>'),
          foot: '풀 HP로 복귀',
        });
      default:
        return this.card(i, GREEN, { tier: '회복', head: '응급처치', desc: '갱 전원 HP 30% 회복' });
    }
  }

  rosterRows(units, showDamage) {
    return units
      .map((u, i) => {
        const w = u.weapon;
        const t = TIERS[w.def.tier];
        const hp = u.alive ? `${Math.ceil(u.hp)} / ${u.maxHp}` : '<span class="dead">사망</span>';
        const dmg = showDamage ? `<td class="num">${Math.round(u.dmgDealt).toLocaleString()}</td>` : '';
        const rank = showDamage ? `<td class="num">${i + 1}</td>` : '';
        const max = w.level >= WEAPON_BOSS_MAX_LEVEL ? ' (MAX)' : w.level > WEAPON_MAX_LEVEL ? ' ★' : '';
        return `<tr>${rank}<td>${u.name}</td>
          <td style="color:${t.color}">${w.def.name} <small>${t.label}</small></td>
          <td class="num">Lv ${w.level}${max}</td>
          <td class="num">${hp}</td>${dmg}</tr>`;
      })
      .join('');
  }

  passiveLine(game) {
    const list = game.passiveList();
    if (!list.length) return '<p class="sub">패시브 없음 — 네임드를 잡아서 얻는다</p>';
    return `<p class="passives">${list.map((p) => `<span>${p.name} Lv${p.level}</span>`).join('')}</p>`;
  }

  showPause(game, onResume) {
    this.show(
      `<div class="panel wide">
        <h2>일시정지</h2>
        <p class="sub">${formatTime(game.time)} 경과 · Lv ${game.level} · 처치 ${game.kills}</p>
        ${this.passiveLine(game)}
        <table class="roster">
          <tr><th>이름</th><th>무기</th><th>레벨</th><th>HP</th></tr>
          ${this.rosterRows([...game.units, ...game.dead], false)}
        </table>
        <button class="btn" data-act="resume">계속 (ESC)</button>
      </div>`,
    );
    this.root.querySelector('[data-act=resume]').onclick = onResume;
  }

  showResult(game, victory, onRestart) {
    const ranked = [...game.roster].sort((a, b) => b.dmgDealt - a.dmgDealt);
    const mvp = ranked[0];
    this.show(
      `<div class="panel wide">
        <h1 class="${victory ? 'win' : 'lose'}">${victory ? '생존 성공!' : '두목 사망'}</h1>
        <p class="sub">생존 ${formatTime(game.time)} · Lv ${game.level} ·
          처치 ${game.kills} (네임드 ${game.namedKills} · 보스 ${game.bossKills}) ·
          동료 ${game.units.length - 1}명 생존 / ${game.dead.length}명 사망</p>
        <p class="mvp">MVP — <b>${mvp.name}</b> (${mvp.weapon.def.name})</p>
        ${this.passiveLine(game)}
        <table class="roster">
          <tr><th>#</th><th>이름</th><th>무기</th><th>레벨</th><th>HP</th><th>누적 피해</th></tr>
          ${this.rosterRows(ranked, true)}
        </table>
        <button class="btn" data-act="restart">다시 하기 (Enter)</button>
      </div>`,
      (e) => {
        if (e.code === 'Enter') onRestart();
      },
    );
    this.root.querySelector('[data-act=restart]').onclick = onRestart;
  }
}
