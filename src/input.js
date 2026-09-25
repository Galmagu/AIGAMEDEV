const BLOCKED = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F1', 'Backquote',
]);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set(); // 이번 프레임에 새로 눌린 키

    window.addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  // 정규화된 이동 방향 (대각선도 속도 1)
  axis() {
    const d = this.down;
    let x = (d.has('KeyD') || d.has('ArrowRight') ? 1 : 0) - (d.has('KeyA') || d.has('ArrowLeft') ? 1 : 0);
    let y = (d.has('KeyS') || d.has('ArrowDown') ? 1 : 0) - (d.has('KeyW') || d.has('ArrowUp') ? 1 : 0);
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  endFrame() {
    this.pressed.clear();
  }
}
