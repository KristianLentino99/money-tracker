import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { resolve } from 'node:path';

const FORMATTABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.json', '.css', '.scss']);
const BLOCKED_I18N_FRAGMENT = 'i18n/locales/';

const BLOCKED_BASH_PATTERNS = [
  /\brm\s+-rf\s+\//,
  /\brm\s+-rf\s+~/,
  /\bmkfs\./,
  /\bdd\s+if=/,
  />\s*\/dev\/sd/,
  /\bchmod\s+-R\s+777\s+\//,
  /\bcurl\b[^\n|]*\|\s*(?:sh|bash)\b/,
  /\bwget\b[^\n|]*\|\s*(?:sh|bash)\b/,
  /\beval\s+.*\$\(/,
  /\bgit\s+push\b[^\n]*--force[^\n]*(?:main|master)\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-fd\b/,
];

function getPath(input: Record<string, unknown>): string | undefined {
  const candidate = input.path ?? input.file_path;
  return typeof candidate === 'string' ? candidate : undefined;
}

function isBlockedLocaleRead(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName !== 'read') return false;
  const filePath = getPath(input);
  return Boolean(filePath?.includes(BLOCKED_I18N_FRAGMENT) && filePath.endsWith('.json'));
}

function shouldFormat(filePath: string): boolean {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return FORMATTABLE_EXTENSIONS.has(extension);
}

export default function (pi: ExtensionAPI) {
  let lastCheckedStatus: string | undefined;
  let knipRunning = false;

  pi.on('tool_call', async (event, ctx) => {
    if (isBlockedLocaleRead(event.toolName, event.input as Record<string, unknown>)) {
      return {
        block: true,
        reason:
          'Locale JSON reads are delegated to the i18n-editor project agent. Use that agent for translation work.',
      };
    }

    if (event.toolName !== 'bash') return;
    const command = (event.input as { command?: unknown }).command;
    if (typeof command !== 'string') return;

    for (const pattern of BLOCKED_BASH_PATTERNS) {
      if (pattern.test(command)) {
        return { block: true, reason: `Blocked dangerous command matching ${pattern}` };
      }
    }

    if (/\bgit\s+push\b/.test(command)) {
      if (!ctx.hasUI) return { block: true, reason: 'git push requires explicit user confirmation.' };
      const approved = await ctx.ui.confirm(
        'Confirm git push',
        'This project requires explicit confirmation immediately before pushing changes.',
      );
      if (!approved) return { block: true, reason: 'git push was not approved.' };
    }
  });

  pi.on('tool_result', async (event, ctx) => {
    if (event.toolName !== 'edit' && event.toolName !== 'write') return;
    const filePath = getPath(event.input as Record<string, unknown>);
    if (!filePath || !shouldFormat(filePath)) return;

    const absolutePath = resolve(ctx.cwd, filePath);
    await pi.exec('npx', ['oxfmt', '--write', absolutePath], {
      cwd: ctx.cwd,
      timeout: 120_000,
      signal: ctx.signal,
    });
  });

  pi.on('agent_settled', async (_event, ctx) => {
    if (process.env.PI_SUBAGENT === '1' || knipRunning) return;

    const status = await pi.exec('git', ['status', '--porcelain'], { cwd: ctx.cwd, timeout: 30_000 });
    if (status.code !== 0 || status.stdout === lastCheckedStatus) return;
    lastCheckedStatus = status.stdout;
    knipRunning = true;

    try {
      const result = await pi.exec('npm', ['run', 'knip'], { cwd: ctx.cwd, timeout: 120_000 });
      if (result.code !== 0 && ctx.hasUI) {
        ctx.ui.notify(`Knip found unused code:\n${result.stdout || result.stderr}`, 'warning');
      }
    } finally {
      knipRunning = false;
    }
  });
}
