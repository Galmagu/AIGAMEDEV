# 갱 서바이버 (프로토타입)

좀비 떼 속에서 8분을 버티는 뱀서라이크. 무기 대신 **동료를 모아서** 갱을 키운다.
기획 명세: [`docs/SPEC.md`](docs/SPEC.md)

## 실행

**가장 쉬운 방법**: [`dist/gang-survivor.html`](dist/gang-survivor.html) 파일 하나만 받아서 더블클릭. 서버도 설치도 필요 없다.
(GitHub에서 파일 열고 우측 상단 Download raw file 버튼)

### 개발할 때

`src/`를 고치면서 바로 확인하려면 로컬 서버로 `index.html`을 연다.
ES 모듈이라 `index.html`을 더블클릭(`file://`)하면 CORS 에러로 안 뜬다.

```bash
python3 -m http.server 8000   # → http://localhost:8000
```

고친 내용을 단일 파일에 반영하려면:

```bash
node tools/build.mjs          # → dist/gang-survivor.html 갱신
```

## 조작

| 키 | 동작 |
|---|---|
| WASD / 방향키 | 이동 (공격은 자동) |
| 1 · 2 · 3 / 클릭 | 선택지 고르기 |
| ESC / P | 일시정지 |
| F1 / \` | 디버그 패널 |

디버그 패널이 켜져 있을 때: `I` 무적, `L` 즉시 레벨업, `T` 30초 건너뛰기, `N` 네임드 소환, `B` 보스 소환.
콘솔에서 `__game`으로 게임 상태에 바로 접근할 수 있다.

## 구조

```
index.html          캔버스 + 오버레이 + CSS
src/
  main.js           부트스트랩, 고정 타임스텝 루프
  config.js         전역 수치 (동료 최대 수, 스폰량, 경험치 곡선 등)
  game.js           게임 상태, 갱/적/투사체/경험치/레벨업 로직
  weapons.js        무기 런타임 (레벨 스탯 계산, 유형별 발동)
  render.js         캔버스 렌더링 + HUD
  ui.js             DOM 오버레이 (타이틀, 레벨업 카드, 일시정지, 결과)
  input.js          키보드 입력
  spatial.js        공간 해시 (충돌/최근접 탐색)
  util.js
  data/weapons.js   무기 15종 정의, 티어 확률
  data/passives.js  패시브 8종
  data/names.js     동료 별명 생성
tools/build.mjs     src/를 단일 HTML로 묶는 빌드 스크립트 (의존성 없음)
dist/               빌드 결과 (더블클릭 실행용)
```

밸런싱은 `src/config.js`와 `src/data/weapons.js`의 숫자만 고치면 된다.
