// The Nightwatch configuration `postdoc test` uses, unless `nightwatch.config` in the
// PostDoc configuration, or `--config`, names another. A project's own nightwatch.json
// or nightwatch.conf.js isn't read by itself.
import process from 'node:process';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// Nightwatch loads plugins from the project, which may not have this one installed.
function isInstalled(packageName) {
  try {
    createRequire(join(process.cwd(), 'package.json')).resolve(packageName);

    return true;
  } catch {
    return false;
  }
}

const configuration = {
  // Runs page tests, waits for PostDoc to render pages and checks accessibility.
  plugins: isInstalled('nightwatch-plugin-postdoc') ? ['nightwatch-plugin-postdoc'] : [],

  'webdriver': {
    'start_process': true,
    'server_path': '',
    'cli_args': []
  },
  'test_settings': {
    'default': {
      // `postdoc test` builds and serves the site, and passes its address on.
      'launch_url': process.env.POSTDOC_BASE_URL,
      'desiredCapabilities': {
        'browserName': 'chrome'
      }
    },
    'chrome': {
      'desiredCapabilities': {
        'browserName': 'chrome'
      }
    },
    'firefox': {
      'desiredCapabilities': {
        'browserName': 'firefox',
        'moz:firefoxOptions': {
          // On macOS, Tab moves only between form fields by default. The keyboard
          // page check needs it to reach links and buttons too.
          'prefs': { 'accessibility.tabfocus': 7 }
        }
      }
    },
    'edge': {
      'desiredCapabilities': {
        'browserName': 'MicrosoftEdge'
      }
    },
    'safari': {
      'desiredCapabilities': {
        'browserName': 'safari'
      }
    }
  }
};

export default configuration;

// Nightwatch loads its configuration with require(), which returns this export of an ES
// module instead of the module itself.
export { configuration as 'module.exports' };
