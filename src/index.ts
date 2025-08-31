import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function getGreeting(): string {
  return 'hello world';
}

export type GitDupProgressEvent =
  | { type: 'copy:start'; source: string; dest: string }
  | { type: 'copy:done'; dest: string }
  | { type: 'copy:skip-node_modules'; source: string }
  | { type: 'git:reset:start'; dest: string }
  | { type: 'git:reset:done'; dest: string }
  | { type: 'git:clean:start'; dest: string }
  | { type: 'git:clean:done'; dest: string }
  | { type: 'git:branch:start'; dest: string; branch: string }
  | { type: 'git:branch:done'; dest: string; branch: string }
  | { type: 'git:pr:start'; dest: string; pr: number; remote: string }
  | { type: 'git:pr:done'; dest: string; pr: number; remote: string }
  | { type: 'node:install:start'; dest: string; manager: string }
  | { type: 'node:install:done'; dest: string; manager: string }
  | { type: 'node:install:skip'; dest: string; reason: string }
  | { type: 'done'; dest: string };

export interface GitDupOptions {
  dest?: string;
  branch?: string;
  pr?: number;
  remote?: string;
  clean?: boolean;
  verbose?: boolean;
  onProgress?: (evt: GitDupProgressEvent) => void;
  install?: boolean; // For Node projects: run package manager install after copy
}

export interface GitDupResult {
  source: string;
  dest: string;
  checkedOut?: string;
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  verbose = false
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let out = '';
    let err = '';
    if (!verbose) {
      child.stdout?.on('data', (b) => (out += b.toString()));
      child.stderr?.on('data', (b) => (err += b.toString()));
    }
    child.on('close', (code) => {
      if (code === 0) return resolve();
      const message = `Command failed: ${cmd} ${args.join(' ')}\n${err || out}`;
      reject(new Error(message));
    });
  });
}

function runCapture(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let out = '';
    let err = '';
    child.stdout?.on('data', (b) => (out += b.toString()));
    child.stderr?.on('data', (b) => (err += b.toString()));
    child.on('close', (code) => {
      if (code === 0) return resolve(out);
      reject(new Error(err || out));
    });
  });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function isSubPath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function ensureGitRepo(dir: string): Promise<void> {
  const gitDir = path.join(dir, '.git');
  if (!(await pathExists(gitDir))) {
    throw new Error(`Not a git repository: ${dir}`);
  }
}

async function isNodeProject(dir: string): Promise<boolean> {
  return pathExists(path.join(dir, 'package.json'));
}

function pathHasNodeModules(p: string): boolean {
  const parts = p.split(path.sep);
  return parts.includes('node_modules');
}

async function detectPackageManager(
  dir: string
): Promise<{ cmd: string; args: string[] } | null> {
  // Prefer explicit packageManager field
  try {
    const pkgRaw = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw) as { packageManager?: string };
    if (pkg.packageManager) {
      const name = pkg.packageManager.split('@')[0];
      const candidate = await pmCommandFor(name, dir);
      if (candidate) return candidate;
    }
  } catch (_e) {
    void 0; // ignore JSON or read errors
  }

  // Detect by lockfiles
  const candidates: Array<{ check: string; pm: string }> = [
    { check: 'bun.lockb', pm: 'bun' },
    { check: 'pnpm-lock.yaml', pm: 'pnpm' },
    { check: 'yarn.lock', pm: 'yarn' },
    { check: 'package-lock.json', pm: 'npm' },
  ];
  for (const c of candidates) {
    if (await pathExists(path.join(dir, c.check))) {
      const cand = await pmCommandFor(c.pm, dir);
      if (cand) return cand;
    }
  }
  // Fallback to npm if available
  const npm = await pmCommandFor('npm', dir);
  return npm;
}

async function pmCommandFor(
  pm: string,
  dir: string
): Promise<{ cmd: string; args: string[] } | null> {
  const has = async (cmd: string): Promise<boolean> => {
    try {
      await runCapture(cmd, ['--version'], dir);
      return true;
    } catch {
      return false;
    }
  };
  switch (pm) {
    case 'bun':
      if (await has('bun')) return { cmd: 'bun', args: ['install'] };
      return null;
    case 'pnpm':
      if (await has('pnpm')) {
        const frozen = await pathExists(path.join(dir, 'pnpm-lock.yaml'));
        return {
          cmd: 'pnpm',
          args: ['install', ...(frozen ? ['--frozen-lockfile'] : [])],
        };
      }
      return null;
    case 'yarn':
      if (await has('yarn')) {
        // Avoid --immutable for compatibility across Yarn versions
        return { cmd: 'yarn', args: ['install'] };
      }
      return null;
    case 'npm':
    default:
      if (await has('npm')) {
        const useCi = await pathExists(path.join(dir, 'package-lock.json'));
        return { cmd: 'npm', args: [useCi ? 'ci' : 'install'] };
      }
      return null;
  }
}

async function defaultDest(cwd: string): Promise<string> {
  const parent = path.dirname(cwd);
  const base = path.basename(cwd);
  let candidate = path.join(parent, `${base}-dup`);
  if (!(await pathExists(candidate))) return candidate;
  let i = 1;
  while (i < 1000) {
    candidate = path.join(parent, `${base}-dup-${i}`);
    // eslint-disable-next-line no-await-in-loop
    if (!(await pathExists(candidate))) return candidate;
    i += 1;
  }
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  return path.join(parent, `${base}-dup-${stamp}`);
}

export async function gitdup(
  options: GitDupOptions = {}
): Promise<GitDupResult> {
  const cwd = process.cwd();
  await ensureGitRepo(cwd);

  const dest = path.resolve(options.dest || (await defaultDest(cwd)));

  // Safety checks
  if (dest === cwd) {
    throw new Error('Destination is the same as the current directory.');
  }
  if (isSubPath(cwd, dest)) {
    throw new Error('Destination must not be inside the current directory.');
  }

  // Destination rules: must not exist or must be an empty directory
  if (await pathExists(dest)) {
    const st = await fs.lstat(dest);
    if (!st.isDirectory()) {
      throw new Error(`Destination exists and is not a directory: ${dest}`);
    }
    const entries = await fs.readdir(dest);
    if (entries.length > 0) {
      throw new Error(`Destination directory must be empty: ${dest}`);
    }
  } else {
    await fs.mkdir(dest, { recursive: true });
  }

  const isNode = await isNodeProject(cwd);
  if (isNode) {
    options.onProgress?.({ type: 'copy:skip-node_modules', source: cwd });
  }
  options.onProgress?.({ type: 'copy:start', source: cwd, dest });
  // Use fs.cp (Node 18) to copy the tree; skip node_modules for Node projects
  await fs.cp(cwd, dest, {
    recursive: true,
    force: false,
    filter: (src: string, _dest: string) => {
      const rel = path.relative(cwd, src);
      // Always skip the ephemeral git index file; git will recreate it
      if (rel === path.join('.git', 'index')) return false;
      // For Node projects, skip any path inside node_modules
      if (isNode) {
        return !pathHasNodeModules(src);
      }
      return true;
    },
  });
  options.onProgress?.({ type: 'copy:done', dest });

  // Reset tracked changes only (keeps untracked like .env)
  options.onProgress?.({ type: 'git:reset:start', dest });
  await run('git', ['reset', '--hard'], dest, !!options.verbose);
  options.onProgress?.({ type: 'git:reset:done', dest });
  if (options.clean) {
    options.onProgress?.({ type: 'git:clean:start', dest });
    // Remove untracked files, but keep ignored files (e.g. .env) by not using -x
    await run('git', ['clean', '-fd'], dest, !!options.verbose);
    options.onProgress?.({ type: 'git:clean:done', dest });
  }

  let checkedOut: string | undefined;
  if (options.branch) {
    options.onProgress?.({
      type: 'git:branch:start',
      dest,
      branch: options.branch,
    });
    // Fetch only if remotes exist; skip otherwise (local-only repo)
    try {
      const remotes = (await runCapture('git', ['remote'], dest))
        .trim()
        .split('\n')
        .filter(Boolean);
      if (remotes.length > 0) {
        await run(
          'git',
          ['fetch', '--all', '--prune'],
          dest,
          !!options.verbose
        );
      }
    } catch (_e) {
      void 0; // ignore fetch if 'git remote' fails
    }
    await run('git', ['checkout', options.branch], dest, !!options.verbose);
    options.onProgress?.({
      type: 'git:branch:done',
      dest,
      branch: options.branch,
    });
    checkedOut = options.branch;
  } else if (typeof options.pr === 'number') {
    const remote = options.remote || 'origin';
    const localRef = `pr-${options.pr}`;
    options.onProgress?.({
      type: 'git:pr:start',
      dest,
      pr: options.pr,
      remote,
    });
    // GitHub-style PR refspec
    await run(
      'git',
      ['fetch', remote, `pull/${options.pr}/head:${localRef}`],
      dest,
      !!options.verbose
    );
    await run('git', ['checkout', localRef], dest, !!options.verbose);
    options.onProgress?.({ type: 'git:pr:done', dest, pr: options.pr, remote });
    checkedOut = localRef;
  }

  // If Node project, optionally run install step inside the duplicate
  if (isNode) {
    if (options.install === false) {
      options.onProgress?.({
        type: 'node:install:skip',
        dest,
        reason: 'install disabled by option',
      });
    } else {
      const pm = await detectPackageManager(dest);
      if (!pm) {
        options.onProgress?.({
          type: 'node:install:skip',
          dest,
          reason: 'no package manager available',
        });
      } else {
        options.onProgress?.({
          type: 'node:install:start',
          dest,
          manager: pm.cmd,
        });
        await run(pm.cmd, pm.args, dest, !!options.verbose);
        options.onProgress?.({
          type: 'node:install:done',
          dest,
          manager: pm.cmd,
        });
      }
    }
  }

  options.onProgress?.({ type: 'done', dest });
  return { source: cwd, dest, checkedOut };
}
