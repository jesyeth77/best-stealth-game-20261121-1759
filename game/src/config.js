// NIGHTSHIFT — every number the game balances on, in one place.
// Top-down stealth: slip past patrolling guards, use shadows and crates as
// cover, grab the data chips, reach the vault exit without being seen.
export const CONFIG = {
  canvasWidth: 1280,
  canvasHeight: 800,
  tile: 40,
  cols: 26,
  rows: 16,
  // The playfield sits left; the right strip is the HUD panel.
  fieldX: 20,
  fieldY: 80,
  panelX: 1080,

  player: {
    radius: 13,
    walkSpeed: 150,
    sneakSpeed: 85,
    // How far a guard hears your footsteps while walking / sneaking.
    noiseWalk: 95,
    noiseSneak: 26,
  },

  guard: {
    radius: 14,
    patrolSpeed: 62,
    chaseSpeed: 128,
    investigateSpeed: 95,
    // Vision cone: half-angle and reach.
    fovHalf: 0.61, // ~35 degrees each side
    viewRange: 205,
    // Detection fills 0..100; rates below are per second while you are seen.
    detectLit: 62,
    detectShadow: 20,
    detectSneak: 0.55, // multiplier while sneaking
    detectClose: 1.8, // multiplier inside 70 px
    decay: 26,
    alarmDecay: 9,
    catchDistance: 26,
    // How long a guard stays suspicious after losing sight of you.
    suspicionTime: 4.0,
    // Pause at each patrol waypoint, in seconds.
    waypointPause: 1.1,
  },

  coin: {
    startCount: 3,
    throwRange: 260,
    noiseRadius: 150,
  },

  scoring: {
    chip: 150,
    levelClear: 500,
    timeBonusPerSecond: 12,
    ghostBonus: 300,
    keycard: 100,
  },

  lives: 3,
};

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
