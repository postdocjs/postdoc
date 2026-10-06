import { inspect } from 'node:util';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

import fm from 'front-matter';

import Page from './page.js';
import Logger from './logger.js';
import PostDocError from './error.js';
import Configuration from './configuration.js';

export default class RegularPage extends Page {
  static #getLayoutRoots(configuration) {
    const layoutRoots = [resolve(configuration.baseDir, configuration.directories.layouts)];

    if (configuration._resolvedThemePaths?.layouts) {
      layoutRoots.push(configuration._resolvedThemePaths.layouts);
    }

    return layoutRoots;
  }

  // Walks from the page's folder up to the root of the layouts directory. At each level,
  // a layout named after the page comes before the folder's index.ejs, and the project's
  // layout comes before the theme's. So the most specific layout wins, and the project
  // overrides the theme at the same level.
  static #findLayout(contentFilePath, contentPageName, configuration) {
    const relativeContentDirectory = relative(resolve(configuration.contentPath), dirname(contentFilePath));
    const folders = relativeContentDirectory ? relativeContentDirectory.split(sep) : [];
    const layoutRoots = RegularPage.#getLayoutRoots(configuration);

    for (let depth = folders.length; depth >= 0; depth--) {
      for (const layoutFileName of [contentPageName + '.ejs', 'index.ejs']) {
        for (const layoutRoot of layoutRoots) {
          const layoutFilePath = join(layoutRoot, ...folders.slice(0, depth), layoutFileName);

          if (existsSync(layoutFilePath)) {
            return layoutFilePath;
          }
        }
      }
    }
  }

  // A page can name its layout in its front matter, such as `layout: story`. The name is
  // a path in the layouts folder without .ejs, and the project's layout comes before the
  // theme's.
  static #findNamedLayout(layoutName, configuration) {
    for (const layoutRoot of RegularPage.#getLayoutRoots(configuration)) {
      const layoutFilePath = join(layoutRoot, ...`${layoutName}.ejs`.split('/'));

      if (existsSync(layoutFilePath)) {
        return layoutFilePath;
      }
    }
  }

  static #readLayoutName(contentFilePath) {
    try {
      const { layout } = fm(readFileSync(contentFilePath, 'utf8')).attributes;

      return typeof layout === 'string' && layout ? layout : null;
    } catch {
      // Invalid front matter is reported when the page is compiled.
      return null;
    }
  }

  #contentFilePath;
  #markdownCompiler;
  #pathLayoutFilePath;
  #isLeftOutAsDraft = false;

  constructor(contentFilePath, temporaryOutputDirectoryName, markdownCompiler) {
    const configuration = Configuration.get();

    const contentPageName = basename(contentFilePath, extname(contentFilePath));
    const rootPagesDirectoryPath = resolve(configuration.contentPath);
    const outputFilePath = Page.resolveOutputFilePath(contentFilePath, rootPagesDirectoryPath, temporaryOutputDirectoryName);

    const pathLayoutFilePath = RegularPage.#findLayout(contentFilePath, contentPageName, configuration);
    const layoutName = RegularPage.#readLayoutName(contentFilePath);
    const layoutFilePath = layoutName ? RegularPage.#findNamedLayout(layoutName, configuration) : pathLayoutFilePath;

    if (layoutName && !layoutFilePath) {
      throw new PostDocError('page:missed-named-layout', {
        pageUrl: '/' + relative(rootPagesDirectoryPath, contentFilePath).split(sep).join('/').replace(/\.md$/, '.html'),
        layoutName
      });
    }

    super(layoutFilePath, outputFilePath, temporaryOutputDirectoryName);

    this.#contentFilePath = contentFilePath;
    this.#markdownCompiler = markdownCompiler;
    this.#pathLayoutFilePath = pathLayoutFilePath;
  }

  // The Markdown file that the page is made from.
  get sourceFilePath() {
    return this.#contentFilePath;
  }

  // Whether the last compilation left the page out because it's a draft, rather than
  // because it failed.
  get isLeftOut() {
    return this.#isLeftOutAsDraft;
  }

  async #compileContent(allowDrafts) {
    const content = await readFile(this.#contentFilePath, 'utf8');

    try {
      const result = await this.#markdownCompiler.compile(content);

      this.#isLeftOutAsDraft = Boolean(result[0].draft && !allowDrafts);

      if (this.#isLeftOutAsDraft) {
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

    // The front matter is read again, so a layout named while the dev server runs applies.
    const layoutName = typeof frontMatter.layout === 'string' && frontMatter.layout ? frontMatter.layout : null;
    const layoutFilePath = layoutName ? RegularPage.#findNamedLayout(layoutName, Configuration.get()) : this.#pathLayoutFilePath;

    if (!layoutFilePath) {
      Logger.log(() => new PostDocError(layoutName ? 'page:missed-named-layout' : 'page:missed-layout', {
        pageUrl: this.url,
        layoutName
      }).message, Logger.ErrorLevel);

      return;
    }

    return this.compileLayout(pages, {
      ...frontMatter, content
    }, layoutFilePath);
  }
}
