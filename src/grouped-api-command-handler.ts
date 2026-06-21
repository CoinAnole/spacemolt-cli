import type { SpaceMoltClient } from './api.ts';
import { parseArgs, validateRequiredArgs } from './args.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import type { CommandGroupAction } from './command-groups.ts';
import type { CommandConfig } from './commands.ts';
import type { CommandHandler, CommandParseResult } from './command-types.ts';
import { displayMissingArgument, showCommandHelp } from './help.ts';
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

  private displayConfig() {
    return {
      ...this.action.config,
      example: this.action.config.example?.replace(`spacemolt ${this.action.command}`, `spacemolt ${this.name}`),
    };
  }

  private displayRegistry() {
    return { [this.name]: this.displayConfig() };
  }

  private derivedRequiredArgs(): string[] {
    if (this.action.config.required && this.action.config.required.length > 0) {
      return this.action.config.required;
    }
    const requiredPlaceholders = Array.from(this.action.config.usage?.matchAll(/<([^>]+)>/g) ?? []);
    return requiredPlaceholders.map((match, index) => {
      const arg = this.action.config.args?.[index];
      return typeof arg === 'string' ? arg : typeof arg?.rest === 'string' ? arg.rest : (match[1] as string);
    });
  }

  private validationRegistry(): { commands: Record<string, CommandConfig> } {
    return {
      commands: {
        [this.action.command]: {
          ...this.action.config,
          required: this.derivedRequiredArgs(),
        },
      },
    };
  }

  parse(
    argv: string[],
    options: GlobalOptions,
    context?: CliRuntimeContext,
  ): CommandParseResult<Record<string, unknown>> {
    const flatArgv = [this.action.command, ...argv.slice(2)];
    const actionRegistry = { commands: { [this.action.command]: this.action.config } };
    const validationRegistry = this.validationRegistry();

    if (flatArgv.length === 2 && (flatArgv[1] === 'help' || flatArgv[1] === '--help' || flatArgv[1] === '-h')) {
      showCommandHelp(this.name, context?.writer, this.displayRegistry(), { plain: options.plain });
      return {
        ok: false,
        error: {
          code: 'exit',
          message: '',
          exitCode: 0,
        },
      };
    }

    const parsedArgs = parseArgs(flatArgv, { allowUnknown: options.allowUnknown, registry: actionRegistry });
    if (!parsedArgs.ok) return { ok: false, error: validationErrorFromParseErrors(parsedArgs.errors) };

    const missingArg = validateRequiredArgs(this.action.command, parsedArgs.payload, validationRegistry);
    if (missingArg) {
      displayMissingArgument(this.name, missingArg, context?.writer, this.displayRegistry(), options);
      return {
        ok: false,
        error: {
          code: 'missing_required_argument',
          message: `Missing required argument: ${missingArg}`,
        },
      };
    }

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
