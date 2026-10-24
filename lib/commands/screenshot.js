/**
 * Takes screenshots of pages in Chrome, to see a change rather than read it: at several
 * window widths, in the light and the dark colour scheme, of the whole page or of one
 * element. It waits until each page has finished rendering, as the page checks do.
 *
 * Without `--url`, it builds the site and serves the build, like `postdoc test`. With
 * it, it uses a site that's already running, such as the dev server, which is quicker
 * and shows drafts.
 *
 * Options:
 *
 * - `--width <widths>` - the window widths, in CSS pixels, separated by commas. Defaults
 *   to `1280`.
 * - `--height <height>` - the window height. Defaults to `800`.
 * - `--theme <themes>` - `light`, `dark` or `light,dark`. Defaults to `light`. Dark mode
 *   is switched on as the page checks do, with the `nightwatch.pageChecks.a11y.darkMode`
 *   settings.
 * - `--selector <selector>` - a CSS selector: only the first element it matches.
 * - `--full-page` - the whole page, not only the window.
 * - `--url <address>` - the address of a running site, such as `http://localhost:5173`.
 * - `--output <dir>` - where to write the PNG files. Defaults to `screenshots`.
 * - `--wait <ms>` - how long to wait after a page is ready, for maps, fonts and
 *   animations. Defaults to `300`.
 *
 * It prints the path of each file it writes. It needs Chrome, and `selenium-webdriver`,
 * which comes with Nightwatch.
 *
 * @example
 * ```sh
 * npx postdoc screenshot /guide/index.html --width 1280,390 --theme light,dark
 * ```
 *
 * @name screenshot
 * @since 0.3.0
 */

/* global document, scrollX, scrollY -- the functions that run in the browser */

import process from 'node:process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import Logger from '../logger.js';
import Configuration from '../configuration.js';
import PostDocCommand from '../command.js';
import { serveBuild } from './preview.js';

const list = (value) => String(value).split(',').map((item) => item.trim()).filter(Boolean);

// The name of a screenshot's file: the page's path, its width, and its colour scheme
// when it's dark.
function getFileName(pagePath, width, theme) {
  const name = pagePath.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '').replace(/[^\w.-]+/g, '-') || 'index';

  return `${name}-${width}${theme === 'dark' ? '-dark' : ''}.png`;
}

function loadSelenium() {
  const require = createRequire(resolve('package.json'));

  try {
    return {
      webdriver: require('selenium-webdriver'),
      chrome: require('selenium-webdriver/chrome')
    };
  } catch {
    return null;
  }
}

// Runs in the browser. Calls back once PostDoc has rendered the page and the fonts have
// loaded, or after the timeout.
function waitUntilReady(timeout, done) {
  const start = Date.now();

  (function check() {
    if (document.documentElement.hasAttribute('data-postdoc-ready') || Date.now() - start >= timeout) {
      document.fonts.ready.then(() => done());
    } else {
      setTimeout(check, 50);
    }
  })();
}

// Runs in the browser. Switches the page to dark mode, as the dark mode check does.
function switchToDarkMode(attribute, value) {
  if (attribute === 'class') {
    document.documentElement.classList.add(value);
  } else {
    document.documentElement.setAttribute(attribute, value);
  }
}

// Runs in the browser. The box of the first element that matches, in page coordinates.
function findBox(selector) {
  const element = document.querySelector(selector);

  if (!element) {
    return null;
  }

  const box = element.getBoundingClientRect();

  return { x: box.left + scrollX, y: box.top + scrollY, width: box.width, height: box.height };
}

async function takeScreenshot(driver, { address, width, height, theme, selector, fullPage, wait, readyTimeout, darkMode }) {
  await driver.sendAndGetDevToolsCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await driver.sendAndGetDevToolsCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }]
  });
  await driver.get(address);
  await driver.executeAsyncScript(waitUntilReady, readyTimeout);

  if (theme === 'dark' && darkMode) {
    await driver.executeScript(switchToDarkMode, darkMode.attribute, darkMode.value);
  }

  await driver.sleep(wait);

  const parameters = { format: 'png' };

  if (selector) {
    const box = await driver.executeScript(findBox, selector);

    if (!box) {
      throw new Error(`Nothing on ${address} matches ${selector}.`);
    }

    parameters.captureBeyondViewport = true;
    parameters.clip = { ...box, scale: 1 };
  } else if (fullPage) {
    const size = await driver.executeScript(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    }));

    parameters.captureBeyondViewport = true;
    parameters.clip = { x: 0, y: 0, ...size, scale: 1 };
  }

  const { data } = await driver.sendAndGetDevToolsCommand('Page.captureScreenshot', parameters);

  return Buffer.from(data, 'base64');
}

export default function createScreenshotCommand() {
  return new PostDocCommand('screenshot')
    .argument('<pages...>', 'The paths of the pages, such as /guide/index.html')
    .option('--width <widths>', 'The window widths, separated by commas.', '1280')
    .option('--height <height>', 'The window height.', '800')
    .option('--theme <themes>', 'light, dark or light,dark.', 'light')
    .option('--selector <selector>', 'Only the first element that matches this CSS selector.')
    .option('--full-page', 'The whole page, not only the window.')
    .option('--url <address>', 'The address of a running site, instead of building one.')
    .option('--output <dir>', 'Where to write the PNG files.', 'screenshots')
    .option('--wait <ms>', 'How long to wait after a page is ready.', '300')
    .description('Takes screenshots of pages in Chrome.')
    .action(async (pagePaths, options) => {
      const selenium = loadSelenium();

      if (!selenium) {
        Logger.log((typography) => `
            Screenshots need selenium-webdriver, which comes with Nightwatch. Install it with:
              ${typography.cyan('npm i -D nightwatch')}
          `, Logger.ErrorLevel);
        process.exitCode = 1;

        return;
      }

      const configuration = Configuration.get();
      const darkModeSettings = configuration.nightwatch?.pageChecks?.a11y?.darkMode;
      const darkMode = darkModeSettings === false
        ? null
        : { attribute: darkModeSettings?.attribute ?? 'data-theme', value: darkModeSettings?.value ?? 'dark' };
      const themes = list(options.theme).filter((theme) => theme === 'light' || theme === 'dark');
      const widths = list(options.width).map(Number).filter((width) => width > 0);
      const outputDirectory = resolve(options.output);

      const site = options.url
        ? { baseUrl: options.url.endsWith('/') ? options.url : options.url + '/', stop: async () => {} }
        : await serveBuild();

      if (!site) {
        return;
      }

      const { webdriver, chrome } = selenium;
      const browserOptions = new chrome.Options().addArguments('--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1');
      let driver;

      try {
        driver = await new webdriver.Builder().forBrowser('chrome').setChromeOptions(browserOptions).build();
        await mkdir(outputDirectory, { recursive: true });

        for (const pagePath of pagePaths) {
          for (const width of widths) {
            for (const theme of themes.length ? themes : ['light']) {
              const address = new URL(pagePath.replace(/^\//, ''), site.baseUrl).href;

              try {
                const image = await takeScreenshot(driver, {
                  address,
                  width,
                  height: Number(options.height),
                  theme,
                  selector: options.selector,
                  fullPage: options.fullPage,
                  wait: Number(options.wait),
                  readyTimeout: configuration.nightwatch?.pageChecks?.readyTimeout ?? 10000,
                  darkMode
                });
                const filePath = join(outputDirectory, getFileName(pagePath, width, theme));

                await writeFile(filePath, image);
                const shownPath = relative(process.cwd(), filePath);

                Logger.log(shownPath.startsWith('..') ? filePath : shownPath, Logger.SuccessLevel);
              } catch (error) {
                Logger.log(error.message, Logger.ErrorLevel);
                process.exitCode = 1;
              }
            }
          }
        }
      } finally {
        await driver?.quit();
        await site.stop();
      }
    });
}
