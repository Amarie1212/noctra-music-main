const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const root = __dirname;
const desktop = path.join(root, 'apps', 'desktop');
const node = process.execPath;
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const tsup = path.join(root, 'node_modules', 'tsup', 'dist', 'cli-default.js');
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const children = [];
let stopping = false;

function run(file, args, cwd) {
  const child = spawn(file, args, { cwd, stdio: 'inherit', windowsHide: false });
  children.push(child);
  child.on('exit', code => {
    if (!stopping && code && code !== 0) stop(code);
  });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed && child.pid) {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 120);
}

function waitForVite() {
  return new Promise(resolve => {
    const check = () => {
      const request = http.get('http://127.0.0.1:5173', response => {
        response.resume();
        resolve();
      });
      request.on('error', () => setTimeout(check, 100));
    };
    check();
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

run(node, [vite], desktop);
run(node, [tsup, '--watch'], desktop);
waitForVite().then(() => {
  if (!stopping) run(electron, ['.'], desktop);
});
