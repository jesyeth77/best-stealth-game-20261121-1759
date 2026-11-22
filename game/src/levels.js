// Level data for NIGHTSHIFT. Each floor is a 26 x 16 tile map plus guard patrols.
// Legend: '#' wall, '.' lit floor, ',' shadow floor (dark: you are harder to see),
// 'C' crate (cover: blocks movement and a guard's line of sight), 'P' player start,
// 'E' vault exit, 'D' data chip, 'K' keycard, 'G' guard spawn.
// Guard waypoints are tile coordinates; the world converts them to pixels.
// parseLevel() validates every row is exactly 26 tiles, so a typo fails loudly.
import { CONFIG } from './config.js';

const LEVELS = [
  {
    name: 'WAREHOUSE 7',
    sub: 'First shift — learn the dark',
    briefing:
      'Two guards walk the floor. Stay out of their cones, use the shadows and crates, reach the vault door.',
    lockedExit: false,
    par: 75,
    map: [
      '##########################',
      '#P.....,,,,......C.......#',
      '#......,,,,......C....D..#',
      '#.CC...,,,,..######......#',
      '#.........,..#....#...##.#',
      '#..D.....,,.....G....#...#',
      '#.........,..######...#..#',
      '#..####....,........#....#',
      '#..#........C.....,,,....#',
      '#..#..C......C...,,,,.E..#',
      '#..#.............,,,.....#',
      '#..####....D.....,,,..C..#',
      '#..................#.....#',
      '#..C......G......#....D..#',
      '#........................#',
      '##########################',
    ],
    guards: [
      { spawn: [17, 5], waypoints: [[13, 5], [20, 5]], pause: 1.1 },
      { spawn: [9, 13], waypoints: [[6, 13], [15, 13]], pause: 1.4 },
    ],
  },
  {
    name: 'SERVER VAULT',
    sub: 'Second shift — more eyes',
    briefing:
      'Three guards, longer sightlines down the server rows. The dark aisles are your friends — sprinting is not.',
    lockedExit: false,
    par: 95,
    map: [
      '##########################',
      '#P...,,,,,....C......D...#',
      '#....,,,,,....C..........#',
      '#.C..,,,,,....####..##...#',
      '#..............#.........#',
      '#..D.....G.....#...C.....#',
      '#.........######....,,,,,#',
      '#..####..............,,,,#',
      '#..#....C......C.....,,,,#',
      '#..#.........D.....#.....#',
      '#..#..C....######..#..E..#',
      '#..................#.....#',
      '#..D.....,,,,,.....#..C..#',
      '#......G,,,,,.....G......#',
      '#.......,,,,,............#',
      '##########################',
    ],
    guards: [
      { spawn: [10, 5], waypoints: [[6, 5], [14, 5]], pause: 1.0 },
      { spawn: [8, 13], waypoints: [[5, 13], [12, 13]], pause: 1.2 },
      { spawn: [19, 13], waypoints: [[16, 13], [22, 13]], pause: 0.9 },
    ],
  },
  {
    name: 'THE CORE',
    sub: 'Last shift — vault locked',
    briefing:
      'Four guards and a locked vault. Lift the keycard from the core room first — then slip out unseen.',
    lockedExit: true,
    par: 120,
    map: [
      '##########################',
      '#P....,,,,......C.......D#',
      '#......,,,,.....C........#',
      '#.CC..,,,,..######..##...#',
      '#...........#....#.......#',
      '#..D...G....#..K.#G.C....#',
      '#........######..#.......#',
      '#..###..........#....,,,,#',
      '#..#......C.....#...,,,,,#',
      '#..#...D.....C.......,,,,#',
      '#..#.......######.......E#',
      '#..###..............#....#',
      '#......C.....G.....#..D..#',
      '#..D......,,,,,....#.....#',
      '#....G....,,,,,.........D#',
      '##########################',
    ],
    guards: [
      { spawn: [8, 5], waypoints: [[5, 5], [11, 5]], pause: 1.0 },
      { spawn: [15, 12], waypoints: [[11, 12], [16, 12]], pause: 1.1 },
      { spawn: [6, 14], waypoints: [[4, 14], [10, 14]], pause: 1.3 },
      { spawn: [19, 5], waypoints: [[19, 3], [19, 8]], pause: 0.8 },
    ],
  },
];

export function levelCount() {
  return LEVELS.length;
}

export function levelMeta(index) {
  const level = LEVELS[index];
  const { name, sub, briefing, lockedExit, par } = level;
  return { name, sub, briefing, lockedExit, par };
}

// Parse a level map into the pieces the world and renderer need. Any malformed
// row throws, so a bad map can never silently ship as a broken floor.
export function parseLevel(index) {
  const level = LEVELS[index];
  const rows = level.map;
  if (rows.length !== CONFIG.rows) {
    throw new Error(`level ${index}: ${rows.length} rows, expected ${CONFIG.rows}`);
  }
  const walls = new Set();
  const crates = new Set();
  const shadow = new Set();
  const chips = [];
  const guardSpawns = [];
  let playerStart = null;
  let exit = null;
  let keycard = null;
  rows.forEach((row, y) => {
    if (row.length !== CONFIG.cols) {
      throw new Error(`level ${index} row ${y}: ${row.length} cols, expected ${CONFIG.cols}: "${row}"`);
    }
    [...row].forEach((ch, x) => {
      const key = `${x},${y}`;
      switch (ch) {
        case '#': walls.add(key); break;
        case 'C': crates.add(key); break;
        case ',': shadow.add(key); break;
        case 'D': chips.push({ x, y, taken: false }); break;
        case 'P': playerStart = { x, y }; break;
        case 'E': exit = { x, y }; break;
        case 'K': keycard = { x, y, taken: false }; break;
        case 'G': guardSpawns.push({ x, y }); break;
        case '.': case ' ': break;
        default: throw new Error(`level ${index}: unknown tile "${ch}" at ${x},${y}`);
      }
    });
  });
  if (!playerStart) throw new Error(`level ${index}: no player start`);
  if (!exit) throw new Error(`level ${index}: no exit`);
  if (level.lockedExit && !keycard) {
    throw new Error(`level ${index}: locked exit but no keycard tile`);
  }
  if (guardSpawns.length !== level.guards.length) {
    throw new Error(`level ${index}: ${guardSpawns.length} G tiles but ${level.guards.length} guard defs`);
  }
  return {
    meta: levelMeta(index),
    walls,
    crates,
    shadow,
    chips,
    playerStart,
    exit,
    keycard,
    guardDefs: level.guards,
    lockedExit: level.lockedExit,
  };
}

// Tile centre in playfield pixels.
export function tileCenter(x, y) {
  return {
    x: CONFIG.fieldX + (x + 0.5) * CONFIG.tile,
    y: CONFIG.fieldY + (y + 0.5) * CONFIG.tile,
  };
}

// Is this tile solid for movement (wall or crate)?
export function isSolidTile(parsed, x, y) {
  if (x < 0 || y < 0 || x >= CONFIG.cols || y >= CONFIG.rows) return true;
  const key = `${x},${y}`;
  return parsed.walls.has(key) || parsed.crates.has(key);
}

// Does this tile block a guard's sight? Walls and crates both do.
export function blocksSight(parsed, x, y) {
  return isSolidTile(parsed, x, y);
}
