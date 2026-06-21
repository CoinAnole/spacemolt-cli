import type { SpaceMoltClient } from './api.ts';
import { parseArgs } from './args.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import type { CommandGroupAction } from './command-groups.ts';
import type { CommandHandler, CommandParseResult } from './command-types.ts';
import { preparePayload, validationErrorFromParseErrors } from './payload.ts';
import { type CommandRunResult, renderResponse, runCommand } from './response-renderer.ts';
import { getRuntimeConfig } from './runtime-config.ts';
import { tryGetSessionPath } from './session.ts';
import type { GlobalOptions } from './types.ts';

export class GroupedApiCommandHandler implements CommandHandler<Record<string, unknown>, CommandRunResult> {
  public name: string;
  public requiresNetwork = true;

  constructor(
    group: string,
    actionName: string,
    private action: CommandGroupAction,
  ) {
    this.name = `${group} ${actionName}`;
  }

  parse(
    argv: string[],
    options: GlobalOptions,
    context?: CliRuntimeContext,
  ): CommandParseResult<Record<string, unknown>> {
    const flatArgv = [this.action.command, ...argv.slice(2)];
    const actionRegistry = { commands: { [this.action.command]: this.action.config } };

    if (flatArgv.length === 2 && (flatArgv[1] === 'help' || flatArgv[1] === '--help' || flatArgv[1] === '-h')) {
      const prepared = preparePayload(
        this.action.command,
        { help: 'true' },
        options,
        undefined,
        context?.writer,
        actionRegistry,
      );
      return {
        ok: false,
        error: {
          code: 'exit',
          message: '',
          exitCode: prepared.type === 'exit' ? prepared.exitCode : 0,
        },
      };
    }

    const parsedArgs = parseArgs(flatArgv, { allowUnknown: options.allowUnknown, registry: actionRegistry });
    if (!parsedArgs.ok) return { ok: false, error: validationErrorFromParseErrors(parsedArgs.errors) };

    const config = context?.config ?? getRuntimeConfig(options, context?.env);
    const sessionPath = tryGetSessionPath(config, context?.env);
    const prepared = preparePayload(
      this.action.command,
      parsedArgs.payload,
      options,
      sessionPath,
      context?.writer,
      actionRegistry,
    );
    if (prepared.type === 'exit') {
      return { ok: false, error: { code: 'exit', message: '', exitCode: prepared.exitCode } };
    }
    return { ok: true, payload: prepared.payload };
  }

  async run(payload: Record<string, unknown>, options: GlobalOptions, client?: SpaceMoltClient) {
    const result = await runCommand(this.action.command, payload, options, client, this.action.config);
    return { ...result, displayCommand: this.name };
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
