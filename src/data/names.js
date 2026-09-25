import { pick } from '../util.js';

const PREFIX = [
  '쇠파이프', '문신', '대머리', '외눈', '금니', '빡빡이', '콧수염', '짝귀', '칼자국', '꽁지머리',
  '깍두기', '주먹', '번개', '곰탱이', '여우', '독사', '망치', '뚝배기', '불도저', '미친개',
];
const SURNAME = ['김씨', '이씨', '박씨', '최씨', '정씨', '강씨', '조씨', '윤씨', '장씨', '임씨', '한씨', '오씨'];

// used에 없는 랜덤 별명
export function makeName(used) {
  for (let i = 0; i < 50; i++) {
    const n = `${pick(PREFIX)} ${pick(SURNAME)}`;
    if (!used.has(n)) return n;
  }
  return `신입 ${used.size + 1}호`;
}
