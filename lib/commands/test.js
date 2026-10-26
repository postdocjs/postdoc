/**
 * Runs the project's tests with [Nightwatch](https://nightwatchjs.org) 3.15 or newer,
 * which has to be installed in the project: `npm i -D nightwatch@3`. Another package can
 * bring in Nightwatch 2, which the command doesn't run.
 *
 * Besides the tests in the tests directory, it checks every page of the site without any
 * test files. It builds the project, serves the output, runs
 * [axe](https://github.com/dequelabs/axe-core) accessibility checks on each page, and
 * tries each page with the keyboard and with larger text.
 * See [page checks](/api/configuration.html#page-checks). HTML files that aren't pages of
 * PostDoc, such as one in the public folder, are left out: they don't load PostDoc's
 * script, so the checks can't tell when they're ready.
 *
 * Your own tests run first, and the page checks after them, in a Nightwatch run of their
 * own.
 *
 * Options:
 *
 * - `--skip-page-checks` - runs only the tests in the tests directory.
 * - `--pages <patterns>` - checks only the pages whose URLs match these glob patterns,
 *   separated by commas, such as `/guide/**,/index.html`.
 * - `--widths <widths>` - the window widths to check each page at, in CSS pixels,
 *   such as `1280,390`, in place of `nightwatch.pageChecks.widths`.
 * - `--report <file>` - writes what the page checks found to this file, as JSON: each
 *   problem with its page, width and check, the problems grouped, how many pages and
 *   widths were checked, and whether the checks finished. The checks keep a record as
 *   they go, so the report still has what they found if Nightwatch stops on the way.
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
 * The page checks run with the same configuration and the same options, apart from those
 * that choose tests or reports, with two changes for a run over a whole site: Nightwatch
 * writes no report files, and the browsers' drivers log only warnings. Nightwatch keeps
 * both in memory, which a site of a few hundred pages fills.
 *
 * After the checks, the command prints each problem once, with the pages it was found
 * on, so one in a header or a footer doesn't fill the report.
 *
 * The command exits with Nightwatch's exit code, so failing tests fail a CI job, and with
 * 1 when the build had to leave out a page that couldn't be compiled.
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
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
import { formatSummary, groupProblems, readPageCheckRecords } from '../page-checks-report.js';
import { walkDirectory } from '../fs.js';

const DEFAULT_NIGHTWATCH_CONFIG = fileURLToPath(new URL('../../extra/nightwatch.conf.js', import.meta.url));
// The configuration files that Nightwatch would read from a project by itself.
const PROJECT_NIGHTWATCH_CONFIGS = ['nightwatch.conf.js', 'nightwatch.conf.cjs', 'nightwatch.conf.mjs', 'nightwatch.conf.ts', 'nightwatch.json'];
const PAGE_CHECKS_SUITE = fileURLToPath(new URL('../../extra/page-checks.js', import.meta.url));
// The page checks run with the project's Nightwatch configuration, changed for them.
const PAGE_CHECKS_CONFIG = fileURLToPath(new URL('../../extra/page-checks.conf.js', import.meta.url));

// Nightwatch's options that take a value, as `--env chrome`, and those that choose the
// project's own tests or where Nightwatch reports on them, which the page checks' run
// leaves out.
const VALUE_OPTIONS = new Set([
  '--env', '-e', '--config', '-c', '--test', '-t', '--testcase', '--group', '-g', '--skipgroup', '-s', '--filter', '-f',
  '--tag', '-a', '--skiptags', '--grep', '--fgrep', '--retries', '--suiteRetries', '--timeout', '--output', '-o',
  '--reporter', '-r', '--workers', '--deviceId', '--source'
]);
const PROJECT_TEST_OPTIONS = new Set([
  '--config', '-c', '--test', '-t', '--testcase', '--group', '-g', '--skipgroup', '-s', '--filter', '-f', '--tag', '-a',
  '--skiptags', '--grep', '--fgrep', '--invert', '--retries', '--suiteRetries', '--output', '-o', '--reporter', '-r',
  '--open', '--mocha', '--source', '--list-files', '--rerun-failed'
]);

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
    .description('Builds the site and runs the page checks and the project\'s tests in a browser.')
    .action(async (nightwatchOptions, { skipPageChecks, pages: pagePatterns, widths, report, outDir }) => {
      useOutputDirectory(outDir);

      const configuration = Configuration.get();

      const nightwatch = findNightwatch();

      if (!nightwatch) {
        Logger.log((typography) => `
            Nightwatch is not installed in this project. Install it with:
              ${typography.cyan('npm i -D nightwatch')}
          `, Logger.ErrorLevel);

        process.exitCode = 1;

        return;
      }

      const versionProblem = checkNightwatchVersion(nightwatch.version);

      if (versionProblem?.level === 'error') {
        Logger.log(versionProblem.message, Logger.ErrorLevel);
        process.exitCode = 1;

        return;
      }

      if (versionProblem) {
        Logger.log(versionProblem.message, Logger.WarningLevel);
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

      const pageChecks = pageChecksSettings && await writePageChecksManifest(pageChecksConfiguration, pageChecksSettings, site, {
        only: pagePatterns ? pagePatterns.split(',').map((pattern) => pattern.trim()).filter(Boolean) : null,
        widths: widths ? widths.split(',').map(Number).filter((width) => width > 0) : null
      });

      if (!projectTestsDirectories.length && !pageChecks) {
        await site.stop();

        return;
      }

      // Your own tests run first, as Nightwatch would run them, and then the page checks,
      // in a run of their own.
      const { projectOptions, pageCheckOptions } = splitNightwatchOptions(nightwatchOptions);
      const sharedArgs = [];

      if (isParallelMode) {
        sharedArgs.push('--parallel');
      }

      if (isHeadlessMode) {
        sharedArgs.push('--headless');
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
          sharedArgs.push('--env', browsers.join(','));
        }
      }

      const args = [
        nightwatch.script,
        ...projectTestsDirectories,
        ...projectOptions,
        ...(configOption === undefined ? ['--config', nightwatchConfig] : []),
        ...sharedArgs
      ];
      const environment = {
        // Your own tests and the Nightwatch plugin for PostDoc open the site at this address.
        POSTDOC_BASE_URL: site.baseUrl,
        // The plugin runs the page tests in this folder.
        POSTDOC_PAGES_PATH: resolve(testsDirectories[0], 'pages')
      };

      try {
        let exitCode = 0;

        if (projectTestsDirectories.length) {
          exitCode = await waitUntilChildProcessFinishes(runNightwatch(args, environment));
        }

        if (pageChecks) {
          const pageChecksExitCode = await waitUntilChildProcessFinishes(runNightwatch(
            [nightwatch.script, PAGE_CHECKS_SUITE, ...pageCheckOptions, '--config', PAGE_CHECKS_CONFIG, ...sharedArgs],
            {
              POSTDOC_BASE_URL: site.baseUrl,
              POSTDOC_NIGHTWATCH_CONFIG: resolve(configOption ?? nightwatchConfig),
              POSTDOC_PAGE_CHECKS: pageChecks.manifestPath,
              POSTDOC_PAGE_CHECKS_REPORT: pageChecks.reportPath
            }
          ));

          exitCode ||= pageChecksExitCode;
          await reportPageChecks(pageChecks, report);
        } else if (report) {
          Logger.log(`The page checks didn't run, so there's no report to write to ${report}.`, Logger.WarningLevel);
        }

        // A build that left a page out has failed already, whatever the tests say.
        process.exitCode = exitCode || process.exitCode || 0;
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
  // report.jsonl, or with several browsers, a report for each, such as report.firefox.jsonl.
  const reportDirectory = dirname(pageChecks.reportPath);
  const reportFiles = (await readdir(reportDirectory)).filter((name) => /^report(\..+)?\.jsonl$/.test(name));

  if (!reportFiles.length) {
    // Nightwatch stopped before the checks started, and has said why.
    return;
  }

  const records = await Promise.all(reportFiles.map(async (name) => readPageCheckRecords(await readFile(join(reportDirectory, name), 'utf8'))));
  const problems = records.flatMap((record) => record.problems);
  const checkedCount = records.reduce((count, record) => count + record.checked.length, 0);
  const expectedCount = pageChecks.pages.length * Math.max(pageChecks.widths.length, 1) * records.length;
  const isComplete = records.every((record) => record.finished);

  const groups = groupProblems(problems);

  if (groups.length) {
    Logger.log((typography) => formatSummary(groups, typography), Logger.ErrorLevel);
  }

  if (!isComplete) {
    Logger.log(`Nightwatch stopped after checking ${checkedCount} of ${expectedCount} pages and widths. ` +
      'The problems above are those found until then.', Logger.WarningLevel);
  }

  if (reportPath) {
    await writeFile(resolve(reportPath), JSON.stringify({
      pages: pageChecks.pages,
      widths: pageChecks.widths,
      skipped: pageChecks.skipped,
      checked: checkedCount,
      complete: isComplete,
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
        // null leaves the page's attributes alone, for a theme that follows the media
        // query only.
        attribute: darkMode.attribute === undefined ? 'data-theme' : darkMode.attribute,
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
async function writePageChecksManifest(pageChecksConfiguration, settings, { baseUrl, pageUrls }, { only, widths }) {
  const { pages, skipped } = selectPagesToCheck(await collectBuiltFiles(), pageUrls, { ignore: pageChecksConfiguration.ignore, only });

  if (skipped.length) {
    Logger.log(`Left out ${skipped.length} HTML file${skipped.length === 1 ? ' that isn\'t a page' : 's that aren\'t pages'} of PostDoc, ` +
      `such as ${skipped[0]}: without PostDoc's script, the checks can't tell when ${skipped.length === 1 ? 'it\'s' : 'they\'re'} ready.`);
  }

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
    reportPath: join(manifestDirectory, 'report.jsonl'),
    pages,
    skipped,
    widths: checkedWidths,
    remove: () => rm(manifestDirectory, { recursive: true, force: true })
  };
}

// The built HTML files, as URLs.
async function collectBuiltFiles() {
  const outputDirectory = resolve(Configuration.get().outputPath);

  const files = await pipeWith(
    walkDirectory(outputDirectory).files,
    AsyncIterable.filter((filePath) => filePath.endsWith('.html')),
    AsyncIterable.map((filePath) => '/' + relative(outputDirectory, filePath).split(sep).join('/')),
    AsyncIterable.fold([], (files, pageUrl) => {
      files.push(pageUrl);

      return files;
    })
  );

  return files.sort();
}

/**
 * The built HTML files to check, apart from those that `ignore` matches, and with
 * `only`, patterns from the command line, just those that match one of them. Files
 * that aren't PostDoc's pages, such as HTML files of the public folder, are `skipped`.
 *
 * @ignore
 */
export function selectPagesToCheck(builtUrls, pageUrls, { ignore = [], only = null } = {}) {
  const shouldIgnore = anymatch(ignore);
  const isAsked = only?.length ? anymatch(only) : () => true;
  const isPage = new Set(pageUrls);
  const asked = builtUrls.filter((url) => !shouldIgnore(url) && isAsked(url));

  return {
    pages: asked.filter((url) => isPage.has(url)),
    skipped: asked.filter((url) => !isPage.has(url))
  };
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

// Nightwatch's script and version, from the copy that the project has. The link to it in
// node_modules/.bin is a shell script on Windows and with pnpm, which Node can't run.
function findNightwatch() {
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

  const { bin, version } = JSON.parse(readFileSync(packagePath, 'utf8'));
  const script = typeof bin === 'string' ? bin : bin?.nightwatch;

  return script ? { script: resolve(dirname(packagePath), script), version } : null;
}

/**
 * What's wrong with the project's version of Nightwatch, as `{ level, message }`, or
 * null. Another package, such as one of examples, may have brought in an older one.
 *
 * @ignore
 */
export function checkNightwatchVersion(version) {
  const [, major, minor] = (/^(\d+)\.(\d+)/.exec(version ?? '') ?? []).map(Number);

  if (major === undefined || major > 3 || (major === 3 && minor >= 15)) {
    return null;
  }

  if (major < 3) {
    return {
      level: 'error',
      message: `postdoc test needs Nightwatch 3 or newer, and the project has ${version}, which another package may have ` +
        'brought in. Install it with: npm i -D nightwatch@3'
    };
  }

  return {
    level: 'warning',
    message: `postdoc test is made for Nightwatch 3.15 or newer, and the project has ${version}. Update it with: npm i -D nightwatch@3`
  };
}

/**
 * Splits the Nightwatch options of the command line: the project's tests run with all
 * of them, and the page checks without those that choose tests or reports, and without
 * test files.
 *
 * @ignore
 */
export function splitNightwatchOptions(options) {
  const pageCheckOptions = [];

  for (let index = 0; index < options.length; index++) {
    const option = options[index];

    // A test file, which only the project's run is for.
    if (!option.startsWith('-')) {
      continue;
    }

    const name = option.split('=')[0];
    const group = [option];

    if (VALUE_OPTIONS.has(name) && !option.includes('=') && index + 1 < options.length) {
      group.push(options[++index]);
    }

    if (!PROJECT_TEST_OPTIONS.has(name) && name !== '--watch') {
      pageCheckOptions.push(...group);
    }
  }

  return { projectOptions: options.filter((option) => option !== '--watch'), pageCheckOptions };
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
