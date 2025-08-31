import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile, type ExecException } from 'node:child_process';

const TMP_ROOT = path.join(process.cwd(), '.tmp', 'cli');

function exec(
  cmd: string,
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd }, (error, stdout, stderr) => {
      const err = error as ExecException | null;
      const code = err
        ? typeof err.code === 'number'
          ? (err.code as number)
          : 1
        : 0;
      resolve({ stdout: String(stdout), stderr: String(stderr), code });
    });
  });
}

async function mkTempDir(prefix = 'gitdup-cli-'): Promise<string> {
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

describe('gitdup CLI', () => {
  beforeAll(async () => {
    // build via npm to trigger postbuild chmod step
    const res = await exec('npm', ['run', 'build']);
    if (res.code !== 0) throw new Error(`build failed: ${res.stderr}`);
  });

  afterAll(async () => {
    await fs.rm(TMP_ROOT, { recursive: true, force: true });
  });

  it('runs via shebang and duplicates project', async () => {
    const repo = await mkTempDir();
    await initRepo(repo);
    const dest = path.join(TMP_ROOT, 'cli-dup');
    await fs.rm(dest, { recursive: true, force: true });
    const cliPath = path.resolve('dist/cli.js');
    const { code } = await exec(cliPath, [dest], repo);
    expect(code).toBe(0);
    await expect(fs.stat(path.join(dest, '.git'))).resolves.toBeTruthy();
  });
});
