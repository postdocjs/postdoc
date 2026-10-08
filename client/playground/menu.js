/**
 * The context menu of the panel, as VS Code's: one for the explorer, the tabs, the
 * terminals and the editor, opened with the right button, or Shift+F10 on what has the
 * focus, and worked with the arrow keys.
 */

const createElement = (tagName, className, textContent = '') => Object.assign(document.createElement(tagName), { className, textContent });

/**
 * The menu lives in panel, over everything. show(event, items) opens it where the
 * event happened, for items of { label, keys, action, disabled } and '-' separators.
 */
export function createMenu(panel) {
  const element = createElement('div', 'playground-menu');
  let restoreFocus = null;

  element.hidden = true;
  element.setAttribute('role', 'menu');
  panel.append(element);

  const buttons = () => [...element.querySelectorAll('.playground-menu-item:not([aria-disabled="true"])')];

  function close() {
    if (element.hidden) {
      return;
    }

    element.hidden = true;
    element.replaceChildren();
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    document.removeEventListener('scroll', close, true);
    restoreFocus?.focus?.();
    restoreFocus = null;
  }

  function onPointerDown(event) {
    if (!element.contains(event.target)) {
      close();
    }
  }

  function onKeyDown(event) {
    const items = buttons();
    const index = items.indexOf(document.activeElement);

    switch (event.key) {
      case 'Escape':
      case 'Tab':
        event.preventDefault();
        close();
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        break;
      case 'Home':
      case 'End':
        event.preventDefault();
        items.at(event.key === 'Home' ? 0 : -1)?.focus();
        break;
      default:
        return;
    }

    event.stopPropagation();
  }

  return {
    show(event, items) {
      close();
      event.preventDefault();
      event.stopPropagation();
      restoreFocus = document.activeElement;

      for (const item of items) {
        if (item === '-') {
          element.append(createElement('div', 'playground-menu-separator'));

          continue;
        }

        const button = createElement('button', 'playground-menu-item');

        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.append(createElement('span', 'playground-menu-label', item.label));

        if (item.keys) {
          button.append(createElement('span', 'playground-menu-keys', item.keys));
        }

        if (item.disabled) {
          button.setAttribute('aria-disabled', 'true');
        } else {
          button.addEventListener('click', () => {
            const focus = restoreFocus;

            restoreFocus = null;
            close();
            item.action(focus);
          });
        }

        element.append(button);
      }

      // Where the pointer is, or by the element for the keyboard, and inside the window.
      const target = event.currentTarget instanceof Element ? event.currentTarget : event.target;
      const rect = target?.getBoundingClientRect?.();
      const fromKeyboard = !event.clientX && !event.clientY && rect;
      let x = fromKeyboard ? rect.left : event.clientX;
      let y = fromKeyboard ? rect.bottom : event.clientY;

      element.hidden = false;
      x = Math.min(x, window.innerWidth - element.offsetWidth - 4);
      y = Math.min(y, window.innerHeight - element.offsetHeight - 4);
      element.style.left = `${Math.max(x, 4)}px`;
      element.style.top = `${Math.max(y, 4)}px`;
      buttons()[0]?.focus();

      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('blur', close);
      window.addEventListener('resize', close);
      document.addEventListener('scroll', close, true);
    },

    close,

    get isOpen() {
      return !element.hidden;
    }
  };
}

// The keys of a shortcut as VS Code writes them on this platform.
export function keys(combination) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  return combination
    .replace('Mod', isMac ? '⌘' : 'Ctrl')
    .replace('Alt', isMac ? '⌥' : 'Alt')
    .replace('Shift', isMac ? '⇧' : 'Shift')
    .replace(/\+/g, isMac ? '' : '+');
}
