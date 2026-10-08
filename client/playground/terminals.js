/**
 * The terminals of a playground, in a panel like VS Code's: a list of them on the
 * right, one more with the + button, each closed with its own trash. The first one
 * runs the commands of the settings and the shell after them; the others are shells.
 */

import { icon, iconButton } from './icons.js';

const XTERM = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/+esm';
const XTERM_FIT = 'https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/+esm';
const XTERM_STYLESHEET = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css';

// Text that would be too faint on the background, such as the dim grey that programs
// print notes in, is lightened by the terminal to this contrast.
const TERMINAL_CONTRAST = 4.5;

// The colours of VS Code's terminal.
const ANSI = {
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5'
};

const createElement = (tagName, className, textContent = '') => Object.assign(document.createElement(tagName), { className, textContent });

const loadModule = (url) => import(/* @vite-ignore */ url);

function loadStylesheet(href) {
  if (!document.querySelector(`link[href="${href}"]`)) {
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  }
}

// The terminal comes from a CDN when the first playground runs.
export async function loadTerminal() {
  loadStylesheet(XTERM_STYLESHEET);

  const [{ Terminal }, { FitAddon }] = await Promise.all([loadModule(XTERM), loadModule(XTERM_FIT)]);

  return { Terminal, FitAddon };
}

/**
 * The terminal panel in element. theme has the colours of the panel, onKey is given
 * every key pressed in a terminal and answers true for the ones the panel takes,
 * openShell starts a shell in a new terminal, and onMenu is given a context menu event
 * with the terminal it is for.
 */
export function createTerminals(element, { Terminal, FitAddon }, { theme, onKey, openShell, onMenu }) {
  const bar = createElement('div', 'playground-terminal-bar');
  const title = createElement('span', 'playground-terminal-title', 'Terminal');
  const add = iconButton('add', 'New terminal');
  const trash = iconButton('trash', 'Kill the terminal');
  const main = createElement('div', 'playground-terminal-main');
  const views = createElement('div', 'playground-terminal-views');
  const tabs = createElement('div', 'playground-terminal-tabs');
  const terminals = [];
  let active = null;
  let count = 0;

  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Terminals');
  tabs.setAttribute('aria-orientation', 'vertical');
  bar.append(title, add, trash);
  main.append(views, tabs);
  element.append(bar, main);

  function create() {
    const name = ++count === 1 ? 'jsh' : `jsh ${count}`;
    const view = createElement('div', 'playground-terminal-view');
    const tab = createElement('div', 'playground-terminal-tab');
    const kill = createElement('span', 'playground-terminal-kill');
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: theme.codeFont,
      // The terminal is a surface for content, like the editor, in its colour.
      theme: {
        ...ANSI,
        background: theme.editor,
        foreground: theme.text,
        cursor: theme.text,
        cursorAccent: theme.editor,
        selectionBackground: theme.selection
      },
      minimumContrastRatio: TERMINAL_CONTRAST
    });
    const fit = new FitAddon();
    const entry = { name, view, tab, terminal, fit, process: null, input: null, observer: null, isProtected: false };

    tab.setAttribute('role', 'tab');
    tab.title = name;
    kill.title = 'Kill the terminal';
    kill.setAttribute('aria-hidden', 'true');
    kill.append(icon('trash'));
    tab.append(icon('terminal'), createElement('span', 'playground-terminal-tab-name', name), kill);
    tab.addEventListener('click', (event) => {
      if (kill.contains(event.target)) {
        close(entry);
        active?.terminal.focus();
      } else {
        show(entry);
        terminal.focus();
      }
    });
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        show(entry);
        terminal.focus();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        close(entry);
        active?.tab.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = terminals[(terminals.indexOf(entry) + (event.key === 'ArrowDown' ? 1 : -1) + terminals.length) % terminals.length];

        show(next);
        next.tab.focus();
      }
    });
    tab.addEventListener('contextmenu', (event) => onMenu?.(event, 'tab', entry));
    view.addEventListener('contextmenu', (event) => onMenu?.(event, 'terminal', entry));

    terminal.loadAddon(fit);
    terminal.open(view);
    // The keys that the panel takes, such as Ctrl+` , pass the terminal by.
    terminal.attachCustomKeyEventHandler((event) => !onKey?.(event));
    terminal.onData((data) => entry.input?.write(data).catch(() => {}));

    // The terminal follows the size of its box, and tells the process that is running.
    entry.observer = new ResizeObserver(() => {
      if (!view.hidden) {
        fit.fit();
        entry.process?.resize({ cols: terminal.cols, rows: terminal.rows });
      }
    });
    entry.observer.observe(view);

    terminals.push(entry);
    tabs.append(tab);
    showList();
    views.append(view);
    show(entry);

    return entry;
  }

  // The list of terminals shows once there is more than one, as in VS Code: with one,
  // it would only take room from it.
  function showList() {
    element.classList.toggle('has-several', terminals.length > 1);
  }

  function show(entry) {
    active = entry;

    for (const other of terminals) {
      other.view.hidden = other !== entry;
      other.tab.setAttribute('aria-selected', other === entry ? 'true' : 'false');
      other.tab.tabIndex = other === entry ? 0 : -1;
    }

    trash.disabled = entry.isProtected;
    entry.fit.fit();
    entry.process?.resize({ cols: entry.terminal.cols, rows: entry.terminal.rows });
  }

  // The terminal that the setup runs in can't be killed while it does: the tutorial
  // would lose its server. Ctrl+C in it still works.
  function protect(entry, isProtected) {
    entry.isProtected = isProtected;
    entry.tab.classList.toggle('is-protected', isProtected);

    if (entry === active) {
      trash.disabled = isProtected;
    }
  }

  function close(entry) {
    if (!terminals.includes(entry) || entry.isProtected) {
      return;
    }

    entry.process?.kill();
    entry.observer.disconnect();
    entry.terminal.dispose();
    entry.tab.remove();
    entry.view.remove();
    terminals.splice(terminals.indexOf(entry), 1);
    showList();

    if (active === entry) {
      active = null;

      // There's always a terminal: the last one closed is replaced by a shell.
      if (terminals.length) {
        show(terminals.at(-1));
      } else {
        openShell(create());
      }
    }
  }

  // One more terminal, with a shell in it.
  function addShell() {
    const entry = create();

    openShell(entry);
    entry.terminal.focus();
  }

  add.addEventListener('click', addShell);
  trash.addEventListener('click', () => {
    if (active) {
      close(active);
      active?.terminal.focus();
    }
  });

  return {
    get active() {
      return active;
    },

    create,
    add: addShell,
    close,
    show,
    protect,

    canClose(entry) {
      return !entry.isProtected;
    },

    // The columns and rows of a terminal, for the process that is started in it.
    size(entry) {
      return { cols: entry.terminal.cols, rows: entry.terminal.rows };
    },

    // Writes what a process prints to a terminal, gives it what the reader types, and
    // waits for it to end.
    async attach(entry, process) {
      const input = process.input.getWriter();

      entry.process = process;
      entry.input = input;
      process.output.pipeTo(new WritableStream({ write: (data) => entry.terminal.write(data) })).catch(() => {});

      const code = await process.exit;

      if (entry.input === input) {
        entry.input = null;
        entry.process = null;
      }

      input.releaseLock();

      return code;
    },

    write(entry, text) {
      entry.terminal.write(text);
    },

    // The clipboard and the screen, for the context menu.
    copy(entry) {
      const text = entry.terminal.getSelection();

      if (text) {
        navigator.clipboard?.writeText(text).catch(() => {});
      }
    },

    hasSelection(entry) {
      return entry.terminal.hasSelection();
    },

    paste(entry) {
      navigator.clipboard?.readText().then((text) => entry.terminal.paste(text)).catch(() => {});
    },

    clear(entry) {
      entry.terminal.clear();
    },

    focus() {
      active?.terminal.focus();
    },

    // For tests and tools that read what was printed.
    get first() {
      return terminals[0]?.terminal ?? null;
    },

    destroy() {
      for (const entry of [...terminals]) {
        entry.process?.kill();
        entry.observer.disconnect();
        entry.terminal.dispose();
      }

      terminals.length = 0;
      active = null;
    }
  };
}
