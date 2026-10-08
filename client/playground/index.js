/**
 * Runs the playgrounds of a page: Node.js in the browser, in a WebContainer, in a panel
 * laid out like a window of VS Code, with its explorer, its editor, its terminals and a
 * preview of what the container serves. The Markdown extension in
 * lib/md-plugins/playground.js writes the settings, and PostDoc loads this module on
 * the pages that have a playground.
 *
 * Nothing is loaded until the reader presses Run. Then the WebContainer API, the
 * terminal, the editor and the icons come from a CDN, the container boots, the files
 * of the settings are put in it, its commands run one after the other, and the reader
 * edits the files, which are written back to the container as they type, and has the
 * shell. A page can boot one container, so the playgrounds of a page share it.
 *
 * The keys of VS Code work in the panel: Ctrl+S (Cmd on a Mac) writes the file, Ctrl+P
 * finds a file, Ctrl+B, Ctrl+J and Ctrl+Shift+Y show and hide the explorer, the
 * terminal and the preview, Ctrl+` goes to the terminal and Ctrl+Shift+` opens one
 * more, Ctrl+Shift+E goes to the explorer, Ctrl+1 to the editor, Ctrl+Alt+Left and
 * Right change tabs, and Escape leaves the expanded panel. Ctrl+W closes a tab too,
 * but the browser keeps that key for itself, so the page asks before it is left while
 * a playground runs. The context menus are VS Code's too: files and folders are made,
 * renamed and deleted in the explorer, tabs closed, terminals opened and killed.
 *
 * The browser only boots a container on a page that it has isolated, which takes two
 * headers from the server: Cross-Origin-Opener-Policy: same-origin and
 * Cross-Origin-Embedder-Policy: credentialless (or require-corp).
 */

import './tokens.css';
import './playground.css';
import { onLeave, onRender } from '../page/index.js';
import { createFileTree } from './files.js';
import { createEditor } from './editor.js';
import { createTerminals, loadTerminal } from './terminals.js';
import { createQuickOpen } from './quick-open.js';
import { createSashes } from './sashes.js';
import { createMenu, keys } from './menu.js';
import { icon, iconButton, loadIcons } from './icons.js';
import { readTheme } from './theme.js';

const WEBCONTAINER_API = 'https://cdn.jsdelivr.net/npm/@webcontainer/api@1/+esm';
const PROMPT = '\x1b[1;32m❯\x1b[0m ';

// How long after the last change the files are read again, in milliseconds.
const REFRESH_DELAY = 300;
// A change by the container within this time after the editor wrote a file is the
// editor's own write coming back.
const OWN_WRITE_WINDOW = 1000;
// Files that the editor doesn't open.
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|tar|mp[34]|webm|wasm)$/i;
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
// The icons of a setup step in the preview, before, during and after it.
const STEP_ICONS = { pending: 'circle-large-outline', running: 'loading codicon-modifier-spin', done: 'check', failed: 'error' };

const playgrounds = new Set();
let container = null;
let playgroundCount = 0;

const createElement = (tagName, className, textContent = '') => Object.assign(document.createElement(tagName), { className, textContent });

const loadModule = (url) => import(/* @vite-ignore */ url);

// A URL that starts with / is relative to the site, which may be served from a subfolder.
const resolveUrl = (url) => url.startsWith('/') && !url.startsWith('//') ? (import.meta.env?.BASE_URL ?? '/') + url.slice(1) : url;

// The container is booted once for the page, by whichever playground runs first.
async function getContainer(coep) {
  container ??= (async () => {
    const { WebContainer } = await loadModule(WEBCONTAINER_API);

    return WebContainer.boot({ coep });
  })();

  return container;
}

// The files of the settings as the tree that the container mounts: nested folders, each
// file fetched from the site or written in the settings.
async function buildFileTree(files) {
  const tree = {};

  await Promise.all(Object.entries(files).map(async ([path, file]) => {
    let contents = file.content;

    if (file.url) {
      const response = await fetch(resolveUrl(file.url));

      if (!response.ok) {
        throw new Error(`${file.url} couldn't be fetched: ${response.status} ${response.statusText}`);
      }

      contents = new Uint8Array(await response.arrayBuffer());
    }

    const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
    let folder = tree;

    for (const part of parts.slice(0, -1)) {
      folder[part] ??= { directory: {} };
      folder = folder[part].directory;
    }

    folder[parts.at(-1)] = { file: { contents } };
  }));

  return tree;
}

// The words of a command, with quotes taken off.
function parseWords(command) {
  return [...command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(([, double, single, bare]) => double ?? single ?? bare);
}

// The parts of a command joined with &&.
const partsOf = (command) => command.split('&&').map((part) => part.trim()).filter(Boolean);

// A path from the current directory, which is kept like a shell keeps it.
function changeDirectory(current, path = '.') {
  const parts = (path.startsWith('/') ? [] : current.split('/').filter(Boolean));

  for (const part of path.split('/').filter(Boolean)) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  return parts.length ? parts.join('/') : '.';
}

// A path of the editor's folder, from the container's root.
const pathIn = (playground, path) => playground.directory === '.' ? path : `${playground.directory}/${path}`;

// A path from the container's root as the editor knows it, or null outside its folder.
function pathOf(playground, path) {
  if (playground.directory === '.') {
    return path;
  }

  return path.startsWith(`${playground.directory}/`) ? path.slice(playground.directory.length + 1) : null;
}

function createPlayground(element) {
  const settings = JSON.parse(element.querySelector('.playground-configuration')?.textContent || '{}');
  const hasEditor = settings.editor !== false;
  const hasPreview = settings.preview !== false;
  const panel = createElement('div', 'playground-panel');
  const header = createElement('div', 'playground-header');
  const name = settings.title ?? 'Node.js in your browser';
  const title = settings.logo
    ? Object.assign(document.createElement('img'), { className: 'playground-logo', src: resolveUrl(settings.logo), alt: name })
    : createElement('span', 'playground-title', name);
  const status = createElement('span', 'playground-status');
  const layout = createElement('span', 'playground-layout');
  const toggles = {
    files: iconButton('layout-sidebar-left', 'Toggle the explorer'),
    terminal: iconButton('layout-panel', 'Toggle the terminal'),
    preview: iconButton('layout-sidebar-right', 'Toggle the preview')
  };
  const expand = createElement('button', 'playground-expand');
  const button = createElement('button', 'playground-run', 'Run');
  const body = createElement('div', 'playground-body');
  const filesElement = createElement('div', 'playground-files');
  const editorElement = createElement('div', 'playground-editor');
  const terminalElement = createElement('div', 'playground-terminal');
  const preview = createElement('div', 'playground-preview');
  const previewBar = createElement('div', 'playground-preview-bar');
  const reload = iconButton('refresh', 'Reload the preview');
  const address = Object.assign(document.createElement('input'), { className: 'playground-address', placeholder: 'Preview pending', readOnly: true });
  const placeholder = createElement('div', 'playground-preview-placeholder');
  const steps = createElement('ul', 'playground-steps');
  const frame = Object.assign(document.createElement('iframe'), { className: 'playground-frame', title: 'Preview' });
  const statusBar = createElement('div', 'playground-statusbar');
  const remote = createElement('span', 'playground-statusbar-remote');
  const server = createElement('span', 'playground-statusbar-item');
  const position = createElement('span', 'playground-statusbar-item playground-statusbar-right');
  const indent = createElement('span', 'playground-statusbar-item playground-statusbar-file', 'Spaces: 2');
  const encoding = createElement('span', 'playground-statusbar-item playground-statusbar-file', 'UTF-8');
  const language = createElement('span', 'playground-statusbar-item');
  const playground = {
    element, settings, panel, body, status, layout, toggles, expand, button, filesElement, editorElement, terminalElement, frame, placeholder, address, server, position, language,
    menu: createMenu(panel), steps: new Map(),
    instance: null, tree: null, editor: null, terminals: null, quickOpen: null, watcher: null, serverUrl: null, serverPort: null, cwd: '.',
    directory: settings.directory ?? '.', pendingOpen: [...(settings.open ?? [])], writes: new Map(), guard: null, escape: null,
    id: ++playgroundCount, history: null
  };

  button.type = 'button';
  expand.type = 'button';
  expand.hidden = true;
  labelExpand(expand, false);
  status.setAttribute('aria-live', 'polite');
  layout.hidden = true;
  layout.append(...(hasEditor ? [toggles.files] : []), toggles.terminal, ...(hasPreview ? [toggles.preview] : []));
  address.setAttribute('aria-label', 'Address of the preview');
  address.spellcheck = false;
  previewBar.append(reload, address);

  // Until something is served, the preview shows the setup, step by step.
  for (const [index, command] of settings.commands.entries()) {
    if (partsOf(command).some((part) => parseWords(part)[0] !== 'cd')) {
      const step = createElement('li', 'playground-step');

      step.append(icon(STEP_ICONS.pending), createElement('code', 'playground-step-command', command));
      steps.append(step);
      playground.steps.set(index, step);
    }
  }

  placeholder.append(icon('globe'), createElement('p', 'playground-preview-title', 'Preview pending'), steps,
    createElement('p', 'playground-preview-note', 'The page shows here once the setup is done and the server starts.'));
  frame.hidden = true;
  preview.append(previewBar, placeholder, frame);
  remote.append(icon('remote'), createElement('span', '', 'Node.js'));
  statusBar.append(remote, server, ...(hasEditor ? [position, indent, encoding, language] : []));
  body.append(...(hasEditor ? [filesElement, editorElement] : []), terminalElement, ...(hasPreview ? [preview] : []));
  header.append(title, status, layout, expand, button);
  panel.append(header, body, statusBar);
  panel.classList.toggle('has-editor', hasEditor);
  panel.classList.toggle('has-preview', hasPreview);
  element.append(panel);
  element.classList.add('has-panel');

  for (const [name, toggle] of Object.entries(toggles)) {
    toggle.setAttribute('aria-pressed', 'true');
    toggle.addEventListener('click', () => showPart(playground, name));
  }

  button.addEventListener('click', () => run(playground).catch((error) => {
    console.error('The playground couldn\'t run:', error);
    setStatus(playground, error.message, true);
    button.disabled = false;
  }));
  expand.addEventListener('click', () => setExpanded(playground, !element.classList.contains('is-expanded')));
  reload.addEventListener('click', () => {
    // The frame is another origin, so it's loaded again by setting its address again.
    if (frame.src) {
      frame.src = String(frame.src);
    }
  });
  // A path typed in the address goes to the server in the container.
  address.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && playground.serverUrl) {
      event.preventDefault();
      showPage(playground, address.value.replace(/^[a-z]+:\/\/[^/]*/, '').replace(/^localhost:\d+/, '') || '/');
    }
  });
  // The keys of VS Code, before the editor and the terminal see them.
  panel.addEventListener('keydown', (event) => {
    if (handleKey(playground, event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  playgrounds.add(playground);
}

function setStatus(playground, message, isError = false) {
  playground.status.textContent = message;
  playground.status.classList.toggle('is-error', isError);
}

// Marks a setup step in the preview: 'running', 'done' or 'failed'.
function setStep(playground, index, state) {
  const step = playground.steps.get(index);

  if (step) {
    step.className = `playground-step is-${state}`;
    step.querySelector('.codicon').className = `codicon codicon-${STEP_ICONS[state]}`;
  }
}

// Shows a page of the server in the container in the preview.
function showPage(playground, path) {
  const url = new URL(path.replace(/^\/+/, ''), playground.serverUrl);

  playground.frame.src = url.href;
  playground.frame.hidden = false;
  playground.placeholder.hidden = true;
  playground.address.value = `localhost:${playground.serverPort}${url.pathname}${url.search}${url.hash}`;
}

// Shows or hides the explorer, the terminal or the preview.
function showPart(playground, name, shown = playground.panel.classList.contains(`hides-${name}`)) {
  playground.panel.classList.toggle(`hides-${name}`, !shown);
  playground.toggles[name].setAttribute('aria-pressed', String(shown));
}

const isShown = (playground, name) => !playground.panel.classList.contains(`hides-${name}`);

// What the expand button says: Expand, or the way back to the page once it is expanded.
function labelExpand(expand, expanded) {
  const label = expanded ? 'Back to the page' : 'Expand';

  expand.replaceChildren(icon(expanded ? 'arrow-left' : 'screen-full'), createElement('span', 'playground-expand-label', label));

  if (expanded) {
    const key = createElement('kbd', 'playground-key', 'Esc');

    key.setAttribute('aria-hidden', 'true');
    expand.append(key);
  }

  expand.title = expanded ? 'Back to the page (Escape)' : 'Expand over the page';
  expand.setAttribute('aria-label', label);

  if (expanded) {
    expand.setAttribute('aria-keyshortcuts', 'Escape');
  } else {
    expand.removeAttribute('aria-keyshortcuts');
  }
}

// The panel over the whole page, for room to work in, or back in the page.
function showExpanded(playground, expanded) {
  const { element, panel, expand } = playground;

  element.classList.toggle('is-expanded', expanded);
  labelExpand(expand, expanded);
  document.body.style.overflow = expanded ? 'hidden' : '';

  // Escape leaves, wherever the focus is: the panel is all there is to see.
  playground.escape ??= (event) => {
    if (event.key === 'Escape' && !playground.quickOpen?.isOpen && !playground.menu.isOpen && !panel.contains(event.target)) {
      setExpanded(playground, false);
    }
  };
  document[expanded ? 'addEventListener' : 'removeEventListener']('keydown', playground.escape);
}

// Expanding is a step in the browser's history, so its back button returns to the
// page, as a reader expects of something that fills the window, and forward expands
// the panel again. Postdoc's navigation would show the page again from scratch on
// those steps, losing the container, so the playground claims them: see renderer.js.
function setExpanded(playground, expanded, { fromHistory = false } = {}) {
  if (expanded === playground.element.classList.contains('is-expanded')) {
    return;
  }

  if (!fromHistory) {
    if (expanded) {
      history.pushState({ ...history.state, postdocPlayground: playground.id }, '');
    } else if (history.state?.postdocPlayground === playground.id) {
      // Back past the step that expanding made, whose popstate shrinks the panel.
      history.back();

      return;
    }
  }

  if (!playground.history) {
    // True when the step was the playground's, which it then follows.
    const follow = (state) => {
      const isExpanded = state?.postdocPlayground === playground.id;

      if (isExpanded === playground.element.classList.contains('is-expanded')) {
        return false;
      }

      setExpanded(playground, isExpanded, { fromHistory: true });

      return true;
    };

    playground.history = {
      claim(event) {
        if (follow(event.detail.state)) {
          event.preventDefault();
        }
      },
      // Where Postdoc doesn't navigate the pages itself, the step comes to the page as it is.
      popstate: (event) => follow(event.state)
    };
    addEventListener('postdoc:popstate', playground.history.claim);
    addEventListener('popstate', playground.history.popstate);
  }

  showExpanded(playground, expanded);
}

// The keys of VS Code. True when the key was taken.
function handleKey(playground, event) {
  const { editor, terminals, quickOpen, tree } = playground;
  const mod = IS_MAC ? event.metaKey : event.ctrlKey;
  const key = event.key.toLowerCase();

  if (event.key === 'Escape') {
    if (quickOpen?.isOpen || playground.menu.isOpen || event.target.closest('.playground-tree-input')) {
      return false;
    }

    if (playground.element.classList.contains('is-expanded')) {
      setExpanded(playground, false);
      playground.expand.focus();

      return true;
    }

    return false;
  }

  if (event.ctrlKey && !event.metaKey && event.code === 'Backquote') {
    if (event.shiftKey) {
      terminals?.add();
    } else if (!isShown(playground, 'terminal')) {
      showPart(playground, 'terminal', true);
      terminals?.focus();
    } else if (playground.terminalElement.contains(document.activeElement)) {
      showPart(playground, 'terminal', false);
      editor?.focus();
    } else {
      terminals?.focus();
    }

    return true;
  }

  if (!mod) {
    return false;
  }

  if (event.altKey && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    editor?.[event.key === 'ArrowLeft' ? 'previous' : 'next']();

    return Boolean(editor);
  }

  if (event.altKey) {
    return false;
  }

  if (event.shiftKey) {
    if (key === 'e' && tree) {
      showPart(playground, 'files', true);
      (tree.element.querySelector('.playground-file[aria-current="true"]') ?? tree.element.querySelector('.playground-folder, .playground-file'))?.focus();

      return true;
    }

    if (key === 'y' && playground.toggles.preview.isConnected) {
      showPart(playground, 'preview');

      return true;
    }

    return false;
  }

  switch (key) {
    case 's':
      editor?.save();

      return true;
    case 'w':
      editor?.closeActive();

      return Boolean(editor);
    case 'p':
      quickOpen?.open();

      return Boolean(quickOpen);
    case 'b':
      if (tree) {
        showPart(playground, 'files');
      }

      return Boolean(tree);
    case 'j':
      showPart(playground, 'terminal');

      return true;
    case '1':
      editor?.focus();

      return Boolean(editor);
    default:
      return false;
  }
}

// The context menus, as VS Code has them.
function showMenu(playground, event, kind, subject) {
  const { menu, editor, tree, terminals } = playground;
  const copyPath = (path) => ({ label: 'Copy Path', action: () => navigator.clipboard?.writeText(pathIn(playground, path)).catch(() => {}) });

  switch (kind) {
    case 'file':
      menu.show(event, [
        { label: 'Open', action: () => openFile(playground, subject) },
        '-',
        { label: 'Rename…', keys: 'F2', action: () => renameEntry(playground, subject) },
        { label: 'Delete', keys: IS_MAC ? keys('Mod+⌫') : 'Delete', action: () => deleteEntry(playground, subject) },
        '-',
        copyPath(subject)
      ]);
      break;
    case 'folder':
    case 'root':
      menu.show(event, [
        { label: 'New File…', action: () => newEntry(playground, subject, false) },
        { label: 'New Folder…', action: () => newEntry(playground, subject, true) },
        ...(kind === 'folder' ? [
          '-',
          { label: 'Rename…', keys: 'F2', action: () => renameEntry(playground, subject) },
          { label: 'Delete', keys: IS_MAC ? keys('Mod+⌫') : 'Delete', action: () => deleteEntry(playground, subject) },
          '-',
          copyPath(subject)
        ] : [
          '-',
          { label: 'Refresh', action: () => refreshFiles(playground) }
        ])
      ]);
      break;
    case 'tab':
      menu.show(event, [
        { label: 'Close', keys: keys('Mod+W'), action: () => editor.close(subject) },
        { label: 'Close Others', disabled: editor.paths().length < 2, action: () => editor.closeOthers(subject) },
        { label: 'Close All', action: () => editor.closeAll() },
        '-',
        {
          label: 'Reveal in Explorer',
          action() {
            showPart(playground, 'files', true);
            tree.select(subject);
          }
        },
        copyPath(subject)
      ]);
      break;
    case 'editor':
      menu.show(event, [
        { label: 'Change All Occurrences', keys: keys('Mod+F2'), action: () => editor.runAction('editor.action.changeAll') },
        { label: 'Format Document', keys: keys('Shift+Alt+F'), action: () => editor.runAction('editor.action.formatDocument') },
        '-',
        { label: 'Cut', keys: keys('Mod+X'), action: () => editor.runAction('editor.action.clipboardCutAction') },
        { label: 'Copy', keys: keys('Mod+C'), action: () => editor.runAction('editor.action.clipboardCopyAction') },
        { label: 'Paste', keys: keys('Mod+V'), action: () => editor.runAction('editor.action.clipboardPasteAction') },
        '-',
        { label: 'Command Palette…', keys: 'F1', action: () => editor.runAction('editor.action.quickCommand') }
      ]);
      break;
    case 'terminal':
    case 'terminal-tab':
      menu.show(event, [
        ...(kind === 'terminal' ? [
          { label: 'Copy', keys: keys('Mod+C'), disabled: !terminals.hasSelection(subject), action: () => terminals.copy(subject) },
          { label: 'Paste', keys: keys('Mod+V'), action: () => terminals.paste(subject) },
          '-',
          { label: 'Clear', action: () => terminals.clear(subject) },
          '-'
        ] : []),
        { label: 'New Terminal', keys: keys('Ctrl+Shift+`'), action: () => terminals.add() },
        {
          label: 'Kill Terminal',
          disabled: !terminals.canClose(subject),
          action() {
            terminals.close(subject);
            terminals.focus();
          }
        }
      ]);
      break;
    default:
      break;
  }
}

// Reads the editor's folder again, and files that something else changed.
async function refreshFiles(playground, changed = []) {
  const { tree, editor, instance } = playground;

  if (!tree) {
    return;
  }

  const exists = await tree.refresh(instance.fs, playground.directory);

  for (const name of changed) {
    const path = pathOf(playground, name);

    if (path && editor.has(path) && Date.now() - (playground.writes.get(path) ?? 0) > OWN_WRITE_WINDOW) {
      instance.fs.readFile(pathIn(playground, path), 'utf-8').then((text) => editor.replace(path, text)).catch(() => {});
    }
  }

  if (exists) {
    await openPending(playground);
  }
}

// Opens the files of the settings that exist now. The first of them is shown, once it
// has come.
async function openPending(playground) {
  const { pendingOpen, tree, editor, settings } = playground;
  let opened = false;

  for (const path of [...pendingOpen]) {
    if (tree.has(path)) {
      pendingOpen.splice(pendingOpen.indexOf(path), 1);
      await openFile(playground, path);
      opened = true;
    }
  }

  if (opened && settings.open?.[0] && editor.has(settings.open[0])) {
    editor.show(settings.open[0]);
  }
}

async function openFile(playground, path) {
  const { editor, instance } = playground;

  if (BINARY.test(path)) {
    setStatus(playground, `${path} isn't a text file.`);

    return;
  }

  let text;

  try {
    text = await instance.fs.readFile(pathIn(playground, path), 'utf-8');
  } catch {
    setStatus(playground, `${path} couldn't be read.`);

    return;
  }

  await editor.open(path, text);
}

async function writeFile(playground, path, text) {
  playground.writes.set(path, Date.now());

  try {
    await playground.instance.fs.writeFile(pathIn(playground, path), text);
  } catch (error) {
    setStatus(playground, `${path} couldn't be written: ${error.message}`, true);
  }
}

// A file or folder with the name the reader types, in a folder of the explorer.
function newEntry(playground, folder, isFolder) {
  const { tree, instance } = playground;

  showPart(playground, 'files', true);
  tree.promptNew(folder, async (name) => {
    if (!name) {
      return;
    }

    const path = folder ? `${folder}/${name}` : name;

    try {
      if (isFolder) {
        await instance.fs.mkdir(pathIn(playground, path), { recursive: true });
        await refreshFiles(playground);
      } else {
        await instance.fs.writeFile(pathIn(playground, path), '');
        await refreshFiles(playground);
        await openFile(playground, path);
        playground.editor.focus();
      }
    } catch (error) {
      setStatus(playground, `${path} couldn't be made: ${error.message}`, true);
    }
  });
}

function renameEntry(playground, path) {
  const { tree, editor, instance } = playground;

  tree.promptRename(path, async (name) => {
    if (!name || name === path.split('/').pop()) {
      return;
    }

    const next = [...path.split('/').slice(0, -1), name].join('/');
    const wasOpen = editor.has(path);

    try {
      editor.closeUnder(path);
      await instance.fs.rename(pathIn(playground, path), pathIn(playground, next));
      await refreshFiles(playground);

      if (wasOpen) {
        await openFile(playground, next);
      }
    } catch (error) {
      setStatus(playground, `${path} couldn't be renamed: ${error.message}`, true);
    }
  });
}

async function deleteEntry(playground, path) {
  const { editor, instance } = playground;

  if (!window.confirm(`Delete ${path}?`)) {
    return;
  }

  try {
    editor.closeUnder(path);
    await instance.fs.rm(pathIn(playground, path), { recursive: true, force: true });
    await refreshFiles(playground);
  } catch (error) {
    setStatus(playground, `${path} couldn't be deleted: ${error.message}`, true);
  }
}

// The tree follows what the container does to the files. The churn of node_modules
// is left out: it's never shown.
function watchFiles(playground) {
  const changed = new Set();
  let timer;

  try {
    playground.watcher = playground.instance.fs.watch('.', { recursive: true }, (event, filename) => {
      const name = typeof filename === 'string' ? filename : new TextDecoder().decode(filename);

      if (name === 'node_modules' || name.startsWith('node_modules/') || name.includes('/node_modules/')) {
        return;
      }

      changed.add(name);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const names = [...changed];

        changed.clear();
        refreshFiles(playground, names).catch(() => {});
      }, REFRESH_DELAY);
    });
  } catch (error) {
    console.error('The playground can\'t follow the files of the container:', error);
  }
}

// A shell in a terminal, in the folder the commands ended in. The terminal goes with it.
async function openShell(playground, entry) {
  const { instance, terminals } = playground;
  const shell = await instance.spawn('jsh', [], { cwd: playground.cwd, terminal: terminals.size(entry) });

  await terminals.attach(entry, shell);
  terminals.close(entry);
}

async function run(playground) {
  const { settings, element, panel, button, terminalElement } = playground;
  const hasEditor = settings.editor !== false;
  const hasPreview = settings.preview !== false;

  button.disabled = true;

  if (!globalThis.crossOriginIsolated) {
    setStatus(playground, 'This page isn\'t isolated by the browser, so Node.js can\'t run in it. The server has to send ' +
      'Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: credentialless.', true);

    return;
  }

  setStatus(playground, 'Loading…');
  loadIcons();

  const theme = readTheme(panel);
  const terminals = createTerminals(terminalElement, await loadTerminal(), {
    theme,
    onKey: (event) => event.type === 'keydown' && handleKey(playground, event),
    openShell: (entry) => openShell(playground, entry).catch(() => {}),
    onMenu: (event, kind, entry) => showMenu(playground, event, kind === 'tab' ? 'terminal-tab' : 'terminal', entry)
  });
  const first = terminals.create();

  terminals.protect(first, true);
  playground.terminals = terminals;
  element.classList.add('is-running');
  playground.expand.hidden = false;
  playground.layout.hidden = false;
  // For tests and tools that read what was printed, and what is in the container.
  element.playgroundTerminal = terminals.first;
  element.playground = playground;

  // Leaving the page loses the container, and Ctrl+W is a habit of VS Code's.
  playground.guard = (event) => {
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', playground.guard);

  setStatus(playground, 'Starting Node.js…');

  if (hasEditor) {
    playground.tree = createFileTree(playground.filesElement, {
      onOpen: (path) => openFile(playground, path),
      onMenu: (event, kind, path) => showMenu(playground, event, kind, path),
      onCommand: (command, path) => (command === 'rename' ? renameEntry : deleteEntry)(playground, path)
    });
  }

  const [instance, editor] = await Promise.all([
    getContainer(settings.coep ?? 'credentialless'),
    hasEditor && createEditor(playground.editorElement, {
      theme,
      write: (path, text) => writeFile(playground, path, text),
      onShow(path, languageName) {
        if (path) {
          playground.tree.select(path);
        }

        playground.language.textContent = languageName;
        panel.classList.toggle('has-file', Boolean(path));
      },
      onCursor(line, column) {
        playground.position.textContent = `Ln ${line}, Col ${column}`;
      },
      onMenu: (event, kind, path) => showMenu(playground, event, kind, path)
    })
  ]);

  playground.instance = instance;
  playground.editor = editor || null;

  if (hasEditor) {
    playground.quickOpen = createQuickOpen(playground.editorElement, {
      files: () => playground.tree.paths(),
      onOpen: (path) => openFile(playground, path).then(() => editor.focus())
    });
  }

  createSashes(panel, playground.body, [hasEditor && 'files', hasPreview && 'preview', hasEditor && 'terminal'].filter(Boolean));

  instance.on('server-ready', (port, url) => {
    playground.serverUrl = url;
    playground.serverPort = port;
    playground.address.readOnly = false;
    playground.server.textContent = `Port ${port}`;
    showPage(playground, typeof settings.preview === 'string' ? settings.preview : '/');
    setStatus(playground, 'Running');
  });

  if (hasEditor) {
    watchFiles(playground);
  }

  if (Object.keys(settings.files).length) {
    setStatus(playground, 'Fetching files…');
    await instance.mount(await buildFileTree(settings.files));
  }

  await refreshFiles(playground);

  for (const [index, command] of settings.commands.entries()) {
    setStep(playground, index, 'running');

    for (const part of partsOf(command)) {
      terminals.write(first, `${PROMPT}${part}\r\n`);

      const [name, ...args] = parseWords(part);

      if (name === 'cd') {
        playground.cwd = changeDirectory(playground.cwd, args[0]);

        // The editor shows the folder that the commands are in, unless the settings name one.
        if (!settings.directory) {
          playground.directory = playground.cwd;
          await refreshFiles(playground);
        }

        continue;
      }

      setStatus(playground, `Running ${part}`);

      const code = await terminals.attach(first, await instance.spawn(name, args, { cwd: playground.cwd, terminal: terminals.size(first) }));

      await refreshFiles(playground);

      if (code !== 0) {
        terminals.write(first, `\r\n\x1b[31m${part} ended with code ${code}.\x1b[0m\r\n`);
        setStatus(playground, `${part} failed`, true);
        setStep(playground, index, 'failed');

        break;
      }
    }

    if (playground.status.classList.contains('is-error')) {
      break;
    }

    setStep(playground, index, 'done');
  }

  if (!playground.status.classList.contains('is-error')) {
    setStatus(playground, settings.shell === false ? 'Done' : 'Running');
  }

  // The setup is over: its terminal is like any other.
  terminals.protect(first, false);

  if (settings.shell === false) {
    return;
  }

  // The shell is the reader's.
  if (!hasEditor) {
    terminals.focus();
  }

  openShell(playground, first).catch(() => {});
}

function removePlaygrounds() {
  for (const playground of playgrounds) {
    playground.menu.close();
    playground.watcher?.close();
    playground.editor?.destroy();
    playground.terminals?.destroy();

    if (playground.guard) {
      window.removeEventListener('beforeunload', playground.guard);
    }

    if (playground.history) {
      removeEventListener('postdoc:popstate', playground.history.claim);
      removeEventListener('popstate', playground.history.popstate);
    }

    if (playground.element.classList.contains('is-expanded')) {
      showExpanded(playground, false);
    }
  }

  playgrounds.clear();

  // The next page may have a playground of its own, and a page can boot one container.
  container?.then((instance) => instance.teardown()).catch(() => {});
  container = null;
}

onRender(() => document.querySelectorAll('.playground').forEach(createPlayground), {
  forPage() {
    return true;
  }
});

onLeave(removePlaygrounds, {
  forPage() {
    return true;
  }
});
