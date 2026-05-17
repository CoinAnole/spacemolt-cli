#!/usr/bin/env bun
import { execute } from './api.ts';
import { convertPayloadTypes, normalizeParsedPayload, parseArgs, validateRequiredArgs } from './args.ts';
import { COMMANDS } from './commands.ts';
import { generateCompletion } from './completion.ts';
import { displayResult } from './display/index.ts';
import {
  displayError,
  displayMissingArgument,
  displayUnknownCommand,
  parseCommandSearchQuery,
  parseGlobalOptions,
  printJsonError,
  printJsonResponse,
  showCommandExplanation,
  showCommandGroup,
  showCommandGroups,
  showCommandHelp,
  showCommandSearch,
  showHelp,
} from './help.ts';
import { displayNotifications } from './notifications.ts';
import { getObjectResult, getStructuredResult, isRecord } from './response.ts';
import { API_BASE, c, DEBUG, VERSION } from './runtime.ts';
import { getSession, loadSession, saveSession, showProfiles } from './session.ts';
import { checkForUpdates } from './update.ts';

export async function main(): Promise<void> {
  const options = parseGlobalOptions(process.argv.slice(2));
  const args = options.args;

  // Check for updates in the background (non-blocking) - skip in quiet mode
  if (!options.json && !options.quiet) checkForUpdates();

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  if (args[0] === 'profile') {
    const action = args[1] || 'list';
    if (action === 'list') {
      showProfiles();
      process.exit(0);
    }
    if (options.json) {
      printJsonError('unknown_command', `Unknown profile command: ${action}`);
      process.exit(1);
    }
    console.error(`${c.red}Error:${c.reset} Unknown profile command "${action}"`);
    console.error('Usage: spacemolt profile list');
    process.exit(1);
  }

  if (args[0] === 'commands') {
    showCommandSearch(parseCommandSearchQuery(args.slice(1)));
    process.exit(0);
  }

  if (args[0] === 'explain') {
    const explainCommand = args[1];
    if (!explainCommand) {
      console.error(`${c.red}Error:${c.reset} Missing command name.`);
      console.error(`Usage: spacemolt explain <command>`);
      process.exit(1);
    }
    if (!showCommandExplanation(explainCommand)) {
      if (options.json) {
        printJsonError('unknown_command', `Unknown command: ${explainCommand}`);
        process.exit(1);
      }
      displayUnknownCommand(explainCommand);
      process.exit(1);
    }
    process.exit(0);
  }

  if (args[0] === 'completion') {
    const shell = args[1] || 'bash';
    if (!['bash', 'zsh', 'fish'].includes(shell)) {
      console.error(`${c.red}Error:${c.reset} Unsupported shell: ${shell}. Use bash, zsh, or fish.`);
      process.exit(1);
    }
    console.log(generateCompletion(shell));
    process.exit(0);
  }

  if (args[0] === 'help' && args[1] && showCommandGroup(args[1])) {
    process.exit(0);
  }

  if (args[0] === '--help' || args[0] === '-h') {
    const helpCommand = args[1];
    if (helpCommand) {
      if (showCommandHelp(helpCommand) || showCommandGroup(helpCommand)) {
        process.exit(0);
      }
      if (options.json) {
        printJsonError('unknown_command', `Unknown command: ${helpCommand}`);
        process.exit(1);
      }
      displayUnknownCommand(helpCommand);
      process.exit(1);
    }
    showHelp();
    showCommandGroups();
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-v') {
    console.log(`SpaceMolt Client v${VERSION}`);
    console.log(`API: ${API_BASE}`);
    process.exit(0);
  }

  const { command, payload, warnings } = parseArgs(args);

  if (!command) {
    showHelp();
    process.exit(0);
  }

  if (warnings.length > 0 && !options.quiet) {
    for (const w of warnings) console.error(`${c.yellow}Warning:${c.reset} ${w}`);
  }

  if (DEBUG) {
    console.log(`${c.dim}[DEBUG] Command: ${command}${c.reset}`);
    console.log(`${c.dim}[DEBUG] Payload: ${JSON.stringify(payload)}${c.reset}`);
    console.log(`${c.dim}[DEBUG] API: ${API_BASE}${c.reset}`);
  }

  try {
    if (!COMMANDS[command]) {
      if (options.json) {
        printJsonError('unknown_command', `Unknown command: ${command}`);
        process.exit(1);
      }
      displayUnknownCommand(command);
      process.exit(1);
    }

    if (payload.help === 'true' || payload.help === '1') {
      showCommandHelp(command);
      process.exit(0);
    }

    const missingArg = validateRequiredArgs(command, payload);
    if (missingArg) {
      if (options.json) {
        printJsonError('missing_required_argument', `Missing required argument: ${missingArg}`);
        process.exit(1);
      }
      displayMissingArgument(command, missingArg);
      process.exit(1);
    }

    // Save credentials on login/register
    if (command === 'login' && payload.username && payload.password) {
      const session = await getSession();
      session.username = payload.username;
      session.password = payload.password;
      await saveSession(session);
      if (DEBUG) console.log(`${c.dim}[DEBUG] Saved credentials to session${c.reset}`);
    }

    if (command === 'register' && payload.username) {
      const session = await getSession();
      session.username = payload.username;
      await saveSession(session);
    }

    const requestPayload = normalizeParsedPayload(command, payload);

    // Convert string payload to proper types (numbers, booleans)
    const typedPayload = Object.keys(requestPayload).length > 0 ? convertPayloadTypes(requestPayload, command) : {};
    const response = await execute(command, typedPayload);

    if (options.json && response.error) {
      printJsonResponse(response);
      process.exit(1);
    }

    if (!options.json && response.notifications?.length && !options.quiet) {
      console.log(`${c.dim}--- Notifications (${response.notifications.length}) ---${c.reset}`);
      displayNotifications(response.notifications);
      console.log('');
    }

    if (!options.json && response.error) {
      displayError(command, response.error);
      process.exit(1);
    }

    const structuredResult = getStructuredResult(response);
    const resultRecord = structuredResult || getObjectResult(response);

    if (command === 'register') {
      const password = typeof resultRecord?.password === 'string' ? resultRecord.password : undefined;
      const player = isRecord(resultRecord?.player) ? resultRecord.player : undefined;
      const playerId =
        typeof resultRecord?.player_id === 'string'
          ? resultRecord.player_id
          : typeof player?.id === 'string'
            ? player.id
            : response.session?.player_id;

      if (password) {
        const session = await loadSession();
        if (session) {
          session.password = password;
          if (playerId) session.player_id = playerId;
          await saveSession(session);
          if (DEBUG) console.log(`${c.dim}[DEBUG] Saved password to session${c.reset}`);
        }
      }
    }

    if (command === 'login') {
      const player = isRecord(resultRecord?.player) ? resultRecord.player : undefined;
      const playerId =
        typeof player?.id === 'string'
          ? player.id
          : typeof resultRecord?.player_id === 'string'
            ? resultRecord.player_id
            : response.session?.player_id;

      if (playerId) {
        const session = await loadSession();
        if (session) {
          session.player_id = playerId;
          await saveSession(session);
        }
      }
    }

    if (options.json) {
      printJsonResponse(response);
      process.exit(response.error ? 1 : 0);
    }

    displayResult(command, response, options.fields);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (options.json) {
      printJsonError('connection_error', errorMessage);
      process.exit(1);
    }
    console.error(`${c.red}${c.bright}Connection Error:${c.reset} ${errorMessage}`);
    console.error('');

    if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network')) {
      console.error(`${c.yellow}Troubleshooting:${c.reset}`);
      console.error(`  1. Check your internet connection`);
      console.error(`  2. Verify the API is reachable: ${API_BASE}`);
      console.error(`  3. The game server may be temporarily down`);
      console.error(`  4. Try again in a few moments`);
    }

    if (DEBUG) {
      console.error(`\n${c.dim}[DEBUG] Full error:${c.reset}`);
      console.error(error);
    }

    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
