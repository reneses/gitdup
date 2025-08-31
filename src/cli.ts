#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { gitdup, type GitDupProgressEvent } from './index';
import { createSpinner, colors, linkifyPath, indent } from './ui';

const program = new Command();

program
  .name('gitdup')
  .description(
    'Duplicate the current project directory, reset git changes, and optionally checkout a PR/branch.'
  )
  .argument(
    '[dest]',
    'Destination directory (must not exist or be empty). Defaults to <cwd>-dup or -dup-N'
  )
  .option('-b, --branch <name>', 'Branch name to checkout in the duplicate')
  .option(
    '-p, --pr <number>',
    'PR number to fetch and checkout (GitHub remotes)',
    (v) => Number(v)
  )
  .option(
    '-r, --remote <name>',
    'Remote to use for PR fetch (default: origin)',
    'origin'
  )
  .option(
    '--clean',
    'Also remove untracked files (keeps ignored like .env)',
    false
  )
  .option('-v, --verbose', 'Verbose output for git operations', false)
  .option('--no-install', 'Skip package manager install in Node projects')
  .action(
    async (
      destArg: string | undefined,
      opts: {
        branch?: string;
        pr?: number;
        remote: string;
        clean: boolean;
        verbose: boolean;
        install?: boolean;
      }
    ) => {
      const verbose = !!opts.verbose;
      const spinner = createSpinner(!verbose, indent);
      try {
        const source = process.cwd();
        const destAbs = destArg ? path.resolve(destArg) : undefined;
        const isNode = await fs
          .stat(path.join(source, 'package.json'))
          .then(() => true)
          .catch(() => false);
        const willInstall = isNode && opts.install !== false;

        // Header
        // eslint-disable-next-line no-console
        console.log(
          `${colors.magenta(colors.bold('gitdup'))} ${colors.dim('— duplicate a repo for branching work')}`
        );
        // eslint-disable-next-line no-console
        console.log(
          `${indent}${colors.cyan('source:')} ${linkifyPath(source)}`
        );
        if (destAbs) {
          // eslint-disable-next-line no-console
          console.log(
            `${indent}${colors.cyan('target:')} ${linkifyPath(destAbs)}`
          );
        }

        let currentStep = 'Starting';
        const totalSteps =
          2 +
          (opts.clean ? 1 : 0) +
          (opts.branch || typeof opts.pr === 'number' ? 1 : 0) +
          (willInstall ? 1 : 0);
        const stepLabel = (n: number) => colors.dim(`step ${n}/${totalSteps}`);
        const updateFrom = (evt: GitDupProgressEvent) => {
          switch (evt.type) {
            case 'copy:start':
              currentStep = `Copying project → ${evt.dest}`;
              spinner.start(`${stepLabel(1)} ${currentStep}`);
              break;
            case 'copy:done':
              spinner.text(`${stepLabel(1)} Copied → ${evt.dest}`);
              break;
            case 'copy:skip-node_modules':
              // just informational; keep current step
              break;
            case 'git:reset:start':
              spinner.text(`${stepLabel(2)} Resetting tracked changes`);
              break;
            case 'git:reset:done':
              spinner.text(`${stepLabel(2)} Reset complete`);
              break;
            case 'git:clean:start':
              spinner.text(`${stepLabel(3)} Cleaning untracked files`);
              break;
            case 'git:clean:done':
              spinner.text(`${stepLabel(3)} Clean complete`);
              break;
            case 'git:branch:start':
              spinner.text(
                `${stepLabel(totalSteps)} Checkout branch ${colors.bold(evt.branch)}`
              );
              break;
            case 'git:branch:done':
              spinner.text(
                `${stepLabel(totalSteps)} Checked out ${colors.bold(evt.branch)}`
              );
              break;
            case 'git:pr:start':
              spinner.text(
                `${stepLabel(totalSteps)} Fetch + checkout PR ${colors.bold(String(evt.pr))} from ${evt.remote}`
              );
              break;
            case 'git:pr:done':
              spinner.text(
                `${stepLabel(totalSteps)} Checked out PR ${colors.bold(String(evt.pr))}`
              );
              break;
            case 'node:install:start':
              spinner.text(
                `${stepLabel(totalSteps)} Installing dependencies (${colors.bold(evt.manager)})`
              );
              break;
            case 'node:install:done':
              spinner.text(
                `${stepLabel(totalSteps)} Install complete (${colors.bold(evt.manager)})`
              );
              break;
            case 'node:install:skip':
              // Informative, but don't change step label
              break;
            case 'done':
              spinner.succeed(
                `${colors.green('Done')} ${colors.dim('— duplicate ready')}`
              );
              break;
          }
        };

        const res = await gitdup({
          dest: destArg,
          branch: opts.branch,
          pr:
            typeof opts.pr === 'number' && !Number.isNaN(opts.pr)
              ? opts.pr
              : undefined,
          remote: opts.remote,
          clean: !!opts.clean,
          verbose,
          install: opts.install,
          onProgress: updateFrom,
        });

        const summary: string[] = [];
        summary.push(
          `${indent}${colors.green('duplicated:')} ${linkifyPath(res.dest)}`
        );
        if (res.checkedOut)
          summary.push(
            `${indent}${colors.green('checked out:')} ${colors.bold(res.checkedOut)}`
          );
        // eslint-disable-next-line no-console
        console.log(summary.join('\n'));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          spinner.fail(colors.red('Failed'));
        } catch (_e) {
          void 0; // no-op
        }
        // eslint-disable-next-line no-console
        console.error(indent + colors.red('Error: ') + message);
        process.exitCode = 1;
      }
    }
  );

program.parseAsync(process.argv);
