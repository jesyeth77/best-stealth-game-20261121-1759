// All drawing for NIGHTSHIFT: the floor, crates and walls, vision cones raycast
// so they stop at cover, the player and guards, the HUD panel, and every
// screen (title, briefing, pause, level clear, caught, victory). Canvas 2D,
// everything procedural, no images.
import { CONFIG, PALETTE } from './config.js';
import { blocksSight } from './levels.js';
import { clamp, dist } from './random.js';
import { GUARD_STATE, maxAlert, anyChase } from './world.js';

const TAU = Math.PI * 2;

// March one vision ray from (x, y) along `angle` until it hits sight-blocking
// terrain or the guard's view range. Returns the hit point.
function castRay(parsed, x, y, angle, maxLen) {
  const step = 6;
  const dx = Math.cos(angle) * step;
  const dy = Math.sin(angle) * step;
  let px = x;
  let py = y;
  for (let travelled = 0; travelled < maxLen; travelled += step) {
    const nx = px + dx;
    const ny = py + dy;
    const tx = Math.floor((nx - CONFIG.fieldX) / CONFIG.tile);
    const ty = Math.floor((ny - CONFIG.fieldY) / CONFIG.tile);
    if (blocksSight(parsed, tx, ty)) return { x: px, y: py };
    px = nx;
    py = ny;
  }
  return { x: px, y: py };
}

function drawCone(ctx, parsed, guard) {
  const rays = 26;
  const half = CONFIG.guard.fovHalf;
  const range = CONFIG.guard.viewRange;
  const fill =
    guard.state === GUARD_STATE.CHASE
      ? PALETTE.guardConeAlert
      : guard.alert > 40
        ? PALETTE.guardConeSuspicious
        : PALETTE.guardCone;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  for (let i = 0; i <= rays; i += 1) {
    const angle = guard.angle - half + ((2 * half * i) / rays);
    const hit = castRay(parsed, guard.x, guard.y, angle, range);
    ctx.lineTo(hit.x, hit.y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 220, 120, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawFloor(ctx, parsed) {
  for (let y = 0; y < CONFIG.rows; y += 1) {
    for (let x = 0; x < CONFIG.cols; x += 1) {
      const px = CONFIG.fieldX + x * CONFIG.tile;
      const py = CONFIG.fieldY + y * CONFIG.tile;
      const key = `${x},${y}`;
      if (parsed.walls.has(key)) continue; // walls drawn later, above the cones
      const shadowed = parsed.shadow.has(key);
      const alt = (x + y) % 2 === 0;
      ctx.fillStyle = shadowed
        ? alt
          ? PALETTE.floorShadow
          : PALETTE.floorShadowAlt
        : alt
          ? PALETTE.floorLit
          : PALETTE.floorLitAlt;
      ctx.fillRect(px, py, CONFIG.tile, CONFIG.tile);
      if (shadowed) {
        ctx.fillStyle = 'rgba(120, 160, 255, 0.05)';
        ctx.fillRect(px + 3, py + 3, CONFIG.tile - 6, CONFIG.tile - 6);
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, CONFIG.tile - 1, CONFIG.tile - 1);
    }
  }
}

function drawCover(ctx, parsed) {
  for (const key of parsed.crates) {
    const [x, y] = key.split(',').map(Number);
    const px = CONFIG.fieldX + x * CONFIG.tile;
    const py = CONFIG.fieldY + y * CONFIG.tile;
    ctx.fillStyle = PALETTE.crateDark;
    ctx.fillRect(px + 2, py + 2, CONFIG.tile - 4, CONFIG.tile - 4);
    ctx.fillStyle = PALETTE.crate;
    ctx.fillRect(px + 5, py + 5, CONFIG.tile - 10, CONFIG.tile - 10);
    ctx.strokeStyle = PALETTE.crateEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 5.5, py + 5.5, CONFIG.tile - 11, CONFIG.tile - 11);
    ctx.beginPath();
    ctx.moveTo(px + 5, py + 5);
    ctx.lineTo(px + CONFIG.tile - 5, py + CONFIG.tile - 5);
    ctx.moveTo(px + CONFIG.tile - 5, py + 5);
    ctx.lineTo(px + 5, py + CONFIG.tile - 5);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (const key of parsed.walls) {
    const [x, y] = key.split(',').map(Number);
    const px = CONFIG.fieldX + x * CONFIG.tile;
    const py = CONFIG.fieldY + y * CONFIG.tile;
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(px, py, CONFIG.tile, CONFIG.tile);
    ctx.fillStyle = PALETTE.wallTop;
    ctx.fillRect(px, py, CONFIG.tile, 6);
    ctx.strokeStyle = PALETTE.wallEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, CONFIG.tile - 1, CONFIG.tile - 1);
  }
}

function drawExit(ctx, world, time) {
  const exit = world.exit;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  ctx.save();
  ctx.translate(exit.x, exit.y);
  ctx.fillStyle = world.exit.open ? PALETTE.exit : '#5a6b7a';
  ctx.strokeStyle = world.exit.open ? `rgba(39, 224, 160, ${0.5 + 0.5 * pulse})` : 'rgba(120, 140, 160, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0a0d12';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(world.exit.open ? 'EXIT' : 'LOCK', 0, 1);
  ctx.restore();
}

function drawChips(ctx, world, time) {
  for (const chip of world.chips) {
    if (chip.taken) continue;
    const bob = Math.sin(time * 2.4 + chip.x * 0.13) * 2;
    ctx.save();
    ctx.translate(chip.x, chip.y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.chip;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.strokeStyle = '#8a6a10';
    ctx.lineWidth = 2;
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.restore();
    ctx.fillStyle = '#0a0d12';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('D', chip.x, chip.y + bob + 0.5);
  }
  if (world.keycard && !world.keycard.taken) {
    const bob = Math.sin(time * 2.4 + 2) * 2;
    ctx.save();
    ctx.translate(world.keycard.x, world.keycard.y + bob);
    ctx.fillStyle = PALETTE.keycard;
    ctx.fillRect(-11, -7, 22, 14);
    ctx.strokeStyle = '#1d6f86';
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, -7, 22, 14);
    ctx.fillStyle = '#0a2a33';
    ctx.fillRect(-7, -3, 6, 6);
    ctx.restore();
  }
}

function drawGuard(ctx, guard, time) {
  const bob = Math.sin(guard.stepPhase) * 1.5;
  ctx.save();
  ctx.translate(guard.x, guard.y + bob * 0.3);
  // Body: dark red circle with a lighter facing wedge.
  ctx.fillStyle = guard.state === GUARD_STATE.CHASE ? '#ff2e2e' : PALETTE.guardBody;
  ctx.beginPath();
  ctx.arc(0, 0, CONFIG.guard.radius, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = PALETTE.guardDark;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.rotate(guard.angle);
  ctx.fillStyle = '#ffd9d9';
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.lineTo(-6, -7);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  // Eyes.
  ctx.fillStyle = '#1a0505';
  ctx.beginPath();
  ctx.arc(6, -4.5, 1.8, 0, TAU);
  ctx.arc(6, 4.5, 1.8, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Alert ring + mark above the guard.
  if (guard.alert > 1) {
    const frac = guard.alert / 100;
    ctx.save();
    ctx.translate(guard.x, guard.y - 24);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = frac > 0.66 ? PALETTE.danger : frac > 0.33 ? PALETTE.warn : '#c9d4e6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 9, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    ctx.stroke();
    ctx.fillStyle = guard.state === GUARD_STATE.CHASE ? PALETTE.danger : '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(guard.state === GUARD_STATE.CHASE ? '!' : guard.state === GUARD_STATE.INVESTIGATE ? '?' : '', 0, 0.5);
    ctx.restore();
  }
}

function drawPlayer(ctx, world, time) {
  const player = world.player;
  const bob = player.moving ? Math.sin(player.stepPhase) * 1.5 : 0;
  ctx.save();
  ctx.translate(player.x, player.y + bob * 0.3);
  // Sneak ring: the quieter you move, the calmer the ring.
  ctx.strokeStyle = player.sneaking ? 'rgba(127, 212, 255, 0.85)' : 'rgba(232, 241, 255, 0.35)';
  ctx.lineWidth = player.sneaking ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius + 5, 0, TAU);
  ctx.stroke();
  // Hooded figure: pale circle, dark hood arc, facing tick.
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#5a6b84';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.rotate(player.facing);
  ctx.fillStyle = '#22303f';
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(-8, -8);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#22303f';
  ctx.beginPath();
  ctx.arc(5, -4.5, 2, 0, TAU);
  ctx.arc(5, 4.5, 2, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Thrown coin in flight.
  if (world.coinFlight) {
    const flight = world.coinFlight;
    const x = flight.fx + (flight.tx - flight.fx) * flight.t;
    const y = flight.fy + (flight.ty - flight.fy) * flight.t - Math.sin(flight.t * Math.PI) * 26;
    ctx.fillStyle = PALETTE.chip;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#8a6a10';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Expanding noise ring where a coin landed.
  if (world.noisePulse) {
    const pulse = world.noisePulse;
    const frac = 1 - pulse.left / 0.9;
    ctx.strokeStyle = `rgba(255, 211, 77, ${0.8 * (1 - frac)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pulse.x, pulse.y, 12 + frac * pulse.radius, 0, TAU);
    ctx.stroke();
  }
}

function drawPanel(ctx, world, screen) {
  const x0 = CONFIG.panelX;
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x0, 0, CONFIG.canvasWidth - x0, CONFIG.canvasHeight);
  ctx.strokeStyle = PALETTE.panelLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0, CONFIG.canvasHeight);
  ctx.stroke();

  let y = 34;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.textFaint;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('NIGHTSHIFT', x0 + 18, y);
  y += 22;
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillText(world.parsed.meta.name, x0 + 18, y);
  y += 20;
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(world.parsed.meta.sub, x0 + 18, y);

  y += 44;
  ctx.fillStyle = PALETTE.textFaint;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('DETECTION', x0 + 18, y);
  y += 12;
  const alert = maxAlert(world);
  const chasing = anyChase(world);
  const barW = CONFIG.canvasWidth - x0 - 36;
  ctx.fillStyle = '#1b2230';
  ctx.fillRect(x0 + 18, y, barW, 16);
  ctx.fillStyle = chasing ? PALETTE.danger : alert > 40 ? PALETTE.warn : PALETTE.good;
  ctx.fillRect(x0 + 18, y, barW * clamp(alert / 100, 0, 1), 16);
  ctx.strokeStyle = PALETTE.panelLine;
  ctx.strokeRect(x0 + 18.5, y + 0.5, barW - 1, 15);
  y += 34;
  ctx.fillStyle = chasing ? PALETTE.danger : PALETTE.textDim;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(chasing ? '!! SPOTTED !!' : alert > 40 ? 'Suspicious — hide!' : alert > 1 ? 'A guard notices you…' : 'Unseen', x0 + 18, y);

  const rows = [
    ['SCORE', String(world.score)],
    ['DATA CHIPS', `${world.chipsGot} / ${world.chips.length}`],
    ['COINS', '●'.repeat(Math.max(0, world.coins)) + '○'.repeat(Math.max(0, CONFIG.coin.startCount - world.coins))],
    ['LIVES', '♥'.repeat(Math.max(0, world.lives)) + '♡'.repeat(Math.max(0, CONFIG.lives - world.lives))],
    ['TIME', formatTime(world.time)],
    ['LEVEL', `${world.levelIndex + 1} / 3`],
  ];
  y += 40;
  for (const [label, value] of rows) {
    ctx.fillStyle = PALETTE.textFaint;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(label, x0 + 18, y);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(value, x0 + 118, y);
    y += 28;
  }

  y += 18;
  ctx.fillStyle = PALETTE.textFaint;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('OBJECTIVE', x0 + 18, y);
  y += 20;
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '13px system-ui, sans-serif';
  const objective = world.parsed.lockedExit && !world.exit.open
    ? 'Lift the keycard, then reach the vault exit.'
    : 'Reach the green vault exit unseen.';
  const panelInner = CONFIG.canvasWidth - x0 - 36;
  wrapText(ctx, objective, x0 + 18, y, panelInner, 18);
  y += 58;
  ctx.fillStyle = PALETTE.textFaint;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('CONTROLS', x0 + 18, y);
  y += 20;
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '12.5px system-ui, sans-serif';
  const controls = ['WASD / arrows — move', 'SHIFT — sneak (slow, quiet)', 'CLICK — throw a coin', 'P — pause   M — mute'];
  for (const line of controls) {
    ctx.fillText(line, x0 + 18, y);
    y += 19;
  }
  y += 14;
  ctx.fillStyle = PALETTE.textFaint;
  ctx.font = '12px system-ui, sans-serif';
  wrapText(ctx, 'Dark floor is shadow: guards spot you far slower there. Crates block sight.', x0 + 18, y, panelInner, 17);
  void screen;
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

function drawMessage(ctx, world) {
  if (world.messageLeft <= 0 || !world.message) return;
  ctx.save();
  ctx.globalAlpha = clamp(world.messageLeft, 0, 1);
  ctx.fillStyle = 'rgba(10, 13, 18, 0.82)';
  const w = 560;
  const x = CONFIG.fieldX + (CONFIG.cols * CONFIG.tile - w) / 2;
  const y = CONFIG.fieldY + CONFIG.rows * CONFIG.tile - 52;
  ctx.fillRect(x, y, w, 34);
  ctx.strokeStyle = PALETTE.panelLine;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 33);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(world.message, x + w / 2, y + 18);
  ctx.restore();
}

function overlay(ctx, title, lines, hint, accent) {
  ctx.fillStyle = 'rgba(6, 8, 12, 0.78)';
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = accent || PALETTE.text;
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText(title, CONFIG.canvasWidth / 2, 300);
  let y = 350;
  ctx.fillStyle = PALETTE.text;
  ctx.font = '17px system-ui, sans-serif';
  for (const line of lines) {
    ctx.fillText(line, CONFIG.canvasWidth / 2, y);
    y += 28;
  }
  if (hint) {
    y += 26;
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(hint, CONFIG.canvasWidth / 2, y);
  }
}

export function render(ctx, game) {
  const { world, screen, time } = game;
  ctx.fillStyle = PALETTE.page;
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

  if (screen === 'title') {
    drawTitleScene(ctx, time);
    return;
  }

  drawFloor(ctx, world.parsed);
  drawExit(ctx, world, time);
  drawChips(ctx, world, time);
  for (const guard of world.guards) drawCone(ctx, world.parsed, guard);
  drawCover(ctx, world.parsed);
  drawPlayer(ctx, world, time);
  for (const guard of world.guards) drawGuard(ctx, guard, time);
  drawPanel(ctx, world, screen);
  drawMessage(ctx, world);

  if (screen === 'briefing') {
    const meta = world.parsed.meta;
    overlay(ctx, meta.name, [meta.sub, '', meta.briefing, '', `Par time ${formatTime(meta.par)}  ·  ${world.parsed.chips.length} data chips on the floor`], 'ENTER or CLICK to begin the shift', PALETTE.good);
  } else if (screen === 'paused') {
    overlay(ctx, 'PAUSED', ['The floor waits for no one — except right now.', ''], 'P or CLICK to resume  ·  R to restart the level', PALETTE.textDim);
  } else if (screen === 'caught') {
    const left = world.lives;
    overlay(
      ctx,
      'CAUGHT',
      [
        'A guard laid hands on you in the light.',
        left > 0 ? `${left} ${left === 1 ? 'life' : 'lives'} left — the floor resets.` : 'That was your last life.',
      ],
      left > 0 ? 'ENTER to try the floor again' : 'ENTER for the final tally',
      PALETTE.danger,
    );
  } else if (screen === 'clear') {
    const stats = world.clearStats || { timeBonus: 0, ghost: false, chips: 0, totalChips: 0 };
    const last = world.levelIndex >= 2;
    overlay(
      ctx,
      last ? 'ALL SHIFTS DONE' : 'FLOOR CLEAR',
      [
        `Score ${world.score}  ·  time bonus +${stats.timeBonus}`,
        `Data chips ${stats.chips} / ${stats.totalChips}${stats.ghost ? '  ·  GHOST — never spotted (+300)' : ''}`,
        last ? 'You slipped through all three floors unseen enough to tell about it.' : 'The next floor is darker, and the guards are closer together.',
      ],
      last ? 'ENTER for the final tally' : 'ENTER for the next floor',
      PALETTE.good,
    );
  } else if (screen === 'over') {
    overlay(
      ctx,
      'SHIFT OVER',
      [
        `Final score ${game.totalScore}`,
        `Floors cleared ${game.floorsCleared} / 3  ·  data chips ${game.totalChips}  ·  best ghost run: ${game.ghostLevels} floor${game.ghostLevels === 1 ? '' : 's'}`,
        game.floorsCleared >= 3 ? 'Three floors, one shadow. The night is yours.' : 'The vault keeps its secrets — for tonight.',
      ],
      'ENTER or CLICK to run it back',
      game.floorsCleared >= 3 ? PALETTE.good : PALETTE.warn,
    );
  }
}

function drawTitleScene(ctx, time) {
  // A living title: the warehouse floor behind the text, a guard sweeping a
  // cone across the dark, the player waiting in shadow.
  ctx.fillStyle = PALETTE.page;
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
  const cx = CONFIG.canvasWidth / 2;
  const sweep = Math.sin(time * 0.5) * 0.9;
  ctx.save();
  ctx.translate(cx - 260, 480);
  ctx.rotate(sweep);
  ctx.fillStyle = 'rgba(255, 214, 90, 0.10)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 320, -0.61, 0.61);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#e5484d';
  ctx.beginPath();
  ctx.arc(cx - 260, 480, 16, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e8f1ff';
  ctx.beginPath();
  ctx.arc(cx + 180, 560, 13, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(127, 212, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx + 180, 560, 19, 0, TAU);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.textFaint;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('A STEALTH GAME IN THREE SHIFTS', cx, 218);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('NIGHTSHIFT', cx, 308);
  ctx.fillStyle = PALETTE.good;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('slip past the guards  ·  stay in the dark  ·  reach the vault', cx, 352);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('WASD move  ·  SHIFT sneak  ·  CLICK throws a coin to distract a guard', cx, 640);
  const blink = 0.55 + 0.45 * Math.sin(time * 3.2);
  ctx.fillStyle = `rgba(232, 238, 247, ${blink})`;
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillText('PRESS ENTER OR CLICK TO START', cx, 700);
}
