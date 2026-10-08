/**
 * Playgrounds: Node.js running in the reader's browser, in a
 * [WebContainer](https://webcontainers.io), with a file tree, a code editor, a terminal
 * and a preview of what it serves. A page can set up a project and run its commands,
 * and the reader can edit the files, watch the preview follow and carry on in the
 * shell: an interactive tutorial.
 *
 * ````md
 * ::: playground
 * ```yaml
 * files: /playground/first-site
 * commands:
 *   - npm install
 *   - npm run dev
 * open: content/index.md
 * ```
 *
 * Press Run to start Node.js in your browser.
 * :::
 * ````
 *
 * The settings, in a YAML or JSON code block at the start of the container:
 *
 * - `files` - the files to start with. A folder of the site's public files, by its
 *   URL, holds a whole project: every file in it is fetched when the playground runs
 *   (`node_modules` and `.git` are left out). Or a map from each path in the
 *   container to `{ url }`, a file of the site, or `{ content }`, text written in the
 *   settings.
 * - `commands` - shell commands to run one after the other. `cd` changes the directory
 *   for the commands after it.
 * - `directory` - the folder that the editor shows. By default, the one that the
 *   commands end in.
 * - `open` - a file, or a list of files, to open in the editor as soon as they exist,
 *   relative to the editor's folder. The first one is shown.
 * - `editor` - whether to show the file tree and the editor. `true` by default.
 * - `preview` - whether to show what the container serves: `true` by default, or the
 *   path of the page to show, such as `/guide/index.html`.
 * - `shell` - whether to leave the reader a shell after the commands. `true` by default.
 * - `title` - the name of the panel. "Node.js in your browser" by default.
 * - `logo` - the URL of a picture to show in the panel's title bar in place of the title,
 *   such as the logo of the project. The title is its text alternative.
 * - `coep` - the Cross-Origin-Embedder-Policy the page is served with:
 *   `credentialless` by default, or `require-corp`.
 *
 * The text after the settings is shown above the panel, and is all that shows without
 * JavaScript. The page has to be served with the headers that let the browser isolate
 * it: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy:
 * credentialless` (or `require-corp`). The client in client/playground runs it.
 */

import yaml from 'js-yaml';

import { readFiles } from './public-files.js';

const SETTINGS = ['files', 'commands', 'directory', 'open', 'editor', 'preview', 'shell', 'title', 'logo', 'coep'];
const POLICIES = ['credentialless', 'require-corp'];

function fail(message) {
  throw new Error(`Playground: ${message}`);
}

function parseSettings(source, publicDirectory) {
  const match = /^\s*```(?:ya?ml|json)[ \t]*\n([\s\S]*?)\n```[ \t]*(?:\n|$)/.exec(source);
  let settings = {};

  if (match) {
    try {
      settings = yaml.load(match[1]) ?? {};
    } catch (error) {
      fail(`the settings aren't valid YAML: ${error.message}`);
    }
  }

  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    fail('the settings should be a set of keys, such as files and commands.');
  }

  for (const name of Object.keys(settings)) {
    if (!SETTINGS.includes(name)) {
      fail(`${name} isn't a setting. Use ${SETTINGS.join(', ').replace(/, (\w+)$/, ' or $1')}.`);
    }
  }

  const { commands = [], directory, editor, preview, coep, logo } = settings;
  let { files = {}, open = [] } = settings;

  files = readFiles(files, publicDirectory, fail);

  if (!Array.isArray(commands) || commands.some((command) => typeof command !== 'string' || !command.trim())) {
    fail('commands should be a list of shell commands.');
  }

  if (directory !== undefined && (typeof directory !== 'string' || !directory.trim())) {
    fail('directory should be the path of a folder.');
  }

  if (typeof open === 'string') {
    open = [open];
  }

  if (!Array.isArray(open) || open.some((path) => typeof path !== 'string' || !path.trim())) {
    fail('open should be a file, or a list of files, to open in the editor.');
  }

  if (editor !== undefined && typeof editor !== 'boolean') {
    fail('editor should be true or false.');
  }

  if (preview !== undefined && typeof preview !== 'boolean' && !(typeof preview === 'string' && preview.startsWith('/'))) {
    fail('preview should be true, false or the path of a page, such as /index.html.');
  }

  if (logo !== undefined && (typeof logo !== 'string' || !logo.trim())) {
    fail('logo should be the URL of a picture, such as /assets/logo.svg.');
  }

  if (coep !== undefined && !POLICIES.includes(coep)) {
    fail(`coep: ${coep} isn't a policy. Use ${POLICIES.join(' or ')}.`);
  }

  return { settings: { ...settings, files, commands, open }, rest: match ? source.slice(match[0].length) : source };
}

// The extension, for a site whose public files are in publicDirectory.
export const playgroundExtension = (publicDirectory) => ({
  extensions: [{
    name: 'playground',
    level: 'block',
    start(src) {
      return src.match(/^:{3,} playground/m)?.index;
    },

    tokenizer(src) {
      const match = /^(:{3,}) playground[ \t]*\n([\s\S]*?)\n\1(?!:)[ \t]*(?:\n|$)/.exec(src);

      if (!match) {
        return;
      }

      const { settings, rest } = parseSettings(match[2], publicDirectory);

      return {
        type: 'playground',
        raw: match[0],
        settings,
        tokens: this.lexer.blockTokens(rest, [])
      };
    },

    renderer(token) {
      // In a script element, "</script>" in a value would end it early.
      const settings = JSON.stringify(token.settings).replace(/</g, '\\u003c');

      return '<div class="playground">' +
        `<script type="application/json" class="playground-configuration">${settings}</script>` +
        `<div class="playground-text">${this.parser.parse(token.tokens)}</div>` +
        '</div>\n';
    }
  }],

  async: false
});
