// NIGHTSHIFT — boot, screen flow and the frame loop.
// Screens: title -> briefing -> play -> (paused | caught | clear) -> over.
// The session object is exposed as window.__game for the shot driver and live
// play-tests; window.__shotReady flips true when a ?shot= scene has settled.
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

const query = new URLSearchParams(window.location.search);
const shotName = query.get('shot');
const seed = Number(query.get('seed') || '1') || 1;

const input = createInput(canvas);
const audio = createAudio();

// Hiding the tab mid-shift pauses the game so you don't get caught while away.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session.screen === 'play') session.screen = 'paused';
});

const session = {
  screen: 'title',
  world: createWorld(0, makeRng((seed * 2654435761) >>> 0)),
  time: 0,
  totalScore: 0,
  floorsCleared: 0,
  totalChips: 0,
  ghostLevels: 0,
  lives: CONFIG.lives,
  shot: shotName || null,
  shotScript: null,
  shotReady: false,
  muted: false,
  stepTimer: 0,
  wasChasing: false,
};
window.__game = session;
Object.defineProperty(window, '__shotReady', { get: () => session.shotReady });

if (shotName) applyShot(session, shotName, seed);

function openLevel(index) {
  session.world = createWorld(index, makeRng((Date.now() % 2147483647) >>> 0));
  session.world.lives = session.lives; // lives carry across retries of a floor
  session.screen = 'briefing';
  session.shotReady = false;
}

function beginRun() {
  session.totalScore = 0;
  session.floorsCleared = 0;
  session.totalChips = 0;
  session.ghostLevels = 0;
  session.lives = CONFIG.lives;
  openLevel(0);
}

function isConfirm(pressed) {
  return pressed.has('confirm');
}

// One frame of live play on the 'play' screen: coin throws, the world step,
// footstep ticks, the chase sting, and the caught / cleared transitions.
function playFrame(dt, pressed) {
  if (pressed.has('pause')) {
    session.screen = 'paused';
    return;
  }
  const click = input.takeClick();
  if (click && click.x < CONFIG.panelX) {
    if (throwCoin(session.world, click.x, click.y)) audio.coin();
  }
  if (pressed.has('coin')) {
    const player = session.world.player;
    const tx = player.x + Math.cos(player.facing) * 200;
    const ty = player.y + Math.sin(player.facing) * 200;
    if (throwCoin(session.world, tx, ty)) audio.coin();
  }
  updateWorld(session.world, input.snapshot(), dt);
  // Footstep ticks, quieter while sneaking.
  if (session.world.player.moving) {
    session.stepTimer -= dt;
    if (session.stepTimer <= 0) {
      audio.step(session.world.player.sneaking);
      session.stepTimer = session.world.player.sneaking ? 0.42 : 0.3;
    }
  }
  // One-shot sting on the moment a chase begins.
  const chasing = anyChase(session.world);
  if (chasing && !session.wasChasing) audio.alert();
  session.wasChasing = chasing;
  if (session.world.caught) {
    audio.caught();
    session.lives = session.world.lives;
    session.screen = 'caught';
  } else if (session.world.levelDone) {
    audio.levelClear();
    session.totalScore += session.world.score;
    session.floorsCleared += 1;
    session.totalChips += session.world.chipsGot;
    if (session.world.clearStats && session.world.clearStats.ghost) session.ghostLevels += 1;
    session.screen = 'clear';
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - session.lastNow) / 1000 || 0.016);
  session.lastNow = now;
  session.time += dt;
  const pressed = input.takePressed();

  if (pressed.has('mute')) {
    session.muted = audio.toggleMute();
  }
  if (pressed.has('restart') && (session.screen === 'play' || session.screen === 'paused')) {
    openLevel(session.world.levelIndex);
  }

  // Screenshot scenes run their own script and skip the menu flow entirely.
  if (session.shot) {
    if (!session.shotReady) updateShot(session, dt);
    render(ctx, session);
    return;
  }

  switch (session.screen) {
    case 'title':
      if (isConfirm(pressed) || input.takeClick()) {
        audio.unlock();
        audio.startDrone();
        beginRun();
      }
      break;
    case 'briefing':
      if (isConfirm(pressed) || input.takeClick()) {
        audio.unlock();
        session.screen = 'play';
      }
      break;
    case 'play':
      playFrame(dt, pressed);
      break;
    case 'paused':
      if (pressed.has('pause') || isConfirm(pressed) || input.takeClick()) {
        session.screen = 'play';
      }
      break;
    case 'caught':
      if (isConfirm(pressed) || input.takeClick()) {
        if (session.lives > 0) openLevel(session.world.levelIndex);
        else session.screen = 'over';
      }
      break;
    case 'clear':
      if (isConfirm(pressed) || input.takeClick()) {
        if (session.world.levelIndex + 1 < levelCount()) openLevel(session.world.levelIndex + 1);
        else session.screen = 'over';
      }
      break;
    case 'over':
      if (isConfirm(pressed) || input.takeClick()) beginRun();
      break;
  }

  render(ctx, session);
}

session.lastNow = performance.now();
requestAnimationFrame(frame);
