#!/usr/bin/env node

const { execSync } = require('child_process');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function header(message) {
  console.log();
  log(`--- ${message}`, 'bold');
}

function success(message) {
  log(`  pass: ${message}`, 'green');
}

function error(message) {
  log(`  fail: ${message}`, 'red');
}

function run(command, options = {}) {
  const { cwd = process.cwd(), silent = false } = options;

  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
    });
    return { success: true, output };
  } catch (err) {
    return {
      success: false,
      output: err.stdout || err.stderr || err.message,
      error: err
    };
  }
}

const results = {
  passed: [],
  failed: [],
};

async function main() {
  log('Running pre-commit checks...', 'cyan');

  // 1. TypeScript type checking, including the Tauri renderer adapter
  header('TypeScript Type Check');
  const typeCheck = run('npm run typecheck');
  if (typeCheck.success) {
    success('No type errors');
    results.passed.push('TypeScript');
  } else {
    error('Type errors found');
    results.failed.push('TypeScript');
  }

  // 2. ESLint
  header('ESLint');
  const lint = run('npm run lint');
  if (lint.success) {
    success('No linting errors');
    results.passed.push('ESLint');
  } else {
    error('Linting errors found');
    results.failed.push('ESLint');
  }

  // 3. Prettier
  header('Prettier Format Check');
  const format = run('npm run format:check');
  if (format.success) {
    success('All files properly formatted');
    results.passed.push('Prettier');
  } else {
    error('Formatting issues found (run: npm run format)');
    results.failed.push('Prettier');
  }

  // 4. Rust formatting. This intentionally does not compile/link Tauri so the
  // commit gate remains usable on hosts without WebKitGTK 4.1 development files.
  header('Rust Format Check');
  const rustFormat = run('npm run format:rust:check');
  if (rustFormat.success) {
    success('All Rust files properly formatted');
    results.passed.push('Rust format');
  } else {
    error('Rust formatting issues found (run: npm run format:rust)');
    results.failed.push('Rust format');
  }

  // 5. Tests
  header('Tests');
  const test = run('npm run test');
  if (test.success) {
    success('All tests passed');
    results.passed.push('Tests');
  } else {
    error('Tests failed');
    results.failed.push('Tests');
  }

  // Summary
  console.log();
  log('========================================================', 'bold');
  header('SUMMARY');

  if (results.passed.length > 0) {
    log(`\nPassed (${results.passed.length}):`, 'green');
    results.passed.forEach(item => log(`  - ${item}`, 'green'));
  }

  if (results.failed.length > 0) {
    log(`\nFailed (${results.failed.length}):`, 'red');
    results.failed.forEach(item => log(`  - ${item}`, 'red'));
  }

  console.log();
  log('========================================================', 'bold');

  if (results.failed.length === 0) {
    log('\nAll checks passed! Ready to commit.', 'green');
    console.log();
    process.exit(0);
  } else {
    log('\nSome checks failed. Please fix the issues before committing.', 'red');
    console.log();

    // Quick fix suggestions
    log('Quick fixes:', 'cyan');
    if (results.failed.includes('ESLint')) {
      log('  npm run lint:fix', 'cyan');
    }
    if (results.failed.includes('Prettier')) {
      log('  npm run format', 'cyan');
    }
    if (results.failed.includes('Rust format')) {
      log('  npm run format:rust', 'cyan');
    }
    console.log();

    process.exit(1);
  }
}

main().catch(err => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
