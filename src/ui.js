// DOM 오버레이: 타이틀 / 레벨업 선택 / 일시정지 / 결과 화면
import { TIERS, nominalDps, LEVEL_BONUS_TEXT } from './data/weapons.js';
import { computeStats } from './weapons.js';
import { MAX_COMPANIONS, WEAPON_MAX_LEVEL } from './config.js';
import { formatTime } from './util.js';

const PICK_LOCK_MS = 250; // 창이 뜨자마자 실수로 고르는 것 방지

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

  showLevelUp(offer, level, game, onPick) {
    const heads = {
      recruit: ['동료를 영입하라', `갱 ${game.units.length - 1} / ${MAX_COMPANIONS}`],
      upgrade: ['갱이 꽉 찼다 — 무기 강화', '한 명의 무기를 +1레벨'],
      heal: ['전원 최대 강화 완료', '갱 전원 회복'],
    };
    const [title, sub] = heads[offer.kind];
    const cards = offer.cards.map((c, i) => this.cardHtml(offer.kind, c, i)).join('');
    this.show(
      `<div class="panel wide">
        <h2>Lv ${level} 달성 — ${title}</h2>
        <p class="sub">${sub}</p>
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

  cardHtml(kind, c, i) {
    if (kind === 'recruit') {
      const t = TIERS[c.def.tier];
      return `<button class="card" style="--tc:${t.color}" data-i="${i}">
        <span class="c-key">${i + 1}</span>
        <span class="c-tier">${t.label}</span>
        <span class="c-weapon">${c.def.name}</span>
        <span class="c-name">${c.name}</span>
        <span class="c-desc">${c.def.desc}</span>
        <span class="c-dps">DPS ${Math.round(nominalDps(c.def.type, c.def.stats))}</span>
      </button>`;
    }
    if (kind === 'upgrade') {
      const w = c.unit.weapon;
      const t = TIERS[w.def.tier];
      const next = w.level + 1;
      const before = nominalDps(w.def.type, w.stats);
      const after = nominalDps(w.def.type, computeStats(w.def, next));
      const extra = next === 3 || next === 5 ? `<br>+ ${LEVEL_BONUS_TEXT[w.def.type]}` : '';
      return `<button class="card" style="--tc:${t.color}" data-i="${i}">
        <span class="c-key">${i + 1}</span>
        <span class="c-tier">${t.label} · Lv ${w.level} → ${next}</span>
        <span class="c-weapon">${w.def.name}</span>
        <span class="c-name">${c.unit.name}</span>
        <span class="c-desc">피해 +25%${extra}</span>
        <span class="c-dps">DPS ${Math.round(before)} → ${Math.round(after)}</span>
      </button>`;
    }
    return `<button class="card" style="--tc:#7bd88f" data-i="${i}">
      <span class="c-key">1</span>
      <span class="c-tier">회복</span>
      <span class="c-weapon">응급처치</span>
      <span class="c-desc">갱 전원 HP 30% 회복</span>
    </button>`;
  }

  rosterRows(units, showDamage) {
    return units
      .map((u, i) => {
        const w = u.weapon;
        const t = TIERS[w.def.tier];
        const hp = u.alive ? `${Math.ceil(u.hp)} / ${u.maxHp}` : '<span class="dead">사망</span>';
        const dmg = showDamage ? `<td class="num">${Math.round(u.dmgDealt).toLocaleString()}</td>` : '';
        const rank = showDamage ? `<td class="num">${i + 1}</td>` : '';
        return `<tr>${rank}<td>${u.name}</td>
          <td style="color:${t.color}">${w.def.name} <small>${t.label}</small></td>
          <td class="num">Lv ${w.level}${w.level >= WEAPON_MAX_LEVEL ? ' (MAX)' : ''}</td>
          <td class="num">${hp}</td>${dmg}</tr>`;
      })
      .join('');
  }

  showPause(game, onResume) {
    this.show(
      `<div class="panel wide">
        <h2>일시정지</h2>
        <p class="sub">${formatTime(game.time)} 경과 · Lv ${game.level} · 처치 ${game.kills}</p>
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
        <p class="sub">생존 ${formatTime(game.time)} · Lv ${game.level} · 처치 ${game.kills} ·
          동료 ${game.units.length - 1}명 생존 / ${game.dead.length}명 사망</p>
        <p class="mvp">MVP — <b>${mvp.name}</b> (${mvp.weapon.def.name})</p>
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
