/**
 * Quick open, as Ctrl+P is in VS Code: a box over the editor that finds a file of the
 * project by part of its path, typed in any order of its letters.
 */

const MAX_RESULTS = 12;

const createElement = (tagName, className, textContent = '') => Object.assign(document.createElement(tagName), { className, textContent });

// How well a path matches what was typed: 0 when it doesn't, more for a match of the
// whole query in the name, then in the path, then of its letters in order.
function score(path, query) {
  const name = path.split('/').pop().toLowerCase();
  const lowerPath = path.toLowerCase();

  if (!query) {
    return 1;
  }

  if (name.includes(query)) {
    return 3 + (name.startsWith(query) ? 1 : 0);
  }

  if (lowerPath.includes(query)) {
    return 2;
  }

  let position = 0;

  for (const letter of query) {
    position = lowerPath.indexOf(letter, position);

    if (position === -1) {
      return 0;
    }

    position += 1;
  }

  return 1;
}

export function createQuickOpen(element, { files, onOpen }) {
  const box = createElement('div', 'playground-quick-open');
  const input = Object.assign(document.createElement('input'), { className: 'playground-quick-open-input', placeholder: 'Search files by name' });
  const list = createElement('ul', 'playground-quick-open-list');
  let results = [];
  let index = 0;

  box.hidden = true;
  input.setAttribute('aria-label', 'Search files by name');
  input.spellcheck = false;
  input.autocomplete = 'off';
  list.setAttribute('role', 'listbox');
  box.append(input, list);
  element.append(box);

  function render() {
    const query = input.value.trim().toLowerCase();

    results = files()
      .map((path) => ({ path, score: score(path, query) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path))
      .slice(0, MAX_RESULTS)
      .map((result) => result.path);
    index = 0;

    list.replaceChildren(...results.map((path, position) => {
      const item = createElement('li', 'playground-quick-open-item');
      const parts = path.split('/');

      item.setAttribute('role', 'option');
      item.append(createElement('span', 'playground-quick-open-name', parts.pop()), createElement('span', 'playground-quick-open-path', parts.join('/')));
      item.addEventListener('mousedown', (event) => {
        // Before the input loses focus and the box closes.
        event.preventDefault();
        choose(position);
      });

      return item;
    }));
    highlight();
  }

  function highlight() {
    [...list.children].forEach((item, position) => item.setAttribute('aria-selected', position === index ? 'true' : 'false'));
    list.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  function choose(position) {
    const path = results[position];

    close();

    if (path) {
      onOpen(path);
    }
  }

  function close() {
    box.hidden = true;
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      index = (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1);
      highlight();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(index);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  // The box goes when the reader clicks or tabs away from it.
  box.addEventListener('focusout', (event) => {
    if (!box.contains(event.relatedTarget)) {
      close();
    }
  });

  return {
    open() {
      box.hidden = false;
      input.value = '';
      render();
      input.focus();
    },

    close,

    get isOpen() {
      return !box.hidden;
    }
  };
}
