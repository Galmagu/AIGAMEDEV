// 균일 격자 공간 해시. 매 프레임 clear → insert로 다시 채운다.
// 적 수백 마리의 충돌/타겟 탐색을 "근처 셀만" 보도록 줄이는 용도.
export class SpatialHash {
  constructor(cellSize) {
    this.cell = cellSize;
    this.inv = 1 / cellSize;
    this.buckets = new Map();
    this.used = [];
  }

  key(cx, cy) {
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear() {
    for (const b of this.used) b.length = 0;
    this.used.length = 0;
    // 무한 맵이라 버킷이 계속 늘어나므로 가끔 통째로 비운다
    if (this.buckets.size > 6000) this.buckets.clear();
  }

  insert(obj) {
    const k = this.key(Math.floor(obj.x * this.inv), Math.floor(obj.y * this.inv));
    let b = this.buckets.get(k);
    if (!b) {
      b = [];
      this.buckets.set(k, b);
    }
    if (b.length === 0) this.used.push(b);
    b.push(obj);
  }

  // 사각 영역에 걸친 셀의 객체를 out에 담는다. 정확한 거리 판정은 호출하는 쪽에서.
  queryRect(minX, minY, maxX, maxY, out) {
    out.length = 0;
    const x0 = Math.floor(minX * this.inv);
    const x1 = Math.floor(maxX * this.inv);
    const y0 = Math.floor(minY * this.inv);
    const y1 = Math.floor(maxY * this.inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }

  // 가장 가까운 살아있는 객체. 셀 링을 바깥으로 넓혀가다가 더 볼 필요가 없으면 멈춘다.
  nearest(x, y, maxDist, exclude = null) {
    const cx = Math.floor(x * this.inv);
    const cy = Math.floor(y * this.inv);
    const maxRing = Math.ceil(maxDist * this.inv);
    let best = null;
    let bestD2 = maxDist * maxDist;
    for (let r = 0; r <= maxRing; r++) {
      // 링 r에 있는 점은 최소 (r-1)*cell 만큼 떨어져 있다
      if (best && r > 1) {
        const minD = (r - 1) * this.cell;
        if (minD * minD >= bestD2) break;
      }
      for (let ix = cx - r; ix <= cx + r; ix++) {
        const edge = ix === cx - r || ix === cx + r;
        const step = edge || r === 0 ? 1 : 2 * r; // 안쪽 열은 위/아래 끝 셀만
        for (let iy = cy - r; iy <= cy + r; iy += step) {
          const b = this.buckets.get(this.key(ix, iy));
          if (!b) continue;
          for (let i = 0; i < b.length; i++) {
            const o = b[i];
            if (o.dead || (exclude && exclude.has(o))) continue;
            const dx = o.x - x;
            const dy = o.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = o;
            }
          }
        }
      }
    }
    return best;
  }
}
