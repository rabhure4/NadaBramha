import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('NadaBramha dev server needs a built frontend. Run "npm run build" once first.');
  process.exit(1);
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: rootDir,
  stdio: 'inherit',
  windowsHide: false,
  shell: false,
  env: { ...process.env, NADABRAMHA_SERVER_PORT: process.env.NADABRAMHA_SERVER_PORT || '3901' },
});

const shutdown = () => {
  server.kill();
};

server.on('error', (error) => {
  console.error('Failed to start NadaBramha server:', error);
  process.exitCode = 1;
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.on('exit', shutdown);
