import { inspect } from 'node:util';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

import Page from './page.js';
import Logger from './logger.js';
import Configuration from './configuration.js';

export default class RegularPage extends Page {
  static #findLayoutInDir(directoryPath, contentPageName, absoluteLayoutsPath) {
    if (!directoryPath.includes(absoluteLayoutsPath)) {
      return;
    }

    const namedLayoutPath = join(directoryPath, contentPageName + '.ejs');
    const sharedLayoutPath = join(directoryPath, 'index.ejs');

    if (existsSync(namedLayoutPath)) {
      return namedLayoutPath;
    }

    if (existsSync(sharedLayoutPath)) {
      return sharedLayoutPath;
    }

    if (directoryPath !== absoluteLayoutsPath) {
      return this.#findLayoutInDir(join(directoryPath, '..'), contentPageName, absoluteLayoutsPath);
    }
  }

  static #findLayout(contentFilePath, contentPageName, configuration) {
    const rootPagesDirectoryPath = resolve(configuration.contentPath);
    const absoluteLayoutsPath = resolve(configuration.baseDir, configuration.directories.layouts);

    // Compute the relative content path (e.g. "guide/core-concepts")
    const relativeContentDir = dirname(contentFilePath).replace(rootPagesDirectoryPath, '');

    const themePaths = configuration._resolvedThemePaths;
    const hasTheme = themePaths?.layouts && existsSync(themePaths.layouts);

    // 1. Check consumer for an exact layout match first (named or index-for-index)
    if (existsSync(absoluteLayoutsPath)) {
      const consumerLayoutDir = join(absoluteLayoutsPath, relativeContentDir);

      // Named layout: about/glossary.ejs for about/glossary.md
      const namedLayoutPath = join(consumerLayoutDir, contentPageName + '.ejs');

      if (existsSync(namedLayoutPath)) {
        return namedLayoutPath;
      }
    }

    // 2. Fall back to theme layouts directory (with full walk-up)
    if (hasTheme) {
      const themeLayoutDir = join(themePaths.layouts, relativeContentDir);
      const themeLayout = this.#findLayoutInDir(themeLayoutDir, contentPageName, themePaths.layouts);

      if (themeLayout) {
        return themeLayout;
      }
    }

    // 3. Consumer walk-up fallback (handles projects without themes and catch-all layouts)
    if (existsSync(absoluteLayoutsPath)) {
      const consumerLayoutDir = join(absoluteLayoutsPath, relativeContentDir);

      return this.#findLayoutInDir(consumerLayoutDir, contentPageName, absoluteLayoutsPath);
    }
  }

  #contentFilePath;
  #markdownCompiler;

  constructor(contentFilePath, temporaryOutputDirectoryName, markdownCompiler) {
    const configuration = Configuration.get();

    const contentPageName = basename(contentFilePath, extname(contentFilePath));

    const layoutFilePath = RegularPage.#findLayout(contentFilePath, contentPageName, configuration);

    const rootPagesDirectoryPath = resolve(configuration.contentPath);
    const outputFilePath = Page.resolveOutputFilePath(contentFilePath, rootPagesDirectoryPath, temporaryOutputDirectoryName);

    super(layoutFilePath, outputFilePath, temporaryOutputDirectoryName);

    this.#contentFilePath = contentFilePath;
    this.#markdownCompiler = markdownCompiler;
  }

  async #compileContent(allowDrafts) {
    const content = await readFile(this.#contentFilePath, 'utf8');

    try {
      const result = await this.#markdownCompiler.compile(content);

      if (result[0].draft && !allowDrafts) {
        return;
      }

      return result;
    } catch (error) {
      Logger.log((typography) => `
            Cannot compile the ${typography.bold(this.#contentFilePath)} because of the following error:

              ${inspect(error, { compact: false, colors: true })}
          `, Logger.ErrorLevel);
    }
  }

  async compile(pages, allowDrafts) {
    const compiledContentAndFrontMatter = await this.#compileContent(allowDrafts);

    if (!compiledContentAndFrontMatter) {
      // All relative errors have been displayed. Just abort writing.
      return;
    }

    const [frontMatter, content] = compiledContentAndFrontMatter;

    return this.compileLayout(pages, {
      ...frontMatter, content
    });
  }
}
