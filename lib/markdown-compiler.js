import fm from 'front-matter';
import { Marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import markedKatex from 'marked-katex-extension';

import { createHighlightPlugin } from './md-plugins/highlight.js';
import { codeGroupExtension } from './md-plugins/code-groups.js';
import { alertContainerExtension } from './md-plugins/containers.js';
import { mermaidExtension } from './md-plugins/mermaid.js';
import tables from './md-plugins/tables.js';
import Configuration from './configuration.js';

const INTERPOLATION_RE = /{{([^}]+)}}/g;

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
      useMathExpressions = false
    } = options;

    this.#compiler = new Marked(options);

    if (syntaxHighlight !== false) {
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
    const { body } = fm(content);

    return this.#compiler.parse(body);
  }

  async compile(content) {
    const { attributes, body } = fm(content);

    const html = await this.#compiler.parse(body);
    const configuration = Configuration.get();

    return [attributes, html.replace(INTERPOLATION_RE, (_, variableName) => {
      const trimmedVariableName = variableName.trim();

      if (trimmedVariableName.startsWith('appSettings')) {
        const properties = trimmedVariableName.split('.').slice(1);

        return properties.reduce((target, property) => target[property.trim()], configuration.appSettings);
      }

      return attributes[trimmedVariableName];
    })];
  }
}
