import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { gitdup } from '../src/index';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const TMP_ROOT = path.join(process.cwd(), '.tmp', 'node');

function exec(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }>{
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd }, (error, stdout, stderr) => {
      resolve({ stdout: String(stdout), stderr: String(stderr), code: error ? ((error as any).code ?? 1) : 0 });
    });
  });
}

async function mkTempDir(prefix = 'gitdup-node-'): Promise<string> {
  await fs.mkdir(TMP_ROOT, { recursive: true });
  return await fs.mkdtemp(path.join(TMP_ROOT, prefix));
}

async function initRepo(dir: string): Promise<void> {
  const run = async (args: string[]) => {
    const { code, stderr } = await exec('git', args, dir);
    if (code !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
  };
  await run(['init']);
  await run(['config', 'user.email', 'test@example.com']);
  await run(['config', 'user.name', 'Test User']);
  await fs.writeFile(path.join(dir, 'README.md'), '# Test\n');
  await run(['add', 'README.md']);
  await run(['commit', '-m', 'chore: initial commit']);
}

describe('Node optimization', () => {
  afterAll(async () => {
    await fs.rm(TMP_ROOT, { recursive: true, force: true });
  });

  it('skips copying node_modules and can skip install when requested', async () => {
    const repo = await mkTempDir();
    await initRepo(repo);
    // Create a minimal package.json and a fake node_modules content
    await fs.writeFile(
      path.join(repo, 'package.json'),
      JSON.stringify({ name: 'tmp', version: '1.0.0' }, null, 2)
    );
    await fs.mkdir(path.join(repo, 'node_modules', '.bin'), { recursive: true });
    await fs.writeFile(path.join(repo, 'node_modules', 'leftpad.txt'), 'x');

    const prev = process.cwd();
    try {
      process.chdir(repo);
      const dest = path.join(TMP_ROOT, 'node-dup');
      await fs.rm(dest, { recursive: true, force: true });
      const res = await gitdup({ dest, install: false });
      expect(res.dest).toBe(dest);
      // node_modules should not be copied
      await expect(fs.stat(path.join(dest, 'node_modules'))).rejects.toBeTruthy();
      // package.json should be present
      await expect(fs.stat(path.join(dest, 'package.json'))).resolves.toBeTruthy();
    } finally {
      process.chdir(prev);
    }
  });
});
