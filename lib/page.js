import { cwd } from 'node:process';
import { inspect } from 'node:util';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { sep, resolve, dirname, basename, extname, join } from 'node:path';

import anymatch from 'anymatch';
import { renderAsync } from '@pineview/ejs';

import Logger from './logger.js';
import PostDocError from './error.js';
import Configuration from './configuration.js';
import PageEnvironment from './page-environment.js';
import {filterStackTrace} from './utils/stack-trace.js';
import Pagefind from './pagefind.js';

const CLOSING_HEAD_TAG = '</head>';
const STORYMAP_MARKER = '<div class="storymap">';
const STORYMAP_SCRIPT = '<script type="module">import \'postdoc/storymap\';</script>';
const PLAYGROUND_MARKER = '<div class="playground">';
const PLAYGROUND_SCRIPT = '<script type="module">import \'postdoc/playground\';</script>';
const NOTEBOOK_MARKER = '<div class="notebook">';
const NOTEBOOK_SCRIPT = '<script type="module">import \'postdoc/notebook\';</script>';
// Hosts serve a site's 404 page from one of these when a page doesn't exist.
const NOT_FOUND_PAGE_URLS = ['/404.html', '/404/index.html'];

// Only the settings the client reads are shipped: the full configuration holds
// absolute build paths and values resolved from environment variables.
// JSON is a valid JS expression, so it is embedded as a literal; escaping "<"
// stops a "</script>" inside a value from closing the tag early.
export const navigationManagerScript = (configuration) => {
  const clientConfiguration = JSON.stringify({ session: configuration.session }).replace(/</g, '\\u003c');

  // The client sets up the configuration with the base path, so the settings are merged in.
  return '<script type="module">import {session} from \'postdoc/client\';\n' +
    `Object.assign(globalThis.PostDoc.configuration, ${clientConfiguration});session.init();</script>`;
};


const toValidVarName = (file) => {
  const type = extname(file);
  const fileName = basename(file, type);
  let name = fileName.replace(/[^a-zA-Z0-9_$]/g, '_');

  // Convert kebab-case and snake_case to camelCase
  name = name.replace(/[_-]+([a-z])/g, (g, char) => char.toUpperCase());

  // Ensure the name doesn't start with a number
  if (/^[0-9]/.test(name)) {
    name = '_' + name;
  }

  // Check if the name is a reserved word and prefix with underscore if it is
  const reservedWords = [
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in',
    'instanceof', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof',
    'var', 'void', 'while', 'with', 'yield'
  ];

  if (reservedWords.includes(name)) {
    name = '_' + name;
  }

  return [name, fileName, type.toLowerCase().substring(1)];
};

/**
 * The temporary folder that pages are compiled into: in the project's root, wherever the
 * output folder is, so that the imports in the pages resolve from the project's
 * node_modules.
 *
 * @ignore
 */
export function resolveTemporaryDirectory(name) {
  return resolve(cwd(), name);
}

export default class Page {
  static resolveOutputFilePath(
    baseFilePath,
    rootDirectoryPath,
    temporaryOutputDirectoryName
  ) {
    const outputRootDirectoryPath = resolveTemporaryDirectory(temporaryOutputDirectoryName);

    const basePageName = basename(baseFilePath, extname(baseFilePath));

    return join(
      dirname(baseFilePath.replace(rootDirectoryPath, outputRootDirectoryPath)),
      basePageName + '.html'
    );
  }

  #url;
  #layoutFilePath;
  #outputFilePath;

  constructor(layoutFilePath, outputFilePath, temporaryOutputDirectoryName) {
    this.#layoutFilePath = layoutFilePath;
    this.#outputFilePath = outputFilePath;

    const configuration = Configuration.get();
    const outputRootDirectoryPath = resolveTemporaryDirectory(temporaryOutputDirectoryName);

    this.#url = this.#outputFilePath
      .replace(outputRootDirectoryPath, '')
      .replaceAll(sep, '/');

    if (!this.#layoutFilePath) {
      throw new PostDocError('page:missed-layout', {
        pageUrl: this.#url
      });
    }

    if (anymatch(configuration.ignore.layouts, this.#layoutFilePath)) {
      throw new PostDocError('page:ignored-layout', {
        pageUrl: this.#url,
        layoutPagePath: this.#layoutFilePath
      });
    }
  }

  get url() {
    return this.#url;
  }

  // The 404 page is never something to search for, so it isn't indexed.
  get isNotFoundPage() {
    return NOT_FOUND_PAGE_URLS.includes(this.#url);
  }

  get outputFilePath() {
    return this.#outputFilePath;
  }

  get layoutFilePath() {
    return this.#layoutFilePath;
  }

  /**
   * @override
   */
  compile(pages) {

  }

  async getIncludeFiles(configuration) {
    const includesDir = resolve(configuration.baseDir, configuration.directories.includes);
    const consumerFiles = new Map();

    try {
      const files = await readdir(includesDir);

      for (const file of files) {
        if (['.ejs', '.jsx', '.tsx'].includes(extname(file))) {
          const [varName, fileName, type] = toValidVarName(file);
          consumerFiles.set(fileName, [varName, fileName, type]);
        }
      }
    } catch {
      // Consumer includes directory may not exist when using theme
    }

    // Merge theme includes (consumer files take precedence)
    const themePaths = configuration._resolvedThemePaths;

    if (themePaths?.includes && existsSync(themePaths.includes)) {
      try {
        const themeFiles = await readdir(themePaths.includes);

        for (const file of themeFiles) {
          if (['.ejs', '.jsx', '.tsx'].includes(extname(file))) {
            const [varName, fileName, type] = toValidVarName(file);

            if (!consumerFiles.has(fileName)) {
              consumerFiles.set(fileName, [varName, fileName, type]);
            }
          }
        }
      } catch {
        // Theme includes directory may be missing
      }
    }

    return Array.from(consumerFiles.values());
  }

  // A page can render with another layout than the one it was created with, such as one
  // that its front matter names.
  async compileLayout(pages, additionalPageInformation, layoutFilePath = this.#layoutFilePath) {
    const layoutContent = await readFile(layoutFilePath, 'utf8');

    const configuration = Configuration.get();

    const environment = new PageEnvironment(
      layoutFilePath,
      this.#url,
      this.#outputFilePath,
      pages,
      additionalPageInformation
    );

    try {
      const files = await this.getIncludeFiles(configuration);

      // Build views array: consumer includes first, then theme includes as fallback
      const views = [resolve(configuration.baseDir, configuration.directories.includes)];
      const themePaths = configuration._resolvedThemePaths;

      if (themePaths?.includes && existsSync(themePaths.includes)) {
        views.push(themePaths.includes);
      }

      const compiledPage = await renderAsync(layoutContent, environment, {
        root: cwd(),
        async: true,
        views,
        filename: layoutFilePath,
        files
      });

      // A storymap's map, a playground's container and a notebook's Python run in the
      // browser, so only the pages that have one load their clients.
      const scripts = [
        navigationManagerScript(configuration),
        compiledPage.includes(STORYMAP_MARKER) && STORYMAP_SCRIPT,
        compiledPage.includes(PLAYGROUND_MARKER) && PLAYGROUND_SCRIPT,
        compiledPage.includes(NOTEBOOK_MARKER) && NOTEBOOK_SCRIPT
      ].filter(Boolean).join('\n');

      return compiledPage.replace(CLOSING_HEAD_TAG, `${scripts}\n${CLOSING_HEAD_TAG}`);
    } catch (error) {
      let message = error.message || error;
      if (typeof message !== 'string') {
        message = inspect(message);
      }

      const newError = new Error(message);
      newError.stack = filterStackTrace(error);

      const beautifiedStack = filterStackTrace(error, true);
      newError.source = beautifiedStack;

      switch (error.code) {
        case 'ERR_MODULE_NOT_FOUND':
          newError.message = newError.message + `.\n\nTo import external modules, make sure to use the importModule() (with await) function provided by Postdoc.`;
          break;

        case 'ERR_REQUIRE_ESM':
          const messageParts = newError.message.split('\n');

          messageParts[1] = '\nInstead of using require(), use the \'await importModule()\' function provided by Postdoc to import the module.';
          newError.message = messageParts.join('\n');
          break;
      }

      Logger.log((typography) => {
        const layoutFilePathFromPackageRoot = layoutFilePath.replace(
          cwd(),
          '~'
        );

        return `
          An error occurred while rendering ${typography.bold(layoutFilePathFromPackageRoot)} template:

          ${newError.message.split('\n').join(' ')}
                    
${beautifiedStack}          
        `;
      }, Logger.ErrorLevel);

      throw newError;
    }
  }

  // Whether the last compilation left the page out on purpose, as a draft is in a build.
  get isLeftOut() {
    return false;
  }

  // Compiles the page and writes it. Returns false when it failed, and true when it was
  // written or left out on purpose.
  async compileAndWrite(pages) {
    const compiledPage = await this.compile(pages);

    if (!compiledPage) {
      // All relative errors have been displayed. Just abort writing.
      return this.isLeftOut;
    }

    await mkdir(dirname(this.#outputFilePath), { recursive: true });

    if (!this.isNotFoundPage) {
      await Pagefind.addHTMLFile({
        url: this.url,
        content: compiledPage
      });
    }

    await writeFile(this.#outputFilePath, compiledPage, 'utf8');

    return true;
  }

  async compileAndIndex(pages) {
    if (this.isNotFoundPage) {
      return;
    }

    const compiledPage = await this.compile(pages);

    if (!compiledPage) {
      // All relative errors have been displayed. Just abort writing.
      return;
    }

    await Pagefind.addHTMLFile({
      url: this.url,
      content: compiledPage
    });
  }

  // Override this method if a page has to perform some checks
  // after creation to be sure that it is legit.
  async shouldCompile() {
    return true;
  }
}
