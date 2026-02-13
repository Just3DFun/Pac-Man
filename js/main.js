/* main.js: Bootstraps menu UI, keyboard input and game lifecycle wiring. */
(function () {
  const PM = (window.PM = window.PM || {});

  const menu = document.getElementById('menu');
  const shell = document.getElementById('gameShell');
  const canvas = document.getElementById('gameCanvas');
  const hud = document.getElementById('hud');
  const startBtn = document.getElementById('startBtn');
  const modeSel = document.getElementById('modeSelect');
  const charSel = document.getElementById('characterSelect');
  const diffSel = document.getElementById('difficultySelect');

  let game = null;
  let last = 0;
  let accum = 0;
  const step = 1 / 60;
  let fps = 60;

  function beginGame() {
    game = new PM.Game(canvas, hud, {
      mode: modeSel.value,
      character: charSel.value,
      difficulty: diffSel.value
    });
    menu.classList.add('hidden');
    shell.classList.remove('hidden');
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function backToMenu() {
    if (game) game.running = false;
    game = null;
    shell.classList.add('hidden');
    menu.classList.remove('hidden');
  }

  function loop(ts) {
    if (!game) return;
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    fps = 1 / Math.max(dt, 1e-5);
    accum += dt;
    while (accum >= step) {
      game.update(step);
      accum -= step;
    }
    game.draw(ts);
    PM.UI.updateHUD(game, hud);
    PM.UI.drawDebug(game.ctx, game, fps);
    if (game.running) requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', beginGame);

  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      backToMenu();
      return;
    }
    if (!game) return;

    const dirMap = {
      arrowup: { x: 0, y: -1 },
      w: { x: 0, y: -1 },
      arrowdown: { x: 0, y: 1 },
      s: { x: 0, y: 1 },
      arrowleft: { x: -1, y: 0 },
      a: { x: -1, y: 0 },
      arrowright: { x: 1, y: 0 },
      d: { x: 1, y: 0 }
    };

    if (dirMap[k]) game.handleInputDir(dirMap[k]);
    if (k === ' ') game.activateAbility();
    if (k === 'f1') {
      e.preventDefault();
      game.debug = !game.debug;
    }
    if (k === 'n') game.nextLevel();
    if (k === 'r') game.resetLevel(true);
    if (k === '1') game.setDifficulty('easy');
    if (k === '2') game.setDifficulty('medium');
    if (k === '3') game.setDifficulty('hard');
    if (k === '4') game.setDifficulty('terror');
  });
})();
