import {sep} from 'node:path';

export default {
  pwa: {
    enabled: true
  },

  baseDir: '.',
  contentPath: './content',
  testsPath: './test',
  outputPath: './dist',

  directories: {
    layouts: './src/pages',
    includes: './src/includes'
  },

  apidocs: {
    tags: {},
    source: null,
    layout: 'apidocs.ejs',

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
    shikiOptions: {}
  },

  vite: {
    publicDir: './src/public',
    logLevel: 'silent'
  }
};
