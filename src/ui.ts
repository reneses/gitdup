/* Simple color and spinner utilities without external deps */
const COLOR = !process.env.NO_COLOR && process.stdout.isTTY;
const esc = (n: number) => `\u001B[${n}m`;
const paint = (open: number) => (s: string) => (COLOR ? esc(open) + s + esc(0) : s);
const bold = paint(1);
const dim = paint(2);
const underline = paint(4);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const blue = paint(34);
const magenta = paint(35);
const cyan = paint(36);

export const colors = { bold, dim, underline, red, green, yellow, blue, magenta, cyan };
export const indent = '  ';

export function linkifyPath(absPath: string): string {
  const fileUrl = `file://${absPath}`;
  // Show both absolute path (often clickable) and file:// URL
  return `${underline(absPath)} ${dim(`(${fileUrl})`)}`;
}

export type Spinner = {
  start(text: string): void;
  text(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  stop(): void;
};

export function createSpinner(enabled = process.stdout.isTTY, prefix = ''): Spinner {
  if (!enabled) {
    // no-op spinner for non-TTY
    let current = '';
    return {
      start: (t: string) => {
        current = t;
        process.stdout.write(prefix + t + '\n');
      },
      text: (t: string) => {
        current = t;
        process.stdout.write(prefix + t + '\n');
      },
      succeed: (t?: string) => {
        process.stdout.write(prefix + (t || current) + '\n');
      },
      fail: (t?: string) => {
        process.stdout.write(prefix + (t || current) + '\n');
      },
      stop: () => void 0,
    };
  }

  const frames = ['⠋', '⠙', '⠸', '⠴', '⠦', '⠇'];
  let i = 0;
  let timer: NodeJS.Timeout | null = null;
  let current = '';
  let active = false;

  const clearLine = () => {
    process.stdout.write('\r\x1b[2K');
  };

  const render = () => {
    const frame = frames[i = (i + 1) % frames.length];
    clearLine();
    process.stdout.write(prefix + `${cyan(frame)} ${current}`);
  };

  const start = (text: string) => {
    current = text;
    if (active) return;
    active = true;
    try { process.stdout.write('\x1b[?25l'); } catch {}
    timer = setInterval(render, 80);
  };

  const text = (t: string) => {
    current = t;
  };

  const finalize = (symbol: string, color: (s: string) => string, textOut?: string) => {
    current = textOut || current;
    if (timer) clearInterval(timer);
    timer = null;
    active = false;
    clearLine();
    process.stdout.write(prefix + `${color(symbol)} ${current}\n`);
    try { process.stdout.write('\x1b[?25h'); } catch {}
  };

  const succeed = (t?: string) => finalize('✔', green, t);
  const fail = (t?: string) => finalize('✖', red, t);
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    active = false;
    try { process.stdout.write('\x1b[?25h'); } catch {}
    clearLine();
  };

  return { start, text, succeed, fail, stop };
}
