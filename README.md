# gitdup

Duplicate your current project directory, reset tracked git changes, and optionally checkout a branch or PR — while keeping local config like `.env`.

Great for spinning up parallel workspaces for coding agents such as Codex CLI, so they can branch off a clean copy without losing environment files.

## Install

Install globally from npm:

```bash
npm i -g gitdup
```

Or from source (if working locally):

```bash
# inside the repo
npm i -g .
# or
npm link
```

## Usage

```bash
# Duplicate to a sibling folder (<cwd>-dup or -dup-N)
gitdup

# Specify destination (must not exist or must be empty)
gitdup ../my-project-dup

# Checkout a branch in the duplicate
gitdup -b feature/some-branch

# Fetch and checkout a GitHub PR (default remote: origin)
gitdup -p 123
gitdup -p 123 -r upstream

# Also remove untracked files (keeps ignored like .env)
gitdup --clean

# Verbose git output
gitdup -v

# Node projects: skip copying node_modules and auto-install deps
gitdup

# Disable install step if desired
gitdup --no-install
```

Behavior:

- Copies the entire directory (including `.git` and dotfiles) to preserve local config like `.env`.
- Resets tracked changes with `git reset --hard`. Untracked files are preserved unless `--clean` is passed.
- PR checkout uses GitHub-style refspecs (`pull/<n>/head`).
- If a destination is provided, it must not exist or must be an empty directory.
- Node optimization: If a `package.json` is present, `node_modules` folders are not copied. After copying, it auto-detects your package manager (npm, pnpm, yarn, bun) and runs install in the duplicate. Use `--no-install` to skip.

Requirements:

- Node.js >= 18
- Git installed and available on PATH
- Optional: npm/pnpm/yarn/bun installed if you want auto-install for Node projects

## Development

Setup:

```bash
npm install
```

Build TypeScript → `dist/`:

```bash
npm run build
```

Run the CLI (built):

```bash
npm start
# or
node dist/cli.js
```

Link globally for testing:

```bash
npm link
gitdup
```

Scripts:

- `build`: Compile TypeScript to `dist/`.
- `build:watch`: Rebuild on changes.
- `start`: Run the built CLI.
- `test`: Run unit tests once (no watch).
- `test:watch`: Run unit tests in watch mode.
- `lint`: Lint with ESLint (auto-fix).
- `lint:check`: Lint without fixing.
- `format`: Auto-format with Prettier.
- `check`: Run Prettier check + ESLint (used on pre-push/publish).
- Pre-push: Husky runs `npm run check` and `npm test` before pushing.

Linting notes:

- Unused imports are auto-removed via `eslint-plugin-unused-imports` when running with `--fix` (used in `npm run lint`).
- For intentionally unused variables or parameters, prefix them with `_` (config ignores `^_`).

Publishing (manual):

```bash
# build runs via the prepare script during publish
npm publish
```

Project structure:

- `src/cli.ts`: CLI entry (compiled to `dist/cli.js`).
- `src/index.ts`: Implementation (copy + git operations).
- `dist/`: Compiled JS and type declarations.
- `test/`: Vitest unit tests.
- `tsconfig.json`: TS compiler config.
- `.eslintrc.cjs`: ESLint config.
- `.prettierrc.json`: Prettier config.
