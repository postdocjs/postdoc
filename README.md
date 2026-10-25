# Postdoc

Postdoc turns a folder of Markdown files into a static documentation site. Two things set it apart:

- **Storymaps.** A story told in steps beside a map that follows along as the reader scrolls, written in plain Markdown.
- **Accessibility checks with nothing to write.** `postdoc test` opens every page in a real browser, checks it against the WCAG A and AA rules in light and dark mode, and tries it with the keyboard.

Layouts are HTML with [EJS](https://ejs.co) tags, with no front-end framework to learn, and [Vite](https://vite.dev) does the building.

Postdoc is in preview, so its configuration and APIs may still change before version 1.0.

## Get started

Postdoc needs Node.js 22.18 or newer.

```sh
npx postdoc init --name my-docs
cd my-docs
npm install
npm start
```

`npm start` runs the development server at `http://localhost:5173`, which reloads the browser when you save a page or a layout. The new project has example pages in `content/` and the layouts of its home and about pages in `src/layouts/`. The other pages use the default theme.

To add Postdoc to an existing project instead:

```sh
npm install --save-dev postdoc
```

## What you get

- **Markdown with extras:** highlighted code, tabbed code groups, callouts, tables with merged cells, Mermaid diagrams and math.
- **Storymaps:** markers, tracks and dated map layers, on a [MapLibre](https://maplibre.org) map.
- **Navigation without reloads:** pages are swapped in place, and the site still works with JavaScript turned off.
- **Search:** each build makes a [Pagefind](https://pagefind.app) index.
- **API reference:** pages made from your JSDoc comments.
- **Playgrounds and notebooks:** Node.js and Python code that readers run in the browser.
- **Offline support:** a progressive web app, with [vite-plugin-pwa](https://vite-pwa-org.netlify.app) installed.
- **For AI agents:** an `llms.txt` with a Markdown copy of each page written in Markdown, an `AGENTS.md` in new projects, and commands that report problems as JSON.

## A storymap

Put the steps between `::: storymap` and `:::`. Each heading starts a step and says where the map goes:

```md
::: storymap
### Honolulu {center="-157.87,21.3" zoom=9}

Honolulu Harbor is on the south shore of Oʻahu.

### Hilo {center="-155.07,19.73" zoom=9}

Hilo Harbor is on the east side of the island of Hawaiʻi.
:::
```

Your own GeoJSON sources and layers go in a YAML block at the start of the storymap.

## Commands

| Command | What it does |
| --- | --- |
| `postdoc init` | Creates a project with example pages. |
| `postdoc run` | Starts the development server. |
| `postdoc build` | Builds the site into `out/`, with its search index. |
| `postdoc preview` | Builds the site and serves the build. |
| `postdoc check` | Checks the configuration, compiles every page and follows every link, in seconds and without a browser. |
| `postdoc test` | Builds the site, runs the accessibility checks on every page, and runs your [Nightwatch](https://nightwatchjs.org) tests. |
| `postdoc screenshot <pages...>` | Takes screenshots of pages at the widths and in the themes you name. |
| `postdoc create page` | Creates a page and its page test. |
| `postdoc pagefind` | Writes the search index to a folder of your choice. |
| `postdoc import <path>` | Creates a page for each command of a command-line tool built with commander. |

`postdoc <command> --help` lists a command's options.

`postdoc test` runs Nightwatch from your project. Projects made with `postdoc init` have it already; otherwise install it with `npm install --save-dev nightwatch`.

## Configuration

The configuration is in `postdoc.config.js`. Postdoc's types check it in your editor:

```js
/** @type {import('postdoc').PostdocConfig} */
export default {
  contentPath: './content',
  appSettings: {
    name: 'My docs',
    nav: [
      { title: 'Introduction', url: '/guide/index.html' }
    ]
  }
};
```

## Documentation

The guide and the reference are at [postdoc.dev](https://postdoc.dev).

## Support

Ask in the [Discussions](https://github.com/PostDocJS/postdoc/discussions) or [open an issue](https://github.com/PostDocJS/postdoc/issues).

## License

[MIT](LICENSE)
