import {sep} from 'node:path';

export default {
  pwa: {
    enabled: false
  },

  baseDir: '.',
  contentPath: './content',
  testsPath: './test',
  outputPath: './out',

  directories: {
    layouts: './src/layouts',
    includes: './src/includes',
    vitePublic: './src/public'
  },

  apidocs: {
    tags: {},
    source: null,
    layoutName: 'apidocs.ejs',

    createUrl(filePath) {
      return filePath.split(sep).join('/').replace(/\.js$/, '.html');
    }
  },

  ignore: {
    pages: [],
    apidocs: [],
    layouts: []
  },

  logger: {
    quiet: false,
    noColors: false
  },

  nightwatch: {
    headless: true,
    browser: 'chrome',
    watch: false,
    parallel: false
  },

  appSettings: {},

  markdown: {
    extensions: [],
    syntaxHighlight: {
      theme: {
        light: 'github-light',
        dark: 'github-dark'
      }
    }
  },

  vite: {
    logLevel: 'silent'
  }
};
