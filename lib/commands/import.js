/**
 * Experimental. Creates pages and tests from the `--help` output of another project's
 * command-line tool. The tool has to be built with
 * [commander](https://www.npmjs.com/package/commander), and the path has to point to
 * the root of its package.
 *
 * At the moment it only creates a page for the top-level command.
 *
 * @example
 * ```sh
 * npx postdoc import ../my-cli
 * ```
 *
 * @name import
 * @since 0.1.0
 */

import process, { cwd, env } from 'node:process';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import Iterable from '@halo-lab/iterable';
import { pipeWith } from 'pipe-ts';
import {
  str,
  char,
  skip,
  many,
  many1,
  mapTo,
  regex,
  choice,
  possibly,
  endOfInput,
  sequenceOf,
  whitespace,
  pipeParsers,
  everyCharUntil,
  optionalWhitespace
} from 'arcsecond';

import Logger from '../logger.js';
import Configuration from '../configuration.js';
import GeneratedTest from '../generated-test.js';
import GeneratedPage from '../generated-page.js';
import PostDocCommand from '../command.js';
import runAndMeasureAction from './measured-action.js';

// The flags of an option, such as `-p, --port <port>`: its name, which is the long flag
// when it has one, the short flag beside it, and the value it takes.
function readFlags(flags) {
  const words = flags.split(/[\s,]+/).filter((word) => word && word !== '/' && word !== '|');
  const longFlag = words.find((word) => word.startsWith('--'));
  const shortFlag = words.find((word) => /^-[^-]/.test(word));
  const value = words.filter((word) => /^[<[]/.test(word)).join(' ');

  return {
    name: longFlag ?? shortFlag,
    shortSymbol: longFlag ? shortFlag : undefined,
    value: value || undefined
  };
}

class CommanderHelpParser {
  #newLine = pipeParsers([
    sequenceOf([possibly(char('\r')), char('\n')]),
    mapTo(() => '\n')
  ]);

  #usage = pipeParsers([
    sequenceOf([
      str('Usage:'),
      optionalWhitespace,
      // Command's signature
      everyCharUntil(this.#newLine),
      optionalWhitespace,
      // Command's description
      possibly(
        everyCharUntil(
          choice([
            str('Options:'),
            str('Commands:'),
            str('Arguments:'),
            endOfInput
          ])
        )
      ),
      // Command's arguments
      possibly(
        pipeParsers([
          sequenceOf([
            optionalWhitespace,
            str('Arguments:'),
            optionalWhitespace,
            // Argument's name
            everyCharUntil(whitespace),
            choice([
              pipeParsers([
                whitespace,
                // Argument's description
                everyCharUntil(choice([str('Options'), str('Commands')])),
                mapTo((description) => description.trim().replace(/\s+/g, ' '))
              ]),
              this.#newLine
            ])
          ]),
          mapTo(([, , , name, description]) => [name, description])
        ])
      )
    ]),
    mapTo(([, , signature, , description, possiblyArgument]) => {
      const [argumentName, argumentDescription] = possiblyArgument ?? [];

      const signatureWords = signature.trim().split(/\s+/);
      const nameIndex =
        signatureWords.findIndex((word) => word.startsWith('[')) - 1;

      return {
        name: signatureWords[nameIndex],
        signature: signature.trim(),
        description: description.trim(),
        argument: argumentName
          ? {
            name: argumentName,
            description: argumentDescription
          }
          : null
      };
    })
  ]);

  // Each option is a line with its flags, such as `-p, --port <port>` as commander
  // writes them or `--port <port> / -p` as PostDoc does, then two spaces or more and its
  // description, which goes on in the lines indented under it.
  #options = pipeParsers([
    str('Options:'),
    many1(
      pipeParsers([
        sequenceOf([
          optionalWhitespace,
          regex(/^-[^\r\n]*?(?=[ \t]{2,}|\r?\n|$)/),
          possibly(
            pipeParsers([
              sequenceOf([
                regex(/^[ \t]{2,}[^\r\n]*/),
                many(
                  pipeParsers([
                    sequenceOf([this.#newLine, regex(/^[ \t]{5,}[^\r\n]*/)]),
                    mapTo(([, line]) => line.trim())
                  ])
                )
              ]),
              mapTo(([start, parts]) => [start.trim(), ...parts].join(' '))
            ])
          )
        ]),
        mapTo(([, flags, description]) => ({ ...readFlags(flags), description }))
      ])
    ),
    skip(optionalWhitespace)
  ]);

  #subcommands = pipeParsers([
    str('Commands:'),
    everyCharUntil(this.#newLine),
    many(
      pipeParsers([
        sequenceOf([
          regex(/^\s{2,4}/),
          // Subcommand's name
          everyCharUntil(whitespace),
          // Subcommand's description
          choice([
            pipeParsers([
              sequenceOf([
                regex(/^[ \t]+/),
                everyCharUntil(this.#newLine),
                many(
                  pipeParsers([
                    sequenceOf([
                      this.#newLine,
                      regex(/^[ \t]{5,}/),
                      everyCharUntil(this.#newLine)
                    ]),
                    mapTo(([, , description]) => description)
                  ])
                )
              ]),
              mapTo(([, start, parts]) =>
                parts.length ? start + ' ' + parts.join(' ') : start
              )
            ]),
            this.#newLine
          ])
        ]),
        mapTo(([, name, description]) => ({
          name,
          description: description.trim()
        }))
      ])
    ),
    skip(optionalWhitespace)
  ]);

  parse(text) {
    return pipeParsers([
      sequenceOf([
        this.#usage,
        optionalWhitespace,
        possibly(pipeParsers([this.#options, skip(optionalWhitespace)])),
        possibly(this.#subcommands)
      ]),
      mapTo(([usage, , options, commands]) => ({
        usage,
        options,
        commands
      }))
    ]).run(text);
  }
}

class HelpOutputCollector {
  #parser;
  #executablePath;

  // This was taken from the chalk package and modified.
  // https://github.com/chalk/ansi-regex/blob/main/index.js
  #ansiEscapeCodesRe = new RegExp(
    [
      '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
      '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))'
    ].join('|'),
    'g'
  );

  constructor(parser, executablePath) {
    this.#parser = parser;
    this.#executablePath = executablePath;
  }

  #obtainCommandOutput([executableName, ...executableArguments]) {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(executableName, executableArguments, {
        cwd: cwd(),
        env
      });

      let cliOutput = '';
      let errorOutput = '';

      childProcess.stdout.on('data', (data) => {
        cliOutput += data;
      });

      childProcess.stderr.on('data', (data) => {
        errorOutput += data;
      });

      childProcess.on('error', reject);

      childProcess.on('exit', (exitCode) => {
        const strippedOutput = cliOutput.replace(this.#ansiEscapeCodesRe, '');

        exitCode
          ? reject(new Error(`${executableArguments.join(' ')} exited with ${exitCode}: ${errorOutput.trim() || strippedOutput.trim()}`))
          : resolve(strippedOutput);
      });
    });
  }

  #incorporateCommandInto(cliArguments, commandName) {
    // Just makes a copy to avoid polluting original value.
    cliArguments = cliArguments.slice();

    const lastArgument = cliArguments.pop();

    cliArguments.push(commandName, lastArgument);

    return cliArguments;
  }

  async #collectCommand(cliArgument) {
    const output = await this.#obtainCommandOutput(cliArgument);

    const parsedOutput = this.#parser.parse(output);

    if (parsedOutput.isError) {
      throw new Error(`The help of ${cliArgument.slice(1, -1).join(' ')} couldn't be read: ${parsedOutput.error}`);
    } else {
      const children = await Promise.all(
        parsedOutput.result.commands
          ?.map((subcommand) => subcommand.name)
          .filter((commandName) => commandName !== 'help')
          .map((commandName) =>
            this.#incorporateCommandInto(cliArgument, commandName)
          )
          .map((nextCliAgruments) => this.#collectCommand(nextCliAgruments)) ??
          []
      );

      return {
        name: parsedOutput.result.usage.name,
        options: parsedOutput.result.options,
        children,
        argument: parsedOutput.result.usage.argument,
        signature: parsedOutput.result.usage.signature,
        description: parsedOutput.result.usage.description
      };
    }
  }

  collect() {
    return this.#collectCommand(['node', this.#executablePath, '--help']);
  }
}

function createHTMLFromCommand(command) {
  // In code, as a value such as `<port>` would be read as an HTML tag.
  const options = command.options
    ?.map(
      (option) =>
        `- \`${option.name}${option.value ? ` ${option.value}` : ''}\`${
          option.shortSymbol ? ` | \`${option.shortSymbol}\`` : ''
        } ${option.description ?? ''}`.trimEnd()
    )
    .join('\n');

  const subcommands = command.children
    .map((command) => `- **${command.name}** ${command.description ?? ''}`)
    .join('\n');

  return (
    `# ${command.name}\n\n## Usage\n\n\`\`\`sh\n${command.signature}\n\`\`\`` +
    (command.description ? `\n\n${command.description}\n\n` : '') +
    (command.argument
      ? `\n\n### Argument\n\n- **${command.argument.name}** ${
        command.argument.description
          ? command.argument.description.trim()
          : ''
      }`
      : '') +
    (options ? `\n\n## Options\n\n${options}` : '') +
    (subcommands.length ? `\n\n## Subcommands\n\n${subcommands}` : '')
  );
}

async function createPagesFromCommand(command, parentNames = []) {
  const configuration = Configuration.get();

  const outputPagePath = resolve(
    configuration.contentPath,
    ...parentNames,
    command.name,
    'index.md'
  );

  if (command.children) {
    const children = await Promise.all(
      command.children.map((child) =>
        createPagesFromCommand(child, parentNames.concat(command.name))
      )
    );

    return children
      .flat()
      .concat(
        new GeneratedPage(createHTMLFromCommand(command), outputPagePath)
      );
  }

  return [new GeneratedPage(createHTMLFromCommand(command), outputPagePath)];

}

// A page test, as \`postdoc test\` runs it with nightwatch-plugin-postdoc: the page object,
// and a test case.
const DEFAULT_CLI_PAGE_TEST_CONTENT = `
export default {
  url: '{url}',
  elements: {
    header: 'h1',
    usage: 'pre'
  }
};

export function headerAndUsageAreVisible({ page }) {
  page.assert.visible('@header');
  page.assert.visible('@usage');
}
`.trimStart();

function fail(createText) {
  Logger.log(createText, Logger.ErrorLevel);
  process.exitCode = 1;
}

export default function createImportCommand() {
  return new PostDocCommand('import')
    .argument('<path>', 'Tries to generate API pages based on the <path> project\'s CLI commands and options.')
    .description('Creates new pages and minimal tests from a CLI project.')
    .action((path) =>
      runAndMeasureAction(async () => {
        const packageJsonPath = resolve(path, 'package.json');

        if (!existsSync(packageJsonPath)) {
          fail((typography) => `There's no package.json in ${typography.dim(path)}. Give the path to the folder of the package whose command-line tool to document.`);

          return;
        }

        const projectPackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

        if (!projectPackageJson.bin) {
          fail((typography) => `${typography.bold(projectPackageJson.name ?? path)} has no command-line tool: its package.json has no bin.`);

          return;
        }

        const hasCommanderDependency = pipeWith(
          Iterable.from(function* () {
            if ('dependencies' in projectPackageJson) {
              for (const key in projectPackageJson.dependencies) {
                yield key;
              }
            }
          }),
          Iterable.concat(
            Iterable.from(function* () {
              if ('devDependencies' in projectPackageJson) {
                for (const key in projectPackageJson.devDependencies) {
                  yield key;
                }
              }
            })
          ),
          Iterable.unique,
          Iterable.any((key) => key === 'commander')
        );

        if (!hasCommanderDependency) {
          fail((typography) => `Only tools built with ${typography.bold('commander')} can be imported, and ${typography.bold(projectPackageJson.name ?? path)} doesn't depend on it.`);

          return;
        }

        const executablePath =
          typeof projectPackageJson.bin === 'string'
            ? projectPackageJson.bin
            : Object.values(projectPackageJson.bin).at(0);

        if (!executablePath) {
          fail((typography) => `The bin of ${typography.bold(projectPackageJson.name ?? path)} names no script.`);

          return;
        }

        const parser = new CommanderHelpParser();
        const collector = new HelpOutputCollector(
          parser,
          join(path, executablePath)
        );

        let command;

        try {
          command = await collector.collect();
        } catch (error) {
          fail(() => error.message);

          return;
        }

        let pages;

        try {
          pages = await createPagesFromCommand(command);
        } catch (error) {
          // A page that exists already isn't written over.
          fail(() => `${error.message} Move or remove the pages that ${command.name} made before, to import it again.`);

          return;
        }

        for (const page of pages) {
          await page.write();

          try {
            await new GeneratedTest(page, DEFAULT_CLI_PAGE_TEST_CONTENT).write();
          } catch {
            Logger.log((typography) => `The page test for ${typography.bold(page.url)} exists already, so it was left as it is.`, Logger.WarningLevel);
          }
        }

        Logger.log(() => `Wrote ${pages.length} page${pages.length === 1 ? '' : 's'}, and their page tests.`, Logger.SuccessLevel);
      })
    );
}
