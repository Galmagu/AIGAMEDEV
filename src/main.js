import { VIEW_W, STEP } from './config.js';
import { Game } from './game.js';
import { render } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const ui = new UI(document.getElementById('overlay'));
const input = new Input();
const game = new Game(ui, input);
window.__game = game; // 콘솔 디버깅용

// 화면 크기 × devicePixelRatio에 맞춰 캔버스 해상도를 잡아서 고해상도에서도 선명하게
let scale = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  scale = (canvas.clientWidth * dpr) / VIEW_W;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('blur', () => game.pause());

ui.showTitle(() => game.start());

// 고정 타임스텝: 업데이트는 항상 1/60초 단위, 렌더는 모니터 주사율대로
let last = performance.now();
let acc = 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // 탭 전환 후 복귀 시 폭주 방지
  if (dt > 0) game.fps += (1 / dt - game.fps) * 0.05;

  game.handleInput();
  acc += dt;
  while (acc >= STEP) {
    game.update(STEP);
    acc -= STEP;
  }
  render(ctx, game, scale);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
