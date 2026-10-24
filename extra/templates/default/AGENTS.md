# Working on this site

This is a [PostDoc](https://github.com/PostDocJS/postdoc) site: pages in Markdown, laid out by EJS templates, built into static HTML.

## Where things are

| Path | What it is |
| --- | --- |
| `content/` | The pages, in Markdown. `content/guide/setup.md` becomes `/guide/setup.html`. |
| `content/changelog.md` | What changed in each version. The version at the top of every page comes from `package.json` and links here, so add an entry when it changes. |
| `src/layouts/` | EJS layouts: the home and about pages here, and every other page from PostDoc's default theme. A page uses the most specific one for its path: `guide/setup.ejs`, then `guide/index.ejs`, up to `index.ejs`. Front matter can name one: `layout: story`. |
| `src/includes/`, `src/public/` | Your own partials and files served as they are. The theme has the header, sidebars, footer, styles and scripts. A file here with the same name as one of the theme's replaces it. |
| `src/css/` | The styles of the home and about pages. |
| `test/` | Nightwatch tests of your own. |
| `postdoc.config.js` | The configuration. Its `appSettings` has the site's name and the links of the header (`headerNav`) and of the sidebars (`nav` for the guide, `apiNav` for the API reference), so a new page needs a link there. |

Pages change without a reload, so a script in a layout runs once. Code that has to run for every page goes in `onRender()`, from `postdoc/page`. A page with `draft: true` in its front matter shows in the dev server and is left out of builds.

## Commands

| Command | What it does |
| --- | --- |
| `npx postdoc check` | Checks the configuration, compiles every page and checks every link and anchor, in seconds. Add `--json` for the problems as JSON. Exits with 1 on a problem. |
| `npx postdoc run --port <port>` | The dev server. Choose a port of your own: someone may have one running already. |
| `npx postdoc screenshot <path> --url http://localhost:<port>` | Screenshots of a page, to look at a change. `--width 1280,390`, `--theme light,dark` and `--selector <css>` choose what. |
| `npx postdoc test --pages '<glob>' --report checks.json` | Builds the site and checks its pages in Chrome: accessibility rules, dark mode, the keyboard, larger text. It takes minutes. The report lists each problem with its page. |
| `npx postdoc build --out-dir <dir>` | Builds the site into a folder of your own, leaving `out/` as it is. |

## Before you call a change done

1. `npx postdoc check` passes.
2. You've looked at the pages you changed with `npx postdoc screenshot`, at a wide and a narrow width, and in dark mode.
3. `npx postdoc test --pages` on those pages passes.

Every page has an `.md` copy in the build, and `llms.txt` lists them, for reading the site as text.
