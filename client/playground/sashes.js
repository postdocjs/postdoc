/**
 * The sashes between the parts of the panel, which the reader drags, or moves with the
 * arrow keys, to give the explorer, the preview and the terminal the room they want.
 * Each one sets a size on the panel's style, which the layout in playground.css reads.
 */

const createElement = (tagName, className, textContent = '') => Object.assign(document.createElement(tagName), { className, textContent });

// How far a key press moves a sash, in pixels.
const STEP = 16;

const SASHES = {
  files: { property: '--pg-files-width', orientation: 'vertical', label: 'Width of the explorer', min: 120, max: (panel) => panel.clientWidth / 2, grows: 1 },
  preview: { property: '--pg-preview-width', orientation: 'vertical', label: 'Width of the preview', min: 160, max: (panel) => panel.clientWidth * 0.8, grows: -1 },
  terminal: { property: '--pg-terminal-height', orientation: 'horizontal', label: 'Height of the terminal', min: 80, max: (panel, body) => body.clientHeight - 120, grows: -1 }
};

export function createSashes(panel, body, parts) {
  const sashes = [];

  for (const name of parts) {
    const { property, orientation, label, min, max, grows } = SASHES[name];
    const sash = createElement('div', `playground-sash playground-sash-${name}`);
    const part = body.querySelector(`.playground-${name}`);
    const size = () => (orientation === 'vertical' ? part.getBoundingClientRect().width : part.getBoundingClientRect().height);
    const clamp = (value) => Math.round(Math.min(Math.max(value, min), max(panel, body)));

    const resize = (value) => {
      panel.style.setProperty(property, `${clamp(value)}px`);
      sash.setAttribute('aria-valuenow', String(clamp(value)));
    };

    sash.setAttribute('role', 'separator');
    sash.setAttribute('aria-orientation', orientation);
    sash.setAttribute('aria-label', label);
    sash.setAttribute('aria-valuemin', String(min));
    sash.setAttribute('aria-valuemax', String(Math.round(max(panel, body))));
    sash.setAttribute('aria-valuenow', String(Math.round(size())));
    sash.tabIndex = 0;

    // Dragging. The pointer is held by the sash, so the preview's frame can't take it.
    sash.addEventListener('pointerdown', (event) => {
      const start = orientation === 'vertical' ? event.clientX : event.clientY;
      const startSize = size();

      event.preventDefault();
      sash.setPointerCapture(event.pointerId);
      panel.classList.add('is-resizing');

      const move = (moveEvent) => {
        const position = orientation === 'vertical' ? moveEvent.clientX : moveEvent.clientY;

        resize(startSize + (position - start) * grows);
      };
      const stop = () => {
        sash.removeEventListener('pointermove', move);
        sash.removeEventListener('pointerup', stop);
        sash.removeEventListener('pointercancel', stop);
        panel.classList.remove('is-resizing');
      };

      sash.addEventListener('pointermove', move);
      sash.addEventListener('pointerup', stop);
      sash.addEventListener('pointercancel', stop);
    });

    sash.addEventListener('keydown', (event) => {
      const keys = orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      const direction = keys.indexOf(event.key);

      if (direction !== -1) {
        event.preventDefault();
        resize(size() + (direction ? STEP : -STEP) * grows);
      }
    });

    body.append(sash);
    sashes.push(sash);
  }

  return sashes;
}
