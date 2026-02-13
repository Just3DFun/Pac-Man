/* ai.js: Ghost state machine, sensing model and path selection helpers. */
(function () {
  const PM = (window.PM = window.PM || {});
  const U = PM.Util;

  const GHOST_STATE = {
    PATROL: 'PATROL',
    INVESTIGATE: 'INVESTIGATE',
    CHASE: 'CHASE',
    SEARCH: 'SEARCH'
  };

  const DIFFICULTY = {
    easy: { sight: 5, cone: Math.PI * 0.9, hearing: 5, mask: 'wide', speedScale: 0.96 },
    medium: { sight: 7, cone: Math.PI * 0.65, hearing: 7, mask: 'medium', speedScale: 1.0 },
    hard: { sight: 9, cone: Math.PI * 0.45, hearing: 9, mask: 'small', speedScale: 1.06 },
    terror: { sight: 12, cone: Math.PI * 0.38, hearing: 12, mask: 'terror', speedScale: 1.12 }
  };

  function hasLineOfSight(map, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx !== 0 && dy !== 0) return false;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    let x = from.x;
    let y = from.y;
    while (x !== to.x || y !== to.y) {
      x += sx;
      y += sy;
      if (!map.isWalkable(x, y)) return false;
    }
    return true;
  }

  function withinCone(origin, facing, target, maxDist, cone) {
    const v = { x: target.x - origin.x, y: target.y - origin.y };
    const d = Math.hypot(v.x, v.y);
    if (d > maxDist || d === 0) return d <= maxDist;
    const dot = (facing.x * v.x + facing.y * v.y) / d;
    const ang = Math.acos(U.clamp(dot, -1, 1));
    return ang <= cone * 0.5;
  }

  function pathTo(map, start, goal) {
    return U.bfs(start, (n) => n.x === goal.x && n.y === goal.y, (n) => map.neighbours(n));
  }

  PM.AI = { GHOST_STATE, DIFFICULTY, hasLineOfSight, withinCone, pathTo };
})();
