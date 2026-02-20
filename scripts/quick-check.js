#!/usr/bin/env node

import { execSync } from 'child_process';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function run(command) {
  try {
    execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    return { success: true };
  } catch (err) {
    return { success: false, output: err.stdout || err.stderr };
  }
}

const results = { passed: [], failed: [] };

log('Running quick checks (no tests)...', 'cyan');
console.log();

// TypeScript
process.stdout.write('TypeScript... ');
const typeCheck = run('npx tsc --noEmit');
if (typeCheck.success) {
  log('pass', 'green');
  results.passed.push('TypeScript');
} else {
  log('fail', 'red');
  results.failed.push('TypeScript');
}

// ESLint
process.stdout.write('ESLint... ');
const lint = run('npm run lint');
if (lint.success) {
  log('pass', 'green');
  results.passed.push('ESLint');
} else {
  log('fail', 'red');
  results.failed.push('ESLint');
}

// Prettier
process.stdout.write('Prettier... ');
const format = run('npm run format:check');
if (format.success) {
  log('pass', 'green');
  results.passed.push('Prettier');
} else {
  log('fail', 'red');
  results.failed.push('Prettier');
}

// Summary
console.log();
if (results.failed.length === 0) {
  log('All checks passed!', 'green');
  log('Run "npm run pre-commit" for full checks including tests.', 'cyan');
} else {
  log(`${results.failed.length} check(s) failed: ${results.failed.join(', ')}`, 'red');
  if (results.failed.includes('ESLint')) log('  Fix: npm run lint:fix', 'yellow');
  if (results.failed.includes('Prettier')) log('  Fix: npm run format', 'yellow');
  process.exit(1);
}
