/* game.js: Main gameplay loop, scene state and rendering orchestration. */
(function () {
  const PM = (window.PM = window.PM || {});
  const U = PM.Util;

  class Game {
    constructor(canvas, hud, config) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.hud = hud;
      this.tileSize = 24;
      this.mode = config.mode;
      this.character = config.character;
      this.difficulty = config.difficulty;
      this.level = 1;
      this.seed = Math.floor(Math.random() * 1e9);
      this.rng = new U.RNG(this.seed);
      this.baseGhostSpeed = 4.1;
      this.debug = false;
      this.running = true;
      this.state = 'playing';
      this.camera = { x: 0, y: 0 };
      this.inputDir = { x: 0, y: 0 };
      this.frightenedTimer = 0;
      this.resetLevel(false);
    }

    resetLevel(keepSeed = true) {
      if (!keepSeed) this.seed = this.level <= 3 ? 12345 : this.seed + 1337;
      this.rng = new U.RNG(this.seed);
      this.map = new PM.Map.GridMap(this.level, this.seed);

      const p0 = this.map.spawnPoints[0] || this.map.randomWalkablePacman();
      this.player = new PM.Entities.Player(p0.x, p0.y, 5.2);

      if (this.mode === 'ghost') {
        const aiStart = this.map.spawnPoints[1] || this.map.randomWalkablePacman();
        this.aiPacman = new PM.Entities.AIPacman(aiStart.x, aiStart.y, 4.8);
      } else {
        this.aiPacman = null;
      }

      const colours = ['#ff4f7a', '#67d8ff', '#ffb266', '#a98bff'];
      const home = this.map.lair?.centre || this.map.randomWalkableGhost();
      this.ghosts = colours.map((colour, i) => {
        const offset = { x: home.x + ((i % 2) ? 1 : -1), y: home.y + (i < 2 ? 0 : 1) };
        const spawn = this.map.isWalkable(offset.x, offset.y, true) ? offset : home;
        return new PM.Entities.Ghost(spawn.x, spawn.y, this.baseGhostSpeed, colour, home);
      });
      if (this.mode === 'ghost') this.controlledGhost = this.ghosts[0];

      this.frightenedTimer = 0;
    }

    nextLevel() {
      this.level += 1;
      this.resetLevel(false);
    }

    setDifficulty(d) {
      this.difficulty = d;
    }

    handleInputDir(dir) {
      this.inputDir = dir;
    }

    triggerFrightenedMode() {
      this.frightenedTimer = 7;
    }

    update(dt) {
      if (this.state !== 'playing') return;
      if (this.frightenedTimer > 0) this.frightenedTimer -= dt;

      const targetPlayer = this.mode === 'pacman' ? this.player : this.aiPacman;

      if (this.mode === 'pacman') {
        this.player.nextDir = { ...this.inputDir };
        this.player.update(this, dt);
      } else {
        this.controlledGhost.nextDir = { ...this.inputDir };
        this.controlledGhost.step(this.map, dt);
        this.aiPacman.update(this, dt, this.ghosts);
      }

      this.ghosts.forEach((g) => {
        if (this.mode === 'ghost' && g === this.controlledGhost) return;
        g.update(this, dt, targetPlayer);
      });

      const subject = this.mode === 'pacman' ? this.player : this.aiPacman;
      if (this.mode === 'pacman') this.checkPacmanWinLose();
      else this.checkGhostModeWinLose();
      this.updateCamera(subject);
    }

    updateCamera(subject) {
      const vwTiles = this.canvas.width / this.tileSize;
      const vhTiles = this.canvas.height / this.tileSize;
      this.camera.x = U.clamp(subject.x - vwTiles / 2, 0, Math.max(0, this.map.width - vwTiles));
      this.camera.y = U.clamp(subject.y - vhTiles / 2, 0, Math.max(0, this.map.height - vhTiles));
    }

    worldToScreen(wx, wy) {
      return { x: (wx - this.camera.x) * this.tileSize, y: (wy - this.camera.y) * this.tileSize };
    }

    draw(t) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawMap(ctx, t);
      if (this.mode === 'pacman') this.drawPacman(ctx, this.player, t, this.character === 'mspacman');
      else this.drawPacman(ctx, this.aiPacman, t, false);
      this.ghosts.forEach((g) => this.drawGhost(ctx, g));
      PM.UI.drawMinimap(ctx, this);
    }

    drawMap(ctx, t) {
      const x0 = Math.floor(this.camera.x);
      const y0 = Math.floor(this.camera.y);
      const x1 = Math.ceil(this.camera.x + this.canvas.width / this.tileSize);
      const y1 = Math.ceil(this.camera.y + this.canvas.height / this.tileSize);

      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const tile = this.map.tiles[y]?.[x];
          if (tile == null) continue;
          const s = this.worldToScreen(x, y);

          if (tile === PM.Map.TILE.WALL) {
            ctx.fillStyle = '#0d1726';
            ctx.fillRect(s.x, s.y, this.tileSize, this.tileSize);
            ctx.strokeStyle = 'rgba(97,177,255,0.25)';
            ctx.strokeRect(s.x + 1, s.y + 1, this.tileSize - 2, this.tileSize - 2);
          } else if (tile === PM.Map.TILE.LAIR || tile === PM.Map.TILE.LAIR_DOOR) {
            ctx.fillStyle = tile === PM.Map.TILE.LAIR ? '#261322' : '#663a3a';
            ctx.fillRect(s.x, s.y, this.tileSize, this.tileSize);
          } else {
            ctx.fillStyle = '#142338';
            ctx.fillRect(s.x, s.y, this.tileSize, this.tileSize);
          }

          if (tile === PM.Map.TILE.PELLET || tile === PM.Map.TILE.ENERGISER) {
            ctx.fillStyle = '#b6f0ff';
            const pulse = tile === PM.Map.TILE.ENERGISER ? (3 + Math.sin(t * 0.01) * 1.4) : 2;
            ctx.beginPath();
            ctx.arc(s.x + this.tileSize / 2, s.y + this.tileSize / 2, pulse, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    drawPacman(ctx, ent, t, ms) {
      const p = this.worldToScreen(ent.x, ent.y);
      const moving = ent.dir.x || ent.dir.y;
      const mouth = moving ? (Math.sin(t * 0.02) * 0.3 + 0.5) : 0.2;
      const angle = Math.atan2(ent.facing.y, ent.facing.x);
      ctx.save();
      ctx.translate(p.x + this.tileSize / 2, p.y + this.tileSize / 2);
      ctx.rotate(angle);
      ctx.fillStyle = ms ? '#ff84bf' : '#ffd94d';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, this.tileSize * 0.42, mouth, Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fill();
      if (this.player.flashTimer > 0 && this.mode === 'pacman') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawGhost(ctx, g) {
      const p = this.worldToScreen(g.x, g.y);
      const s = this.tileSize;
      ctx.save();
      ctx.globalAlpha = 0.86;
      ctx.fillStyle = g.isEaten ? '#d9d9ff' : (g.isFrightened ? '#4d77ff' : g.colour);
      ctx.beginPath();
      ctx.arc(p.x + s / 2, p.y + s * 0.45, s * 0.35, Math.PI, 0);
      ctx.lineTo(p.x + s * 0.85, p.y + s * 0.82);
      for (let i = 0; i < 3; i += 1) {
        const bx = p.x + s * (0.72 - i * 0.24);
        ctx.quadraticCurveTo(bx, p.y + s * 0.95, bx - s * 0.12, p.y + s * 0.82);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    checkPacmanWinLose() {
      if (this.map.pelletsRemaining <= 0) {
        this.nextLevel();
        return;
      }

      for (const g of this.ghosts) {
        if (g.isEaten) continue;
        if (U.dist(this.player, g) < 0.55) {
          if (this.frightenedTimer > 0) {
            g.isEaten = true;
            g.state = PM.AI.GHOST_STATE.RETURN;
          } else {
            this.state = 'lose';
            this.running = false;
            return;
          }
        }
      }
    }

    checkGhostModeWinLose() {
      if (this.map.pelletsRemaining <= 0) {
        this.state = 'lose';
        this.running = false;
      }
      for (const g of this.ghosts) {
        if (U.dist(this.aiPacman, g) < 0.55) {
          this.state = 'win';
          this.running = false;
        }
      }
    }

    activateAbility() {
      if (this.mode === 'pacman') this.player.activateAbility(this);
    }

    distanceToNearestPellet(from) {
      const path = U.bfs(
        from,
        (n) => {
          const t = this.map.tiles[n.y][n.x];
          return t === PM.Map.TILE.PELLET || t === PM.Map.TILE.ENERGISER;
        },
        (n) => this.map.neighboursFor(n, false)
      );
      return path ? path.length : 999;
    }

    predictPlayerTile(player) {
      const t = player.tile();
      return {
        x: U.clamp(t.x + player.facing.x * 2, 0, this.map.width - 1),
        y: U.clamp(t.y + player.facing.y * 2, 0, this.map.height - 1)
      };
    }

    findSafeTeleport() {
      const options = [];
      for (let y = 1; y < this.map.height - 1; y += 1) {
        for (let x = 1; x < this.map.width - 1; x += 1) {
          if (!this.map.isWalkable(x, y, false)) continue;
          const exits = this.map.neighboursFor({ x, y }, false).length;
          if (exits < 2) continue;
          const close = this.ghosts.some((g) => U.dist(g.tile(), { x, y }) < 4);
          if (!close) options.push({ x, y });
        }
      }
      return options.length ? this.rng.pick(options) : null;
    }

    phaseShift(player) {
      const dir = player.facing;
      const t = player.tile();
      let x = t.x + dir.x;
      let y = t.y + dir.y;
      if (!this.map.tiles[y]?.[x] || this.map.tiles[y][x] !== PM.Map.TILE.WALL) return;
      while (this.map.tiles[y]?.[x] === PM.Map.TILE.WALL) {
        x += dir.x;
        y += dir.y;
      }
      if (this.map.isWalkable(x, y, false)) {
        player.x = x;
        player.y = y;
      }
    }
  }

  PM.Game = Game;
})();
