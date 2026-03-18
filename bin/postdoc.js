#!/usr/bin/env node

import { argv, cwd } from 'node:process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const tsconfigPath = join(cwd(), 'tsconfig.json');
if (existsSync(tsconfigPath)) {
  require('ts-node').register({
    transpileOnly: true,
    project: tsconfigPath
  });
}

import createCLI from '../lib/index.js';
createCLI().then((cli) => cli.parseAsync(argv));
