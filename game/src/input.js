// Keyboard + mouse input for NIGHTSHIFT.
// Tracks held keys, hands the world a plain movement snapshot each frame, and
// queues clicks (coin throws) plus single-press menu keys for main.js.
export function createInput(canvas) {
  const held = new Set();
  const queue = new Set(); // keys pressed since the last snapshot (menus)
  let click = null; // {x, y} in canvas pixels, consumed by main.js

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
      held.add(action);
      queue.add(action);
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyC') queue.add('coin');
    else if (event.code === 'Enter' || event.code === 'Space') {
      queue.add('confirm');
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') queue.add('pause');
    else if (event.code === 'KeyR') queue.add('restart');
    else if (event.code === 'KeyM') queue.add('mute');
  }

  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) held.delete(action);
  }

  function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    click = {
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
        up: held.has('up'),
        down: held.has('down'),
        left: held.has('left'),
        right: held.has('right'),
        sneak: held.has('sneak'),
      };
    },
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    takePressed() {
      const pressed = new Set(queue);
      queue.clear();
      return pressed;
    },
    hasPressed(name) {
      return queue.has(name);
    },
  };
}
