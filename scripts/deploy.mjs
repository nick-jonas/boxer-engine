#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

/**
 * Deploy to Heroku, with the preflight checks that turn a confusing failure
 * into an obvious one.
 *
 * The check that matters most is the clean-tree check: Heroku builds from what
 * git pushed, so uncommitted work is silently absent from the deploy and you
 * are left staring at a live site that does not match your editor.
 *
 *   npm run deploy
 *   npm run deploy -- --allow-dirty    deploy anyway with uncommitted changes
 *   npm run deploy -- --skip-checks    skip typecheck and tests
 */

const args = new Set(process.argv.slice(2));
const skipChecks = args.has('--skip-checks');
const allowDirty = args.has('--allow-dirty');

/** Run a command and capture its output. Never throws. */
function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout ?? '').trim() };
}

/** Run a command attached to this terminal. Exits the process on failure. */
function passthrough(command, commandArgs, failureMessage) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.status !== 0) fail(failureMessage);
}

function fail(message, hints = []) {
  console.error(`\nFAILED: ${message}`);
  for (const hint of hints) console.error(`  ${hint}`);
  console.error('');
  process.exit(1);
}

// --- 1. Heroku CLI --------------------------------------------------------
if (!capture('heroku', ['--version']).ok) {
  fail('The Heroku CLI is not installed.', [
    'brew tap heroku/brew && brew install heroku',
    'or see https://devcenter.heroku.com/articles/heroku-cli',
  ]);
}

// --- 2. Logged in ---------------------------------------------------------
const who = capture('heroku', ['auth:whoami']);
if (!who.ok) fail('You are not logged in to Heroku.', ['heroku login']);
console.log(`ok   logged in as ${who.out}`);

// --- 3. A heroku git remote ----------------------------------------------
const remote = capture('git', ['remote', 'get-url', 'heroku']);
if (!remote.ok) {
  fail('This repo has no "heroku" git remote, so there is nothing to push to.', [
    'Create a new app:       npm run deploy:setup',
    'Or attach an existing:  heroku git:remote -a your-app-name',
  ]);
}
console.log(`ok   remote ${remote.out}`);

// --- 4. Clean working tree ------------------------------------------------
const status = capture('git', ['status', '--porcelain']);
if (status.out && !allowDirty) {
  const lines = status.out.split('\n');
  fail('Uncommitted changes. Heroku deploys committed code only, so these would NOT ship.', [
    ...lines.slice(0, 8).map((line) => `  ${line}`),
    ...(lines.length > 8 ? [`  ...and ${lines.length - 8} more`] : []),
    '',
    'Commit them, or deploy anyway with: npm run deploy -- --allow-dirty',
  ]);
}
if (status.out) {
  console.log('warn deploying with uncommitted changes; they will not be included');
}

// --- 5. Typecheck and tests ----------------------------------------------
if (skipChecks) {
  console.log('warn skipping typecheck and tests');
} else {
  console.log('...  typechecking');
  passthrough('npx', ['tsc', '--noEmit'], 'Typecheck failed. Fix it, or deploy with --skip-checks.');
  console.log('...  running tests');
  passthrough('npx', ['vitest', 'run'], 'Tests failed. Fix them, or deploy with --skip-checks.');
  console.log('ok   typecheck and tests pass');
}

// --- 6. Push --------------------------------------------------------------
// HEAD:main rather than a bare `main`, so deploying from a feature branch
// pushes what you are actually looking at.
const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out;
console.log(`\nPushing ${branch} to heroku/main\n`);
passthrough('git', ['push', 'heroku', 'HEAD:main'], 'The push to Heroku failed. See the build output above.');

// --- 7. Report ------------------------------------------------------------
const info = capture('heroku', ['apps:info', '--json']);
let url = null;
if (info.ok) {
  try {
    url = JSON.parse(info.out)?.app?.web_url ?? null;
  } catch {
    // Non-fatal: the deploy already succeeded, this is only the closing note.
  }
}

const config = capture('heroku', ['config:get', 'ANTHROPIC_API_KEY']);
const proxyOn = config.ok && config.out.length > 0;

console.log('');
console.log(`ok   deployed${url ? `: ${url}` : ''}`);
console.log(`     Claude proxy: ${proxyOn ? 'on' : 'off (built-in notes only)'}`);
if (!proxyOn) {
  console.log('     enable with: heroku config:set ANTHROPIC_API_KEY=sk-ant-...');
}
console.log('     logs: npm run deploy:logs\n');
