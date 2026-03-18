/**
 * Nightwatch.js page object for the guide page. Each Postdoc page should have a corresponding page object defined as a module in the `test/pages` directory.
 *
 * Postdoc provides additional functionality to the basic Nightwatch.js page object model:
 * - `before`, `after`, `beforeEach`, `afterEach` hooks are supported directly on the "default" export.
 * - `a11y` configuration is supported directly on the "default" export allowing for accessibility testing using the [axe-core](https://www.deque.com/axe/) library which is integrated into Nightwatch.
 * - additional exports can be defined as functions which will run as individual testcases and will receive the page object instance as an argument.
 *
 * Read more about working with page objects on the [Nightwatch.js website](https://nightwatchjs.org/guide/concepts/page-object-model.html).
 */
export default {
  url: '/guide/index.html',

  a11y: {
    selector: 'body',
    enabled: true,
    verbose: false,
    config: {
      rules: {
        'color-contrast': {
          enabled: true
        },
        'button-name': {
          enabled: true
        },
        label: {
          enabled: true
        }
      }
    }
  },

  elements: {
    main: 'body',
    leftSidebar: '#right-sidebar',
    part1Heading: {
      selector: '//h2[text()="Part 1"]',
      locateStrategy: 'xpath'
    }
  },

  async before(browser) {
    console.log('before', browser.sessionId);
  }
};

export const homePageTest = function ({browser, page, element}) {
  element('@main').assert.visible();
  element('@main').find('.page-navigation-search[type=search]').sendKeys('test');
};
