// World state and update logic for NIGHTSHIFT: movement and collision, guard AI
// (patrol / investigate / chase), vision cones with line of sight, the detection
// meter, footstep noise, and coin distractions. Pure logic — no canvas calls,
// so the headless sim can run it in Node.
import { CONFIG } from './config.js';
import { parseLevel, tileCenter, isSolidTile, blocksSight } from './levels.js';
import { clamp, dist, angleTo, angleDelta } from './random.js';

export const GUARD_STATE = { PATROL: 'patrol', INVESTIGATE: 'investigate', CHASE: 'chase' };

export function tileAtPixel(parsed, px, py) {
  return {
    x: Math.floor((px - CONFIG.fieldX) / CONFIG.tile),
    y: Math.floor((py - CONFIG.fieldY) / CONFIG.tile),
  };
}

export function inShadow(parsed, px, py) {
  const t = tileAtPixel(parsed, px, py);
  return parsed.shadow.has(`${t.x},${t.y}`);
}

// Line of sight between two points: stepped in 8 px hops; any sight-blocking
// tile (wall or crate) on the way breaks it.
export function hasLineOfSight(parsed, ax, ay, bx, by) {
  const steps = Math.max(1, Math.ceil(dist(ax, ay, bx, by) / 8));
  for (let i = 1; i < steps; i += 1) {
    const t = tileAtPixel(parsed, ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
    if (blocksSight(parsed, t.x, t.y)) return false;
  }
  return true;
}

// Does this guard see the player right now? Range, cone angle and LOS all must
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
    everAlarmed: false, // any guard hit 100 this level (kills the ghost bonus)
    levelDone: false,
    caught: false,
    message: '',
    messageLeft: 0,
    noisePulse: null, // {x, y, radius, left} — expanding footstep/noise ring
  };
}

// Move a circle against solid tiles, axis by axis so it slides along walls.
function moveCircle(parsed, body, dx, dy) {
  const r = body.radius;
  const nx = body.x + dx;
  if (!hitsSolid(parsed, nx, body.y, r)) body.x = nx;
  if (!hitsSolid(parsed, body.x, body.y + dy, r)) body.y += dy;
}

function hitsSolid(parsed, px, py, r) {
  // Check the four corners of the body's bounding box, in tile space.
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

  updatePlayer(world, input, dt);
  updateCoinFlight(world, dt);
  updateGuards(world, dt);
  updatePickups(world);
  updateExit(world);
}

function updatePlayer(world, input, dt) {
  const player = world.player;
  const speed = input.sneak ? CONFIG.player.sneakSpeed : CONFIG.player.walkSpeed;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  player.moving = len > 0;
  player.sneaking = !!input.sneak;
  if (len > 0) {
    mx /= len;
    my /= len;
    player.facing = Math.atan2(my, mx);
    player.stepPhase += dt * (input.sneak ? 7 : 11);
    moveCircle(world.parsed, player, mx * speed * dt, my * speed * dt);
    // Walking is loud: guards nearby turn toward the noise.
    const noiseRadius = input.sneak ? CONFIG.player.noiseSneak : CONFIG.player.noiseWalk;
    if (noiseRadius > 40) {
      for (const guard of world.guards) {
        if (guard.state === GUARD_STATE.PATROL) {
          const d = dist(guard.x, guard.y, player.x, player.y);
          if (d < noiseRadius && guard.alert < 55) {
            guard.alert = Math.min(guard.alert + dt * 14, 55);
            guard.investigateX = player.x;
            guard.investigateY = player.y;
            guard.state = GUARD_STATE.INVESTIGATE;
            guard.suspicionLeft = 5;
          }
        }
      }
    }
  }
}

function updateCoinFlight(world, dt) {
  const flight = world.coinFlight;
  if (!flight) return;
  flight.t += dt / 0.45;
  if (flight.t >= 1) {
    world.coinFlight = null;
    world.noisePulse = { x: flight.tx, y: flight.ty, radius: CONFIG.coin.noiseRadius, left: 0.9 };
    for (const guard of world.guards) {
      if (guard.state !== GUARD_STATE.CHASE) {
        const d = dist(guard.x, guard.y, flight.tx, flight.ty);
        if (d < CONFIG.coin.noiseRadius) {
          guard.state = GUARD_STATE.INVESTIGATE;
          guard.investigateX = flight.tx;
          guard.investigateY = flight.ty;
          guard.suspicionLeft = 6;
        }
      }
    }
  }
}

// Click (or C key) throws a coin toward the pointer: guards in earshot walk
// over to check the clink. Limited coins per level.
export function throwCoin(world, tx, ty) {
  if (world.coins <= 0 || world.coinFlight || world.levelDone || world.caught) return false;
  const d = dist(world.player.x, world.player.y, tx, ty);
  if (d > CONFIG.coin.throwRange) {
    const k = CONFIG.coin.throwRange / d;
    tx = world.player.x + (tx - world.player.x) * k;
    ty = world.player.y + (ty - world.player.y) * k;
  }
  world.coins -= 1;
  world.coinFlight = { fx: world.player.x, fy: world.player.y, tx, ty, t: 0 };
  return true;
}

function moveGuardToward(world, guard, tx, ty, speed, dt) {
  const d = dist(guard.x, guard.y, tx, ty);
  if (d < 2) return { reached: true, moved: false };
  const step = Math.min(d, speed * dt);
  const nx = guard.x + ((tx - guard.x) / d) * step;
  const ny = guard.y + ((ty - guard.y) / d) * step;
  const before = { x: guard.x, y: guard.y };
  moveCircle(world.parsed, guard, nx - guard.x, ny - guard.y);
  // Turn toward the walk direction smoothly instead of snapping: a guard
  // sweeping its cone around is readable, and it gives the player a moment.
  const want = angleTo(guard.x, guard.y, tx, ty);
  const turn = clamp(angleDelta(guard.angle, want), -5 * dt, 5 * dt);
  guard.angle += turn;
  guard.stepPhase += dt * 9;
  const moved = dist(before.x, before.y, guard.x, guard.y) > 0.5;
  return { reached: dist(guard.x, guard.y, tx, ty) < 8, moved };
}

function updateGuards(world, dt) {
  const player = world.player;
  for (const guard of world.guards) {
    const visibility = guardSeesPlayer(world.parsed, guard, player);
    const shadowed = inShadow(world.parsed, player.x, player.y);
    if (visibility > 0) {
      let rate = shadowed ? CONFIG.guard.detectShadow : CONFIG.guard.detectLit;
      if (player.sneaking) rate *= CONFIG.guard.detectSneak;
      const d = dist(guard.x, guard.y, player.x, player.y);
      if (d < 70) rate *= CONFIG.guard.detectClose;
      rate *= 0.5 + 0.5 * visibility;
      guard.alert = clamp(guard.alert + rate * dt, 0, 100);
      guard.lastSeenX = player.x;
      guard.lastSeenY = player.y;
      if (guard.alert >= 100 && guard.state !== GUARD_STATE.CHASE) {
        guard.state = GUARD_STATE.CHASE;
        world.everAlarmed = true;
        world.message = 'SPOTTED! Break line of sight!';
        world.messageLeft = 2.2;
      }
    } else if (guard.state === GUARD_STATE.CHASE) {
      guard.alert = clamp(guard.alert - CONFIG.guard.alarmDecay * dt, 0, 100);
      guard.suspicionLeft -= dt;
      if (guard.suspicionLeft <= 0 && guard.alert < 60) {
        guard.state = GUARD_STATE.INVESTIGATE;
        guard.investigateX = guard.lastSeenX;
        guard.investigateY = guard.lastSeenY;
        guard.suspicionLeft = 5;
      }
    } else {
      guard.alert = clamp(guard.alert - CONFIG.guard.decay * dt, 0, 100);
    }

    if (guard.state === GUARD_STATE.CHASE) {
      guard.suspicionLeft = CONFIG.guard.suspicionTime;
      moveGuardToward(world, guard, player.x, player.y, CONFIG.guard.chaseSpeed, dt);
      if (dist(guard.x, guard.y, player.x, player.y) < CONFIG.guard.catchDistance) {
        world.caught = true;
        world.lives -= 1;
        return;
      }
    } else if (guard.state === GUARD_STATE.INVESTIGATE) {
      const step = moveGuardToward(
        world, guard, guard.investigateX, guard.investigateY, CONFIG.guard.investigateSpeed, dt,
      );
      if (!step.moved && !step.reached) {
        // A wall is in the way of the noise: give up and resume the patrol.
        guard.state = GUARD_STATE.PATROL;
        guard.alert = Math.min(guard.alert, 45);
      } else if (step.reached) {
        // Look around, then give up and go back to the patrol route.
        guard.scanAngle += guard.scanDir * dt * 1.6;
        guard.angle += guard.scanDir * dt * 1.6;
        if (Math.abs(guard.scanAngle) > 1.9) guard.scanDir *= -1;
        guard.suspicionLeft -= dt;
        if (guard.suspicionLeft <= 0) {
          guard.state = GUARD_STATE.PATROL;
          guard.scanAngle = 0;
          guard.alert = Math.min(guard.alert, 45);
        }
      }
    } else {
      // Patrol: walk to the next waypoint, pause and look around there.
      const target = guard.waypoints[guard.waypointIndex];
      if (guard.pauseLeft > 0) {
        guard.pauseLeft -= dt;
        // A gentle sweep while waiting, not a wild swing: the cone should
        // stay readable as "this guard watches this way".
        guard.angle += Math.sin(world.time * 1.4 + guard.id * 2.1) * dt * 0.35;
      } else {
        const step = moveGuardToward(world, guard, target.x, target.y, CONFIG.guard.patrolSpeed, dt);
        if (step.reached || !step.moved) {
          guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
          guard.pauseLeft = guard.pauseAtWaypoint;
        }
      }
    }
  }
}

function updatePickups(world) {
  const player = world.player;
  for (const chip of world.chips) {
    if (!chip.taken && dist(player.x, player.y, chip.x, chip.y) < 26) {
      chip.taken = true;
      world.chipsGot += 1;
      world.score += CONFIG.scoring.chip;
      world.message = `Data chip secured  +${CONFIG.scoring.chip}`;
      world.messageLeft = 1.6;
    }
  }
  if (world.keycard && !world.keycard.taken && dist(player.x, player.y, world.keycard.x, world.keycard.y) < 28) {
    world.keycard.taken = true;
    world.exit.open = true;
    world.score += CONFIG.scoring.keycard;
    world.message = `Keycard lifted — the vault is open  +${CONFIG.scoring.keycard}`;
    world.messageLeft = 2.2;
  }
}

function updateExit(world) {
  const player = world.player;
  if (!world.exit.open) {
    if (dist(player.x, player.y, world.exit.x, world.exit.y) < 30) {
      world.message = 'Vault locked — find the keycard first.';
      world.messageLeft = 1.2;
    }
    return;
  }
  if (dist(player.x, player.y, world.exit.x, world.exit.y) < 30) {
    world.levelDone = true;
    const timeBonus = Math.max(0, Math.round((world.parsed.meta.par - world.time) * CONFIG.scoring.timeBonusPerSecond));
    world.score += CONFIG.scoring.levelClear + timeBonus;
    if (!world.everAlarmed) world.score += CONFIG.scoring.ghostBonus;
    world.clearStats = {
      timeBonus,
      ghost: !world.everAlarmed,
      chips: world.chipsGot,
      totalChips: world.chips.length,
    };
  }
}

// Highest guard alert across the floor — the HUD's detection meter.
export function maxAlert(world) {
  return world.guards.reduce((top, guard) => Math.max(top, guard.alert), 0);
}

// Is any guard currently chasing the player?
export function anyChase(world) {
  return world.guards.some((guard) => guard.state === GUARD_STATE.CHASE);
}
