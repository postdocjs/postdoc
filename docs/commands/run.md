# API Reference: `postdoc run`

## Synopsis

The `postdoc run` command is used to start a local development server for your PostDoc project.

```bash
postdoc run [options]
```

## Description

This command starts a local server that serves your PostDoc website. It enables live-reloading, meaning the webpage will automatically refresh when changes are made to the source files.

## Options

- `--port, -p` : Specify the port for the local development server. If not provided, PostDoc will use a default port (typically 5000).

- `--open, -o` : Automatically open the local development server URL in the browser.

- `--https` : Serve the website over HTTPS. This requires SSL certificates.

- `--config, -c` : Specify a path to a PostDoc configuration file. By default, PostDoc looks for a `postdoc.config.js` file in the project root.

## Examples

1. Run a PostDoc project on a specific port:

```bash
postdoc run --port 8000
```

2. Run a PostDoc project and automatically open it in the browser:

```bash
postdoc run --open
```

3. Run a PostDoc project with a specific configuration file:

```bash
postdoc run --config ./config/my-postdoc-config.js
```

## Notes

The `postdoc run` command requires a valid PostDoc project structure and configuration. Ensure that the command is run from the root directory of a PostDoc project.

The local development server is for development purposes only. For deploying your PostDoc website, consider using the `postdoc build` and `postdoc deploy` commands.

## See Also

- `postdoc init`: Initializes a new PostDoc project.
- `postdoc build`: Builds your PostDoc project for production.
- `postdoc deploy`: Deploys your PostDoc website to a specified host.
