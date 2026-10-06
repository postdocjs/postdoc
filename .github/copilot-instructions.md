# Postdoc Copilot Instructions

Postdoc is a documentation site generator that transforms Markdown content into static HTML pages with SPA-like navigation. Uses Vite for bundling and EJS for templating.

## Architecture

### Core Data Flow
```
Content (MD) + Layouts (EJS) → Collector → MarkdownCompiler + EJS → Vite → HTML
```

**Key classes in [lib/](lib/):**
- `Configuration` - Singleton, call `Configuration.get()` after `initialise()`. Loads `postdoc.config.{mjs,cjs,js}` or `postdoc.json`
- `Collector` - Walks directories, creates Page instances, writes compiled output to temp directory
- `Page` → `RegularPage` (MD content), `LayoutPage` (standalone EJS), `ApiPage` (JSDoc)
- `MarkdownCompiler` - Uses `marked` with custom plugins in [lib/md-plugins/](lib/md-plugins/)

**Client SPA ([client/](client/)):**
- `Session` initializes on `postdoc/client` import, stored as `globalThis.PostDoc`
- `Navigator` handles SPA transitions with snapshot morphing
- Public exports: `postdoc/client` (session), `postdoc/page` (navigation hooks), `postdoc/dom`

### Layout Resolution
`content/path/foo.md` → searches `layouts/path/foo.ejs` → `layouts/path/index.ejs` → walks up to `layouts/index.ejs`

## Development

### Commands
```bash
npm run test:unit    # Nightwatch unit tests (test/src/)
npm run test:e2e     # E2E tests (test/e2e/)
npm run lint         # ESLint
```

Test against a project: `__tmp/` and `bootstrap-test/` directories contain test fixtures.

### Adding CLI Commands
Commands live in [lib/commands/](lib/commands/). Use `PostDocCommand` (extends Commander):
```javascript
export default function createMyCommand() {
  return new PostDocCommand('mycommand')
    .description('Does something')
    .action(() => runAndMeasureAction(async () => { /* ... */ }));
}
```

## Code Patterns

### Async Iteration with `@halo-lab/iterable`
Collector uses functional pipelines for file processing:
```javascript
import AsyncIterable from '@halo-lab/iterable/async';
import { pipeWith } from 'pipe-ts';

pipeWith(
  walkDirectory(path),
  ({ files }) => files,
  AsyncIterable.filter((f) => f.endsWith('.md')),
  AsyncIterable.map((f) => new RegularPage(f, ...args)),
  AsyncIterable.filter(Boolean)
);
```

### Error Handling
Use `PostDocError` with reason codes (defined in `lib/error.js`):
```javascript
throw new PostDocError('page:missed-layout', { pageUrl });
```

### Page Compilation
Override `compile(pages, allowDrafts)` in Page subclasses. Return HTML string or `undefined` to skip:
```javascript
async compile(pages, allowDrafts) {
  const [frontMatter, content] = await this.#compileContent(allowDrafts);
  return this.compileLayout(pages, { page: { ...frontMatter, content } });
}
```

### API Docs
Files need `@name` tag to generate a page. Parsed via [lib/dox.js](lib/dox.js) (forked dox). Key tags: `@name`, `@param`, `@returns`, `@since`, `@see`, `@example`

### Vite Plugins
- `PostDocRenderVitePlugin` - Dev server middleware, compiles pages on request
- `PostDocRebaseVitePlugin` - Rewrites URLs for production builds

## Style Guidelines
- ES modules, Node.js >= 22.18
- Single quotes, semicolons, 2-space indent
- Private fields: `#` prefix
- Async/await over callbacks
