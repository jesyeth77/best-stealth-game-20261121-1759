// NIGHTSHIFT — every number the game balances on, in one place.
// A top-down stealth infiltrator: slip past patrolling guards, use shadows
// and crates as cover, grab the data chips, reach the vault exit unseen.
export const CONFIG = {
  // Canvas and playfield geometry.
  canvasWidth: 1280,
  canvasHeight: 800,
  tile: 40,
  cols: 26,
  rows: 16,
  fieldX: 20, // playfield sits left; the right strip is the HUD panel
  fieldY: 80,
  panelX: 1080,

  // The courier.
  player: {
    radius: 13,
    walkSpeed: 150, // px/s on open floor
    sneakSpeed: 85, // px/s while sneaking
    noiseWalk: 95, // px: how far a guard hears walking footsteps
    noiseSneak: 26, // px: how far a guard hears sneaking footsteps
  },

  // The guards.
  guard: {
    radius: 14,
    patrolSpeed: 62,
    chaseSpeed: 128,
    investigateSpeed: 95,
    fovHalf: 0.61, // vision cone half-angle, ~35 degrees each side
    viewRange: 205, // vision cone reach in px
    // Detection fills 0..100; rates below are per second while you are seen.
    detectLit: 62, // lit floor
    detectShadow: 20, // shadow floor
    detectSneak: 0.55, // multiplier while sneaking
    detectClose: 1.8, // multiplier inside 70 px
    decay: 26, // detection falloff per second while unseen
    alarmDecay: 9, // alarm falloff per second while chasing without sight
    catchDistance: 26, // px: a chase that close ends the floor
    suspicionTime: 4.0, // seconds a guard stays suspicious after losing you
    waypointPause: 1.1, // seconds paused at each patrol waypoint
  },

  // Coin distractions.
  coin: {
    startCount: 3, // coins per floor
    throwRange: 260, // px: farthest a throw reaches
    noiseRadius: 150, // px: guards inside this ring come to look
  },

  // Points.
  scoring: {
    chip: 150,
    levelClear: 500,
    timeBonusPerSecond: 12, // per second under par
    ghostBonus: 300, // clearing a floor without ever being spotted
    keycard: 100,
  },

  lives: 3, // carried across retries of a floor
};

// Night palette: cold floors, warm cones, green vault.
export const PALETTE = {
  page: '#0a0d12',
  panel: '#10141d',
  panelLine: '#232c3d',
  floorLit: '#2a2f3a',
  floorLitAlt: '#272c37',
  floorShadow: '#171b26',
  floorShadowAlt: '#151923',
  wall: '#3d4659',
  wallTop: '#4d5a74',
  wallEdge: '#202634',
  crate: '#6b5433',
  crateEdge: '#8a6f45',
  crateDark: '#4a3a22',
  exit: '#27e0a0',
  exitDark: '#0d7a55',
  chip: '#ffd34d',
  keycard: '#7fe7ff',
  player: '#e8f1ff',
  playerRing: '#7fd4ff',
  guardBody: '#e5484d',
  guardDark: '#8f1d22',
  guardCone: 'rgba(255, 214, 90, 0.20)',
  guardConeAlert: 'rgba(255, 80, 70, 0.30)',
  guardConeSuspicious: 'rgba(255, 170, 60, 0.26)',
  text: '#e8eef7',
  textDim: '#9aa7bd',
  textFaint: '#5d6b82',
  danger: '#ff5a4e',
  warn: '#ffb02e',
  good: '#2fe6a8',
};
