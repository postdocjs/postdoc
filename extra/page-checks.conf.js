// The Nightwatch configuration of the page checks' run of `postdoc test`: the one that
// the project's own tests run with, named by POSTDOC_NIGHTWATCH_CONFIG, with two changes
// for a run over every page of a site. Nightwatch keeps in memory all that it would write
// to its report files, and all that the browsers' drivers print, and a large site fills
// both. So it writes no report files, as the test command reports what the checks found,
// and the drivers log only warnings.
import process from 'node:process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// Nightwatch loads its configuration with require(), so the file is read the same way.
const loaded = createRequire(import.meta.url)(resolve(process.env.POSTDOC_NIGHTWATCH_CONFIG));
const settings = loaded?.default ?? loaded;

// Each driver's option to log only warnings, and how to tell that it's set already.
// safaridriver has none.
const isChromiumLogOption = (arg) => arg === '--silent' || arg.startsWith('--log-level=');
const QUIET_DRIVERS = {
  chrome: { args: ['--log-level=WARNING'], isSet: isChromiumLogOption },
  microsoftedge: { args: ['--log-level=WARNING'], isSet: isChromiumLogOption },
  firefox: { args: ['--log', 'warn'], isSet: (arg) => arg === '--log' }
};

function quietDriver(name, environment) {
  // The other environments inherit the default one's options, which may be for another driver.
  if (name === 'default' || typeof environment !== 'object' || environment === null) {
    return environment;
  }

  const browserName = String(
    environment.desiredCapabilities?.browserName ?? settings.test_settings?.default?.desiredCapabilities?.browserName ?? ''
  ).toLowerCase();
  const quiet = QUIET_DRIVERS[browserName];
  const cliArgs = environment.webdriver?.cli_args ?? settings.webdriver?.cli_args ?? [];

  if (!quiet || !Array.isArray(cliArgs) || cliArgs.some(quiet.isSet)) {
    return environment;
  }

  return { ...environment, webdriver: { ...environment.webdriver, cli_args: [...cliArgs, ...quiet.args] } };
}

const configuration = {
  ...settings,
  output_folder: false,
  webdriver: { ...settings.webdriver, log_path: false },
  test_settings: Object.fromEntries(
    Object.entries(settings.test_settings ?? {}).map(([name, environment]) => [name, quietDriver(name, environment)])
  )
};

export default configuration;

// Nightwatch loads its configuration with require(), which returns this export of an ES
// module instead of the module itself.
export { configuration as 'module.exports' };
