import type { SpaceMoltClient } from './api.ts';
import type { CommandParseError } from './args.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import type { GlobalOptions } from './types.ts';

export type CommandStatus = { type: 'exit'; exitCode: number };
export type PreparedPayload = CommandStatus | { type: 'payload'; payload: Record<string, unknown> };

export interface CommandError {
  code: string;
  message: string;
  customStderr?: string;
  errors?: CommandParseError[];
  exitCode?: number;
}

export type CommandParseResult<TPayload = unknown> =
  | { ok: true; payload: TPayload }
  | { ok: false; error: CommandError };

export interface CommandHandler<TPayload = unknown, TResult = unknown> {
  name: string;
  aliases?: string[];
  requiresNetwork: boolean;
  parse(argv: string[], options: GlobalOptions, context?: CliRuntimeContext): CommandParseResult<TPayload>;
  run(
    payload: TPayload,
    options: GlobalOptions,
    client?: SpaceMoltClient,
    context?: CliRuntimeContext,
  ): Promise<TResult> | TResult;
  render(
    runResult: TResult,
    options: GlobalOptions,
    client?: SpaceMoltClient,
    context?: CliRuntimeContext,
  ): Promise<number> | number;
}
