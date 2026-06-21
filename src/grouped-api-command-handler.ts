import type { SpaceMoltClient } from './api.ts';
import { type CommandParseError, parseArgs, validateRequiredArgs } from './args.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import { groupedCommandParts, groupActionDisplayName, type CommandGroupAction } from './command-groups.ts';
import type { CommandConfig } from './commands.ts';
import type { CommandHandler, CommandParseResult } from './command-types.ts';
import { displayMissingArgument, showCommandHelp } from './help.ts';
import { preparePayload, validationErrorFromParseErrors } from './payload.ts';
import { hasOutputSearch } from './output-search.ts';
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

  private translateRelatedCommand(command: string): string {
    const parts = groupedCommandParts(command);
    return parts ? groupActionDisplayName(parts.group, parts.action) : command;
  }

  private displayConfig() {
    return {
      ...this.action.config,
      example: this.action.config.example?.replace(`spacemolt ${this.action.command}`, `spacemolt ${this.name}`),
      discoverWith: this.action.config.discoverWith?.map((command) => this.translateRelatedCommand(command)),
      seeAlso: this.action.config.seeAlso?.map((command) => this.translateRelatedCommand(command)),
    };
  }

  private displayRegistry() {
    return { [this.name]: this.displayConfig() };
  }

  private validationRegistry(): { commands: Record<string, CommandConfig> } {
    return {
      commands: {
        [this.action.command]: this.action.config,
      },
    };
  }

  private translateParseErrors(errors: CommandParseError[]): CommandParseError[] {
    return errors.map((error) => ({
      ...error,
      message: error.message.replaceAll(this.action.command, this.name),
    }));
  }

  private humanDryRunOptions(options: GlobalOptions): boolean {
    const format = options.format ?? 'table';
    return (format === 'table' || format === 'text') &&
      !options.compact &&
      !options.json &&
      !options.structured &&
      !options.jq &&
      options.keys === undefined &&
      !options.field &&
      !(options.fields && options.fields.length > 0) &&
      !hasOutputSearch(options);
  }

  private rewriteDryRunResult(result: string | undefined): string | undefined {
    if (!result) return result;
    return result.replace(`Dry run: ${this.action.command}`, `Dry run: ${this.name}`);
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
    if (!parsedArgs.ok) {
      return { ok: false, error: validationErrorFromParseErrors(this.translateParseErrors(parsedArgs.errors)) };
    }

    const missingArg = validateRequiredArgs(this.action.command, parsedArgs.payload, validationRegistry);
    if (missingArg) {
      if (options.json) {
        return {
          ok: false,
          error: {
            code: 'missing_required_argument',
            message: `Missing required argument: ${missingArg}`,
            exitCode: 1,
          },
        };
      }

      displayMissingArgument(this.name, missingArg, context?.writer, this.displayRegistry(), options);
      return {
        ok: false,
        error: {
          code: 'exit',
          message: '',
          exitCode: 1,
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
    if (options.dryRun && this.humanDryRunOptions(options)) {
      return renderResponse(
        {
          ...runResult,
          response: {
            ...runResult.response,
            structuredContent: undefined,
            result:
              typeof runResult.response.result === 'string'
                ? this.rewriteDryRunResult(runResult.response.result)
                : runResult.response.result,
          },
        },
        options,
        client,
        context,
      );
    }
    return renderResponse(runResult, options, client, context);
  }
}
