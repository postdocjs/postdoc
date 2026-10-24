/**
 * <h2 id="overview">Overview</h2>
 *
 * PostDoc reads its settings from a configuration file in the project root,
 * the directory you run `postdoc` from. Every setting has a default, so the file
 * only needs the values you want to change. Nested objects are merged with the
 * defaults, and arrays are appended to the default arrays.
 *
 * ```js
 * // postdoc.config.js
 * export default {
 *   contentPath: './docs',
 *   appSettings: {
 *     name: 'My project'
 *   }
 * };
 * ```
 *
 * <h2 id="config-resolution">Config resolution</h2>
 *
 * PostDoc uses the first of these files that exists:
 *
 * 1. `postdoc.config.mjs`
 * 2. `postdoc.config.cjs`
 * 3. `postdoc.config.js` (an ES module when `package.json` has `"type": "module"`)
 * 4. `postdoc.config.mts`
 * 5. `postdoc.config.ts`
 * 6. `postdoc.json`
 *
 * A JavaScript or TypeScript file can export an object, or a function (sync or async)
 * that returns one.
 *
 * TypeScript files run with Node's built-in TypeScript support, which removes the types
 * and needs no other package. It doesn't compile anything, so syntax that has to be
 * compiled, such as `enum`, isn't supported, and imports of other TypeScript files need
 * their extension: `import sidebars from './sidebars.ts'`. For full TypeScript, run
 * PostDoc with a loader such as [tsx](https://tsx.is): `NODE_OPTIONS="--import tsx"`.
 *
 * ```ts
 * // postdoc.config.ts
 * import type { PostdocConfig } from 'postdoc';
 *
 * export default {
 *   contentPath: './docs'
 * } satisfies PostdocConfig;
 * ```
 *
 * Variables from a `.env` file are loaded into the environment. A string value
 * written as `${NAME}` is replaced with the `NAME` environment variable:
 *
 * ```js
 * appSettings: {
 *   analyticsId: '${ANALYTICS_ID}'
 * }
 * ```
 *
 * <h2 id="directories">Directories</h2>
 *
 * Paths are relative to the project root.
 *
 * | Setting | Default | Contents |
 * | --- | --- | --- |
 * | `contentPath` | `docs` | Markdown pages |
 * | `baseDir` | `postdoc` | The directory that holds layouts, includes and public files |
 * | `directories.layouts` | `layouts` | EJS layouts, relative to `baseDir` |
 * | `directories.includes` | `includes` | EJS partials, relative to `baseDir` |
 * | `directories.vitePublic` | `public` | Files copied to the output as they are, relative to `baseDir` |
 * | `testsPath` | `test` | Nightwatch tests run by `postdoc test` |
 * | `outputPath` | `out` | The build output |
 *
 * > Older versions used `directories.content`, `directories.tests` and
 * > `directories.output`. Those keys are ignored now. Every command reports them as an
 * > error, and `postdoc check` fails on them.
 *
 * <h2 id="base">Base path</h2>
 *
 * Set `base` when the site is served from a subfolder of its domain, such as
 * `https://example.com/docs/`:
 *
 * ```js
 * export default {
 *   base: '/docs/'
 * };
 * ```
 *
 * Builds then add the base path to every link and asset that starts with `/`, so pages
 * and layouts keep linking to `/guide/index.html`. The dev server always serves the
 * site from the root; `postdoc preview` serves the build from the base path.
 * Defaults to `/`.
 *
 * <h2 id="theme">Theme</h2>
 *
 * The `theme` setting picks the layouts, includes and public files that your project
 * builds on. Your own files with the same names take precedence.
 *
 * - `'default'` - the built-in theme. This is the default.
 * - a path such as `'./my-theme'` - a theme directory in your project. A value without
 *   a `/` is read as the name of a built-in theme.
 * - `null` - no theme.
 *
 * <h2 id="ignores">Ignores</h2>
 *
 * Each list holds [anymatch](https://github.com/micromatch/anymatch) patterns that
 * are matched against absolute file paths:
 *
 * - `ignore.pages` - Markdown files that should not become pages.
 * - `ignore.layouts` - layouts that should not become standalone pages.
 * - `ignore.apidocs` - JavaScript files that should not become API pages. By default,
 *   `node_modules` and `test` directories are skipped.
 *
 * <h2 id="api-docs">API docs</h2>
 *
 * PostDoc can turn JSDoc comments into pages. The `apidocs` setting configures it:
 *
 * - `source` - the directory with the JavaScript files. API pages are only generated
 *   when it is set.
 * - `layoutName` - the layout for API pages, relative to the layouts directory.
 *   Defaults to `apidocs.ejs`.
 * - `createUrl(filePath)` - returns the URL of the page for a file. It receives the
 *   file's path relative to `source`, and the URL also decides where the page is
 *   written. By default, the URL is that path with `.html` instead of `.js`: with
 *   `source: './lib'`, `lib/commands/run.js` becomes `/commands/run.html`.
 * - `tags` - functions that handle custom JSDoc tags, keyed by tag name. Each function
 *   receives the tag, the whole comment and the tags parsed so far, and may return an
 *   object to merge into the comment's data.
 *
 * Only files with at least one comment that has a `@name` tag become pages.
 *
 * <h2 id="markdown">Markdown</h2>
 *
 * Markdown is compiled with [marked](https://marked.js.org). The `markdown` setting has
 * three parts:
 *
 * 1. `options` - [marked options](https://marked.js.org/using_advanced#options), plus
 *    switches for the built-in extensions. All of them are on by default:
 *    `useCodeGroups`, `useTables`, `useAlertContainers`, `useMermaid`, `useStorymaps`
 *    and `useMathExpressions`. Heading ids get the prefix set in `gfmHeadingId.prefix`
 *    (`postdoc-` by default), and `gfmHeadingId: false` turns them off.
 * 2. `syntaxHighlight` - code blocks are highlighted with [Shiki](https://shiki.style)
 *    in a light and a dark theme, `github-light-high-contrast` and
 *    `github-dark-high-contrast` by default, whose colours pass the page checks.
 *    Set `theme.light` and `theme.dark` to change them, or set `syntaxHighlight`
 *    to `false` to turn highlighting off.
 * 3. `extensions` - extra [marked extensions](https://marked.js.org/using_advanced#extensions).
 *
 * <h2 id="storymap">Storymaps</h2>
 *
 * The `storymap` setting holds the map settings every
 * [storymap](/guide/storymaps.html) of the site starts with, so a story only writes what
 * is its own. A storymap's own settings replace them key by key, and any map setting can
 * be given here:
 *
 * - `style` - the base map: a [MapLibre style](https://maplibre.org/maplibre-style-spec/)
 *   URL, or a `light` and a `dark` one, which follow the site's colour scheme. A URL
 *   starting with `/` is a file of the site, in its public folder. By default, the free
 *   [OpenFreeMap](https://openfreemap.org) styles.
 * - `layout` - `docked`, the steps beside the map, or `floating`, the map filling the
 *   storymap with the steps scrolling over it. Defaults to `docked`.
 * - `projection` - `mercator`, or `globe`, which shows the Earth as a sphere when the
 *   map is zoomed out.
 * - `controls` - the controls of the map: `zoom`, the zoom buttons, which are on by
 *   default, `compass`, and `scale`, in kilometres, or `imperial` or `nautical`.
 * - `sources`, `layers`, `timeline`, `legend` and `popups` - data to put on every map,
 *   and what explains it.
 * - `map` - other [options of the MapLibre map](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/),
 *   such as `minZoom`, `maxZoom` or `maxBounds`.
 * - `center`, `zoom`, `bearing`, `pitch` and `bounds` - the view before a step sets one.
 *
 * The [storymap reference](/guide/storymaps/reference.html) describes each of them.
 *
 * ```javascript
 * export default {
 *   storymap: {
 *     style: {
 *       light: '/map-styles/bathymetry.json',
 *       dark: '/map-styles/bathymetry-dark.json'
 *     }
 *   }
 * };
 * ```
 *
 * <h2 id="app-settings">App settings</h2>
 *
 * Whatever you put in `appSettings` is available as the `appSettings` variable in
 * every layout and include, and as `{{ appSettings.name }}` in Markdown.
 * `appSettings.name` defaults to the `name` in your `package.json`.
 *
 * The default theme reads these:
 *
 * - `name` - the site's name, in the header unless there's a `logo`, and in each title.
 * - `logo` - an image for the header, such as `/logo.svg`, in place of the name.
 * - `headerNav` - the links of the header and the footer: `{ title, url }`.
 * - `nav` and `apiNav` - the sidebars of the guide and of the API reference. An item
 *   with `children` is a section that opens and closes.
 * - `github`, `editLink` and `versions` - the link to the repository, the link to edit
 *   each page, and the versions menu. See [Themes](/guide/themes.html).
 *
 * <h2 id="session">Navigation</h2>
 *
 * Pages switch without a full reload. The `session` setting controls it:
 *
 * - `disable_spa` - set to `true` to use regular page loads.
 * - `enable_prefetch` - set to `true` to fetch a page when the pointer moves over a link to it.
 *
 * <h2 id="search">Search</h2>
 *
 * The build creates a [Pagefind](https://pagefind.app) search index. The `pagefind`
 * setting controls it:
 *
 * - `enabled` - set to `false` to skip the index. Defaults to `true`.
 * - `outputDir` - where the index goes, relative to the output directory.
 *   Defaults to `pagefind`.
 * - `options` - [Pagefind indexing options](https://pagefind.app/docs/node-api/).
 *   By default, the index treats every page as English.
 *
 * <h2 id="llms">Pages for AI agents</h2>
 *
 * Builds write an [`llms.txt`](https://llmstxt.org) at the root of the site, which lists
 * its pages, and a Markdown copy of each page next to its HTML: `/guide/index.md` beside
 * `/guide/index.html`. AI agents and other tools read them more easily than the pages.
 *
 * - `llms.enabled` - set to `false` to leave them out. Defaults to `true`.
 * - `llms.description` - a line about the site, at the top of `llms.txt`. Defaults to
 *   `appSettings.description`, if there is one.
 *
 * <h2 id="pwa">PWA</h2>
 *
 * PostDoc includes [vite-plugin-pwa](https://vite-pwa-org.netlify.app), which makes the
 * built site work offline. Set `pwa.enabled` to `true` to turn it on. The other `pwa`
 * values are passed to the plugin as
 * [its options](https://vite-pwa-org.netlify.app/guide/#configuring-vite-plugin-pwa).
 *
 * <h2 id="vite">Vite</h2>
 *
 * The `vite` setting passes these options to [Vite](https://vitejs.dev/config/):
 *
 * - `server` - [dev server options](https://vitejs.dev/config/server-options.html),
 *   such as `port`.
 * - `plugins` - extra Vite plugins.
 * - `publicDir` - overrides `directories.vitePublic`.
 * - `root` and `logLevel`.
 *
 * <h2 id="logger">Logger</h2>
 *
 * - `logger.quiet` - hides everything except errors.
 * - `logger.verbose` - shows debug messages as well.
 * - `logger.noColors` - turns off colours. PostDoc also respects the
 *   [NO_COLOR](https://no-color.org) environment variable.
 *
 * <h2 id="nightwatch">Testing</h2>
 *
 * The `nightwatch` setting configures the `test` command:
 *
 * - `browser` - the Nightwatch environment, or a list of them. Defaults to `chrome`.
 * - `headless` - runs browsers without a window. Defaults to `true`.
 * - `parallel` - runs test files in parallel.
 * - `watch` - reruns the tests when they change.
 * - `config` - the path to your own Nightwatch configuration file.
 *
 * <h2 id="page-checks">Page checks</h2>
 *
 * The `test` command builds the site and checks every generated page in a real browser,
 * without any test files. Configure it with the `nightwatch.pageChecks` property:
 *
 * 1. `enabled` - set to `false` to skip page checks. Defaults to `true`.
 * 2. `ignore` - glob patterns of page URLs to skip, e.g. `'/legacy/**'`.
 * 3. `widths` - window widths, in CSS pixels, to check each page at, e.g. `[1280, 390]`
 *   to check the desktop and the phone layout. By default, pages are checked once, at the
 *   browser's window size.
 * 4. `readyTimeout` - how long to wait, in milliseconds, for a page to finish rendering
 *   before it is checked. A page is ready when its `onRender` callbacks have finished.
 *   Defaults to `10000`.
 * 5. `a11y` - accessibility checks with [axe](https://github.com/dequelabs/axe-core),
 *   or `false` to turn them off:
 *     - `context` - the CSS selector to check. Defaults to `html`.
 *     - `options` - [axe run options](https://www.deque.com/axe/core-documentation/api-documentation/#options-parameter).
 *       By default, the WCAG 2.0, 2.1 and 2.2 level A and AA rules run.
 *     - `darkMode` - runs the contrast rules again with the page in dark mode, or
 *       `false` to skip that. `attribute` and `value` say how to switch it: by default,
 *       `data-theme="dark"` on `<html>`, as the default theme does. With `attribute:
 *       'class'`, the value is added as a class. In Chrome and Edge, the
 *       `prefers-color-scheme: dark` media query matches too.
 * 6. `keyboard` - the keyboard check, or `false` to turn it off. It presses Tab through
 *   the page and fails on Tab stops that can't be seen, that don't show the focus or that
 *   have no name, on links to `#`, on elements that act as controls but can't take the
 *   focus, and when the focus gets trapped:
 *     - `skipLink` - also requires the first Tab stop to be a link to the main content.
 *       Defaults to `true`.
 *     - `ignore` - CSS selectors of elements to leave out of the report.
 *     - `maxStops` - how many Tab stops to check on a page. Defaults to `1000`.
 * 7. `toggles` - opens menus, dialogs and panels with the keyboard, or `false` to skip
 *   it. It finds buttons with `aria-expanded="false"`, `aria-haspopup`, `popovertarget`
 *   or `commandfor`, and closed `<details>`. It fails when Enter doesn't open one or
 *   `aria-expanded` doesn't follow, when the focus doesn't move into a modal dialog or
 *   leaves it, when axe or the keyboard check finds a problem in what opened, and when
 *   Escape doesn't close a dialog, a menu or an overlay or the focus doesn't go back to
 *   the button:
 *     - `ignore` - CSS selectors of buttons to leave out.
 *     - `maxToggles` - how many buttons to open on a page. Defaults to `20`.
 * 8. `text` - fails when a box cuts off text with more space between lines, words and
 *   letters (WCAG 1.4.12), or with text twice as large (WCAG 1.4.4). Set it to `false`
 *   to skip it:
 *     - `spacing` - set to `false` to skip the text spacing.
 *     - `resize` - set to `false` to skip the larger text.
 *     - `ignore` - CSS selectors of elements to leave out of the report.
 * 9. `navigation` - follows a link that PostDoc shows without a reload, and fails when
 *   the new page isn't announced to screen readers, has another title than after a page
 *   load, or Tab doesn't start from the top of it. Set it to `false` to skip it. It's
 *   skipped when `session.disable_spa` is set.
 *
 *   The keyboard and toggles checks don't run in Safari, where Tab skips links by default.
 *
 * @name configuration
 */

import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { sep, resolve, join, dirname, extname, relative, isAbsolute, basename } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

import deepmerge from 'deepmerge';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EnvironmentType = {
  MODULE: 'module',
  COMMONJS: 'commonjs'
};

const assetsToCache = ['js', 'css', 'html', 'json', 'png', 'jpeg', 'jpg', 'ico', 'webp', 'avif', 'svg', 'woff2'];

const ENVIRONMENT_VARIABLE_RE = /^\${(.+)}$/;

// Settings of older versions, and the ones that took their place. PostDoc ignores them,
// so a project that still has them would fail later on, and less clearly.
const RENAMED_SETTINGS = {
  content: 'contentPath',
  output: 'outputPath',
  tests: 'testsPath'
};

/**
 * The problems of a project's own settings, as messages: for now, the settings that
 * older versions had.
 *
 * @ignore
 */
export function findConfigurationProblems(userConfiguration = {}) {
  const directories = userConfiguration?.directories ?? {};

  return Object.entries(RENAMED_SETTINGS)
    .filter(([name]) => name in directories)
    .map(([name, replacement]) => `The configuration sets directories.${name}, which PostDoc no longer reads. ` +
      `Set ${replacement} instead, relative to the project root.`);
}

/**
 * Why building into the output directory would delete the project's own files, or null
 * when it wouldn't. A build empties the directory first, so it can't be the project's
 * folder, the home folder or a folder above them, nor hold the pages, the layouts, the
 * includes, the public files or the tests.
 *
 * @ignore
 */
export function findOutputDirectoryProblem(configuration) {
  const outputDirectory = resolve(configuration.outputPath);
  const { baseDir, directories } = configuration;
  const publicDirectory = typeof configuration.vite?.publicDir === 'string'
    ? resolve(configuration.vite.publicDir)
    : resolve(baseDir, directories.vitePublic);
  const keptPaths = [
    [process.cwd(), 'the project'],
    [homedir(), 'your home folder'],
    [resolve(baseDir), 'the project\'s files'],
    [resolve(configuration.contentPath), 'the pages'],
    [resolve(baseDir, directories.layouts), 'the layouts'],
    [resolve(baseDir, directories.includes), 'the includes'],
    [publicDirectory, 'the public files'],
    ...[configuration.testsPath].flat().map((path) => [resolve(path), 'the tests'])
  ];
  const isInOutputDirectory = (path) => {
    const relativePath = relative(outputDirectory, path);

    return relativePath !== '..' && !relativePath.startsWith('..' + sep) && !isAbsolute(relativePath);
  };
  const kept = keptPaths.find(([path]) => isInOutputDirectory(path));

  return kept
    ? `The output directory, ${outputDirectory}, holds ${kept[1]}, and a build empties it first. ` +
      'Set outputPath, or --out-dir, to a folder of its own.'
    : null;
}

const require = createRequire(import.meta.url);

const MISSING_MODULE_RE = /Cannot find module '([^']+)' imported from (\S+)/;

// Node runs TypeScript by removing the types, so a few things a compiler would handle
// fail. Returns how to fix the error, if it's one of those.
function getTypeScriptHint(error) {
  if (!process.features.typescript) {
    return 'PostDoc loads TypeScript files with Node\'s built-in TypeScript support, which is turned off. ' +
      'Remove --no-experimental-strip-types from the Node options.';
  }

  if (error.code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX') {
    return 'Node runs TypeScript by removing the types, so syntax that has to be compiled, such as enum, ' +
      'namespaces or parameter properties, isn\'t supported. Write it without, or run PostDoc with a ' +
      'TypeScript loader such as tsx: NODE_OPTIONS="--import tsx" npx postdoc.';
  }

  const [, missingPath, importer = ''] = MISSING_MODULE_RE.exec(error.message) ?? [];

  if (error.code === 'ERR_MODULE_NOT_FOUND' && missingPath && !extname(missingPath) && /\.m?ts$/.test(importer)) {
    const withExtension = ['.ts', '.mts', '/index.ts'].map((ending) => missingPath + ending).find(existsSync);

    if (withExtension) {
      const importerPath = importer.startsWith('file:') ? fileURLToPath(importer) : importer;
      const asWritten = (path) => './' + relative(dirname(importerPath), path).split(sep).join('/');

      return `Imports of TypeScript files need their extension. In ${relative(process.cwd(), importerPath)}, ` +
        `import '${asWritten(withExtension)}' instead of '${asWritten(missingPath)}'.`;
    }
  }

  return null;
}

// Where in the configuration file the error is, as a line number, when it can be told.
// Node reports a syntax error's line only when the error isn't caught, so the file is
// checked again on its own to find it.
function findErrorLine(filePath, error) {
  if (error.name === 'SyntaxError') {
    const { stderr } = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });

    return stderr?.match(/^.*?:(\d+)\n/)?.[1] ?? null;
  }

  const fileUrl = pathToFileURL(filePath).href;
  const frame = String(error.stack ?? '').split('\n').find((line) => line.includes(fileUrl) || line.includes(filePath));

  return frame?.match(/:(\d+):\d+\)?$/)?.[1] ?? null;
}

async function importConfiguration(filePath) {
  try {
    return (await import(pathToFileURL(filePath).toString())).default;
  } catch (error) {
    const hint = /\.m?ts$/.test(filePath) ? getTypeScriptHint(error) : null;

    throw hint ? new Error(`${hint}\n\n${error.message}`, { cause: error }) : error;
  }
}

export default class Configuration {
  static #instance;
  static #names = ['postdoc.config.mjs', 'postdoc.config.cjs', 'postdoc.config.js', 'postdoc.config.mts', 'postdoc.config.ts', 'postdoc.json'];

  static async initialise(environment) {
    config({ debug: Boolean(environment.DEBUG), quiet: !environment.DEBUG });

    const configuration = new Configuration(environment);

    let userConfiguration;
    let loadError = null;

    // With the defaults in its place, the help, the version and init still work. The
    // other commands report the error and stop.
    try {
      userConfiguration = await configuration.#resolveUserConfiguration();
    } catch (error) {
      loadError = error.message;
    }

    if (userConfiguration) {
      configuration.#walkAndInjectEnvironmentVariables(environment, userConfiguration);

      if (userConfiguration.pwa?.workbox?.globPatterns) {
        configuration.pwa.workbox.globPatterns = [];
      }
    }

    this.#instance = userConfiguration ? deepmerge(configuration, userConfiguration) : configuration;

    // Reported once the logger is up, and by `postdoc check`.
    this.#instance._problems = findConfigurationProblems(userConfiguration);
    this.#instance._loadError = loadError;

    // Resolve theme paths after merging so user config can override theme
    this.#instance._resolvedThemePaths = Configuration.#resolveThemePaths(this.#instance.theme);

    // "docs", "/docs" and "/docs/" all mean the same subfolder.
    this.#instance.base = `/${this.#instance.base}/`.replace(/\/+/g, '/');
  }

  static get() {
    if (!this.#instance) {
      throw new Error('Configuration is not initialised yet.');
    }

    return this.#instance;
  }

  /**
   * Resolves the absolute paths for a theme's directories.
   * Built-in themes are resolved from lib/theme/<name>/.
   * Returns null if theme is falsy (no theme).
   */
  static #resolveThemePaths(theme) {
    if (!theme) {
      return null;
    }

    let themePath;

    if (theme === 'default' || !theme.includes('/')) {
      // Built-in theme: resolve from lib/theme/<name>/
      themePath = join(__dirname, 'theme', theme);
    } else {
      // External path: resolve relative to cwd
      themePath = resolve(theme);
    }

    if (!existsSync(themePath)) {
      return null;
    }

    return {
      root: themePath,
      layouts: join(themePath, 'layouts'),
      includes: join(themePath, 'includes'),
      js: join(themePath, 'js'),
      css: join(themePath, 'css'),
      public: join(themePath, 'public')
    };
  }

  #isModuleEnvironmentInPackage;
  #resolvedThemePaths = null;

  /**
   * Returns the resolved theme directory paths, or null if no theme is configured.
   */
  get themePaths() {
    return this._resolvedThemePaths ?? this.#resolvedThemePaths;
  }

  theme = 'default';

  base = '/';

  baseDir = 'postdoc';
  contentPath = 'docs';
  testsPath = 'test';
  outputPath = 'out';

  directories = {
    layouts: 'layouts', // relative to the baseDir directory
    includes: 'includes', // relative to the baseDir directory
    vitePublic: 'public' // relative to the baseDir directory
  };

  vite = {
    publicDir: null, // will override the directories.vitePublic value if defined
    logLevel: 'info'
  }

  session = {
    disable_spa: false,
    enable_prefetch: false
  }

  pwa = {
    enabled: false,
    strategies: 'generateSW',
    registerType: 'autoUpdate',
    workbox: {
      globPatterns: [`**/*.{${assetsToCache.join(',')}}`],
      // Every page is its own HTML file, so an unknown URL must not be answered
      // with index.html the way a single-page app would be.
      navigateFallback: null
    }
  };

  apidocs = {
    tags: {},
    source: null,
    layoutName: 'apidocs.ejs',

    createUrl(filePath) {
      return filePath.split(sep).join('/').replace(/\.js$/, '.html');
    }
  };

  ignore = {
    pages: [],
    apidocs: [
      '**/node_modules/**/*',
      '**/node_modules/**/.*',
      '**/test/**/*'
    ],
    layouts: []
  };

  logger = {
    quiet: false,
    verbose: false
  };

  pagefind = {
    enabled: true,
    outputDir: 'pagefind' // relative to the build output directory
  }

  // llms.txt and a Markdown copy of every page, for AI agents.
  llms = {
    enabled: true,
    description: null
  };

  nightwatch = {
    headless: true,
    browser: 'chrome',
    watch: false,
    pageChecks: {
      enabled: true,
      ignore: [],
      widths: [],
      readyTimeout: 10000,
      a11y: {
        enabled: true,
        context: 'html',
        options: null,
        darkMode: {
          enabled: true,
          attribute: 'data-theme',
          value: 'dark'
        }
      },
      keyboard: {
        enabled: true,
        skipLink: true,
        ignore: [],
        maxStops: 1000
      },
      toggles: {
        enabled: true,
        ignore: [],
        maxToggles: 20
      },
      text: {
        enabled: true,
        spacing: true,
        resize: true,
        ignore: []
      },
      navigation: {
        enabled: true
      }
    }
  };

  appSettings = {};

  // The map settings every storymap starts with. A storymap's own settings replace them
  // key by key. Empty by default, so the storymap client's own defaults apply.
  storymap = {};

  markdown = {
    options: {
      async: true,
      useCodeGroups: true,
      useTables: true,
      useAlertContainers: true,
      useMermaid: true,
      useStorymaps: true,
      useMathExpressions: true,

      gfmHeadingId: {
        prefix: 'postdoc-'
      }
    },
    syntaxHighlight: {
      theme: {
        // GitHub's other themes have token colours that fail the contrast checks.
        light: 'github-light-high-contrast',
        dark: 'github-dark-high-contrast'
      }
    },
    extensions: []
  };

  constructor(environment) {
    this.logger.noColors = Boolean(environment.NO_COLOR);

    const packageDefinitionFilePath = resolve('package.json');
    const {
      name = '',
      type = EnvironmentType.COMMONJS
    } = existsSync(packageDefinitionFilePath) ? require(packageDefinitionFilePath) : {};

    this.appSettings.name = name;
    this.#isModuleEnvironmentInPackage = type === EnvironmentType.MODULE;
  }

  async #resolveUserConfiguration() {
    for (const configurationFileName of Configuration.#names) {
      const configurationFilePath = resolve(configurationFileName);

      const existConfigurationFile = existsSync(configurationFilePath);

      if (existConfigurationFile) {
        const isESMConfiguration = /\.(mjs|mts|ts)$/.test(configurationFileName) || (configurationFileName.endsWith('.js') && this.#isModuleEnvironmentInPackage);

        try {
          const maybeUserConfiguration = isESMConfiguration ? await importConfiguration(configurationFilePath) : require(configurationFilePath);

          return typeof maybeUserConfiguration === 'object' ? maybeUserConfiguration : await Promise.resolve(maybeUserConfiguration());
        } catch (error) {
          const line = findErrorLine(configurationFilePath, error.cause ?? error);
          const where = basename(configurationFilePath) + (line ? ` (line ${line})` : '');

          throw new Error(`The configuration in ${where} can't be loaded: ${error.message}`, { cause: error });
        }
      }
    }
  }

  #walkAndInjectEnvironmentVariables(environment, userConfiguration) {
    for (const property in userConfiguration) {
      const value = userConfiguration[property];

      if (typeof value === 'object') {
        this.#walkAndInjectEnvironmentVariables(environment, value);
      } else if (typeof value === 'string') {
        const [, environmentVariableName] = ENVIRONMENT_VARIABLE_RE.exec(value) ?? [];

        if (environmentVariableName) {
          userConfiguration[property] = environment[environmentVariableName];
        }
      }
    }
  }
}
