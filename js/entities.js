/* entities.js: Entity model for player, ghosts and AI Pac-Man decision making. */
(function () {
  const PM = (window.PM = window.PM || {});
  const U = PM.Util;
  const { GHOST_STATE } = PM.AI;

  class Entity {
    constructor(x, y, speed, allowLair = false) {
      this.x = x;
      this.y = y;
      this.speed = speed;
      this.dir = { x: 0, y: 0 };
      this.nextDir = { x: 0, y: 0 };
      this.facing = { x: 1, y: 0 };
      this.allowLair = allowLair;
    }

    tile() {
      return { x: Math.round(this.x), y: Math.round(this.y) };
    }

    atCentre() {
      return Math.abs(this.x - Math.round(this.x)) < 0.05 && Math.abs(this.y - Math.round(this.y)) < 0.05;
    }

    canMove(map, dir) {
      const t = this.tile();
      return map.isWalkable(t.x + dir.x, t.y + dir.y, this.allowLair);
    }

    step(map, dt) {
      if (this.atCentre()) {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        if ((this.nextDir.x || this.nextDir.y) && this.canMove(map, this.nextDir)) {
          this.dir = { ...this.nextDir };
        }
        if (!this.canMove(map, this.dir)) this.dir = { x: 0, y: 0 };
      }

      this.x += this.dir.x * this.speed * dt;
      this.y += this.dir.y * this.speed * dt;
      if (this.dir.x || this.dir.y) this.facing = { ...this.dir };
    }
  }

  class Player extends Entity {
    constructor(x, y, speed) {
      super(x, y, speed, false);
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
          this.ability = game.rng.pick(options); // Replaces held ability for easier testing.
          this.abilityTimer = 0;
          game.triggerFrightenedMode();
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
    constructor(x, y, speed, colour, home) {
      super(x, y, speed, true);
      this.baseSpeed = speed;
      this.colour = colour;
      this.home = home;
      this.state = GHOST_STATE.PATROL;
      this.target = null;
      this.path = [];
      this.stateTimer = 0;
      this.lastSeen = null;
      this.lastHeard = null;
      this.patrolTarget = null;
      this.isFrightened = false;
      this.isEaten = false;
    }

    update(game, dt, playerRef) {
      const diff = PM.AI.DIFFICULTY[game.difficulty];
      const myTile = this.tile();
      const playerTile = playerRef.tile();

      if (this.isEaten) {
        this.state = GHOST_STATE.RETURN;
        this.target = this.home;
        this.path = PM.AI.pathTo(game.map, myTile, this.target, true) || [];
        if (myTile.x === this.home.x && myTile.y === this.home.y) {
          this.isEaten = false;
          this.isFrightened = false;
          this.state = GHOST_STATE.PATROL;
          this.patrolTarget = null;
        }
      } else {
        this.isFrightened = game.frightenedTimer > 0;
        const sees = PM.AI.withinCone(myTile, this.facing, playerTile, diff.sight, diff.cone) && PM.AI.hasLineOfSight(game.map, myTile, playerTile);

        if (sees && !this.isFrightened) {
          this.state = GHOST_STATE.CHASE;
          this.lastSeen = { ...playerTile };
          this.stateTimer = 2.5;
        } else if (!playerRef.silent && !this.isFrightened) {
          const heard = U.dist(myTile, playerTile) <= diff.hearing;
          if (heard && this.state !== GHOST_STATE.CHASE) {
            this.state = GHOST_STATE.INVESTIGATE;
            this.lastHeard = { ...playerTile };
            this.target = { ...playerTile };
            this.path = [];
          }
        }

        if (this.isFrightened) {
          this.state = GHOST_STATE.SEARCH;
          if (this.atCentre()) {
            const neigh = game.map.neighboursFor(myTile, true);
            neigh.sort((a, b) => U.dist(b, playerTile) - U.dist(a, playerTile));
            const pick = neigh[0] || myTile;
            this.nextDir = { x: pick.x - myTile.x, y: pick.y - myTile.y };
          }
        } else if (this.state === GHOST_STATE.CHASE) {
          this.target = game.predictPlayerTile(playerRef);
          this.path = PM.AI.pathTo(game.map, myTile, this.target, true) || [];
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
          this.path = PM.AI.pathTo(game.map, myTile, this.target, true) || [];
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
            const neigh = game.map.neighboursFor(myTile, true);
            this.target = game.rng.pick(neigh);
            this.path = [];
          }
        }

        if (this.state === GHOST_STATE.PATROL && this.atCentre()) {
          if (!this.patrolTarget || (myTile.x === this.patrolTarget.x && myTile.y === this.patrolTarget.y)) {
            const options = game.map.spawnPoints.filter((p) => U.dist(p, myTile) > 6);
            this.patrolTarget = options.length ? game.rng.pick(options) : game.rng.pick(game.map.spawnPoints);
          }
          this.path = PM.AI.pathTo(game.map, myTile, this.patrolTarget, true) || [];
          if (this.path.length > 1) {
            const n = this.path[1];
            this.nextDir = { x: n.x - myTile.x, y: n.y - myTile.y };
          }
        }

        if (this.path.length > 1 && this.atCentre() && !this.isFrightened && this.state !== GHOST_STATE.PATROL) {
          const n = this.path[1];
          this.nextDir = { x: n.x - myTile.x, y: n.y - myTile.y };
        }
      }

      const frightenedScale = this.isFrightened ? 0.78 : 1;
      const eatenScale = this.isEaten ? 1.4 : 1;
      this.speed = this.baseSpeed * diff.speedScale * frightenedScale * eatenScale;
      this.step(game.map, dt);
    }
  }

  class AIPacman extends Entity {
    constructor(x, y, speed) {
      super(x, y, speed, false);
      this.thinkTime = 0;
    }

    update(game, dt, ghosts) {
      this.thinkTime -= dt;
      if (this.thinkTime <= 0 && this.atCentre()) {
        this.thinkTime = 0.12;
        const t = this.tile();
        const neigh = game.map.neighboursFor(t, false);
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
        if (consumed === PM.Map.TILE.ENERGISER) game.triggerFrightenedMode();
      }
    }
  }

  PM.Entities = { Entity, Player, Ghost, AIPacman };
})();
