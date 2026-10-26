import {sep} from 'node:path';
import {readFileSync} from 'node:fs';

// appSettings.version is the one in package.json, so npm version changes it.
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

  // The theme's layouts read the site's name and navigation from here. Its header and
  // footer link to `headerNav`, the guide's sidebar lists `nav`, and the API reference's
  // lists `apiNav`. An item with `children` is a section that opens and closes.
  appSettings: {
    name: '${project_name}',
    version,

    headerNav: [
      { title: 'Guide', url: '/guide/index.html' },
      { title: 'API Reference', url: '/api_reference/index.html' },
      { title: 'About', url: '/about/index.html' }
    ],

    nav: [
      {
        title: 'Getting started',
        children: [
          { title: 'Introduction', url: '/guide/index.html' },
          { title: 'Installation', url: '/guide/installation/index.html' },
          { title: 'Usage', url: '/guide/usage/index.html' }
        ]
      },
      {
        title: 'Learn more',
        children: [
          { title: 'Concepts', url: '/guide/concepts/index.html' },
          { title: 'Changelog', url: '/changelog.html' }
        ]
      }
    ],

    apiNav: [
      {
        title: 'Reference',
        children: [
          { title: 'Implementation details', url: '/api_reference/index.html' },
          { title: 'Configuration', url: '/api_reference/configuration/index.html' },
          { title: 'API documentation', url: '/api_reference/docs/index.html' }
        ]
      }
    ]
  },

  markdown: {
    extensions: []
  },

  vite: {
    logLevel: 'silent'
  }
};
