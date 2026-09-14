#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

/**
 * One-time Heroku setup: create the app and wire up the git remote.
 *
 *   npm run deploy:setup                 let Heroku pick a name
 *   npm run deploy:setup -- my-app-name  choose one
 *
 * `heroku create` adds the "heroku" remote itself when run inside a repo, so
 * this is mostly about failing clearly rather than doing much work.
 */

const appName = process.argv.slice(2).find((arg) => !arg.startsWith('-'));

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout ?? '').trim() };
}

function fail(message, hints = []) {
  console.error(`\nFAILED: ${message}`);
  for (const hint of hints) console.error(`  ${hint}`);
  console.error('');
  process.exit(1);
}

if (!capture('heroku', ['--version']).ok) {
  fail('The Heroku CLI is not installed.', ['brew tap heroku/brew && brew install heroku']);
}

const who = capture('heroku', ['auth:whoami']);
if (!who.ok) fail('You are not logged in to Heroku.', ['heroku login']);
console.log(`ok   logged in as ${who.out}`);

if (!capture('git', ['rev-parse', '--is-inside-work-tree']).ok) {
  fail('Not a git repository, so there is nowhere to add the remote.', ['git init && git add -A && git commit -m "Initial commit"']);
}

const existing = capture('git', ['remote', 'get-url', 'heroku']);
if (existing.ok) {
  console.log(`ok   a heroku remote already exists: ${existing.out}`);
  console.log('     nothing to do. Deploy with: npm run deploy');
  console.log('     to point at a different app: heroku git:remote -a other-app-name\n');
  process.exit(0);
}

console.log(`...  creating Heroku app${appName ? ` "${appName}"` : ''}`);
const create = spawnSync('heroku', ['create', ...(appName ? [appName] : [])], { stdio: 'inherit' });
if (create.status !== 0) {
  fail('heroku create failed. See the output above.', [
    'If the name is taken, try another: npm run deploy:setup -- another-name',
  ]);
}

const remote = capture('git', ['remote', 'get-url', 'heroku']);
if (!remote.ok) {
  fail('The app was created but no git remote was added.', ['heroku git:remote -a your-app-name']);
}

console.log(`\nok   remote ${remote.out}`);
console.log('\nNext:');
console.log('  npm run deploy');
console.log('');
console.log('Optional, to give the tutor and click-to-ask real answers');
console.log('(usage is billed to this key for every visitor):');
console.log('  heroku config:set ANTHROPIC_API_KEY=sk-ant-...');
console.log('');
