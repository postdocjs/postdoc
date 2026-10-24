/**
 * Runs the project's tests with [Nightwatch](https://nightwatchjs.org), which has to be
 * installed in the project: `npm i -D nightwatch`.
 *
 * Besides the tests in the tests directory, it checks every page of the site without any
 * test files. It builds the project, serves the output, runs
 * [axe](https://github.com/dequelabs/axe-core) accessibility checks on each page, and
 * tries each page with the keyboard and with larger text.
 * See [page checks](/api/configuration.html#page-checks).
 *
 * Options:
 *
 * - `--skip-page-checks` - runs only the tests in the tests directory.
 * - `--pages <patterns>` - checks only the pages whose URLs match these glob patterns,
 *   separated by commas, such as `/guide/**,/index.html`.
 * - `--widths <widths>` - the window widths to check each page at, in CSS pixels,
 *   such as `1280,390`, in place of `nightwatch.pageChecks.widths`.
 * - `--report <file>` - writes what the page checks found to this file, as JSON: each
 *   problem with its page, width and check, and the problems grouped.
 * - `--out-dir <dir>` - builds into this directory instead of the configured
 *   `outputPath`, which is then left as it is.
 * - `--watch` - reruns the tests when they change. Page checks don't run in watch mode.
 * - Any other option goes to Nightwatch, such as `--env firefox` or `--parallel`.
 *
 * Nightwatch runs with PostDoc's own configuration, which opens the served build and
 * loads `nightwatch-plugin-postdoc` when the project has it. To run with yours, set
 * `nightwatch.config` or pass `--config`; the browsers in `nightwatch.browser` that it has
 * no environment for are left out. A project's own `nightwatch.json` or
 * `nightwatch.conf.js` isn't read by itself, and the command says so.
 *
 * After the checks, the command prints each problem once, with the pages it was found
 * on, so one in a header or a footer doesn't fill the report.
 *
 * The command exits with Nightwatch's exit code, so failing tests fail a CI job.
 *
 * @example
 * ```sh
 * npx postdoc test --pages '/guide/**' --widths 1280,390 --report checks.json
 * ```
 *
 * @name test
 * @since 0.1.0
 */

import process from 'node:process';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import anymatch from 'anymatch';
import Stream from '@halo-lab/stream';
import AsyncIterable from '@halo-lab/iterable/async';
import { watch } from 'chokidar';
import { pipeWith } from 'pipe-ts';

import Logger from '../logger.js';
import Configuration from '../configuration.js';
import PostDocCommand from '../command.js';
import { useOutputDirectory } from './build.js';
import { serveBuild } from './preview.js';
import { formatSummary, groupProblems } from '../page-checks-report.js';
import { walkDirectory } from '../fs.js';

const DEFAULT_NIGHTWATCH_CONFIG = fileURLToPath(new URL('../../extra/nightwatch.conf.js', import.meta.url));
// The configuration files that Nightwatch would read from a project by itself.
const PROJECT_NIGHTWATCH_CONFIGS = ['nightwatch.conf.js', 'nightwatch.conf.cjs', 'nightwatch.conf.mjs', 'nightwatch.conf.ts', 'nightwatch.json'];
const PAGE_CHECKS_SUITE = fileURLToPath(new URL('../../extra/page-checks.js', import.meta.url));

// WCAG 2.0, 2.1 and 2.2 level A and AA: the usual compliance target.
const DEFAULT_AXE_OPTIONS = {
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
  }
};

export default function createTestCommand() {
  return new PostDocCommand('test')
    .argument('[nightwatchOptions...]', 'A list of any nightwatch related values')
    .option('--skip-page-checks', 'Skip the accessibility checks that run on every built page.')
    .option('--pages <patterns>', 'Check only the pages whose URLs match these glob patterns, separated by commas.')
    .option('--widths <widths>', 'The window widths to check each page at, such as 1280,390.')
    .option('--report <file>', 'Write what the page checks found to this file, as JSON.')
    .option('--out-dir <dir>', 'Build into this directory instead of the configured outputPath.')
    .allowUnknownOption()
    .description('Runs all test declared in the project.')
    .action(async (nightwatchOptions, { skipPageChecks, pages: pagePatterns, widths, report, outDir }) => {
      useOutputDirectory(outDir);

      const configuration = Configuration.get();

      const nightwatchScript = findNightwatchScript();

      if (!nightwatchScript) {
        Logger.log((typography) => `
            Nightwatch is not installed in this project. Install it with:
              ${typography.cyan('npm i -D nightwatch')}
          `, Logger.ErrorLevel);

        process.exitCode = 1;

        return;
      }

      const testsDirectories = Array.isArray(configuration.testsPath) ? configuration.testsPath : [configuration.testsPath];
      const isInWatchMode = nightwatchOptions.includes('--watch') || configuration.nightwatch?.watch;
      const isParallelMode = nightwatchOptions.includes('--parallel') || configuration.nightwatch?.parallel;
      const isHeadlessMode = nightwatchOptions.includes('--headless') || configuration.nightwatch?.headless;
      const configOption = findOptionValue(nightwatchOptions, ['--config', '-c']);
      const hasNightwatchEnv = findOptionValue(nightwatchOptions, ['--env', '-e']) !== undefined;
      const builtInEnvs = configuration.nightwatch?.browser;
      const ownNightwatchConfig = configOption ?? configuration.nightwatch?.config;
      const nightwatchConfig = ownNightwatchConfig || DEFAULT_NIGHTWATCH_CONFIG;

      if (!ownNightwatchConfig) {
        const ignoredConfig = PROJECT_NIGHTWATCH_CONFIGS.find((name) => existsSync(resolve(name)));

        if (ignoredConfig) {
          Logger.log((typography) => `
              The tests run with PostDoc's Nightwatch configuration, not with ${typography.dim(ignoredConfig)}. To use yours, set ${typography.cyan(`nightwatch.config: './${ignoredConfig}'`)} in the PostDoc configuration.
            `, Logger.WarningLevel);
        }
      }
      const pageChecksConfiguration = configuration.nightwatch?.pageChecks;
      const projectTestsDirectories = testsDirectories.filter((directory) => existsSync(resolve(directory)));

      let pageChecksSettings = null;

      if (pageChecksConfiguration?.enabled && !skipPageChecks) {
        if (isInWatchMode) {
          Logger.log((typography) => `Page checks don't run in watch mode. Run ${typography.cyan('postdoc test')} without ${typography.cyan('--watch')} to check every page.`);
        } else {
          pageChecksSettings = getPageChecksSettings(pageChecksConfiguration, configuration.session);
        }
      }

      if (!projectTestsDirectories.length && !pageChecksSettings) {
        Logger.log((typography) => `
            There is nothing to test: the ${typography.dim(testsDirectories.join(', '))} directory does not exist and page checks are off.
          `, Logger.WarningLevel);

        return;
      }

      const site = await serveBuild();

      if (!site) {
        return;
      }

      Logger.log(`Testing the build served at ${site.baseUrl}`);

      const pageChecks = pageChecksSettings && await writePageChecksManifest(pageChecksConfiguration, pageChecksSettings, site.baseUrl, {
        only: pagePatterns ? pagePatterns.split(',').map((pattern) => pattern.trim()).filter(Boolean) : null,
        widths: widths ? widths.split(',').map(Number).filter((width) => width > 0) : null
      });
      const testPaths = projectTestsDirectories.concat(pageChecks ? [PAGE_CHECKS_SUITE] : []);

      if (!testPaths.length) {
        await site.stop();

        return;
      }

      const environment = {
        // Your own tests and the Nightwatch plugin for PostDoc open the site at this address.
        POSTDOC_BASE_URL: site.baseUrl,
        // The plugin runs the page tests in this folder.
        POSTDOC_PAGES_PATH: resolve(testsDirectories[0], 'pages'),
        ...(pageChecks && { POSTDOC_PAGE_CHECKS: pageChecks.manifestPath, POSTDOC_PAGE_CHECKS_REPORT: pageChecks.reportPath })
      };

      const args = [nightwatchScript, ...testPaths, ...nightwatchOptions.filter((value) => value !== '--watch')];
      if (configOption === undefined) {
        args.push('--config', nightwatchConfig);
      }

      if (isParallelMode) {
        args.push('--parallel');
      }

      if (isHeadlessMode) {
        args.push('--headless');
      }

      if (!hasNightwatchEnv && builtInEnvs) {
        let browsers = [builtInEnvs].flat().filter(Boolean);

        // Your own configuration may not have an environment for each browser, which
        // Nightwatch would refuse.
        const environments = ownNightwatchConfig ? await readNightwatchEnvironments(ownNightwatchConfig) : null;

        if (environments) {
          const missing = browsers.filter((browser) => !environments.includes(browser));

          if (missing.length) {
            Logger.log((typography) => `
                ${typography.dim(ownNightwatchConfig)} has no ${missing.join(' or ')} environment, so the tests run without it. Add it to the file's test_settings, or set nightwatch.browser.
              `, Logger.WarningLevel);
          }

          browsers = browsers.filter((browser) => environments.includes(browser));
        }

        if (browsers.length) {
          args.push('--env', browsers.join(','));
        }
      }

      try {
        // A build that left a page out has failed already, whatever the tests say.
        process.exitCode = await waitUntilChildProcessFinishes(runNightwatch(args, environment)) || process.exitCode || 0;

        if (pageChecks) {
          await reportPageChecks(pageChecks, report);
        } else if (report) {
          Logger.log(`The page checks didn't run, so there's no report to write to ${report}.`, Logger.WarningLevel);
        }
      } finally {
        await pageChecks?.remove();

        // In watch mode, the site stays up for the next runs.
        if (!isInWatchMode) {
          await site.stop();
        }
      }

      if (isInWatchMode) {
        notifyAboutChangeWatching(configuration);

        let isIdle = true;
        // chokidar watches directories recursively. It doesn't take globs.
        const stopWatching = pipeWith(
          createWatcher(testsDirectories.map((directory) => resolve(directory))),
          Stream.filter(() => isIdle),
          Stream.forEach(() => {
            isIdle = false;

            waitUntilChildProcessFinishes(runNightwatch(args, environment))
              .then(() => {
                isIdle = true;
                notifyAboutChangeWatching(configuration);
              });
          })
        );

        process
          .on('beforeExit', stopWatching)
          .on('uncaughtException', stopWatching)
          .on('unhandledRejection', stopWatching);
      }
    });
}

/**
 * Prints what the page checks found, each problem once, and writes the report if one
 * was asked for.
 */
async function reportPageChecks(pageChecks, reportPath) {
  let problems;

  try {
    problems = JSON.parse(await readFile(pageChecks.reportPath, 'utf8'));
  } catch {
    // Nightwatch stopped before the checks finished, and has said why.
    return;
  }

  const groups = groupProblems(problems);

  if (groups.length) {
    Logger.log((typography) => formatSummary(groups, typography), Logger.ErrorLevel);
  }

  if (reportPath) {
    await writeFile(resolve(reportPath), JSON.stringify({
      pages: pageChecks.pages,
      widths: pageChecks.widths,
      problems,
      groups
    }, null, 2), 'utf8');

    Logger.log(`The page checks report is in ${reportPath}`);
  }
}

// The settings of a check, which can also be just true or false, or null when it's off.
function getCheckSettings(value) {
  if (value === true) {
    return {};
  }

  return value?.enabled ? value : null;
}

// The settings of the enabled checks, or null when no check is enabled.
function getPageChecksSettings(pageChecksConfiguration, sessionConfiguration) {
  const a11y = getCheckSettings(pageChecksConfiguration.a11y);
  const darkMode = a11y && getCheckSettings(a11y.darkMode);
  const keyboard = getCheckSettings(pageChecksConfiguration.keyboard);
  const toggles = getCheckSettings(pageChecksConfiguration.toggles);
  const text = getCheckSettings(pageChecksConfiguration.text);
  const navigation = getCheckSettings(pageChecksConfiguration.navigation);

  const settings = {
    a11y: a11y && {
      context: a11y.context ?? 'html',
      options: a11y.options ?? DEFAULT_AXE_OPTIONS,
      darkMode: darkMode && {
        attribute: darkMode.attribute ?? 'data-theme',
        value: darkMode.value ?? 'dark'
      }
    },
    keyboard: keyboard && {
      skipLink: keyboard.skipLink ?? true,
      ignore: keyboard.ignore ?? [],
      maxStops: keyboard.maxStops ?? 1000
    },
    toggles: toggles && {
      ignore: toggles.ignore ?? [],
      maxToggles: toggles.maxToggles ?? 20
    },
    text: text && (text.spacing !== false || text.resize !== false) && {
      spacing: text.spacing ?? true,
      resize: text.resize ?? true,
      ignore: text.ignore ?? []
    },
    // When the site turns off navigation without reloads, there's nothing to check.
    navigation: navigation && !sessionConfiguration?.disable_spa ? {} : null
  };

  if (!Object.values(settings).some(Boolean)) {
    Logger.log('Page checks are on, but no check is enabled. Skipping them.', Logger.WarningLevel);

    return null;
  }

  return settings;
}

/**
 * Writes the manifest that the page checks suite reads: the built pages and the
 * settings. Returns null when the build has no pages to check.
 */
async function writePageChecksManifest(pageChecksConfiguration, settings, baseUrl, { only, widths }) {
  const pages = await collectBuiltPages(pageChecksConfiguration.ignore, only);

  if (!pages.length) {
    Logger.log('The build has no pages to check. Skipping page checks.', Logger.WarningLevel);

    return null;
  }

  const manifestDirectory = await mkdtemp(join(tmpdir(), 'postdoc-page-checks-'));
  const manifestPath = join(manifestDirectory, 'manifest.json');
  const checkedWidths = widths ?? pageChecksConfiguration.widths ?? [];

  await writeFile(manifestPath, JSON.stringify({
    baseUrl,
    pages,
    widths: checkedWidths,
    readyTimeout: pageChecksConfiguration.readyTimeout,
    ...settings
  }), 'utf8');

  Logger.log((typography) => `Checking ${typography.bold(pages.length)} pages`);

  return {
    manifestPath,
    reportPath: join(manifestDirectory, 'report.json'),
    pages,
    widths: checkedWidths,
    remove: () => rm(manifestDirectory, { recursive: true, force: true })
  };
}

// The built pages, as URLs, apart from those the configuration ignores. With `only`,
// patterns from the command line, just the pages that match one of them.
async function collectBuiltPages(ignore = [], only = null) {
  const outputDirectory = resolve(Configuration.get().outputPath);
  const shouldIgnore = anymatch(ignore);
  const isAsked = only?.length ? anymatch(only) : () => true;

  const pages = await pipeWith(
    walkDirectory(outputDirectory).files,
    AsyncIterable.filter((filePath) => filePath.endsWith('.html')),
    AsyncIterable.map((filePath) => '/' + relative(outputDirectory, filePath).split(sep).join('/')),
    AsyncIterable.filter((pageUrl) => !shouldIgnore(pageUrl) && isAsked(pageUrl)),
    AsyncIterable.fold([], (pages, pageUrl) => {
      pages.push(pageUrl);

      return pages;
    })
  );

  return pages.sort();
}

function notifyAboutChangeWatching(configuration) {
  Logger.log((typography) => `
      ${typography.green('Done')}.
      Listen to changes in ${typography.dim(configuration.testsPath)}...
    `, Logger.SuccessLevel);
}

function createWatcher(directories) {
  const watcherOptions = {
    ignoreInitial: true
  };

  return Stream.from((send) => {
    const watcher = watch(directories, watcherOptions)
      .on('add', (path, stats) =>
        send({
          kind: 'add',
          path,
          stats
        })
      )
      .on('change', (path, stats) =>
        send({
          kind: 'change',
          path,
          stats
        })
      )
      .on('unlink', (path, stats) =>
        send({
          kind: 'remove',
          path,
          stats
        })
      );

    return () => watcher.close();
  });
}

// Nightwatch's script, from the copy that the project has. The link to it in
// node_modules/.bin is a shell script on Windows and with pnpm, which Node can't run.
function findNightwatchScript() {
  const require = createRequire(join(process.cwd(), 'package.json'));
  let packagePath;

  try {
    packagePath = require.resolve('nightwatch/package.json');
  } catch {
    // A package can leave its package.json out of what it exports.
    try {
      packagePath = findPackageFile(require.resolve('nightwatch'));
    } catch {
      return null;
    }
  }

  const { bin } = JSON.parse(readFileSync(packagePath, 'utf8'));
  const script = typeof bin === 'string' ? bin : bin?.nightwatch;

  return script ? resolve(dirname(packagePath), script) : null;
}

function findPackageFile(file) {
  for (let directory = dirname(file); directory !== dirname(directory); directory = dirname(directory)) {
    const packagePath = join(directory, 'package.json');

    if (existsSync(packagePath) && JSON.parse(readFileSync(packagePath, 'utf8')).name === 'nightwatch') {
      return packagePath;
    }
  }

  throw new Error('Nightwatch has no package.json.');
}

// The value of a command-line option, as `--env chrome` or `--env=chrome`, or undefined.
function findOptionValue(options, names) {
  for (const [index, option] of options.entries()) {
    const name = names.find((name) => option === name || option.startsWith(`${name}=`));

    if (name) {
      return option === name ? options[index + 1] ?? '' : option.slice(name.length + 1);
    }
  }
}

// The environments of a Nightwatch configuration file, or null when it can't be read.
async function readNightwatchEnvironments(configPath) {
  try {
    const settings = extname(configPath) === '.json'
      ? JSON.parse(await readFile(resolve(configPath), 'utf8'))
      : (await import(pathToFileURL(resolve(configPath)).href)).default;

    return Object.keys(settings?.test_settings ?? {});
  } catch {
    return null;
  }
}

function runNightwatch(args, environment = {}) {
  const childProcess = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    detached: false
  });

  childProcess.on('error', (error) => {
    Logger.log(() => error.message, Logger.ErrorLevel);
  });

  return childProcess;
}

function waitUntilChildProcessFinishes(childProcess) {
  return new Promise((resolve) => {
    // A process killed by a signal has no exit code; report it as a failure.
    childProcess.on('close', (code) => resolve(code ?? 1));
  });
}
