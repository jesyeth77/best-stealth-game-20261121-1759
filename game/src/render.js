// Canvas rendering for NIGHTSHIFT: the floor, the vault, the chips, the guards
// and their vision cones, the courier, and every screen (title, briefing,
// level clear, caught, game over, victory). Pure drawing — the world object is
// the only input.
import { CONFIG, PALETTE } from './config.js';
import { levelCount, levelMeta } from './levels.js';
import { tileAtPixel, inShadow, hasLineOfSight, maxAlert, GUARD_STATE } from './world.js';
import { clamp, dist, angleDelta } from './random.js';

const FONT = 'system-ui, -apple-system, sans-serif';

// Rounded-rectangle path helper.
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function centreText(ctx, text, x, y, font, colour) {
  ctx.fillStyle = colour;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function leftText(ctx, text, x, y, font, colour) {
  ctx.fillStyle = colour;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// -- The playfield ------------------------------------------------------------

// How far the guard's cone reaches in a given direction before a wall or crate
// cuts it off. Steps outward in 10 px hops.
function coneReach(world, guard, angle) {
  const step = 10;
  for (let d = step; d <= CONFIG.guard.viewRange; d += step) {
    const px = guard.x + Math.cos(angle) * d;
    const py = guard.y + Math.sin(angle) * d;
    const t = tileAtPixel(world.parsed, px, py);
    if (t.x < 0 || t.y < 0 || t.x >= CONFIG.cols || t.y >= CONFIG.rows) return d;
    if (world.parsed.walls.has(`${t.x},${t.y}`) || world.parsed.crates.has(`${t.x},${t.y}`)) {
      return d;
    }
  }
  return CONFIG.guard.viewRange;
}

function paintCone(ctx, world, guard) {
  const half = CONFIG.guard.fovHalf;
  const colour =
    guard.state === GUARD_STATE.CHASE
      ? PALETTE.guardConeAlert
      : guard.state === GUARD_STATE.INVESTIGATE
        ? PALETTE.guardConeSuspicious
        : PALETTE.guardCone;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  const rays = 14;
  for (let i = 0; i <= rays; i += 1) {
    const angle = guard.angle - half + ((2 * half) / rays) * i;
    const reach = coneReach(world, guard, angle);
    ctx.lineTo(guard.x + Math.cos(angle) * reach, guard.y + Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.fill();
}

function paintFloor(ctx, world) {
  for (let y = 0; y < CONFIG.rows; y += 1) {
    for (let x = 0; x < CONFIG.cols; x += 1) {
      const key = `${x},${y}`;
      const px = CONFIG.fieldX + x * CONFIG.tile;
      const py = CONFIG.fieldY + y * CONFIG.tile;
      if (world.parsed.walls.has(key)) {
        ctx.fillStyle = PALETTE.wall;
        ctx.fillRect(px, py, CONFIG.tile, CONFIG.tile);
        ctx.fillStyle = PALETTE.wallTop;
        ctx.fillRect(px, py, CONFIG.tile, 6);
        ctx.fillStyle = PALETTE.wallEdge;
        ctx.fillRect(px, py + CONFIG.tile - 3, CONFIG.tile, 3);
        continue;
      }
      const dark = world.parsed.shadow.has(key);
      const alt = (x + y) % 2 === 0;
      ctx.fillStyle = dark
        ? alt
          ? PALETTE.floorShadow
          : PALETTE.floorShadowAlt
        : alt
          ? PALETTE.floorLit
          : PALETTE.floorLitAlt;
      ctx.fillRect(px, py, CONFIG.tile, CONFIG.tile);
      if (world.parsed.crates.has(key)) {
        ctx.fillStyle = PALETTE.crate;
        ctx.fillRect(px + 4, py + 4, CONFIG.tile - 8, CONFIG.tile - 8);
        ctx.strokeStyle = PALETTE.crateEdge;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 4, py + 4, CONFIG.tile - 8, CONFIG.tile - 8);
        ctx.strokeStyle = PALETTE.crateDark;
        ctx.beginPath();
        ctx.moveTo(px + 4, py + 4);
        ctx.lineTo(px + CONFIG.tile - 4, py + CONFIG.tile - 4);
        ctx.moveTo(px + CONFIG.tile - 4, py + 4);
        ctx.lineTo(px + 4, py + CONFIG.tile - 4);
        ctx.stroke();
      }
    }
  }
}

function paintExit(ctx, world) {
  const { x, y, open } = world.exit;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
  ctx.fillStyle = open ? PALETTE.exit : PALETTE.exitDark;
  ctx.beginPath();
  ctx.arc(x, y, 20 + (open ? pulse * 3 : 0), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = open ? '#a9ffe4' : '#1d5c46';
  ctx.lineWidth = 3;
  ctx.stroke();
  centreText(ctx, open ? 'EXIT' : 'LOCK', x, y, `bold 11px ${FONT}`, open ? '#06281d' : '#9fe8cf');
  if (!open) {
    ctx.strokeStyle = '#9fe8cf';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function paintChips(ctx, world) {
  const t = performance.now() / 500;
  for (const chip of world.chips) {
    if (chip.taken) continue;
    const bob = Math.sin(t + chip.x * 0.7) * 2;
    ctx.save();
    ctx.translate(chip.x, chip.y + bob);
    ctx.rotate(Math.sin(t * 0.8 + chip.y) * 0.25);
    ctx.fillStyle = PALETTE.chip;
    roundRect(ctx, -9, -12, 18, 24, 3);
    ctx.fill();
    ctx.fillStyle = '#7a5b00';
    ctx.fillRect(-5, -7, 10, 3);
    ctx.fillRect(-5, 0, 10, 3);
    ctx.fillRect(-5, 7, 10, 3);
    ctx.restore();
  }
}

function paintKeycard(ctx, world) {
  const card = world.keycard;
  if (!card || card.taken) return;
  const bob = Math.sin(performance.now() / 400) * 2;
  ctx.save();
  ctx.translate(card.x, card.y + bob);
  ctx.fillStyle = PALETTE.keycard;
  roundRect(ctx, -11, -7, 22, 14, 3);
  ctx.fill();
  ctx.fillStyle = '#0b3d4a';
  ctx.fillRect(-7, -3, 8, 2);
  ctx.fillRect(-7, 2, 5, 2);
  ctx.restore();
}

function paintPlayer(ctx, world) {
  const player = world.player;
  const dark = inShadow(world.parsed, player.x, player.y);
  // A faint ring while sneaking: the courier is deliberately slow and quiet.
  if (player.sneaking) {
    ctx.strokeStyle = 'rgba(127, 212, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Little feet shuffle while moving.
  const wobble = player.moving ? Math.sin(player.stepPhase) * 3 : 0;
  const fx = Math.cos(player.facing + Math.PI / 2);
  const fy = Math.sin(player.facing + Math.PI / 2);
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.arc(player.x + fx * wobble, player.y + fy * wobble, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dark ? PALETTE.playerRing : '#3a6ea8';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Facing tick: which way the courier is looking.
  ctx.strokeStyle = PALETTE.playerRing;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + Math.cos(player.facing) * (player.radius + 6), player.y + Math.sin(player.facing) * (player.radius + 6));
  ctx.stroke();
}

function paintGuard(ctx, world, guard) {
  const wobble = Math.sin(guard.stepPhase) * 2;
  const px = Math.cos(guard.angle + Math.PI / 2);
  const py = Math.sin(guard.angle + Math.PI / 2);
  ctx.fillStyle = guard.state === GUARD_STATE.CHASE ? PALETTE.guardBody : PALETTE.guardDark;
  ctx.beginPath();
  ctx.arc(guard.x + px * wobble, guard.y + py * wobble, CONFIG.guard.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffb3b5';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Eyes: two dots facing the patrol direction.
  const ex = Math.cos(guard.angle);
  const ey = Math.sin(guard.angle);
  const sx = -ey;
  const sy = ex;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(guard.x + ex * 6 + sx * 5, guard.y + ey * 6 + sy * 5, 2.2, 0, Math.PI * 2);
  ctx.arc(guard.x + ex * 6 - sx * 5, guard.y + ey * 6 - sy * 5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // Alert meter arc above the head, plus the state mark.
  if (guard.alert > 1) {
    ctx.strokeStyle = guard.alert >= 100 ? PALETTE.danger : PALETTE.warn;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(guard.x, guard.y, CONFIG.guard.radius + 7, -Math.PI / 2, -Math.PI / 2 + (guard.alert / 100) * Math.PI * 2);
    ctx.stroke();
  }
  if (guard.state === GUARD_STATE.CHASE) {
    centreText(ctx, '!', guard.x, guard.y - 26, `bold 20px ${FONT}`, PALETTE.danger);
  } else if (guard.state === GUARD_STATE.INVESTIGATE) {
    centreText(ctx, '?', guard.x, guard.y - 26, `bold 20px ${FONT}`, PALETTE.warn);
  }
}

function paintCoinFlight(ctx, world) {
  const flight = world.coinFlight;
  if (!flight) return;
  const arc = Math.sin(flight.t * Math.PI) * 26;
  const cx = flight.fx + (flight.tx - flight.fx) * flight.t;
  const cy = flight.fy + (flight.ty - flight.fy) * flight.t - arc;
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a5b00';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function paintNoiseRing(ctx, world) {
  const pulse = world.noisePulse;
  if (!pulse) return;
  const progress = 1 - pulse.left / 0.9;
  ctx.strokeStyle = `rgba(255, 211, 77, ${0.7 * (1 - progress)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pulse.x, pulse.y, pulse.radius * progress, 0, Math.PI * 2);
  ctx.stroke();
}

// -- The HUD panel ------------------------------------------------------------

function paintPanel(ctx, world) {
  const x = CONFIG.panelX;
  const w = CONFIG.canvasWidth - x;
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x, 0, w, CONFIG.canvasHeight);
  ctx.fillStyle = PALETTE.panelLine;
  ctx.fillRect(x, 0, 1, CONFIG.canvasHeight);

  const pad = 16;
  let y = 30;
  leftText(ctx, world.parsed.meta.name, x + pad, y, `bold 20px ${FONT}`, PALETTE.text);
  y += 24;
  leftText(ctx, world.parsed.meta.sub, x + pad, y, `13px ${FONT}`, PALETTE.textDim);
  y += 34;
  leftText(ctx, `SCORE  ${world.score}`, x + pad, y, `bold 16px ${FONT}`, PALETTE.text);
  y += 26;
  leftText(ctx, `TIME  ${formatTime(world.time)}  ·  PAR ${formatTime(world.parsed.meta.par)}`, x + pad, y, `14px ${FONT}`, PALETTE.textDim);
  y += 30;
  const chipsLeft = world.chips.filter((c) => !c.taken).length;
  leftText(ctx, `CHIPS  ${world.chipsGot}/${world.chips.length}`, x + pad, y, `15px ${FONT}`, chipsLeft === 0 ? PALETTE.good : PALETTE.text);
  y += 26;
  leftText(ctx, `COINS  ${world.coins}`, x + pad, y, `15px ${FONT}`, PALETTE.text);
  y += 26;
  leftText(ctx, `LIVES  ${'♥'.repeat(Math.max(0, world.lives))}`, x + pad, y, `15px ${FONT}`, world.lives <= 1 ? PALETTE.danger : PALETTE.text);
  y += 40;
  leftText(ctx, 'DETECTION', x + pad, y, `bold 12px ${FONT}`, PALETTE.textDim);
  y += 16;
  const alert = maxAlert(world);
  ctx.fillStyle = '#1c2433';
  roundRect(ctx, x + pad, y, w - pad * 2, 12, 6);
  ctx.fill();
  ctx.fillStyle = alert >= 100 ? PALETTE.danger : alert >= 50 ? PALETTE.warn : PALETTE.good;
  if (alert > 0) {
    roundRect(ctx, x + pad, y, (w - pad * 2) * clamp(alert / 100, 0, 1), 12, 6);
    ctx.fill();
  }
  y += 40;
  leftText(ctx, world.exit.open ? 'VAULT: OPEN' : 'VAULT: LOCKED', x + pad, y, `bold 13px ${FONT}`, world.exit.open ? PALETTE.good : PALETTE.warn);
  y += 20;
  leftText(ctx, world.exit.open ? 'reach the exit' : 'find the keycard first', x + pad, y, `13px ${FONT}`, world.exit.open ? PALETTE.good : PALETTE.warn);
  y += 32;
  leftText(ctx, 'HOW TO PLAY', x + pad, y, `bold 12px ${FONT}`, PALETTE.textDim);
  y += 22;
  const hints = [
    'WASD / arrows — move',
    'Hold Shift — sneak',
    'Click — throw a coin',
    'C — coin at guard',
    'P — pause · M — mute',
  ];
  for (const hint of hints) {
    leftText(ctx, hint, x + pad, y, `13px ${FONT}`, PALETTE.textDim);
    y += 20;
  }
  y += 18;
  leftText(ctx, 'Stay out of the cones.', x + pad, y, `13px ${FONT}`, PALETTE.textFaint);
  y += 20;
  leftText(ctx, 'Shadows hide you.', x + pad, y, `13px ${FONT}`, PALETTE.textFaint);
  y += 20;
  leftText(ctx, 'Crates block sight.', x + pad, y, `13px ${FONT}`, PALETTE.textFaint);
}

function paintMessage(ctx, world) {
  if (world.messageLeft <= 0 || !world.message) return;
  const alpha = clamp(world.messageLeft, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  centreText(ctx, world.message, CONFIG.fieldX + (CONFIG.cols * CONFIG.tile) / 2, 46, `bold 22px ${FONT}`, '#ffd34d');
  ctx.restore();
}

// -- The main scene -----------------------------------------------------------

export function renderWorld(ctx, world) {
  ctx.fillStyle = PALETTE.page;
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
  paintFloor(ctx, world);
  paintExit(ctx, world);
  paintChips(ctx, world);
  paintKeycard(ctx, world);
  for (const guard of world.guards) paintCone(ctx, world, guard);
  paintCoinFlight(ctx, world);
  paintPlayer(ctx, world);
  for (const guard of world.guards) paintGuard(ctx, world, guard);
  paintNoiseRing(ctx, world);
  paintPanel(ctx, world);
  paintMessage(ctx, world);
}

// -- Screens ------------------------------------------------------------------

function dimScreen(ctx) {
  ctx.fillStyle = PALETTE.page;
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
}

export function renderTitle(ctx) {
  dimScreen(ctx);
  // A slow sweeping cone behind the title, for atmosphere.
  const cx = CONFIG.canvasWidth / 2;
  const cy = CONFIG.canvasHeight / 2 + 40;
  const sweep = Math.sin(performance.now() / 1400) * 0.9;
  ctx.fillStyle = 'rgba(255, 214, 90, 0.07)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, 320, sweep - 0.6, sweep + 0.6);
  ctx.closePath();
  ctx.fill();
  centreText(ctx, 'NIGHTSHIFT', cx, 250, `bold 84px ${FONT}`, PALETTE.text);
  centreText(ctx, 'Slip past the guards. Stay in the dark. Reach the vault.', cx, 310, `20px ${FONT}`, PALETTE.textDim);
  centreText(ctx, 'WASD / arrows to move · Hold Shift to sneak · Click to throw a coin', cx, 380, `16px ${FONT}`, PALETTE.textDim);
  centreText(ctx, 'Three shifts. Three vaults. One quiet courier.', cx, 412, `16px ${FONT}`, PALETTE.textDim);
  const blink = 0.55 + 0.45 * Math.sin(performance.now() / 350);
  ctx.save();
  ctx.globalAlpha = blink;
  centreText(ctx, 'Press ENTER to start', cx, 500, `bold 24px ${FONT}`, PALETTE.good);
  ctx.restore();
  centreText(ctx, 'A top-down stealth game · M to mute', cx, 560, `14px ${FONT}`, PALETTE.textFaint);
}

export function renderBriefing(ctx, meta, world) {
  dimScreen(ctx);
  const cx = CONFIG.canvasWidth / 2;
  centreText(ctx, meta.name, cx, 200, `bold 52px ${FONT}`, PALETTE.text);
  centreText(ctx, meta.sub, cx, 246, `20px ${FONT}`, PALETTE.textDim);
  centreText(ctx, meta.briefing, cx, 320, `17px ${FONT}`, PALETTE.textDim);
  centreText(ctx, `Par time ${formatTime(meta.par)} · ${world ? world.chips.length : 0} data chips on the floor`, cx, 360, `16px ${FONT}`, PALETTE.textDim);
  const blink = 0.55 + 0.45 * Math.sin(performance.now() / 350);
  ctx.save();
  ctx.globalAlpha = blink;
  centreText(ctx, 'Press ENTER to begin the shift', cx, 470, `bold 22px ${FONT}`, PALETTE.good);
  ctx.restore();
}

function statLine(ctx, label, value, y) {
  const cx = CONFIG.canvasWidth / 2;
  centreText(ctx, `${label}  ${value}`, cx, y, `20px ${FONT}`, PALETTE.text);
}

export function renderLevelClear(ctx, world) {
  dimScreen(ctx);
  const cx = CONFIG.canvasWidth / 2;
  const stats = world.clearStats || { time: world.time, par: world.parsed.meta.par, timeBonus: 0, ghost: false, ghostBonus: 0 };
  centreText(ctx, 'SHIFT COMPLETE', cx, 200, `bold 52px ${FONT}`, PALETTE.good);
  statLine(ctx, 'Time', `${formatTime(stats.time)}  (par ${formatTime(stats.par)})`, 280);
  statLine(ctx, 'Time bonus', `+${stats.timeBonus}`, 316);
  if (stats.ghost) statLine(ctx, 'Ghost bonus — never spotted', `+${stats.ghostBonus}`, 352);
  statLine(ctx, 'Score', `${world.score}`, 400);
  const blink = 0.55 + 0.45 * Math.sin(performance.now() / 350);
  ctx.save();
  ctx.globalAlpha = blink;
  centreText(ctx, levelCount() > world.levelIndex + 1 ? 'Press ENTER for the next shift' : 'Press ENTER to see the result', cx, 500, `bold 22px ${FONT}`, PALETTE.good);
  ctx.restore();
}

export function renderCaught(ctx, world) {
  dimScreen(ctx);
  const cx = CONFIG.canvasWidth / 2;
  centreText(ctx, 'CAUGHT!', cx, 240, `bold 64px ${FONT}`, PALETTE.danger);
  centreText(ctx, world.lives > 0 ? `${world.lives} ${world.lives === 1 ? 'life' : 'lives'} left` : 'No lives left', cx, 310, `20px ${FONT}`, PALETTE.textDim);
  const blink = 0.55 + 0.45 * Math.sin(performance.now() / 350);
  ctx.save();
  ctx.globalAlpha = blink;
  centreText(ctx, world.lives > 0 ? 'Press R to retry the shift' : 'Press ENTER for the title screen', cx, 420, `bold 22px ${FONT}`, PALETTE.text);
  ctx.restore();
}

export function renderGameOver(ctx, totalScore) {
  dimScreen(ctx);
  const cx = CONFIG.canvasWidth / 2;
  centreText(ctx, 'GAME OVER', cx, 260, `bold 64px ${FONT}`, PALETTE.danger);
  centreText(ctx, `Final score ${totalScore}`, cx, 330, `22px ${FONT}`, PALETTE.textDim);
  const blink = 0.55 + 0.45 * Math.sin(performance.now() / 350);
  ctx.save();
  ctx.globalAlpha = blink;
  centreText(ctx, 'Press ENTER for the title screen', cx, 440, `bold 22px ${FONT}`, PALETTE.text);
  ctx.restore();
}

export function renderVictory(ctx, totalScore) {
  dimScreen(ctx);
  const cx = CONFIG.canvasWidth / 2;
  centreText(ctx, 'ALL SHIFTS COMPLETE', cx, 240, `bold 52px ${FONT}`, PALETTE.good);
  centreText(ctx, 'Three vaults, one quiet courier — and nobody ever saw you coming.', cx, 300, `20px ${FONT}`, PALETTE.textDim);
  centreText(ctx, `Final score ${totalScore}`, cx, 350, `22px ${FONT}`, PALETTE.text);
  const blink = 0.55 + 0.45 * Math.sin(performance.now() / 350);
  ctx.save();
  ctx.globalAlpha = blink;
  centreText(ctx, 'Press ENTER for the title screen', cx, 460, `bold 22px ${FONT}`, PALETTE.text);
  ctx.restore();
}

// -- The single entry the boot code calls ------------------------------------
// Dispatches on the session screen: title and briefing are full screens, play
// and paused draw the live floor, clear/caught/over are end-of-floor screens.
export function render(ctx, game) {
  const world = game.world;
  switch (game.screen) {
    case 'title':
      renderTitle(ctx);
      break;
    case 'briefing':
      renderBriefing(ctx, levelMeta(world.levelIndex), world);
      break;
    case 'play':
      renderWorld(ctx, world);
      break;
    case 'paused':
      renderWorld(ctx, world);
      ctx.fillStyle = 'rgba(5, 8, 12, 0.6)';
      ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
      centreText(ctx, 'PAUSED', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 - 6, `bold 40px ${FONT}`, PALETTE.text);
      centreText(ctx, 'P or Esc to resume — M to mute', CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2 + 30, `18px ${FONT}`, PALETTE.textDim);
      break;
    case 'clear':
      renderLevelClear(ctx, world);
      break;
    case 'caught':
      renderCaught(ctx, world);
      break;
    case 'over':
      if (game.floorsCleared >= levelCount()) renderVictory(ctx, game.totalScore);
      else renderGameOver(ctx, game.totalScore);
      break;
    default:
      renderWorld(ctx, world);
  }
}
