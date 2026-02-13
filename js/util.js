/* util.js: Shared helpers including seeded RNG, pathfinding and geometry utilities. */
(function () {
  const PM = (window.PM = window.PM || {});

  class RNG {
    constructor(seed) {
      this.seed = seed >>> 0;
    }
    next() {
      let x = this.seed;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.seed = x >>> 0;
      return this.seed / 0xffffffff;
    }
    int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    }
  }

  function key(x, y) {
    return `${x},${y}`;
  }

  function bfs(start, isGoal, neighbours) {
    const q = [start];
    const came = new Map();
    came.set(key(start.x, start.y), null);

    while (q.length) {
      const node = q.shift();
      if (isGoal(node)) {
        return reconstruct(node, came);
      }
      for (const n of neighbours(node)) {
        const k = key(n.x, n.y);
        if (!came.has(k)) {
          came.set(k, node);
          q.push(n);
        }
      }
    }
    return null;
  }

  function reconstruct(end, came) {
    const path = [];
    let cur = end;
    while (cur) {
      path.push(cur);
      cur = came.get(key(cur.x, cur.y));
    }
    path.reverse();
    return path;
  }

  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  PM.Util = { RNG, bfs, manhattan, clamp, dist, key };
})();
