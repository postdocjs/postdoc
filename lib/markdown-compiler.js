import { join, resolve } from 'node:path';

import { Marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import markedKatex from 'marked-katex-extension';

import { createHighlightPlugin } from './md-plugins/highlight.js';
import { codeGroupExtension } from './md-plugins/code-groups.js';
import { alertContainerExtension } from './md-plugins/containers.js';
import { mermaidExtension } from './md-plugins/mermaid.js';
import { storymapExtension } from './md-plugins/storymap.js';
import { playgroundExtension } from './md-plugins/playground.js';
import { notebookExtension } from './md-plugins/notebook.js';
import { markdownLinksExtension } from './md-plugins/markdown-links.js';
import tables from './md-plugins/tables.js';
import Configuration from './configuration.js';
import { parseFrontMatter } from './utils/yaml.js';

const INTERPOLATION_RE = /{{([^}]+)}}/g;
const CODE_RE = /(<pre[\s>][\s\S]*?<\/pre>|<code[\s>][\s\S]*?<\/code>)/;

export default class MarkdownCompiler {
  #compiler;

  async initialise() {
    if (this.#compiler) {
      return;
    }

    const configuration = Configuration.get();
    const markedHighlight = await createHighlightPlugin(configuration);

    const { options = {} } = configuration.markdown;
    const {
      syntaxHighlight = {},
      useCodeGroups = true,
      useTables = true,
      useAlertContainers = true,
      useMermaid = true,
      useStorymaps = true,
      usePlaygrounds = true,
      useNotebooks = true,
      useMathExpressions = false
    } = options;

    this.#compiler = new Marked(options);
    this.#compiler.use(markdownLinksExtension);

    if (syntaxHighlight !== false && configuration.markdown.syntaxHighlight !== false) {
      this.#compiler.use(markedHighlight);
    }

    if (useCodeGroups) {
      this.#compiler.use(codeGroupExtension);
    }

    if (useTables) {
      this.#compiler.use(tables());
    }

    if (useAlertContainers) {
      this.#compiler.use(alertContainerExtension);
    }

    if (useMermaid) {
      this.#compiler.use(mermaidExtension);
    }

    if (useStorymaps) {
      this.#compiler.use(storymapExtension(configuration.storymap));
    }

    const publicDirectory = resolve(join(configuration.baseDir, configuration.directories.vitePublic));

    if (usePlaygrounds) {
      this.#compiler.use(playgroundExtension(publicDirectory));
    }

    if (useNotebooks) {
      const isHighlighted = syntaxHighlight !== false && configuration.markdown.syntaxHighlight !== false;

      this.#compiler.use(notebookExtension(publicDirectory, isHighlighted));
    }

    if (useMathExpressions) {
      this.#compiler.use(markedKatex({
        throwOnError: false
      }));
    }

    if (options.gfmHeadingId !== false) {
      this.#compiler.use(gfmHeadingId(options.gfmHeadingId));
    }

    configuration.markdown.extensions.forEach((extension) => this.#compiler.use(extension));
  }

  async parse(content) {
    const { body } = parseFrontMatter(content);

    return this.#compiler.parse(body);
  }

  async compile(content) {
    const { attributes, body } = parseFrontMatter(content);

    const html = await this.#compiler.parse(body);

    return [attributes, this.#interpolate(html, attributes)];
  }

  // Replaces {{ name }} placeholders with front-matter values and {{ appSettings.name }}
  // with app settings. Code is shown as written, and placeholders without a value
  // are left in place so a typo stays visible.
  #interpolate(html, attributes) {
    const values = { ...attributes, appSettings: Configuration.get().appSettings };

    return html
      .split(CODE_RE)
      .map((part, index) => index % 2 ? part : part.replace(INTERPOLATION_RE, (placeholder, expression) => {
        const value = expression
          .split('.')
          .reduce((target, property) => target?.[property.trim()], values);

        return value === undefined ? placeholder : String(value);
      }))
      .join('');
  }
}
