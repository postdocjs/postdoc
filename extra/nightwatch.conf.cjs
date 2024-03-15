module.exports = {
  'src_folders': ['src/a11y-tests'],
  'page_objects_path': 'src/a11y-tests',
  'plugins': [
    'nightwatch-plugin-postdoc'
  ],
  'webdriver': {
    'start_process': true,
    'server_path': '',
    'cli_args': []
  },
  'test_settings': {
    'default': {
      'launch_url': 'http://localhost:5173',
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
        'browserName': 'firefox'
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
