export type ResultFormatter = ((result: Record<string, unknown>, command?: string) => boolean) & {
  formatterName?: string;
  hintKeys?: string[];
  commands?: readonly string[];
  shapeFallback?: boolean;
};

export interface ResultFormatterOptions {
  commands?: readonly string[];
  shapeFallback?: boolean;
}

export function formatter(
  format: (result: Record<string, unknown>, command?: string) => boolean,
  options: ResultFormatterOptions = {},
): ResultFormatter {
  const resultFormatter = format as ResultFormatter;
  resultFormatter.commands = options.commands;
  resultFormatter.shapeFallback = options.shapeFallback ?? false;
  return resultFormatter;
}

export function namedFormatter(
  formatterName: string,
  hintKeys: string[],
  format: (result: Record<string, unknown>, command?: string) => boolean,
  options: ResultFormatterOptions = {},
): ResultFormatter {
  const resultFormatter = formatter(format, options);
  resultFormatter.formatterName = formatterName;
  resultFormatter.hintKeys = hintKeys;
  return resultFormatter;
}

export function formatterMatchesCommand(formatter: ResultFormatter, command: string): boolean {
  const commands = formatter.commands;
  if (!commands?.length) return false;
  const normalizedCommand = command.startsWith('v2_') ? command.slice(3) : command;
  return commands.includes(command) || commands.includes(normalizedCommand);
}

export function commandScopedFormatters(formatters: readonly ResultFormatter[], command: string): ResultFormatter[] {
  return formatters.filter((formatter) => formatterMatchesCommand(formatter, command));
}

export function shapeFallbackFormatters(formatters: readonly ResultFormatter[], command: string): ResultFormatter[] {
  return formatters.filter((formatter) => formatter.shapeFallback && !formatterMatchesCommand(formatter, command));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface FormatterFixture {
  command: string;
  fixture: Record<string, unknown>;
}
