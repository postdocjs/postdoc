# PostDoc Workflow – Running a PostDoc Website Locally

Developing a PostDoc website involves iterating on your site locally before deploying it to a live server. This section covers how to run your PostDoc website on your local machine.

## Running PostDoc Locally

You can run your PostDoc website locally using the `postdoc serve` command. This command builds your website, starts a local server, and opens the site in your default browser.

Here's how to run `postdoc serve`:

```bash
$ postdoc serve
```

When you run this command, PostDoc will:

1. Compile your markdown files and EJS templates to generate HTML pages.
2. Start a local server at `http://localhost:8080` (by default).
3. Open your website in your default browser.

As you make changes to your markdown or EJS files, PostDoc will automatically rebuild the relevant pages and refresh the browser.

## Live Reloading

One of the key features of `postdoc serve` is live reloading. With live reloading, any changes you make to your markdown files or EJS templates are immediately reflected in your browser, without needing to manually refresh the page.

This feature is enabled by default when you run `postdoc serve`.

## Setting a Different Port

By default, `postdoc serve` starts the local server on port 8080. If you want to use a different port, you can specify it with the `-p` or `--port` option. Here's an example:

```bash
$ postdoc serve --port 3000
```

This command would start the server on port 3000 instead of 8080.

Working locally with PostDoc allows you to see how your changes will look on the final website, and live reloading helps you iterate more quickly by instantly reflecting your changes.