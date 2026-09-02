// Boots the real Express server once for the whole e2e run, on a free port,
// and tears it down afterward. Tests get the base URL via inject('baseUrl').
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealthy(url, child, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not become healthy within ${timeoutMs}ms (${url})`);
}

export default async function globalSetup({ provide }) {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn('node', ['server/index.js'], {
    cwd: repoRoot,
    env: { ...process.env, SERVER_PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Surface server output only if startup fails — otherwise stay quiet.
  let logs = '';
  child.stdout.on('data', (d) => (logs += d));
  child.stderr.on('data', (d) => (logs += d));

  try {
    await waitForHealthy(`${baseUrl}/api/health`, child);
  } catch (err) {
    child.kill();
    throw new Error(`${err.message}\n--- server output ---\n${logs}`);
  }

  provide('baseUrl', baseUrl);

  return () => {
    child.kill();
  };
}
