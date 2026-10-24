#!/usr/bin/env node

import process, { argv, env } from 'node:process';

import createCLI from '../lib/index.js';

createCLI()
  .then((cli) => cli.parseAsync(argv))
  .catch((error) => {
    // A mistake such as a port that's taken gets its message, not a stack trace, unless
    // DEBUG is set.
    console.error(env.DEBUG ? error.stack : `× ${error.message}`);
    process.exitCode = 1;
  });
