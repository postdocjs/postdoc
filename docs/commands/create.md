# PostDoc CLI: `create` Command API Documentation

## Overview

The `create` command in the PostDoc CLI is a primary command that consolidates the functionality of various subcommands, namely: `page`, `test`, and `include`.

## Primary Command: `create`

#### Synopsis
```bash
postdoc create [command] [...options]
```

#### Description

The `create` command is used to generate assets for your documentation project. Depending on the subcommand used, these assets may be new pages, test suites, or server-side components.

## Subcommand: `create page`

#### Synopsis
```bash
postdoc create page <name> [-t | --test]
```

#### Description

The `create page` subcommand creates a new page in your documentation, served at the `/[name]` URL. The `<name>` argument is required and determines the name and URL path of the page.

If the `-t` or `--test` flag is used, a test suite for the page will also be generated.

## Subcommand: `create include`

#### Synopsis
```bash
postdoc create include <name>
```

#### Description

The `create include` subcommand creates a new server-side component, also known as an include. The `<name>` argument is required and determines the name of the component.

## Subcommand: `create test`

#### Synopsis
```bash
postdoc create test <page_path> [-o | --output [path]]
```

#### Description

The `create test` subcommand generates a default test suite for the specified page. The `<page_path>` argument is required and should be the path to the page for which the test suite should be generated.

The `-o` or `--output` option is used to specify the path where the generated test should be placed.

## Sample Usage

#### Creating a New Page

To create a new page called "Getting Started":

```bash
postdoc create page "Getting Started"
```

#### Creating a New Page with a Test Suite

To create a new page called "API Reference" with an associated test suite:

```bash
postdoc create page "API Reference" --test
```

#### Creating a Server-side Component

To create a new server-side component named "Header":

```bash
postdoc create include "Header"
```

#### Generating a Test Suite for a Page

To generate a test suite for an existing page at path "/guides/installation":

```bash
postdoc create test "guides/installation"
```

## Notes

- If a file already exists at the specified destination, the operation will be skipped and a warning will be displayed.
- You can provide paths as arguments. For example, `postdoc create page "guides/installation"` will create a page at the URL `/guides/installation`.
- Path arguments should always use forward slashes (`/`), regardless of your operating system.
- If a test suite is generated for a page, the test suite will be placed in the default test directory specified in your PostDoc configuration. This can be overridden using the `-o` or `--output` option with the `create test` subcommand.
