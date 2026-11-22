// NIGHTSHIFT — boot, screen flow and the frame loop.
// Screens: title -> briefing -> play -> (paused | caught | clear) -> over.
// The game exposes window.__game for the shot driver and live play-tests:
// window.__shotReady flips true when a ?shot= scene has settled.
import { CONFIG } from './config.js';
import { createWorld, updateWorld, throwCoin, anyChase } from './world.js';
import { levelCount } from './levels.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { render } from './render.js';
import { makeRng } from './random.js';
import { applyShot, updateShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CONFIG.canvasWidth;
canvas.height = CONFIG.canvasHeight;
canvas.tabIndex = 0;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;

const input = createInput(canvas);
const audio = createAudio();

// Hiding the tab mid-shift pauses the game so you don't get caught while away.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'play') game.screen = 'paused';
});

const game = {
  screen: 'title',
  world: createWorld(0, makeRng((seed * 2654435761) >>> 0)),
  time: 0,
  totalScore: 0,
  floorsCleared: 0,
  totalChips: 0,
  ghostLevels: 0,
  lives: CONFIG.lives,
  shot: shot || null,
  shotScript: null,
  shotReady: false,
  muted: false,
  stepTimer: 0,
  wasChasing: false,
};
window.__game = game;
Object.defineProperty(window, '__shotReady', { get: () => game.shotReady });

if (shot) applyShot(game, shot, seed);

function startLevel(index) {
  game.world = createWorld(index, makeRng((Date.now() % 2147483647) >>> 0));
  game.world.lives = game.lives; // lives carry across retries of a floor
  game.screen = 'briefing';
  game.shotReady = false;
}

function startRun() {
  game.totalScore = 0;
  game.floorsCleared = 0;
  game.totalChips = 0;
  game.ghostLevels = 0;
  game.lives = CONFIG.lives;
  startLevel(0);
}

function confirmPressed(pressed) {
  return pressed.has('confirm');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - game.lastNow) / 1000 || 0.016);
  game.lastNow = now;
  game.time += dt;
  const pressed = input.takePressed();

  if (pressed.has('mute')) {
    game.muted = audio.toggleMute();
  }
  if (pressed.has('restart') && (game.screen === 'play' || game.screen === 'paused')) {
    startLevel(game.world.levelIndex);
  }

  if (game.shot) {
    if (!game.shotReady) updateShot(game, dt);
    render(ctx, game);
    return;
  }

  if (game.screen === 'title') {
    if (confirmPressed(pressed) || input.takeClick()) {
      audio.unlock();
      audio.startDrone();
      startRun();
    }
  } else if (game.screen === 'briefing') {
    if (confirmPressed(pressed) || input.takeClick()) {
      audio.unlock();
      game.screen = 'play';
    }
  } else if (game.screen === 'play') {
    if (pressed.has('pause')) {
      game.screen = 'paused';
    } else {
      const click = input.takeClick();
      if (click && click.x < CONFIG.panelX) {
        if (throwCoin(game.world, click.x, click.y)) audio.coin();
      }
      if (pressed.has('coin')) {
        const player = game.world.player;
        const tx = player.x + Math.cos(player.facing) * 200;
        const ty = player.y + Math.sin(player.facing) * 200;
        if (throwCoin(game.world, tx, ty)) audio.coin();
      }
      const snapshot = input.snapshot();
      updateWorld(game.world, snapshot, dt);
      // Footstep ticks, quieter while sneaking.
      if (game.world.player.moving) {
        game.stepTimer -= dt;
        if (game.stepTimer <= 0) {
          audio.step(game.world.player.sneaking);
          game.stepTimer = game.world.player.sneaking ? 0.42 : 0.3;
        }
      }
      // One-shot stings on state changes.
      const chasing = anyChase(game.world);
      if (chasing && !game.wasChasing) audio.alert();
      game.wasChasing = chasing;
      if (game.world.caught) {
        audio.caught();
        game.lives = game.world.lives;
        game.screen = 'caught';
      } else if (game.world.levelDone) {
        audio.levelClear();
        game.totalScore += game.world.score;
        game.floorsCleared += 1;
        game.totalChips += game.world.chipsGot;
        if (game.world.clearStats && game.world.clearStats.ghost) game.ghostLevels += 1;
        game.screen = 'clear';
      }
    }
  } else if (game.screen === 'paused') {
    if (pressed.has('pause') || confirmPressed(pressed) || input.takeClick()) {
      game.screen = 'play';
    }
  } else if (game.screen === 'caught') {
    if (confirmPressed(pressed) || input.takeClick()) {
      if (game.lives > 0) {
        startLevel(game.world.levelIndex);
      } else {
        game.screen = 'over';
      }
    }
  } else if (game.screen === 'clear') {
    if (confirmPressed(pressed) || input.takeClick()) {
      if (game.world.levelIndex + 1 < levelCount()) {
        startLevel(game.world.levelIndex + 1);
      } else {
        game.screen = 'over';
      }
    }
  } else if (game.screen === 'over') {
    if (confirmPressed(pressed) || input.takeClick()) {
      startRun();
    }
  }

  render(ctx, game);
}

game.lastNow = performance.now();
requestAnimationFrame(frame);
