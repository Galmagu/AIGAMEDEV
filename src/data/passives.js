// 패시브: 네임드 처치 보상. 갱 전원(나중에 합류하는 동료 포함)에게 적용된다.
export const PASSIVES = [
  { id: 'speed', name: '운동화', desc: '이동 속도 +8%' },
  { id: 'magnet', name: '자석', desc: '경험치 획득 거리 +25%' },
  { id: 'power', name: '근력', desc: '무기 피해 +10%' },
  { id: 'haste', name: '손놀림', desc: '공격 쿨다운 -8%' },
  { id: 'armor', name: '방탄조끼', desc: '받는 피해 -1' },
  { id: 'vital', name: '체력단련', desc: '최대 HP +15%' },
  { id: 'regen', name: '붕대', desc: '초당 HP 0.5 재생' },
  { id: 'study', name: '공부', desc: '경험치 획득량 +10%' },
];

export const PASSIVE_BY_ID = Object.fromEntries(PASSIVES.map((p) => [p.id, p]));

// 패시브 레벨 → 게임에서 쓰는 배율/수치
export function computeMods(levels) {
  const l = (id) => levels[id] || 0;
  return {
    speed: 1 + 0.08 * l('speed'),
    pickup: 1 + 0.25 * l('magnet'),
    dmg: 1 + 0.1 * l('power'),
    cd: Math.pow(0.92, l('haste')),
    armor: l('armor'),
    hpMul: 1 + 0.15 * l('vital'),
    regen: 0.5 * l('regen'),
    xp: 1 + 0.1 * l('study'),
  };
}
