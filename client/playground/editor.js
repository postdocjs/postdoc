/**
 * The code editor of a playground: Monaco, the editor of VS Code, with a tab for each
 * open file. What is typed is written to the container a moment later, so a dev server
 * running in it picks the change up.
 *
 * Monaco comes from a CDN, like the terminal: see monaco.js.
 */

import { icon } from './icons.js';
import { loadMonaco } from './monaco.js';
import { monacoTheme } from './theme.js';

// How long typing is left alone before it's written, in milliseconds.
const WRITE_DELAY = 300;
// Languages that Monaco doesn't know from the file's name.
const LANGUAGES = { ejs: 'html' };
// Languages whose lines are wrapped, as prose reads better that way.
const WRAPPED = new Set(['markdown', 'plaintext']);
// The editor shows a minimap when it is at least this wide, in pixels.
const MINIMAP_WIDTH = 600;

const createElement = (tagName, className, textContent = '') => Object.assign(document.createElement(tagName), { className, textContent });

let editors = 0;

// The name of a language as VS Code shows it.
export function languageName(id) {
  return { javascript: 'JavaScript', typescript: 'TypeScript', json: 'JSON', markdown: 'Markdown', html: 'HTML', css: 'CSS', yaml: 'YAML', shell: 'Shell Script', plaintext: 'Plain Text' }[id] ??
    id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * The editor in element, in the colours of theme. write is given a file's path and
 * text when it is to be written, onShow the path and language of the file shown,
 * onCursor the line and column of the cursor, and onMenu a context menu event with
 * what it is for: 'tab' and the path, or 'editor'.
 */
export async function createEditor(element, { theme, write, onShow, onCursor, onMenu }) {
  const monaco = await loadMonaco();
  const id = ++editors;
  const tabs = createElement('div', 'playground-tabs');
  const breadcrumbs = createElement('div', 'playground-breadcrumbs');
  const empty = createElement('p', 'playground-editor-empty', 'Choose a file to edit.');
  const host = createElement('div', 'playground-editor-view');
  // Each open file is a model, and one editor shows the active one.
  const documents = new Map();
  const timers = new Map();
  let active = null;
  let editor = null;
  let hasMinimap = false;
  let isReplacing = false;

  monaco.editor.defineTheme('postdoc', monacoTheme(theme));
  breadcrumbs.setAttribute('aria-hidden', 'true');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Open files');
  element.append(tabs, breadcrumbs, empty, host);

  function scheduleWrite(path) {
    clearTimeout(timers.get(path));
    timers.set(path, setTimeout(() => flush(path), WRITE_DELAY));
  }

  // Writes a change that is waiting, if any.
  function flush(path) {
    if (timers.has(path)) {
      clearTimeout(timers.get(path));
      timers.delete(path);
      write(path, documents.get(path).model.getValue());
    }
  }

  function createView(model) {
    editor = monaco.editor.create(host, {
      model,
      theme: 'postdoc',
      automaticLayout: true,
      fontFamily: theme.codeFont,
      fontSize: 13,
      tabSize: 2,
      padding: { top: 8 },
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      // The panel clips what overflows it, so the completion and hover widgets go over it.
      fixedOverflowWidgets: true,
      // The panel's own menu, the same as everywhere else in it.
      contextmenu: false
    });

    editor.onDidChangeCursorPosition(({ position }) => onCursor?.(position.lineNumber, position.column));
    editor.onContextMenu(({ event }) => onMenu?.(event.browserEvent, 'editor'));

    // The minimap comes with room for it, as in a window of VS Code.
    editor.onDidLayoutChange(({ width }) => {
      const wide = width >= MINIMAP_WIDTH;

      if (wide !== hasMinimap) {
        hasMinimap = wide;
        editor.updateOptions({ minimap: { enabled: wide } });
      }
    });
  }

  function show(path) {
    if (active && documents.has(active)) {
      documents.get(active).viewState = editor.saveViewState();
    }

    active = path;

    for (const [name, entry] of documents) {
      entry.tab.classList.toggle('is-active', name === path);
      entry.tab.setAttribute('aria-selected', name === path ? 'true' : 'false');
      entry.tab.tabIndex = name === path ? 0 : -1;
    }

    breadcrumbs.replaceChildren(...(path ?? '').split('/').map((part) => createElement('span', 'playground-breadcrumb', part)));

    if (!path) {
      empty.hidden = false;
      host.hidden = true;
      editor?.setModel(null);
      onShow?.(null, '');

      return;
    }

    const entry = documents.get(path);
    const language = entry.model.getLanguageId();

    empty.hidden = true;
    host.hidden = false;

    if (editor) {
      editor.setModel(entry.model);
    } else {
      createView(entry.model);
    }

    if (entry.viewState) {
      editor.restoreViewState(entry.viewState);
    }

    editor.updateOptions({ ariaLabel: path, wordWrap: WRAPPED.has(language) ? 'on' : 'off' });
    onShow?.(path, languageName(language));

    const { lineNumber, column } = editor.getPosition() ?? { lineNumber: 1, column: 1 };

    onCursor?.(lineNumber, column);
  }

  function close(path) {
    flush(path);

    const entry = documents.get(path);

    documents.delete(path);
    entry.tab.remove();

    if (active === path) {
      active = null;
      show([...documents.keys()].at(-1) ?? null);
    }

    entry.model.dispose();
  }

  // The tab after or before the active one, around the ends.
  function step(offset) {
    const paths = [...documents.keys()];

    if (paths.length > 1 && active) {
      show(paths[(paths.indexOf(active) + offset + paths.length) % paths.length]);
    }
  }

  return {
    get active() {
      return active;
    },

    async open(path, text) {
      if (!documents.has(path)) {
        const language = LANGUAGES[path.split('.').pop().toLowerCase()];
        // Models are known by their URI, and a page can hold more than one playground.
        const model = monaco.editor.createModel(text, language, monaco.Uri.file(`/playground-${id}/${path}`));
        const tab = createElement('div', 'playground-tab');
        const name = createElement('span', 'playground-tab-name', path.split('/').pop());
        const closeButton = createElement('span', 'playground-tab-close');

        model.onDidChangeContent(() => {
          if (!isReplacing) {
            scheduleWrite(path);
          }
        });
        tab.setAttribute('role', 'tab');
        tab.title = path;
        tab.dataset.path = path;
        tab.addEventListener('contextmenu', (event) => onMenu?.(event, 'tab', path));
        tab.addEventListener('click', (event) => {
          if (!closeButton.contains(event.target)) {
            show(path);
            editor.focus();
          }
        });
        tab.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            show(path);
            editor.focus();
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            step(event.key === 'ArrowRight' ? 1 : -1);
            documents.get(active)?.tab.focus();
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            // The close glyph is for the pointer; the keyboard closes with these, or Ctrl+W.
            event.preventDefault();
            close(path);
            documents.get(active)?.tab.focus();
          }
        });
        closeButton.title = 'Close';
        closeButton.setAttribute('aria-hidden', 'true');
        closeButton.append(icon('close'));
        closeButton.addEventListener('click', () => close(path));
        tab.append(name, closeButton);
        tabs.append(tab);
        documents.set(path, { model, tab, viewState: null });
      }

      show(path);
    },

    // Puts in what a file holds now, after something else changed it. The reader can
    // still undo their way back.
    replace(path, text) {
      const entry = documents.get(path);

      if (!entry || entry.model.getValue() === text) {
        return;
      }

      isReplacing = true;
      entry.model.pushEditOperations([], [{ range: entry.model.getFullModelRange(), text }], () => null);
      isReplacing = false;
    },

    has(path) {
      return documents.has(path);
    },

    show(path) {
      if (documents.has(path) && path !== active) {
        show(path);
      }
    },

    // Closes the file shown, as Ctrl+W does in VS Code.
    closeActive() {
      if (active) {
        close(active);
        editor?.focus();
      }
    },

    close(path) {
      if (documents.has(path)) {
        close(path);
      }
    },

    closeOthers(path) {
      for (const other of [...documents.keys()]) {
        if (other !== path) {
          close(other);
        }
      }
    },

    closeAll() {
      for (const path of [...documents.keys()]) {
        close(path);
      }
    },

    // Closes the files in a folder, when it goes or is renamed.
    closeUnder(folder) {
      for (const path of [...documents.keys()]) {
        if (path === folder || path.startsWith(`${folder}/`)) {
          close(path);
        }
      }
    },

    paths() {
      return [...documents.keys()];
    },

    // Runs one of the editor's own actions, such as the ones of its menu.
    runAction(id) {
      editor?.focus();
      editor?.getAction(id)?.run();
    },

    hasSelection() {
      return Boolean(editor && !editor.getSelection()?.isEmpty());
    },

    next() {
      step(1);
      editor?.focus();
    },

    previous() {
      step(-1);
      editor?.focus();
    },

    // Writes the file shown now, as Ctrl+S does, though it's written anyway.
    save() {
      if (active) {
        flush(active);
      }
    },

    focus() {
      editor?.focus();
    },

    destroy() {
      for (const path of [...timers.keys()]) {
        flush(path);
      }

      editor?.dispose();

      for (const { model } of documents.values()) {
        model.dispose();
      }

      documents.clear();
    }
  };
}
