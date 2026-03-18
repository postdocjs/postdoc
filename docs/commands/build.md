# API Reference: `postdoc build`

## Synopsis

The `postdoc build` command is used to build your PostDoc project, preparing it for deployment.

```bash
postdoc build [options]
```

## Description

This command compiles all the source files of your PostDoc project into a static website, which is then ready for deployment. It copies all static assets into the output directory and processes the templates and Markdown files.

## Options

- `--config, -c` : Specify a path to a PostDoc configuration file. By default, PostDoc looks for a `postdoc.config.js` file in the project root.

## Examples

1. Build a PostDoc project with a specific configuration file:

```bash
postdoc build --config ./config/my-postdoc-config.js
```

## Notes

The `postdoc build` command requires a valid PostDoc project structure and configuration. Ensure that the command is run from the root directory of a PostDoc project.

The `postdoc build` command is typically followed by the `postdoc deploy` command, which deploys your static website to the chosen host.

## See Also

- `postdoc init`: Initializes a new PostDoc project.
- `postdoc run`: Starts a local server for development.
- `postdoc deploy`: Deploys your PostDoc website to a specified host.