/* entities.js: Entity model for player, ghosts and AI Pac-Man decision making. */
(function () {
  const PM = (window.PM = window.PM || {});
  const U = PM.Util;
  const { GHOST_STATE } = PM.AI;

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  class Entity {
    constructor(x, y, speed) {
      this.x = x;
      this.y = y;
      this.speed = speed;
      this.dir = { x: 0, y: 0 };
      this.nextDir = { x: 0, y: 0 };
      this.facing = { x: 1, y: 0 };
      this.radius = 0.38;
    }
    tile() {
      return { x: Math.round(this.x), y: Math.round(this.y) };
    }
    atCentre() {
      return Math.abs(this.x - Math.round(this.x)) < 0.08 && Math.abs(this.y - Math.round(this.y)) < 0.08;
    }
    canMove(map, dir) {
      const t = this.tile();
      return map.isWalkable(t.x + dir.x, t.y + dir.y);
    }
    step(map, dt) {
      if (this.atCentre()) {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        if ((this.nextDir.x || this.nextDir.y) && this.canMove(map, this.nextDir)) {
          this.dir = { ...this.nextDir };
        }
        if (!this.canMove(map, this.dir)) {
          this.dir = { x: 0, y: 0 };
        }
      }
      this.x += this.dir.x * this.speed * dt;
      this.y += this.dir.y * this.speed * dt;
      if (this.dir.x || this.dir.y) this.facing = { ...this.dir };
    }
  }

  class Player extends Entity {
    constructor(x, y, speed) {
      super(x, y, speed);
      this.ability = null;
      this.abilityTimer = 0;
      this.flashTimer = 0;
      this.silent = false;
    }
    update(game, dt) {
      this.step(game.map, dt);
      const t = this.tile();
      if (this.atCentre()) {
        const consumed = game.map.consumeAt(t.x, t.y);
        if (consumed === PM.Map.TILE.ENERGISER) {
          const options = ['teleport', 'phase', 'silent'];
          this.ability = game.rng.pick(options);
          this.abilityTimer = 0;
        }
      }
      if (this.flashTimer > 0) this.flashTimer -= dt;
      if (this.silent) {
        this.abilityTimer -= dt;
        if (this.abilityTimer <= 0) {
          this.silent = false;
          this.ability = null;
        }
      }
    }

    activateAbility(game) {
      if (!this.ability) return;
      if (this.ability === 'teleport') {
        const p = game.findSafeTeleport();
        if (p) {
          this.x = p.x;
          this.y = p.y;
          this.dir = { x: 0, y: 0 };
          this.flashTimer = 0.2;
        }
        this.ability = null;
      } else if (this.ability === 'phase') {
        game.phaseShift(this);
        this.ability = null;
      } else if (this.ability === 'silent') {
        this.silent = true;
        this.abilityTimer = 4;
      }
    }
  }

  class Ghost extends Entity {
    constructor(x, y, speed, colour) {
      super(x, y, speed);
      this.colour = colour;
      this.state = GHOST_STATE.PATROL;
      this.target = null;
      this.path = [];
      this.stateTimer = 0;
      this.lastSeen = null;
      this.lastHeard = null;
      this.debug = {};
    }

    update(game, dt, playerRef) {
      const diff = PM.AI.DIFFICULTY[game.difficulty];
      const myTile = this.tile();
      const playerTile = playerRef.tile();
      const sees = PM.AI.withinCone(myTile, this.facing, playerTile, diff.sight, diff.cone) && PM.AI.hasLineOfSight(game.map, myTile, playerTile);
      this.debug.sees = sees;

      if (sees) {
        this.state = GHOST_STATE.CHASE;
        this.lastSeen = { ...playerTile };
        this.stateTimer = 2.5;
      } else if (!playerRef.silent) {
        const heard = U.dist(myTile, playerTile) <= diff.hearing;
        if (heard && this.state !== GHOST_STATE.CHASE) {
          this.state = GHOST_STATE.INVESTIGATE;
          this.lastHeard = { ...playerTile };
          this.target = { ...playerTile };
          this.path = [];
        }
      }

      if (this.state === GHOST_STATE.CHASE) {
        this.target = game.predictPlayerTile(playerRef);
        this.path = PM.AI.pathTo(game.map, myTile, this.target) || [];
        if (!sees) {
          this.stateTimer -= dt;
          if (this.stateTimer <= 0) {
            this.state = GHOST_STATE.SEARCH;
            this.target = this.lastSeen ? { ...this.lastSeen } : { ...myTile };
            this.stateTimer = 3;
          }
        }
      } else if (this.state === GHOST_STATE.INVESTIGATE) {
        if (!this.target) this.target = this.lastHeard;
        this.path = PM.AI.pathTo(game.map, myTile, this.target) || [];
        if (myTile.x === this.target?.x && myTile.y === this.target?.y) {
          this.state = GHOST_STATE.SEARCH;
          this.stateTimer = 2;
        }
      } else if (this.state === GHOST_STATE.SEARCH) {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = GHOST_STATE.PATROL;
          this.target = null;
          this.path = [];
        } else if (!this.target || (myTile.x === this.target.x && myTile.y === this.target.y)) {
          const neigh = game.map.neighbours(myTile);
          this.target = game.rng.pick(neigh);
          this.path = [];
        }
      }

      if (this.state === GHOST_STATE.PATROL) {
        if (this.atCentre()) {
          const neighbours = game.map.neighbours(myTile);
          const filtered = neighbours.filter((n) => n.x !== myTile.x - this.dir.x || n.y !== myTile.y - this.dir.y);
          const picks = filtered.length ? filtered : neighbours;
          picks.sort((a, b) => {
            const aBias = (a.x - myTile.x === this.dir.x && a.y - myTile.y === this.dir.y) ? -0.4 : 0;
            const bBias = (b.x - myTile.x === this.dir.x && b.y - myTile.y === this.dir.y) ? -0.4 : 0;
            return (game.rng.next() + aBias) - (game.rng.next() + bBias);
          });
          const choice = picks[0] || myTile;
          this.nextDir = { x: choice.x - myTile.x, y: choice.y - myTile.y };
        }
      } else if (this.path.length > 1 && this.atCentre()) {
        const n = this.path[1];
        this.nextDir = { x: n.x - myTile.x, y: n.y - myTile.y };
      }

      this.speed = game.baseGhostSpeed * diff.speedScale;
      this.step(game.map, dt);
    }
  }

  class AIPacman extends Entity {
    constructor(x, y, speed) {
      super(x, y, speed);
      this.thinkTime = 0;
    }
    update(game, dt, ghosts) {
      this.thinkTime -= dt;
      if (this.thinkTime <= 0 && this.atCentre()) {
        this.thinkTime = 0.12;
        const t = this.tile();
        const neigh = game.map.neighbours(t);
        let best = null;
        let bestScore = -Infinity;
        for (const n of neigh) {
          const pelletDist = game.distanceToNearestPellet(n);
          const ghostDist = Math.min(...ghosts.map((g) => U.dist(n, g.tile())));
          const energiser = game.map.tiles[n.y][n.x] === PM.Map.TILE.ENERGISER ? 8 : 0;
          const dangerPenalty = ghostDist < 3 ? -30 : ghostDist < 5 ? -10 : 0;
          const score = -pelletDist * 1.6 + ghostDist * 0.8 + energiser + dangerPenalty;
          if (score > bestScore) {
            bestScore = score;
            best = n;
          }
        }
        if (best) this.nextDir = { x: best.x - t.x, y: best.y - t.y };
      }
      this.step(game.map, dt);
      const t = this.tile();
      if (this.atCentre()) {
        const consumed = game.map.consumeAt(t.x, t.y);
        if (consumed === PM.Map.TILE.ENERGISER) {
          this.speed += 0.15;
        }
      }
    }
  }

  PM.Entities = { Entity, Player, Ghost, AIPacman, DIRS };
})();
