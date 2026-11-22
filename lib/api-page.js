import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, extname, basename, join } from 'node:path';

import { parseComments } from './dox.js';

import Page, { resolveTemporaryDirectory } from './page.js';
import Logger from './logger.js';
import Configuration, { resolveLayoutsDirectory } from './configuration.js';

const DOC_TAGS = Object.freeze({
  API: 'api',
  SEE: 'see',
  W3C: 'w3c',
  FUNC: 'func',
  NAME: 'name',
  LINK: 'link',
  KIND: 'kind',
  ALIAS: 'alias',
  IGNORE: 'ignore',
  PARAM: 'param',
  SINCE: 'since',
  METHOD: 'method',
  SYNTAX: 'syntax',
  RETURN: 'return',
  DISPLAY: 'display',
  EXAMPLE: 'example',
  TSEXAMPLE: 'tsexample',
  RETURNS: 'returns',
  FUNCTION: 'function',
  INTERNAL: 'internal',
  EDIT_LINE: 'editline',
  JSON_WIRE: 'jsonwire',
  SORT_INDEX: 'sortIndex',
  DESCRIPTION: 'description',
  EXAMPLE_LINK: 'exampleLink'
});

const API_TEMPLATE = Object.freeze({
  API: 'api',
  SEE: 'see',
  W3C: 'w3c',
  NAME: 'name',
  LINK: 'link',
  KIND: 'kind',
  SINCE: 'since',
  SYNTAX: 'syntax',
  ALIASES: 'aliases',
  EXAMPLE: 'example',
  EXAMPLE_HTML: 'exampleHtml',
  TSEXAMPLE: 'tsexample',
  RETURNS: 'returns',
  API_NAME: 'apiName',
  INTERNAL: 'internal',
  EDIT_LINE: 'editLine',
  JSON_WIRE: 'jsonWire',
  SORT_INDEX: 'sortIndex',
  PARAMETERS: 'parameters',
  DESCRIPTION: 'description',
  EXAMPLE_LINK: 'exampleLink'
});

export default class ApiPage extends Page {
  #apiFilePath;
  #markdownCompiler;

  constructor(apiFilePath, temporaryOutputDirectoryName, markdownCompiler) {
    const configuration = Configuration.get();

    const rootApiDirectoryPath = resolve(configuration.apidocs.source);
    const relativeFilePath = apiFilePath.replace(rootApiDirectoryPath, '');

    const url = configuration.apidocs.createUrl(relativeFilePath);

    const outputFilePath = resolve(resolveTemporaryDirectory(temporaryOutputDirectoryName), ...url.slice(1).split('/'));

    const projectLayoutFilePath = resolve(resolveLayoutsDirectory(configuration), configuration.apidocs.layoutName);
    const themeLayoutFilePath = configuration._resolvedThemePaths
      && join(configuration._resolvedThemePaths.layouts, configuration.apidocs.layoutName);

    // Like other layouts, the theme's API layout is used when the project has none.
    const layoutFilePath = !existsSync(projectLayoutFilePath) && themeLayoutFilePath && existsSync(themeLayoutFilePath)
      ? themeLayoutFilePath
      : projectLayoutFilePath;

    super(layoutFilePath, outputFilePath, temporaryOutputDirectoryName);

    this.#apiFilePath = apiFilePath;
    this.#markdownCompiler = markdownCompiler;
  }

  async #parseApiFile() {
    const content = await readFile(this.#apiFilePath, 'utf8');

    let parsedComments = await parseComments(content, {
      skipSingleStar: true,
      markdownCompiler: this.#markdownCompiler
    });

    // A comment that starts with /*! or has an @ignore tag isn't part of the page.
    parsedComments = parsedComments.filter((comment) => !comment.ignore &&
      !comment.tags.some((tag) => tag.type === DOC_TAGS.IGNORE) &&
      !Number.isNaN(comment.codeStart));

    if (!parsedComments.length) {
      Logger.debug((typography) => `
        The ${typography.dim(this.#apiFilePath)} does not have api comments or all of them are ignored.
          Skipping this file...
      `);

      return;
    }

    // With apidocs.requireName, only the files with a @name comment become pages.
    const hasName = parsedComments.some((comment) => comment.tags.some((tag) => tag.type === DOC_TAGS.NAME));

    if (Configuration.get().apidocs.requireName && !hasName) {
      return;
    }

    return parsedComments.map((comment) => this.#normaliseComment(comment));
  }

  #normaliseComment(comment) {
    const configuration = Configuration.get();

    return comment.tags.reduce(
      (result, tag) => {
        const apiFileName = basename(
          this.#apiFilePath,
          extname(this.#apiFilePath)
        );

        result.name = result.name || comment.ctx?.name || apiFileName;
        result.description = result.description || comment.description.full;

        switch (tag.type) {
          case DOC_TAGS.NAME:
          case DOC_TAGS.KIND:
          case DOC_TAGS.FUNC:
          case DOC_TAGS.METHOD:
          case DOC_TAGS.FUNCTION: {
            const nameTag = comment.tags
              .filter((tag) =>
                [
                  DOC_TAGS.NAME,
                  DOC_TAGS.METHOD,
                  DOC_TAGS.FUNCTION,
                  DOC_TAGS.FUNC
                ].includes(tag.type)
              )
              .pop();

            const kindTag = comment.tags
              .filter((tag) =>
                [
                  DOC_TAGS.KIND,
                  DOC_TAGS.METHOD,
                  DOC_TAGS.FUNCTION,
                  DOC_TAGS.FUNC
                ].includes(tag.type)
              )
              .pop();

            return {
              ...result,
              [API_TEMPLATE.NAME]: nameTag?.string || result.name,
              [API_TEMPLATE.KIND]: [
                DOC_TAGS.METHOD,
                DOC_TAGS.FUNCTION,
                DOC_TAGS.FUNC
              ].includes(kindTag?.type)
                ? DOC_TAGS.FUNCTION
                : kindTag?.string || result.kind
            };
          }
          case DOC_TAGS.LINK: {
            return { ...result, [API_TEMPLATE.LINK]: tag.string };
          }
          case DOC_TAGS.PARAM: {
            const optional = tag.name.startsWith('[') && tag.name.endsWith(']');

            return {
              ...result,
              [API_TEMPLATE.PARAMETERS]: result.parameters.concat([
                {
                  name: optional ? tag.name.slice(1, -1) : tag.name,
                  optional,
                  description: tag.description,
                  types: Array.isArray(tag.types)
                    ? tag.types.join(' | ')
                    : tag.types
                }
              ])
            };
          }
          case DOC_TAGS.API: {
            return { ...result, [API_TEMPLATE.API]: tag.visibility };
          }
          case DOC_TAGS.EDIT_LINE: {
            return { ...result, [API_TEMPLATE.EDIT_LINE]: tag.editline };
          }
          case DOC_TAGS.ALIAS: {
            return {
              ...result,
              [API_TEMPLATE.ALIASES]: result.aliases.concat([tag.string])
            };
          }
          case DOC_TAGS.DISPLAY: {
            return { ...result, [API_TEMPLATE.API_NAME]: tag.string };
          }
          case DOC_TAGS.SYNTAX: {
            return {
              ...result,
              [API_TEMPLATE.SYNTAX]: result.syntax.concat([tag.string])
            };
          }
          case DOC_TAGS.SEE: {
            return {
              ...result,
              [API_TEMPLATE.SEE]: result.see.concat([tag.string])
            };
          }
          case DOC_TAGS.RETURN:
          case DOC_TAGS.RETURNS: {
            const types = Array.isArray(tag.types)
              ? tag.types.join(' | ')
              : tag.types;

            return {
              ...result,
              [API_TEMPLATE.RETURNS]: {
                type: types.replace('[object Object]', '*'),
                description: tag.description || ''
              }
            };
          }
          case DOC_TAGS.SINCE: {
            return { ...result, [API_TEMPLATE.SINCE]: tag.string };
          }
          case DOC_TAGS.INTERNAL: {
            return { ...result, [API_TEMPLATE.INTERNAL]: true };
          }
          case DOC_TAGS.EXAMPLE: {
            // The example as written, as in 0.3.0-preview4, and compiled as Markdown.
            return {
              ...result,
              [API_TEMPLATE.EXAMPLE]: result.example.concat([tag.string]),
              [API_TEMPLATE.EXAMPLE_HTML]: result.exampleHtml.concat([tag.html ?? tag.string])
            };
          }
          case DOC_TAGS.TSEXAMPLE: {
            return {
              ...result,
              [API_TEMPLATE.TSEXAMPLE]: result.tsexample.concat([tag.string])
            };
          }
          case DOC_TAGS.W3C: {
            return { ...result, [API_TEMPLATE.W3C]: tag.string };
          }
          case DOC_TAGS.JSON_WIRE: {
            return { ...result, [API_TEMPLATE.JSON_WIRE]: tag.string };
          }
          case DOC_TAGS.SORT_INDEX: {
            return { ...result, [API_TEMPLATE.SORT_INDEX]: Number(tag.string) };
          }
          case DOC_TAGS.DESCRIPTION: {
            return { ...result, [API_TEMPLATE.DESCRIPTION]: tag.string };
          }
          case DOC_TAGS.EXAMPLE_LINK: {
            return { ...result, [API_TEMPLATE.EXAMPLE_LINK]: tag.string };
          }
          default: {
            const parseTag = configuration.apidocs.tags[tag.type];

            if (parseTag) {
              const maybeParsedTag = parseTag(tag, comment, result);

              return maybeParsedTag ? { ...result, ...maybeParsedTag } : result;
            }

            return result;
          }
        }
      },
      {
        [API_TEMPLATE.NAME]: '',
        [API_TEMPLATE.LINK]: '',
        [API_TEMPLATE.PARAMETERS]: [],
        [API_TEMPLATE.API]: '',
        [API_TEMPLATE.EDIT_LINE]: '',
        [API_TEMPLATE.ALIASES]: [],
        [API_TEMPLATE.API_NAME]: null,
        [API_TEMPLATE.SYNTAX]: [],
        [API_TEMPLATE.SEE]: [],
        [API_TEMPLATE.KIND]: null,
        [API_TEMPLATE.RETURNS]: null,
        [API_TEMPLATE.SINCE]: null,
        [API_TEMPLATE.INTERNAL]: false,
        [API_TEMPLATE.EXAMPLE]: [],
        [API_TEMPLATE.EXAMPLE_HTML]: [],
        [API_TEMPLATE.TSEXAMPLE]: [],
        [API_TEMPLATE.W3C]: '',
        [API_TEMPLATE.JSON_WIRE]: '',
        [API_TEMPLATE.SORT_INDEX]: 0,
        [API_TEMPLATE.DESCRIPTION]: '',
        [API_TEMPLATE.EXAMPLE_LINK]: ''
      }
    );
  }

  async compile(pages) {
    const comments = await this.#parseApiFile();

    if (!comments) {
      // We already displayed the error, so just returning here.
      return;
    }

    return this.compileLayout(pages, {
      comments,
      commentsSourcePath: this.#apiFilePath
    });
  }

  async shouldCompile() {
    return Boolean(await this.#parseApiFile());
  }
}
