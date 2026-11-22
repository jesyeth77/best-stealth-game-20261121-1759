// Keyboard + mouse input. Tracks held keys, exposes a plain input snapshot
// the world consumes each frame, and queues clicks (coin throws) for main.js.
export function createInput(canvas) {
  const keys = new Set();
  const state = {
    up: false,
    down: false,
    left: false,
    right: false,
    sneak: false,
    click: null, // {x, y} in canvas pixels, consumed by main.js
    pressed: new Set(), // keys pressed since the last snapshot (for menus)
  };

  const KEYMAP = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ShiftLeft: 'sneak',
    ShiftRight: 'sneak',
  };

  function onKeyDown(event) {
    if (event.repeat) return; // holding a key must not re-trigger menus
    const action = KEYMAP[event.code];
    if (action) {
      keys.add(action);
      state.pressed.add(action);
      event.preventDefault();
    } else if (event.code === 'KeyC') {
      state.pressed.add('coin');
    } else if (event.code === 'Enter' || event.code === 'Space') {
      state.pressed.add('confirm');
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      state.pressed.add('pause');
    } else if (event.code === 'KeyR') {
      state.pressed.add('restart');
    } else if (event.code === 'KeyM') {
      state.pressed.add('mute');
    }
  }

  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) keys.delete(action);
  }

  function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    state.click = {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  // Clicking the canvas focuses it so the keyboard works for play.
  canvas.addEventListener('click', () => canvas.focus());

  return {
    snapshot() {
      return {
        up: keys.has('up'),
        down: keys.has('down'),
        left: keys.has('left'),
        right: keys.has('right'),
        sneak: keys.has('sneak'),
      };
    },
    takeClick() {
      const click = state.click;
      state.click = null;
      return click;
    },
    takePressed() {
      const pressed = state.pressed;
      state.pressed = new Set();
      return pressed;
    },
    hasPressed(name) {
      return state.pressed.has(name);
    },
  };
}
