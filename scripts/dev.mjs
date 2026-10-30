// Runs the drill backend and the website together: `npm run dev`.
import { spawn } from 'node:child_process';

const run = (name, args) => {
  const p = spawn('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    console.log(`[${name}] exited (${code})`);
    for (const c of children) c.kill();
    process.exit(code ?? 0);
  });
  return p;
};
const children = [run('server', ['run', 'server']), run('web', ['run', 'web'])];
process.on('SIGINT', () => children.forEach((c) => c.kill()));
