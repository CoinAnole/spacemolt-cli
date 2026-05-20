export const rawColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export function colorize(text: string, code: string, plain = false): string {
  if (plain) return text;
  return code + text + rawColors.reset;
}

export function colorCodes(plain = false) {
  return {
    get reset() {
      return colorize('', rawColors.reset, plain);
    },
    get bright() {
      return colorize('', rawColors.bright, plain);
    },
    get dim() {
      return colorize('', rawColors.dim, plain);
    },
    get red() {
      return colorize('', rawColors.red, plain);
    },
    get green() {
      return colorize('', rawColors.green, plain);
    },
    get yellow() {
      return colorize('', rawColors.yellow, plain);
    },
    get blue() {
      return colorize('', rawColors.blue, plain);
    },
    get magenta() {
      return colorize('', rawColors.magenta, plain);
    },
    get cyan() {
      return colorize('', rawColors.cyan, plain);
    },
  };
}

export function hexColor(text: string, fg?: string, bg?: string, plain = false): string {
  if (!fg && !bg) return text;
  if (plain) return text;

  const hex = (value: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return null;
    return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
  };

  let prefix = '';
  if (fg) {
    const rgb = hex(fg);
    if (rgb) prefix += `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  }
  if (bg) {
    const rgb = hex(bg);
    if (rgb) prefix += `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  }

  return prefix ? `${prefix}${text}\x1b[0m` : text;
}

export function formatPlayer(p: Record<string, unknown>, colors = colorCodes(), plain = false): string {
  const rawName = p.anonymous ? '[Anonymous]' : String(p.username || 'Unknown');
  const name = hexColor(rawName, p.primary_color as string | undefined, p.secondary_color as string | undefined, plain);
  const faction = p.faction_tag ? ` [${p.faction_tag}]` : '';
  const status = p.status_message ? ` - "${p.status_message}"` : '';
  const combat = p.in_combat ? ` ${colors.red}[IN COMBAT]${colors.reset}` : '';
  const ship = p.ship_class ? ` (${p.ship_class})` : '';
  return `${name}${faction}${ship}${status}${combat}`;
}
