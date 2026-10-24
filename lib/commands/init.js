/**
 * Creates a new project with example pages, layouts and tests.
 *
 * Options:
 *
 * - `--name <name>` - the project's name and directory, which must not exist yet.
 *   Use `.` to set up the current directory, which has to be empty. Without this
 *   option, PostDoc asks for a name, or, when there's no terminal to ask in, as in CI
 *   or for an AI agent, stops with an error.
 * - `--template <template>` - the template to start from. Only `default` is available.
 *
 * The new project's `package.json` has `start`, `build`, `preview` and `test` scripts,
 * and its `AGENTS.md` tells AI agents how to work on it and check their changes. Its
 * `CLAUDE.md` imports it, for Claude Code.
 *
 * The command exits with 1 when it can't create the project.
 *
 * @example
 * ```sh
 * npx postdoc init --name my-docs
 * ```
 *
 * @name init
 * @since 0.1.0
 */

import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createReadStream, createWriteStream, existsSync, readdirSync } from 'node:fs';

import inquirer from 'inquirer';
import AsyncIterable from '@halo-lab/iterable/async';

import Logger from '../logger.js';
import PostDocCommand from '../command.js';
import getPackageVersion from '../npm-metadata.js';
import runAndMeasureAction from './measured-action.js';
import { walkDirectory } from '../fs.js';
import chalk from 'chalk';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const TEMPLATES_DIRECTORY_PATH = join(__dirname, '..', '..', 'extra', 'templates');

async function ensurePackageNameDefined(name) {
  // A prompt would wait forever for an answer that can't come.
  if (!name && !process.stdin.isTTY) {
    Logger.log((typography) => `
        There's no terminal to ask for the project's name in. Give it with ${typography.cyan('--name <name>')}, or ${typography.cyan('--name .')} for the current directory.
      `, Logger.ErrorLevel);
    process.exitCode = 1;

    return;
  }

  if (!name) {
    const inputName = await inquirer.prompt({
      type: 'input',
      name: 'name',
      message: 'Enter the name of the project:'
    });

    name = inputName.name;
  }

  if (!name) {
    Logger.log(
      (typography) => `
				The ${typography.bold('name')} is required.
					Please try again.
			`,
      Logger.ErrorLevel
    );
    process.exitCode = 1;

    return;
  }

  return name;
}

export default function createInitCommand() {
  return new PostDocCommand('init')
    .description(
      'Initializes a new Postdoc project and copies the necessary assets to start with.'
    )
    .option('-n, --name <name>', 'The name of the new project to create.')
    .option('-t, --template <template>', 'The UI template to use for the new project.')
    .action((options) =>
      runAndMeasureAction(async () => {
        showInfoBanner();

        const name = await ensurePackageNameDefined(options.name);

        if (!name) {
          // A message was printed, so we can just finish execution here.
          return;
        }

        const template = options.template ?? 'default';
        const templates = readdirSync(TEMPLATES_DIRECTORY_PATH);

        if (!templates.includes(template)) {
          Logger.log((typography) => `
              There's no ${typography.bold(template)} template. The templates are: ${templates.join(', ')}.
            `, Logger.ErrorLevel);
          process.exitCode = 1;

          return;
        }

        const targetDirectoryPath = resolve(name);

        const targetDirectoryName = basename(targetDirectoryPath);

        if (name === '.') {
          const directoryDescriptor = walkDirectory(targetDirectoryPath);

          if (!(await AsyncIterable.isEmpty(directoryDescriptor.files))) {
            Logger.log(
              (typography) => `
                The ${typography.bold(
                  targetDirectoryName
                )} directory is not empty.
                Please specify an empty folder.
               `,
              Logger.ErrorLevel
            );
            process.exitCode = 1;

            return;
          }
        } else {
          const existsDirectory = existsSync(targetDirectoryPath);

          if (existsDirectory) {
            Logger.log(
              (typography) => `
                  The ${typography.bold(
                    targetDirectoryName
                  )} directory already exists.
                  Please specify an empty folder or use a different name.
                 `,
              Logger.ErrorLevel
            );
            process.exitCode = 1;

            return;
          }

          await mkdir(targetDirectoryPath, { recursive: true });
        }

        const [nightwatchVersion, nightwatchPluginPostdocVersion] = await Promise.all([
          getPackageVersion('nightwatch').catch(
            () => '3.0.0'
          ),
          getPackageVersion('nightwatch-plugin-postdoc').catch(
            () => '0.1.0'
          )
        ]);

        const postDocPackageDefinition = require('../../package.json');

        const defaultTemplateDirectoryPath = join(TEMPLATES_DIRECTORY_PATH, template);

        const defaultTemplateDirectoryDescriptor = walkDirectory(
          defaultTemplateDirectoryPath
        );

        await AsyncIterable.forEach(
          defaultTemplateDirectoryDescriptor.files,
          async (filePath) => {
            const outputAbsolutePath = filePath.replace(
              defaultTemplateDirectoryPath,
              targetDirectoryPath
            );

            const directoryPath = dirname(outputAbsolutePath);
            const existsDirectory = existsSync(directoryPath);

            if (!existsDirectory) {
              await mkdir(directoryPath, { recursive: true });
            }

            if (['package.json', 'globals.js', 'postdoc.config.js'].includes(basename(filePath))) {
              const fileContent = await readFile(filePath, 'utf8');

              const finalContent = fileContent
                .replace('${project_name}', targetDirectoryName)
                .replace('${postdoc_version}', postDocPackageDefinition.version)
                .replace('${nightwatch_version}', nightwatchVersion)
                .replace('${nightwatch_plugin_postdoc_version}', nightwatchPluginPostdocVersion);

              await writeFile(outputAbsolutePath, finalContent);
            } else {
              return new Promise((resolve, reject) => {
                createReadStream(filePath)
                  .pipe(createWriteStream(outputAbsolutePath))
                  .on('error', reject)
                  .on('close', resolve);
              });
            }
          }
        );

        Logger.log(
          (typography) => `
            The ${name} Postdoc project is ready with example pages and assets. To get started, run:
            
            ${name === '.'? '' : `${typography.green('cd')} ${typography.green.bold(name)}`}
            ${typography.green('npm install')}
            ${typography.green('npm start')}
            
          `,
          Logger.SuccessLevel
        );
      })
    );
}

function showInfoBanner() {
  const bannerLines = [
    chalk.gray('\n ---------------------------------------------------'),
    `${chalk.white(' 📄 Welcome to')} ${chalk.bold.white('Postdoc')} ${chalk.white('setup 🚀')}`,
    chalk.gray(' ---------------------------------------------------'),
    '',
    `${chalk.white(' We\'ll get your new website ready for you in no-time.')} `,
    '',
  ];

  console.log(bannerLines.join('\n'));
}
