import type { SpaceMoltClient } from './api.ts';
import { parseArgs } from './args.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import type { CommandHandler, CommandParseResult } from './command-types.ts';
import { preparePayload, validationErrorFromParseErrors } from './payload.ts';
import { type CommandRunResult, renderResponse, runCommand } from './response-renderer.ts';
import { getRuntimeConfig } from './runtime-config.ts';
import { getSessionPath } from './session.ts';
import type { GlobalOptions } from './types.ts';

export class ApiCommandHandler implements CommandHandler<Record<string, unknown>, CommandRunResult> {
  constructor(
    public name: string,
    private registry: Pick<CommandRegistrySnapshot, 'commands'> = BUNDLED_COMMAND_REGISTRY,
  ) {}
  requiresNetwork = true;

  parse(
    argv: string[],
    options: GlobalOptions,
    context?: CliRuntimeContext,
  ): CommandParseResult<Record<string, unknown>> {
    const parsedArgs = parseArgs(argv, { allowUnknown: options.allowUnknown, registry: this.registry });
    if (!parsedArgs.ok) {
      return { ok: false, error: validationErrorFromParseErrors(parsedArgs.errors) };
    }

    const config = context?.config ?? getRuntimeConfig(options, context?.env);
    const sessionPath = getSessionPath(config);

    const prepared = preparePayload(
      this.name,
      parsedArgs.payload,
      options,
      sessionPath,
      context?.writer,
      this.registry,
    );
    if (prepared.type === 'exit') {
      return {
        ok: false,
        error: {
          code: 'exit',
          message: '',
          exitCode: prepared.exitCode,
        },
      };
    }

    return { ok: true, payload: prepared.payload };
  }

  async run(payload: Record<string, unknown>, options: GlobalOptions, client?: SpaceMoltClient) {
    return runCommand(this.name, payload, options, client, this.registry.commands[this.name]);
  }

  async render(
    runResult: CommandRunResult,
    options: GlobalOptions,
    client?: SpaceMoltClient,
    context?: CliRuntimeContext,
  ) {
    return renderResponse(runResult, options, client, context);
  }
}

export function hasApiCommand(
  commandName: string | undefined,
  registry: Pick<CommandRegistrySnapshot, 'commands'> = BUNDLED_COMMAND_REGISTRY,
): commandName is string {
  return Boolean(commandName && registry.commands[commandName]);
}
