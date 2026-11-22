// World state and update logic for NIGHTSHIFT: movement and collision, guard AI
// (patrol / investigate / chase), vision cones with line of sight, the detection
// meter, footstep noise, and coin distractions. Pure logic — no canvas calls,
// so the headless sim can run it in Node.
import { CONFIG } from './config.js';
import { parseLevel, tileCenter, isSolidTile, blocksSight } from './levels.js';
import { clamp, dist, angleTo, angleDelta } from './random.js';

export const GUARD_STATE = { PATROL: 'patrol', INVESTIGATE: 'investigate', CHASE: 'chase' };

// Which tile holds a playfield pixel.
export function tileAtPixel(parsed, px, py) {
  return {
    x: Math.floor((px - CONFIG.fieldX) / CONFIG.tile),
    y: Math.floor((py - CONFIG.fieldY) / CONFIG.tile),
  };
}

// Is this point standing on a dark (shadow) tile?
export function inShadow(parsed, px, py) {
  const t = tileAtPixel(parsed, px, py);
  return parsed.shadow.has(`${t.x},${t.y}`);
}

// Line of sight between two points, stepped in 8 px hops. Any sight-blocking
// tile (wall or crate) on the way breaks it.
export function hasLineOfSight(parsed, ax, ay, bx, by) {
  const steps = Math.max(1, Math.ceil(dist(ax, ay, bx, by) / 8));
  for (let i = 1; i < steps; i += 1) {
    const t = tileAtPixel(parsed, ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
    if (blocksSight(parsed, t.x, t.y)) return false;
  }
  return true;
}

// Does this guard see the player right now? Range, cone angle and LOS must all
// agree. Returns a 0..1 visibility factor (1 = dead centre, close, lit).
export function guardSeesPlayer(parsed, guard, player) {
  const d = dist(guard.x, guard.y, player.x, player.y);
  if (d > CONFIG.guard.viewRange) return 0;
  const toPlayer = angleTo(guard.x, guard.y, player.x, player.y);
  const off = Math.abs(angleDelta(guard.angle, toPlayer));
  if (off > CONFIG.guard.fovHalf) return 0;
  if (!hasLineOfSight(parsed, guard.x, guard.y, player.x, player.y)) return 0;
  const centre = 1 - off / CONFIG.guard.fovHalf;
  const closeness = 1 - d / CONFIG.guard.viewRange;
  return clamp(0.35 + 0.65 * centre * (0.5 + 0.5 * closeness), 0, 1);
}

// Build a fresh floor: parse the map, place the player, spawn the guards.
export function createWorld(levelIndex, rng) {
  const parsed = parseLevel(levelIndex);
  const start = tileCenter(parsed.playerStart.x, parsed.playerStart.y);
  const exit = tileCenter(parsed.exit.x, parsed.exit.y);
  const guards = parsed.guardDefs.map((def, index) => {
    const spawn = tileCenter(def.spawn[0], def.spawn[1]);
    const waypoints = def.waypoints.map(([x, y]) => tileCenter(x, y));
    const first = waypoints[0];
    return {
      id: index,
      x: spawn.x,
      y: spawn.y,
      angle: angleTo(spawn.x, spawn.y, first.x, first.y),
      state: GUARD_STATE.PATROL,
      waypointIndex: 0,
      waypoints,
      pauseLeft: def.pause ?? CONFIG.guard.waypointPause,
      pauseAtWaypoint: def.pause ?? CONFIG.guard.waypointPause,
      alert: 0,
      suspicionLeft: 0,
      investigateX: 0,
      investigateY: 0,
      scanAngle: 0,
      scanDir: 1,
      lastSeenX: 0,
      lastSeenY: 0,
      stepPhase: rng() * Math.PI * 2,
    };
  });
  return {
    levelIndex,
    parsed,
    rng,
    player: {
      x: start.x,
      y: start.y,
      radius: CONFIG.player.radius,
      sneaking: false,
      moving: false,
      facing: 0,
      stepPhase: 0,
    },
    guards,
    exit: { x: exit.x, y: exit.y, open: !parsed.lockedExit },
    chips: parsed.chips.map((chip) => ({ ...tileCenter(chip.x, chip.y), taken: false })),
    keycard: parsed.keycard
      ? { ...tileCenter(parsed.keycard.x, parsed.keycard.y), taken: false }
      : null,
    coins: CONFIG.coin.startCount,
    coinFlight: null,
    score: 0,
    chipsGot: 0,
    lives: CONFIG.lives,
    time: 0,
    everAlarmed: false, // a guard hit 100 this floor (kills the ghost bonus)
    levelDone: false,
    caught: false,
    message: '',
    messageLeft: 0,
    noisePulse: null, // {x, y, radius, left}: expanding ring where a coin landed
  };
}

// Slide a circular body against solid tiles, axis by axis, so it slides along
// walls instead of sticking on corners.
function slideBody(parsed, body, dx, dy) {
  const r = body.radius;
  const nx = body.x + dx;
  if (!bodyHitsSolid(parsed, nx, body.y, r)) body.x = nx;
  if (!bodyHitsSolid(parsed, body.x, body.y + dy, r)) body.y += dy;
}

function bodyHitsSolid(parsed, px, py, r) {
  // The four corners of the body's bounding box, in tile space.
  const corners = [
    [px - r, py - r],
    [px + r, py - r],
    [px - r, py + r],
    [px + r, py + r],
  ];
  for (const [cx, cy] of corners) {
    const t = tileAtPixel(parsed, cx, cy);
    if (isSolidTile(parsed, t.x, t.y)) return true;
  }
  return false;
}

export function updateWorld(world, input, dt) {
  if (world.levelDone || world.caught) return;
  world.time += dt;
  if (world.messageLeft > 0) world.messageLeft -= dt;
  if (world.noisePulse) {
    world.noisePulse.left -= dt;
    if (world.noisePulse.left <= 0) world.noisePulse = null;
  }

  stepPlayer(world, input, dt);
  stepCoin(world, dt);
  stepGuards(world, dt);
  collectPickups(world);
  checkExit(world);
}

function stepPlayer(world, input, dt) {
  const player = world.player;
  const speed = input.sneak ? CONFIG.player.sneakSpeed : CONFIG.player.walkSpeed;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  player.moving = len > 0;
  player.sneaking = !!input.sneak;
  if (len <= 0) return;
  mx /= len;
  my /= len;
  player.facing = Math.atan2(my, mx);
  player.stepPhase += dt * (input.sneak ? 7 : 11);
  slideBody(world.parsed, player, mx * speed * dt, my * speed * dt);
  // Walking is loud: a patrolling guard nearby turns toward the noise.
  const noiseRadius = input.sneak ? CONFIG.player.noiseSneak : CONFIG.player.noiseWalk;
  if (noiseRadius <= 40) return; // sneaking is quiet enough to stay unheard
  for (const guard of world.guards) {
    if (guard.state !== GUARD_STATE.PATROL) continue;
    const d = dist(guard.x, guard.y, player.x, player.y);
    if (d >= noiseRadius || guard.alert >= 55) continue;
    guard.alert = Math.min(guard.alert + dt * 14, 55);
    guard.investigateX = player.x;
    guard.investigateY = player.y;
    guard.state = GUARD_STATE.INVESTIGATE;
    guard.suspicionLeft = 5;
  }
}

function stepCoin(world, dt) {
  const flight = world.coinFlight;
  if (!flight) return;
  flight.t += dt / 0.45;
  if (flight.t < 1) return;
  world.coinFlight = null;
  world.noisePulse = { x: flight.tx, y: flight.ty, radius: CONFIG.coin.noiseRadius, left: 0.9 };
  for (const guard of world.guards) {
    if (guard.state === GUARD_STATE.CHASE) continue;
    const d = dist(guard.x, guard.y, flight.tx, flight.ty);
    if (d >= CONFIG.coin.noiseRadius) continue;
    guard.state = GUARD_STATE.INVESTIGATE;
    guard.investigateX = flight.tx;
    guard.investigateY = flight.ty;
    guard.suspicionLeft = 6;
  }
}
// Per-second detection fill for a guard that can see the player.
function detectionRate(world, guard, visibility) {
  const dark = inShadow(world.parsed, world.player.x, world.player.y);
  let rate = dark ? CONFIG.guard.detectShadow : CONFIG.guard.detectLit;
  if (world.player.sneaking) rate *= CONFIG.guard.detectSneak;
  const d = dist(guard.x, guard.y, world.player.x, world.player.y);
  if (d < 70) rate *= CONFIG.guard.detectClose;
  return rate * (0.5 + 0.5 * visibility);
}

// Walk a guard toward a point at the given speed, turning to face travel.
function walkGuardTo(world, guard, tx, ty, speed, dt) {
  const d = dist(guard.x, guard.y, tx, ty);
  if (d < 4) return true;
  const step = Math.min(speed * dt, d);
  const heading = angleTo(guard.x, guard.y, tx, ty);
  guard.x += ((tx - guard.x) / d) * step;
  guard.y += ((ty - guard.y) / d) * step;
  guard.angle = heading;
  guard.stepPhase += dt * 9;
  return false;
}

function stepGuards(world, dt) {
  for (const guard of world.guards) {
    const seen = guardSeesPlayer(world.parsed, guard, world.player);
    if (seen > 0) {
      guard.lastSeenX = world.player.x;
      guard.lastSeenY = world.player.y;
      guard.alert = clamp(guard.alert + detectionRate(world, guard, seen) * dt, 0, 100);
      if (guard.alert >= 100 && guard.state !== GUARD_STATE.CHASE) {
        guard.state = GUARD_STATE.CHASE;
        guard.suspicionLeft = CONFIG.guard.suspicionTime;
        world.everAlarmed = true;
        world.message = 'SPOTTED! Run!';
        world.messageLeft = 1.6;
      }
    } else if (guard.state === GUARD_STATE.CHASE) {
      guard.alert = Math.max(0, guard.alert - CONFIG.guard.alarmDecay * dt);
      guard.suspicionLeft -= dt;
      if (guard.suspicionLeft <= 0 && guard.alert < 60) {
        guard.state = GUARD_STATE.INVESTIGATE;
        guard.investigateX = guard.lastSeenX;
        guard.investigateY = guard.lastSeenY;
        guard.suspicionLeft = 5;
      }
    } else {
      guard.alert = Math.max(0, guard.alert - CONFIG.guard.decay * dt);
    }

    if (guard.state === GUARD_STATE.PATROL) {
      const target = guard.waypoints[guard.waypointIndex];
      if (guard.pauseLeft > 0) {
        guard.pauseLeft -= dt;
        // Bored sweeping: the cone swings a little while the guard waits.
        guard.angle += Math.sin(world.time * 1.4 + guard.id * 2.1) * dt * 0.35;
      } else if (walkGuardTo(world, guard, target.x, target.y, CONFIG.guard.patrolSpeed, dt)) {
        guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
        guard.pauseLeft = guard.pauseAtWaypoint;
      }
    } else if (guard.state === GUARD_STATE.INVESTIGATE) {
      if (walkGuardTo(world, guard, guard.investigateX, guard.investigateY, CONFIG.guard.investigateSpeed, dt)) {
        // Arrived and found nothing: scan the room, then give up.
        guard.scanAngle += guard.scanDir * dt * 1.6;
        guard.angle += guard.scanDir * dt * 1.6;
        if (Math.abs(guard.scanAngle) > 1.9) guard.scanDir *= -1;
        guard.suspicionLeft -= dt;
        if (guard.suspicionLeft <= 0) {
          guard.state = GUARD_STATE.PATROL;
          guard.scanAngle = 0;
          guard.alert = Math.min(guard.alert, 45);
        }
      } else {
        guard.suspicionLeft -= dt;
        if (guard.suspicionLeft <= 0) {
          guard.state = GUARD_STATE.PATROL;
          guard.scanAngle = 0;
          guard.alert = Math.min(guard.alert, 45);
        }
      }
    } else {
      // CHASE: run straight at the player (through nothing, but fast).
      walkGuardTo(world, guard, world.player.x, world.player.y, CONFIG.guard.chaseSpeed, dt);
      const d = dist(guard.x, guard.y, world.player.x, world.player.y);
      if (d < CONFIG.guard.catchDistance) {
        world.caught = true;
        world.lives -= 1;
        return; // stop processing the other guards this frame
      }
    }
  }
}

function collectPickups(world) {
  const player = world.player;
  for (const chip of world.chips) {
    if (chip.taken) continue;
    if (dist(player.x, player.y, chip.x, chip.y) >= 26) continue;
    chip.taken = true;
    world.chipsGot += 1;
    world.score += CONFIG.scoring.chip;
    world.message = `Data chip +${CONFIG.scoring.chip}`;
    world.messageLeft = 1.2;
  }
  const card = world.keycard;
  if (card && !card.taken && dist(player.x, player.y, card.x, card.y) < 28) {
    card.taken = true;
    world.exit.open = true;
    world.score += CONFIG.scoring.keycard;
    world.message = `Keycard +${CONFIG.scoring.keycard} — vault unlocked`;
    world.messageLeft = 2.0;
  }
}

function checkExit(world) {
  const player = world.player;
  if (dist(player.x, player.y, world.exit.x, world.exit.y) >= 30) return;
  if (!world.exit.open) {
    world.message = 'Vault locked — find the keycard first';
    world.messageLeft = 1.2;
    return;
  }
  world.levelDone = true;
  const par = world.parsed.meta.par;
  const timeBonus = Math.max(0, Math.round((par - world.time) * CONFIG.scoring.timeBonusPerSecond));
  world.score += CONFIG.scoring.levelClear + timeBonus;
  world.clearStats = {
    time: world.time,
    par,
    timeBonus,
    ghost: !world.everAlarmed,
    ghostBonus: world.everAlarmed ? 0 : CONFIG.scoring.ghostBonus,
  };
  if (!world.everAlarmed) world.score += CONFIG.scoring.ghostBonus;
}

// Throw a coin: click a floor point inside the throw range and the coin flies
// there in 0.45 s, then rings out and draws nearby guards over to look.
export function throwCoin(world, targetX, targetY) {
  if (world.coins <= 0 || world.coinFlight) return false;
  const d = dist(world.player.x, world.player.y, targetX, targetY);
  if (d > CONFIG.coin.throwRange) return false;
  world.coins -= 1;
  world.coinFlight = {
    fx: world.player.x,
    fy: world.player.y,
    tx: targetX,
    ty: targetY,
    t: 0,
  };
  return true;
}

// Highest detection meter among the guards — the HUD's alert bar.
export function maxAlert(world) {
  let max = 0;
  for (const guard of world.guards) max = Math.max(max, guard.alert);
  return max;
}

export function anyChase(world) {
  return world.guards.some((guard) => guard.state === GUARD_STATE.CHASE);
}
