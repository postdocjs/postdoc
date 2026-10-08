import process, { env } from 'node:process';
import { createRequire } from 'node:module';

import Logger from './logger.js';
import Configuration from './configuration.js';
import Pagefind from './pagefind.js';
import PostDocCommand from './command.js';
import createRunCommand from './commands/run.js';
import createInitCommand from './commands/init.js';
import createTestCommand from './commands/test.js';
import createBuildCommand from './commands/build.js';
import createCreateCommand from './commands/create/index.js';
import createImportCommand from './commands/import.js';
import createPreviewCommand from './commands/preview.js';
import createPagefindCommand from './commands/pagefind.js';
import createCheckCommand from './commands/check.js';
import createScreenshotCommand from './commands/screenshot.js';
import chalk from 'chalk';
import figlet from 'figlet';

const require = createRequire(import.meta.url);

// Only for people: output that goes to a pipe or a file, such as JSON for a script or
// an AI agent, goes without it.
function displayWelcomeBanner() {
  if (!process.stdout.isTTY) {
    return;
  }

  const bannerText = ' Postdoc';
  const data = figlet.textSync(bannerText, { font: 'Big', horizontalLayout: 'default' });
  const coloredBanner = chalk.rgb(255, 127, 80)(data  + '\n───────────────────────────────────────\n');

  // Print the banner
  console.log(coloredBanner);
}

export default async function createCLI() {
  await Configuration.initialise(env);
  Logger.initialise();
  Pagefind.initialise();

  displayWelcomeBanner();

  const postDocPackageDefinition = require('../package.json');

  return new PostDocCommand()
    .version(postDocPackageDefinition.version, '-v | --version', 'outputs the current Postdoc version.')
    .addCommand(createRunCommand())
    .addCommand(createInitCommand())
    .addCommand(createTestCommand())
    .addCommand(createBuildCommand())
    .addCommand(createImportCommand())
    .addCommand(createCreateCommand())
    .addCommand(createPreviewCommand())
    .addCommand(createPagefindCommand())
    .addCommand(createCheckCommand())
    .addCommand(createScreenshotCommand())
    // Problems with the configuration are reported before any command runs, apart from
    // the check command, which reports them itself.
    .hook('preAction', (program, actionCommand) => {
      if (actionCommand.name() === 'check') {
        return;
      }

      for (const problem of Configuration.get()._problems ?? []) {
        Logger.log(problem, Logger.ErrorLevel);
      }
    });
}
