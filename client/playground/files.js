/**
 * The explorer of a playground: the folders and files of the container's working
 * directory, read again whenever they change. node_modules and .git are left out.
 * New names are typed in place, as in VS Code.
 */

import { icon } from './icons.js';

const LEFT_OUT = new Set(['node_modules', '.git']);

const createElement = (tagName, className, textContent = '') => Object.assign(document.createElement(tagName), { className, textContent });

// The entries of a folder, folders first, each folder with its own entries.
async function readFolder(fs, path) {
  let entries;

  try {
    entries = await fs.readdir(path, { withFileTypes: true });
  } catch {
    return null;
  }

  const folders = [];
  const files = [];

  for (const entry of entries) {
    if (LEFT_OUT.has(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      folders.push({ name: entry.name, children: await readFolder(fs, `${path}/${entry.name}`) ?? [] });
    } else if (entry.isFile()) {
      files.push({ name: entry.name });
    }
  }

  const byName = (a, b) => a.name.localeCompare(b.name);

  return [...folders.sort(byName), ...files.sort(byName)];
}

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * The explorer in element. onOpen is given the path of a file to open, onMenu a
 * context menu event with what it is for: 'file' or 'folder' and the path, or 'root',
 * and onCommand 'rename' or 'delete' with a path, for the keys of VS Code.
 */
export function createFileTree(element, { onOpen, onMenu, onCommand }) {
  const title = createElement('div', 'playground-files-title', 'Explorer');
  const root = createElement('div', 'playground-files-root', 'Files');
  const list = createElement('ul', 'playground-tree');
  let selected = null;
  let paths = new Set();
  let folders = new Set();

  element.append(title, root, list);

  element.addEventListener('click', (event) => {
    const button = event.target.closest('.playground-file');

    if (button) {
      onOpen(button.dataset.path);
    }
  });

  // F2 renames, and Delete (Cmd+Backspace on a Mac) deletes, what has the focus.
  element.addEventListener('keydown', (event) => {
    const row = event.target.closest('.playground-file, .playground-folder');

    if (!row) {
      return;
    }

    const path = row.dataset.path ?? row.parentElement.dataset.path;

    if (event.key === 'F2') {
      event.preventDefault();
      onCommand?.('rename', path);
    } else if (event.key === 'Delete' || (IS_MAC && event.metaKey && event.key === 'Backspace')) {
      event.preventDefault();
      onCommand?.('delete', path);
    }
  });

  element.addEventListener('contextmenu', (event) => {
    const file = event.target.closest('.playground-file');
    const folder = event.target.closest('.playground-folder');

    if (file) {
      onMenu?.(event, 'file', file.dataset.path);
    } else if (folder) {
      onMenu?.(event, 'folder', folder.parentElement.dataset.path);
    } else if (!event.target.closest('.playground-tree-input')) {
      onMenu?.(event, 'root', '');
    }
  });

  function render(entries, parent, prefix, depth, openFolders) {
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const item = document.createElement('li');

      if (entry.children) {
        const details = document.createElement('details');
        const summary = createElement('summary', 'playground-folder');
        const children = createElement('ul', 'playground-tree');

        summary.append(icon('chevron-right'), createElement('span', 'playground-folder-name', entry.name));
        details.dataset.path = path;
        // The top folders start open; the reader opens the rest.
        details.open = openFolders ? openFolders.has(path) : depth === 0;
        details.append(summary, children);
        item.append(details);
        folders.add(path);
        render(entry.children, children, path, depth + 1, openFolders);
      } else {
        const button = createElement('button', 'playground-file', entry.name);

        button.type = 'button';
        button.dataset.path = path;
        paths.add(path);

        if (path === selected) {
          button.setAttribute('aria-current', 'true');
        }

        item.append(button);
      }

      parent.append(item);
    }
  }

  // A row with a name to type, at the top of a folder's list or in place of a row.
  // done is given the name, or nothing when the reader gave up.
  function prompt({ parent, replace, initial = '', depth }, done) {
    const item = createElement('li', 'playground-tree-input-row');
    const input = Object.assign(document.createElement('input'), { className: 'playground-tree-input', value: initial });
    let finished = false;

    const finish = (name) => {
      if (finished) {
        return;
      }

      finished = true;
      item.remove();

      if (replace) {
        replace.hidden = false;
      }

      done(name?.trim() || undefined);
    };

    input.setAttribute('aria-label', initial ? `New name for ${initial}` : 'Name');
    input.style.setProperty('--pg-depth', String(depth));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(input.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish();
      }
    });
    // Clicking away keeps the name, as in VS Code, unless nothing changed.
    input.addEventListener('blur', () => finish(input.value.trim() !== initial ? input.value : undefined));
    item.append(input);

    if (replace) {
      replace.hidden = true;
      replace.after(item);
    } else {
      parent.prepend(item);
    }

    input.focus();
    // A file's name is selected without its extension, as its name is what changes most.
    input.setSelectionRange(0, initial.includes('.') && !initial.startsWith('.') ? initial.lastIndexOf('.') : initial.length);
  }

  return {
    element,

    // Reads the folder again and shows it. False when it doesn't exist (yet).
    async refresh(fs, directory) {
      const entries = await readFolder(fs, directory);
      // Folders keep their state across refreshes, apart from the first one.
      const openFolders = list.childElementCount
        ? new Set([...list.querySelectorAll('details[open]')].map((details) => details.dataset.path))
        : null;

      root.textContent = directory === '.' ? 'Files' : directory.split('/').pop();
      paths = new Set();
      folders = new Set();
      list.replaceChildren();

      if (entries) {
        render(entries, list, '', 0, openFolders);
      }

      return entries !== null;
    },

    has(path) {
      return paths.has(path);
    },

    isFolder(path) {
      return folders.has(path);
    },

    // The files shown, for quick open.
    paths() {
      return [...paths];
    },

    select(path) {
      selected = path;

      for (const button of list.querySelectorAll('.playground-file')) {
        if (button.dataset.path === path) {
          button.setAttribute('aria-current', 'true');
          // The file's folders open to show it.
          for (let details = button.closest('details'); details; details = details.parentElement.closest('details')) {
            details.open = true;
          }
        } else {
          button.removeAttribute('aria-current');
        }
      }
    },

    // Asks for the name of a new entry in a folder ('' for the top), which is opened.
    promptNew(folder, done) {
      const details = folder ? list.querySelector(`details[data-path="${CSS.escape(folder)}"]`) : null;

      if (details) {
        details.open = true;
      }

      prompt({ parent: details ? details.querySelector('ul') : list, depth: folder ? folder.split('/').length : 0 }, done);
    },

    // Asks for a new name for an entry, in its place.
    promptRename(path, done) {
      const row = list.querySelector(`[data-path="${CSS.escape(path)}"]`);

      if (row) {
        prompt({ parent: row.parentElement, replace: row, initial: path.split('/').pop(), depth: path.split('/').length - 1 }, done);
      }
    }
  };
}
