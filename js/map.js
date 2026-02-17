/* map.js: Grid map structures with fixed early levels and seeded procedural levels. */
(function () {
  const PM = (window.PM = window.PM || {});
  const U = PM.Util;

  const TILE = {
    WALL: 0,
    PATH: 1,
    PELLET: 2,
    ENERGISER: 3,
    LAIR: 4,
    LAIR_DOOR: 5
  };

  // Classic-like fixed map with a central ghost regeneration lair.
  const FIXED_MAP_STR = [
    '############################',
    '#o........................o#',
    '#.####..#####..#####..####.#',
    '#......#.............#.....#',
    '#.####.#.###.##.###.#.####.#',
    '#......#.............#.....#',
    '#.####.#.##########.#.####.#',
    '#......#.....##......#.....#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '#.####.#####.##.#####.####.#',
    '#......#............#......#',
    '#.####.#.###.##.###.#.####.#',
    '#......#.....##.....#......#',
    '#.####..#####..#####..####.#',
    '#o........................o#',
    '############################'
  ];

  class GridMap {
    constructor(level, seed) {
      this.level = level;
      this.seed = seed;
      this.rng = new U.RNG(seed);
      this.tiles = [];
      this.width = 0;
      this.height = 0;
      this.pelletsRemaining = 0;
      this.spawnPoints = [];
      this.energisers = [];
      this.lair = null;
      this.generate();
    }

    generate() {
      if (this.level <= 3) {
        this.fromFixed();
      } else {
        this.fromProcedural();
      }
      this.ensureConnectedPacman();
      this.scanMeta();
    }

    fromFixed() {
      this.height = FIXED_MAP_STR.length;
      this.width = FIXED_MAP_STR[0].length;
      this.tiles = FIXED_MAP_STR.map((row) => [...row].map((c) => {
        if (c === '#') return TILE.WALL;
        if (c === '.') return TILE.PELLET;
        if (c === 'o') return TILE.ENERGISER;
        if (c === '=') return TILE.LAIR;
        if (c === '-') return TILE.LAIR_DOOR;
        return TILE.PATH;
      }));
      this.createLair();
      this.clearPelletsInsideLair();
      this.findLair();
    }

    fromProcedural() {
      this.width = 28 + Math.floor((this.level - 4) / 2) * 4;
      this.height = 23 + Math.floor((this.level - 4) / 2) * 4;
      if (this.width % 2 === 0) this.width += 1;
      if (this.height % 2 === 0) this.height += 1;

      let attempts = 0;
      while (attempts < 8) {
        attempts += 1;
        this.tiles = Array.from({ length: this.height }, () => Array(this.width).fill(TILE.WALL));
        this.carveMaze();
        this.addLoops();
        this.createLair();
        this.placePelletsAndEnergisers();
        if (this.isConnectedForPacman()) return;
        this.rng = new U.RNG(this.seed + attempts * 97);
      }
      this.fromFixed();
    }

    carveMaze() {
      const stack = [{ x: 1, y: 1 }];
      this.tiles[1][1] = TILE.PATH;
      const dirs = [
        { x: 2, y: 0 },
        { x: -2, y: 0 },
        { x: 0, y: 2 },
        { x: 0, y: -2 }
      ];

      while (stack.length) {
        const c = stack[stack.length - 1];
        const options = [];
        for (const d of dirs) {
          const nx = c.x + d.x;
          const ny = c.y + d.y;
          if (nx > 0 && ny > 0 && nx < this.width - 1 && ny < this.height - 1 && this.tiles[ny][nx] === TILE.WALL) {
            options.push(d);
          }
        }
        if (!options.length) {
          stack.pop();
          continue;
        }
        const d = this.rng.pick(options);
        this.tiles[c.y + d.y / 2][c.x + d.x / 2] = TILE.PATH;
        this.tiles[c.y + d.y][c.x + d.x] = TILE.PATH;
        stack.push({ x: c.x + d.x, y: c.y + d.y });
      }
    }

    addLoops() {
      const openings = Math.floor(this.width * this.height * 0.03);
      for (let i = 0; i < openings; i += 1) {
        const x = this.rng.int(1, this.width - 2);
        const y = this.rng.int(1, this.height - 2);
        if (this.tiles[y][x] !== TILE.WALL) continue;
        const passableAround = this.neighboursAll({ x, y }).length;
        if (passableAround >= 2) this.tiles[y][x] = TILE.PATH;
      }
    }

    createLair() {
      const lw = 7;
      const lh = 5;
      const x0 = Math.floor(this.width / 2 - lw / 2);
      const y0 = Math.floor(this.height / 2 - lh / 2);
      this.lair = { x0, y0, w: lw, h: lh, centre: { x: x0 + Math.floor(lw / 2), y: y0 + Math.floor(lh / 2) } };

      for (let y = y0; y < y0 + lh; y += 1) {
        for (let x = x0; x < x0 + lw; x += 1) {
          if (y <= 0 || x <= 0 || y >= this.height - 1 || x >= this.width - 1) continue;
          this.tiles[y][x] = TILE.LAIR;
        }
      }

      for (let x = x0 - 1; x <= x0 + lw; x += 1) {
        if (x > 0 && x < this.width - 1) {
          if (y0 - 1 > 0 && this.tiles[y0 - 1][x] !== TILE.LAIR) this.tiles[y0 - 1][x] = TILE.PATH;
          if (y0 + lh < this.height - 1 && this.tiles[y0 + lh][x] !== TILE.LAIR) this.tiles[y0 + lh][x] = TILE.PATH;
        }
      }
      for (let y = y0; y < y0 + lh; y += 1) {
        if (y > 0 && y < this.height - 1) {
          if (x0 - 1 > 0 && this.tiles[y][x0 - 1] !== TILE.LAIR) this.tiles[y][x0 - 1] = TILE.PATH;
          if (x0 + lw < this.width - 1 && this.tiles[y][x0 + lw] !== TILE.LAIR) this.tiles[y][x0 + lw] = TILE.PATH;
        }
      }

      const doorX = x0 + Math.floor(lw / 2);
      this.tiles[y0 - 1][doorX] = TILE.LAIR_DOOR;
      this.tiles[y0 - 2][doorX] = TILE.PATH;
    }

    clearPelletsInsideLair() {
      if (!this.lair) return;
      for (let y = this.lair.y0; y < this.lair.y0 + this.lair.h; y += 1) {
        for (let x = this.lair.x0; x < this.lair.x0 + this.lair.w; x += 1) {
          this.tiles[y][x] = TILE.LAIR;
        }
      }
      const doorX = this.lair.x0 + Math.floor(this.lair.w / 2);
      this.tiles[this.lair.y0 - 1][doorX] = TILE.LAIR_DOOR;
    }

    findLair() {
      const lairTiles = [];
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          if (this.tiles[y][x] === TILE.LAIR) lairTiles.push({ x, y });
        }
      }
      if (!lairTiles.length) return;
      const xs = lairTiles.map((t) => t.x);
      const ys = lairTiles.map((t) => t.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const x1 = Math.max(...xs);
      const y1 = Math.max(...ys);
      this.lair = {
        x0,
        y0,
        w: x1 - x0 + 1,
        h: y1 - y0 + 1,
        centre: { x: Math.floor((x0 + x1) / 2), y: Math.floor((y0 + y1) / 2) }
      };
    }

    placePelletsAndEnergisers() {
      let placed = 0;
      for (let y = 1; y < this.height - 1; y += 1) {
        for (let x = 1; x < this.width - 1; x += 1) {
          if (this.tiles[y][x] === TILE.PATH) {
            this.tiles[y][x] = TILE.PELLET;
            placed += 1;
          }
        }
      }
      const count = Math.max(4, Math.floor(placed / 120));
      for (let i = 0; i < count; i += 1) {
        const p = this.randomWalkablePacman();
        this.tiles[p.y][p.x] = TILE.ENERGISER;
      }
    }

    ensureConnectedPacman() {
      let guard = 0;
      while (!this.isConnectedForPacman() && guard < 800) {
        guard += 1;
        const x = this.rng.int(1, this.width - 2);
        const y = this.rng.int(1, this.height - 2);
        if (this.tiles[y][x] === TILE.WALL) this.tiles[y][x] = TILE.PATH;
      }
    }

    isConnectedForPacman() {
      const start = this.randomWalkablePacman();
      const seen = new Set([U.key(start.x, start.y)]);
      const q = [start];
      while (q.length) {
        const n = q.shift();
        for (const nxt of this.neighboursPacman(n)) {
          const k = U.key(nxt.x, nxt.y);
          if (!seen.has(k)) {
            seen.add(k);
            q.push(nxt);
          }
        }
      }
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const t = this.tiles[y][x];
          if ((t === TILE.PATH || t === TILE.PELLET || t === TILE.ENERGISER) && !seen.has(U.key(x, y))) return false;
        }
      }
      return true;
    }

    randomWalkablePacman() {
      for (let i = 0; i < 500; i += 1) {
        const x = this.rng.int(1, this.width - 2);
        const y = this.rng.int(1, this.height - 2);
        if (this.isWalkable(x, y, false)) return { x, y };
      }
      return { x: 1, y: 1 };
    }

    randomWalkableGhost() {
      if (this.lair?.centre) return { ...this.lair.centre };
      return this.randomWalkablePacman();
    }

    scanMeta() {
      this.pelletsRemaining = 0;
      this.spawnPoints = [];
      this.energisers = [];
      this.createLair();
      this.clearPelletsInsideLair();
      this.findLair();
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const t = this.tiles[y][x];
          if (t === TILE.PELLET || t === TILE.ENERGISER) this.pelletsRemaining += 1;
          if (t === TILE.ENERGISER) this.energisers.push({ x, y });
          if (this.isWalkable(x, y, false) && this.neighboursPacman({ x, y }).length >= 3) this.spawnPoints.push({ x, y });
        }
      }
      if (this.spawnPoints.length < 4) {
        this.spawnPoints = [this.randomWalkablePacman(), this.randomWalkablePacman(), this.randomWalkablePacman(), this.randomWalkablePacman()];
      }
    }

    neighboursAll(node) {
      const out = [];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const x = node.x + dx;
        const y = node.y + dy;
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        if (this.tiles[y][x] !== TILE.WALL) out.push({ x, y });
      }
      return out;
    }

    neighboursPacman(node) {
      const out = [];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const x = node.x + dx;
        const y = node.y + dy;
        if (this.isWalkable(x, y, false)) out.push({ x, y });
      }
      return out;
    }

    neighboursGhost(node) {
      const out = [];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const x = node.x + dx;
        const y = node.y + dy;
        if (this.isWalkable(x, y, true)) out.push({ x, y });
      }
      return out;
    }

    neighboursFor(node, allowLair) {
      return allowLair ? this.neighboursGhost(node) : this.neighboursPacman(node);
    }

    isWalkable(x, y, allowLair = false) {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
      const t = this.tiles[y][x];
      if (t === TILE.WALL) return false;
      if (!allowLair && (t === TILE.LAIR || t === TILE.LAIR_DOOR)) return false;
      return true;
    }

    consumeAt(x, y) {
      const t = this.tiles[y]?.[x];
      if (t === TILE.PELLET || t === TILE.ENERGISER) {
        this.tiles[y][x] = TILE.PATH;
        this.pelletsRemaining -= 1;
      }
      return t;
    }
  }

  PM.Map = { GridMap, TILE };
})();
