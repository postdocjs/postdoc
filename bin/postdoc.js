#!/usr/bin/env node

import { argv } from 'node:process';

import createCLI from '../lib/index.js';
createCLI().then((cli) => cli.parseAsync(argv));
