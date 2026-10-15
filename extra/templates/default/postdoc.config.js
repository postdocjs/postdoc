import {sep} from 'node:path';
import {readFileSync} from 'node:fs';

// The version at the top of every page is the one in package.json, so npm version
// changes it.
const {version} = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

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

  appSettings: {
    name: '${project_name}',
    version
  },

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
