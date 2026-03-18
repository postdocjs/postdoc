# `postdoc` Test Command API Documentation

## Overview

The `postdoc test` command is a subcommand part of the `postdoc` tool that facilitates running tests for a given project. The command leverages Nightwatch.js, a Node.js based End-to-End (E2E) testing solution, to conduct the tests. Consequently, it accepts the same command line arguments as Nightwatch.js.

## Command Usage

### Basic Usage

The command order must be: `postdoc test -- [tests] [args]`

The basic usage of this command is as follows:

```bash
postdoc test
```

### With Options

You can also specify additional options in the command. For example:

```bash
postdoc test -- test/src -o tests_output --headless
postdoc test -- -o tests_output --headless
postdoc test -- test/src test/lib -o tests_output --headless
```

In the commands above, `test/src` and `test/lib` are test directories. The `-o` option specifies the output directory for test results, and the `--headless` option runs tests in headless mode.

## Error Handling

If a path specified does not contain a directory, an error message will be shown, and the program will exit with status 1.

Similarly, if a test directory specified in the project configuration does not exist, an error message will be displayed, instructing the user to create a test suite.

## Return

The function does not return anything. It triggers the Nightwatch process and, upon completion, it displays a status message with the duration of the test run.

Please note that any additional Nightwatch command line arguments can be passed to the `postdoc test` command, as it internally delegates to the Nightwatch process.