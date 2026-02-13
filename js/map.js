/* map.js: Grid map structures with fixed early levels and seeded procedural levels. */
(function () {
  const PM = (window.PM = window.PM || {});
  const U = PM.Util;

  const TILE = {
    WALL: 0,
    PATH: 1,
    PELLET: 2,
    ENERGISER: 3
  };

  const FIXED_MAP_STR = [
    "############################",
    "#o....#......##......#....o#",
    "#.##.#.####.#..#.####.#.##.#",
    "#....#......#..#......#....#",
    "#.##.###.##.####.##.###.##.#",
    "#......#..............#....#",
    "#.####.#.##########.#.#.##.#",
    "#......#....##....#.#......#",
    "#.######.##.##.##.######.###",
    "#........##....##..........#",
    "#.######.######.######.##..#",
    "#....#....#..#....#....#...#",
    "###.#.##.##..##.##.#.##.#.##",
    "#...#....#....#....#....#..#",
    "#.####.##########.####.###.#",
    "#......#....##....#........#",
    "#.####.#.##.##.##.#.######.#",
    "#o...#....#....#....#....o.#",
    "############################"
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
      this.generate();
    }

    generate() {
      if (this.level <= 3) {
        this.fromFixed();
      } else {
        this.fromProcedural();
      }
      this.scanMeta();
    }

    fromFixed() {
      this.height = FIXED_MAP_STR.length;
      this.width = FIXED_MAP_STR[0].length;
      this.tiles = FIXED_MAP_STR.map((row) => [...row].map((c) => {
        if (c === '#') return TILE.WALL;
        if (c === '.') return TILE.PELLET;
        if (c === 'o') return TILE.ENERGISER;
        return TILE.PATH;
      }));
    }

    fromProcedural() {
      this.width = 28 + Math.floor((this.level - 4) / 2) * 4;
      this.height = 23 + Math.floor((this.level - 4) / 2) * 4;
      if (this.width % 2 === 0) this.width += 1;
      if (this.height % 2 === 0) this.height += 1;
      let attempts = 0;
      while (attempts < 6) {
        attempts += 1;
        this.tiles = Array.from({ length: this.height }, () => Array(this.width).fill(TILE.WALL));
        this.carveMaze();
        this.addLoops();
        this.placePelletsAndEnergisers();
        if (this.isConnected()) return;
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
      const openings = Math.floor((this.width * this.height) * 0.03);
      for (let i = 0; i < openings; i += 1) {
        const x = this.rng.int(1, this.width - 2);
        const y = this.rng.int(1, this.height - 2);
        if (this.tiles[y][x] !== TILE.WALL) continue;
        const neighbours = this.neighbours({ x, y }).length;
        if (neighbours >= 2) this.tiles[y][x] = TILE.PATH;
      }
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
        const p = this.randomWalkable();
        this.tiles[p.y][p.x] = TILE.ENERGISER;
      }
    }

    isConnected() {
      const start = this.randomWalkable();
      const seen = new Set([U.key(start.x, start.y)]);
      const q = [start];
      while (q.length) {
        const n = q.shift();
        for (const nxt of this.neighbours(n)) {
          const k = U.key(nxt.x, nxt.y);
          if (!seen.has(k)) {
            seen.add(k);
            q.push(nxt);
          }
        }
      }
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          if (this.tiles[y][x] !== TILE.WALL && !seen.has(U.key(x, y))) return false;
        }
      }
      return true;
    }

    randomWalkable() {
      for (let i = 0; i < 500; i += 1) {
        const x = this.rng.int(1, this.width - 2);
        const y = this.rng.int(1, this.height - 2);
        if (this.tiles[y][x] !== TILE.WALL) return { x, y };
      }
      return { x: 1, y: 1 };
    }

    scanMeta() {
      this.pelletsRemaining = 0;
      this.spawnPoints = [];
      this.energisers = [];
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const t = this.tiles[y][x];
          if (t === TILE.PELLET || t === TILE.ENERGISER) this.pelletsRemaining += 1;
          if (t === TILE.ENERGISER) this.energisers.push({ x, y });
          if (t !== TILE.WALL && this.neighbours({ x, y }).length >= 3) this.spawnPoints.push({ x, y });
        }
      }
      if (this.spawnPoints.length < 5) {
        this.spawnPoints = [this.randomWalkable(), this.randomWalkable(), this.randomWalkable(), this.randomWalkable(), this.randomWalkable()];
      }
    }

    neighbours(node) {
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

    isWalkable(x, y) {
      return x >= 0 && y >= 0 && x < this.width && y < this.height && this.tiles[y][x] !== TILE.WALL;
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
