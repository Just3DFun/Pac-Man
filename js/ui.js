/* ui.js: HUD, minimap rendering and optional debug overlays. */
(function () {
  const PM = (window.PM = window.PM || {});

  function updateHUD(game, el) {
    const p = game.player;
    el.innerHTML = [
      `Mode: ${game.mode === 'pacman' ? 'Play as Pac-Man' : 'Play as Ghost'}`,
      `Level: ${game.level}`,
      `Difficulty: ${game.difficulty}`,
      `Pellets: ${game.map.pelletsRemaining}`,
      `Ability: ${p?.ability || 'None'}${p?.silent ? ` (${p.abilityTimer.toFixed(1)}s)` : ''}`
    ].join('<br>');
  }

  function drawMinimap(ctx, game) {
    const tilePx = 8;
    const winW = 14;
    const winH = 15;
    const px = game.player.x;
    const py = game.player.y;

    const ox = PM.Util.clamp(Math.floor(px - winW / 2), 0, Math.max(0, game.map.width - winW));
    const oy = PM.Util.clamp(Math.floor(py - winH / 2), 0, Math.max(0, game.map.height - winH));

    const w = winW * tilePx;
    const h = winH * tilePx;
    const startX = ctx.canvas.width - w - 20;
    const startY = 20;

    ctx.save();
    ctx.translate(startX, startY);
    ctx.fillStyle = 'rgba(6,10,16,0.95)';
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < winH; y += 1) {
      for (let x = 0; x < winW; x += 1) {
        const tx = ox + x;
        const ty = oy + y;
        const t = game.map.tiles[ty]?.[tx];
        if (t == null) continue;
        if (t === PM.Map.TILE.WALL) ctx.fillStyle = '#13243a';
        else ctx.fillStyle = '#1b3553';
        ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx);
        if (t === PM.Map.TILE.PELLET || t === PM.Map.TILE.ENERGISER) {
          ctx.fillStyle = '#9fd8ff';
          const s = t === PM.Map.TILE.ENERGISER ? 3 : 2;
          ctx.fillRect(x * tilePx + tilePx / 2 - s / 2, y * tilePx + tilePx / 2 - s / 2, s, s);
        }
      }
    }

    const drawDot = (e, colour, r = 3) => {
      const ex = (e.x - ox) * tilePx + tilePx / 2;
      const ey = (e.y - oy) * tilePx + tilePx / 2;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
    };

    drawDot(game.player, '#ffe45e', 3.5);
    game.ghosts.forEach((g) => drawDot(g, g.colour, 3));

    const mask = PM.AI.DIFFICULTY[game.difficulty].mask;
    if (mask === 'terror') {
      ctx.fillStyle = 'rgba(0,0,0,0.96)';
      ctx.fillRect(0, 0, w, h);
      drawDot(game.player, 'rgba(255,255,255,0.25)', 2);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.88)';
      ctx.fillRect(0, 0, w, h);
      const playerLocalX = (game.player.x - ox) * tilePx + tilePx / 2;
      const playerLocalY = (game.player.y - oy) * tilePx + tilePx / 2;
      let radius = 56;
      if (mask === 'medium') radius = 34;
      if (mask === 'small') radius = 22;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(playerLocalX, playerLocalY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = '#88b7ff';
    ctx.strokeRect(0, 0, w, h);
    ctx.restore();
  }

  function drawDebug(ctx, game, fps) {
    if (!game.debug) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(10, ctx.canvas.height - 150, 340, 140);
    ctx.fillStyle = '#bde0ff';
    ctx.font = '13px monospace';
    const lines = [
      `FPS: ${fps.toFixed(1)}`,
      `Mode: ${game.mode}`,
      `Level: ${game.level}`,
      `Seed: ${game.seed}`,
      `Difficulty: ${game.difficulty}`,
      `Pellets: ${game.map.pelletsRemaining}`,
      `Ability: ${game.player?.ability || 'none'} ${game.player?.silent ? game.player.abilityTimer.toFixed(1) : ''}`,
      `Ghost states: ${game.ghosts.map((g) => g.state).join(', ')}`
    ];
    lines.forEach((l, i) => ctx.fillText(l, 18, ctx.canvas.height - 128 + i * 16));

    game.ghosts.forEach((g) => {
      const c = game.worldToScreen(g.x, g.y);
      ctx.strokeStyle = 'rgba(255,80,80,0.4)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, PM.AI.DIFFICULTY[game.difficulty].hearing * game.tileSize, 0, Math.PI * 2);
      ctx.stroke();
      if (g.target) {
        const t = game.worldToScreen(g.target.x, g.target.y);
        ctx.fillStyle = '#ff8080';
        ctx.fillRect(t.x - 3, t.y - 3, 6, 6);
      }
    });
    ctx.restore();
  }

  PM.UI = { updateHUD, drawMinimap, drawDebug };
})();
