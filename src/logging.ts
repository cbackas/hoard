// Importing this module prefixes each console level with a coloured tag so levels are
// distinguishable. Colours are skipped when Bun detects no colour support (piped output, NO_COLOR).

const LEVEL_COLORS = {
  trace: "\x1b[38;5;117m", // light blue
  debug: "\x1b[38;5;37m", // teal
  info: "\x1b[38;5;33m", // blue
  warn: "\x1b[38;5;214m", // orange
  error: "\x1b[38;5;196m", // red
} as const;
const HTTP_COLOR = "\x1b[38;5;78m"; // green
const RESET = "\x1b[0m";

// Captured before the levels are wrapped below, so HTTP lines don't also get an [INFO] tag.
const writeHttp = console.info.bind(console);

function tag(label: string, color: string): string {
  const padded = `[${label.toUpperCase()}]`.padEnd(7);
  return Bun.enableANSIColors ? `${color}${padded}${RESET}` : padded;
}

for (const [level, color] of Object.entries(LEVEL_COLORS) as [keyof typeof LEVEL_COLORS, string][]) {
  const write = console[level].bind(console);
  console[level] = (...args: unknown[]) => write(tag(level, color), ...args);
}

/** Logs an HTTP request line with an [HTTP] tag. */
export function logHttp(...args: unknown[]) {
  writeHttp(tag("http", HTTP_COLOR), ...args);
}
