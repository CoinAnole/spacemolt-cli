# Server Help Exposure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit live gameserver help through `spacemolt server-help [topic]` and `spacemolt help --server [topic]` while keeping local help as the default offline CLI help contract.

**Architecture:** Keep local help in `src/help.ts` and `src/local-command-handlers.ts` as the primary user-facing path. Add `server-help` as a local command handler with `requiresNetwork: true` that delegates to the canonical `POST /api/v2/spacemolt/help` route through the existing `runCommand` and `renderResponse` APIs. Add a small human-only mapping layer that can translate server tool/action metadata back to a local CLI command when the active registry contains one.

**Tech Stack:** Bun test runner, TypeScript, existing SpaceMolt command registry, existing CLI command handlers, existing response renderer.

---

## File Structure

- Modify `src/commands.ts`
  - Add `server-help` to `LOCAL_COMMANDS` so local command search, local help, metadata tests, and completion metadata can discover it.
- Modify `src/help.ts`
  - Add live server help text to top-level/progressive/full local help.
  - Add a server-help hint to local command search output.
  - Add a server-help pointer to API-backed command help.
- Modify `src/local-command-handlers.ts`
  - Add the networked `server-help` local handler.
  - Parse `server-help [topic words...]` as one optional topic string.
  - Parse `help --server [topic words...]` inside the local help handler.
  - Add helper functions for extracting server tool/action from structured help responses and mapping them back to a local command.
  - Register `server-help` and route `help --server` to the same behavior.
- Modify `src/response-renderer.ts`
  - Remove the stale server-help filter warning path.
- Modify `src/help.test.ts`
  - Cover top-level/progressive/full help text, local search hints, and API-backed command help pointers.
- Modify `src/local-command-handlers.test.ts`
  - Cover `server-help` parsing, dispatch, output-mode behavior, local mapping, and local-help preservation.
- Modify `src/response-renderer.test.ts`
  - Replace the stale-warning test with a no-warning test for help topic payloads.
- Regenerate committed golden output only if `bun test src/output-golden.test.ts` reports changed help output.

---

### Task 1: Add Local Metadata and Help Text Tests

**Files:**
- Modify: `src/commands.ts`
- Modify: `src/help.ts`
- Test: `src/help.test.ts`
- Test: `src/local-command-handlers.test.ts`

- [ ] **Step 1: Write failing tests for server-help discoverability**

Add these assertions to the existing `showHelp emphasizes local help command discovery before server help` test in `src/help.test.ts`:

```ts
expect(output).toContain('Live server help:');
expect(output).toContain(
  'spacemolt server-help [topic]    Live gameserver help for an action, category, or keyword',
);
expect(output.indexOf('Command Discovery:')).toBeLessThan(output.indexOf('Live server help:'));
```

Add the same assertions to the existing `renderProgressiveHelp emphasizes local help command discovery before server help` test in `src/help.test.ts`:

```ts
expect(output).toContain('Live server help:');
expect(output).toContain(
  'spacemolt server-help [topic]    Live gameserver help for an action, category, or keyword',
);
expect(output.indexOf('Command Discovery:')).toBeLessThan(output.indexOf('Live server help:'));
```

Add the same assertions to the existing `showFullHelp emphasizes local help command discovery before server help` test in `src/help.test.ts`:

```ts
expect(output).toContain('Live server help:');
expect(output).toContain(
  'spacemolt server-help [topic]    Live gameserver help for an action, category, or keyword',
);
expect(output.indexOf('Command Discovery:')).toBeLessThan(output.indexOf('Live server help:'));
```

Add a new test near `sync-api is discoverable through local help and command search` in `src/local-command-handlers.test.ts`:

```ts
test('server-help is discoverable through local help and command search', async () => {
  const helpHandler = localHandler(['help', 'server-help']);
  const parsedHelp = helpHandler.parse(['help', 'server-help'], options);
  expect(parsedHelp.ok).toBe(true);
  if (!parsedHelp.ok) return;
  const helpResult = await helpHandler.run(parsedHelp.payload, options);
  const helpCapture = captureContext();
  const helpExitCode = await helpHandler.render(helpResult, options, undefined, helpCapture.context);

  expect(helpExitCode).toBe(0);
  expect(helpCapture.stdout.join('\n')).toContain('Fetch live gameserver help for an action, category, or keyword.');
  expect(helpCapture.stdout.join('\n')).toContain('spacemolt server-help [topic]');

  const commandsHandler = localHandler(['commands', 'server']);
  const parsedCommands = commandsHandler.parse(['commands', 'server'], options);
  expect(parsedCommands.ok).toBe(true);
  if (!parsedCommands.ok) return;
  const commandsResult = await commandsHandler.run(parsedCommands.payload, options);
  const commandsCapture = captureContext();
  const commandsExitCode = await commandsHandler.render(commandsResult, options, undefined, commandsCapture.context);

  expect(commandsExitCode).toBe(0);
  expect(commandsCapture.stdout.join('\n')).toContain('server-help [topic]');
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
bun test src/help.test.ts src/local-command-handlers.test.ts
```

Expected:

- `help.test.ts` fails because the output does not contain `Live server help:`.
- `local-command-handlers.test.ts` fails because `server-help` is not present in `LOCAL_COMMANDS`.

- [ ] **Step 3: Add `server-help` local metadata**

Modify `LOCAL_COMMANDS` in `src/commands.ts` by adding this entry after `help`:

```ts
  'server-help': {
    usage: '[topic]',
    description: 'Fetch live gameserver help for an action, category, or keyword.',
    example: 'spacemolt server-help repair',
    category: 'Reference & Help',
    args: [{ rest: 'topic' }],
    required: [],
    seeAlso: ['help', 'commands', 'sync-api', 'get_commands'],
  },
```

- [ ] **Step 4: Add live server help text to local help sections**

Modify `cacheHelpSections` in `src/help.ts` so it returns the live server help section before the dynamic API cache section:

```ts
function cacheHelpSections(options?: HelpOutputOptions): string {
  const c = colorsForPlain(Boolean(options?.plain));
  return `
${c.bright}Live server help:${c.reset}
  spacemolt server-help [topic]    Live gameserver help for an action, category, or keyword

${c.bright}Dynamic API Cache:${c.reset}
  spacemolt sync-api              Refresh cached OpenAPI command metadata
  Cached v2 routes appear in help, command search, completion, and dispatch.

${c.bright}ID Cache:${c.reset}
  Discovery commands like get_system, get_cargo, view_market, get_nearby, and list_ships save useful IDs.
  spacemolt ids <kind> [--search text]  Show or filter cached poi/system/item/player/ship/faction/drone/wreck/facility/listing IDs
  spacemolt where-can-i <item>          Search cached item sightings`;
}
```

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
bun test src/help.test.ts src/local-command-handlers.test.ts
```

Expected: all tests in those files pass.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add src/commands.ts src/help.ts src/help.test.ts src/local-command-handlers.test.ts
git commit -m "Add server help local discovery metadata"
```

---

### Task 2: Add Local Help Hints and Command Cross-Links

**Files:**
- Modify: `src/help.ts`
- Test: `src/help.test.ts`
- Test: `src/local-command-handlers.test.ts`

- [ ] **Step 1: Write failing tests for local search server-help hints**

Add this test near `showCommandSearch uses local help metadata for help command` in `src/help.test.ts`:

```ts
test('showCommandSearch suggests server-help for live server lookup', () => {
  const capture = captureWriter();
  showCommandSearch('repair modules', capture.writer);

  const output = capture.stdout.join('\n');
  expect(output).toContain('Commands matching "repair modules"');
  expect(output).toContain('For live server help, run: spacemolt server-help "repair modules"');
});
```

Add this test near `showCommandSearch uses local help metadata for help command` in `src/help.test.ts`:

```ts
test('showCommandSearch suggests server-help even when there are no local matches', () => {
  const capture = captureWriter();
  showCommandSearch('definitely-not-a-local-topic', capture.writer);

  const output = capture.stdout.join('\n');
  expect(output).toContain('(No local command matches)');
  expect(output).toContain(
    'For live server help, run: spacemolt server-help "definitely-not-a-local-topic"',
  );
});
```

- [ ] **Step 2: Write failing tests for API-backed command cross-links**

Add this test near `help travel renders local command explanation with accepted forms and API route` in `src/local-command-handlers.test.ts`:

```ts
test('help for API-backed commands includes server-help pointer', async () => {
  const handler = resolveHandler(['help', 'travel'], options);
  expect(handler?.name).toBe('help');
  if (!handler) return;
  const parsed = handler.parse(['help', 'travel'], options);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const result = await handler.run(parsed.payload, options);
  const { context, stdout } = captureContext();

  const exitCode = await handler.render(result, options, undefined, context);

  expect(exitCode).toBe(0);
  expect(stdout.join('\n')).toContain('Server help:');
  expect(stdout.join('\n')).toContain('spacemolt server-help travel');
});
```

Update the existing `help help renders local help metadata without API route` test in `src/local-command-handlers.test.ts` by adding:

```ts
expect(output).not.toContain('Server help:');
expect(output).not.toContain('spacemolt server-help help');
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
bun test src/help.test.ts src/local-command-handlers.test.ts
```

Expected:

- Search hint tests fail because `showCommandSearch` does not print the server-help hint.
- API-backed command test fails because command help does not include `Server help:`.

- [ ] **Step 4: Add server-help hints to command search**

Add this helper in `src/help.ts` near `showCommandSearch`:

```ts
function formatServerHelpTopicCommand(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `spacemolt server-help "${trimmed.replace(/"/g, '\\"')}"` : 'spacemolt server-help';
}
```

Modify `showCommandSearch` in `src/help.ts` to always append the hint when a non-empty query is present:

```ts
export function showCommandSearch(
  query: string,
  writer?: CliWriter,
  commands?: CommandHelpSource,
  options?: HelpOutputOptions,
): void {
  const allCommands = commandHelpMap(commands);
  const results = searchLocalCommands(query, 30, allCommands);
  const title = query ? `Commands matching "${query}"` : 'All Commands';
  const write = out(writer);
  const c = colorsForPlain(Boolean(options?.plain));
  write(`\n${c.bright}${title}${c.reset}`);
  if (!results.length) {
    write('  (No local command matches)');
    const suggestions = suggestCommands(query, 5, allCommands);
    if (suggestions.length > 0) write(`\nDid you mean: ${suggestions.join(', ')}`);
    if (query.trim()) write(`\nFor live server help, run: ${formatServerHelpTopicCommand(query)}`);
    return;
  }
  for (const command of results) write(`  ${formatCommandSummary(command, allCommands)}`);
  if (results.length === 30) write(`\nShowing first 30 matches. Use a narrower search term for fewer results.`);
  if (query.trim()) write(`\nFor live server help, run: ${formatServerHelpTopicCommand(query)}`);
}
```

- [ ] **Step 5: Add API-backed command server-help pointers**

Modify `showCommandHelp` in `src/help.ts` after the API route/default payload block and before `Example:`:

```ts
  if ('route' in config) {
    write(`\n${c.bright}Server help:${c.reset}`);
    write(`  spacemolt server-help ${command}`);
  }
```

Keep this inside the existing `showCommandHelp` function so both `showCommandHelp` and `showCommandExplanation` share the same output.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run:

```bash
bun test src/help.test.ts src/local-command-handlers.test.ts
```

Expected: all tests in those files pass.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/help.ts src/help.test.ts src/local-command-handlers.test.ts
git commit -m "Link local help to live server help"
```

---

### Task 3: Add `server-help` Command Dispatch

**Files:**
- Modify: `src/local-command-handlers.ts`
- Test: `src/local-command-handlers.test.ts`

- [ ] **Step 1: Write failing tests for direct server-help dispatch**

Add these tests near the other local handler network command tests in `src/local-command-handlers.test.ts`:

```ts
test('server-help dispatches canonical server help without topic', async () => {
  const calls: Array<{ command: string; config: unknown; payload: Record<string, unknown> }> = [];
  const client = {
    config: { profile: 'pilot' },
    async executeCommandConfig(command: string, config: unknown, payload: Record<string, unknown>) {
      calls.push({ command, config, payload });
      return { result: 'Server help index' };
    },
  } as unknown as SpaceMoltClient;
  const handler = resolveHandler(['server-help'], options);
  expect(handler?.name).toBe('server-help');
  if (!handler) return;
  const parsed = handler.parse(['server-help'], { ...options, profile: 'pilot' });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const result = await handler.run(parsed.payload, { ...options, profile: 'pilot' }, client);
  const { context, stdout, stderr } = captureContext();

  const exitCode = await handler.render(result, { ...options, profile: 'pilot', plain: true }, client, context);

  expect(exitCode).toBe(0);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.command).toBe('server-help');
  expect(calls[0]?.payload).toEqual({});
  expect(calls[0]?.config).toMatchObject({ route: { tool: 'spacemolt', action: 'help', method: 'POST' } });
  expect(stdout.join('\n')).toContain('Server help index');
  expect(stderr).toEqual([]);
});
```

```ts
test('server-help joins topic words into one topic payload', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    config: { profile: 'pilot' },
    async executeCommandConfig(_command: string, _config: unknown, payload: Record<string, unknown>) {
      calls.push(payload);
      return { result: 'Faction build help' };
    },
  } as unknown as SpaceMoltClient;
  const handler = resolveHandler(['server-help', 'faction', 'build'], options);
  expect(handler?.name).toBe('server-help');
  if (!handler) return;
  const parsed = handler.parse(['server-help', 'faction', 'build'], { ...options, profile: 'pilot' });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;

  await handler.run(parsed.payload, { ...options, profile: 'pilot' }, client);

  expect(calls).toEqual([{ topic: 'faction build' }]);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
bun test src/local-command-handlers.test.ts
```

Expected: tests fail because `resolveHandler(['server-help'], options)` does not return a handler.

- [ ] **Step 3: Import command and renderer types in `src/local-command-handlers.ts`**

Modify the imports at the top of `src/local-command-handlers.ts`:

```ts
import type { CommandConfig } from './commands.ts';
import { runCommand, renderResponse, type CommandRunResult } from './response-renderer.ts';
```

Keep the existing import from `./commands.ts` if it already exists in the implementation branch; combine imports instead of duplicating module imports.

- [ ] **Step 4: Add server-help handler constants and payload type**

Add this near `syncApiHandler` in `src/local-command-handlers.ts`:

```ts
type ServerHelpPayload = { topic?: string };

const SERVER_HELP_COMMAND_CONFIG: CommandConfig = {
  route: { tool: 'spacemolt', action: 'help', method: 'POST' },
  usage: '[topic]',
  description: 'Fetch live gameserver help for an action, category, or keyword.',
  category: 'Reference & Help',
  args: [{ rest: 'topic' }],
  required: [],
};

function parseServerHelpTopic(argv: string[], startIndex: number): ServerHelpPayload {
  const topic = argv.slice(startIndex).join(' ').trim();
  return topic ? { topic } : {};
}
```

- [ ] **Step 5: Add the `server-help` handler**

Add this handler near `syncApiHandler` in `src/local-command-handlers.ts`:

```ts
function createServerHelpHandler(): CommandHandler<ServerHelpPayload, CommandRunResult> {
  return {
    name: 'server-help',
    requiresNetwork: true,
    parse(argv) {
      return { ok: true, payload: parseServerHelpTopic(argv, 1) };
    },
    run(payload, options, client) {
      return runCommand('server-help', payload, options, client, SERVER_HELP_COMMAND_CONFIG);
    },
    async render(result, options, client, context) {
      const exitCode = await renderResponse(result, options, client, context);
      return exitCode;
    },
  };
}
```

Task 5 adds a registry snapshot parameter when local command mapping needs it.

- [ ] **Step 6: Register and resolve `server-help`**

Add this registration near the other local command registrations:

```ts
registry.register(createServerHelpHandler());
```

Add this branch in `resolveHandler` before the generic `registry.get(commandName)` branch:

```ts
    if (commandName === 'server-help') return createServerHelpHandler();
```

- [ ] **Step 7: Run the focused tests and verify they pass**

Run:

```bash
bun test src/local-command-handlers.test.ts
```

Expected: all tests in `src/local-command-handlers.test.ts` pass.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add src/local-command-handlers.ts src/local-command-handlers.test.ts
git commit -m "Add server-help command dispatch"
```

---

### Task 4: Add `help --server` Alias While Preserving Local Help

**Files:**
- Modify: `src/local-command-handlers.ts`
- Test: `src/local-command-handlers.test.ts`

- [ ] **Step 1: Write failing tests for `help --server`**

Add this test near the new direct server-help dispatch tests in `src/local-command-handlers.test.ts`:

```ts
test('help --server normalizes to server-help topic lookup', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    config: { profile: 'pilot' },
    async executeCommandConfig(_command: string, _config: unknown, payload: Record<string, unknown>) {
      calls.push(payload);
      return { result: 'Repair help' };
    },
  } as unknown as SpaceMoltClient;
  const handler = resolveHandler(['help', '--server', 'repair'], options);
  expect(handler?.name).toBe('server-help');
  if (!handler) return;
  const parsed = handler.parse(['help', '--server', 'repair'], { ...options, profile: 'pilot' });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;

  await handler.run(parsed.payload, { ...options, profile: 'pilot' }, client);

  expect(calls).toEqual([{ topic: 'repair' }]);
});
```

Add this test near `help --help shows local help overview`:

```ts
test('help without --server remains local and network-free', async () => {
  const handler = resolveHandler(['help', 'repair'], options);
  expect(handler?.name).toBe('help');
  if (!handler) return;
  const parsed = handler.parse(['help', 'repair'], options);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const result = await handler.run(parsed.payload, options);
  const { context, stdout } = captureContext();

  const exitCode = await handler.render(result, options, undefined, context);

  expect(exitCode).toBe(0);
  expect(stdout.join('\n')).toContain('spacemolt repair');
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
bun test src/local-command-handlers.test.ts
```

Expected: `help --server normalizes to server-help topic lookup` fails because `resolveHandler(['help', '--server', 'repair'], options)` returns the local help handler.

- [ ] **Step 3: Route `help --server` to the server-help handler**

Modify `resolveHandler` in `src/local-command-handlers.ts` before the existing local-help condition:

```ts
  if (commandName === 'help' && argv[1] === '--server') {
    return createServerHelpHandler();
  }
```

Modify `parseServerHelpTopic` so it treats `help --server` as topic args starting at index 2:

```ts
function parseServerHelpTopic(argv: string[], startIndex: number): ServerHelpPayload {
  const topic = argv.slice(startIndex).join(' ').trim();
  return topic ? { topic } : {};
}
```

Modify `createServerHelpHandler.parse`:

```ts
    parse(argv) {
      const startIndex = argv[0] === 'help' && argv[1] === '--server' ? 2 : 1;
      return { ok: true, payload: parseServerHelpTopic(argv, startIndex) };
    },
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
bun test src/local-command-handlers.test.ts
```

Expected: all tests in `src/local-command-handlers.test.ts` pass.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add src/local-command-handlers.ts src/local-command-handlers.test.ts
git commit -m "Support help --server topic lookup"
```

---

### Task 5: Add Human-Only Local Command Mapping for Server Help

**Files:**
- Modify: `src/local-command-handlers.ts`
- Test: `src/local-command-handlers.test.ts`

- [ ] **Step 1: Write failing tests for server tool/action mapping**

Add this test near the server-help dispatch tests in `src/local-command-handlers.test.ts`:

```ts
test('server-help human output maps server tool and action to local command', async () => {
  const client = {
    config: { profile: 'pilot' },
    async executeCommandConfig() {
      return {
        result: 'Buy command help',
        structuredContent: {
          tool: 'spacemolt_market',
          action: 'buy',
        },
      };
    },
  } as unknown as SpaceMoltClient;
  const handler = resolveHandler(['server-help', 'buy'], { ...options, plain: true });
  expect(handler?.name).toBe('server-help');
  if (!handler) return;
  const parsed = handler.parse(['server-help', 'buy'], { ...options, profile: 'pilot', plain: true });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const result = await handler.run(parsed.payload, { ...options, profile: 'pilot', plain: true }, client);
  const { context, stdout } = captureContext();

  const exitCode = await handler.render(result, { ...options, profile: 'pilot', plain: true }, client, context);

  expect(exitCode).toBe(0);
  const output = stdout.join('\n');
  expect(output).toContain('CLI command:');
  expect(output).toContain('spacemolt buy');
});
```

Add this test near the first mapping test:

```ts
test('server-help JSON output does not append human local command mapping', async () => {
  const client = {
    config: { profile: 'pilot' },
    async executeCommandConfig() {
      return {
        structuredContent: {
          tool: 'spacemolt_market',
          action: 'buy',
        },
      };
    },
  } as unknown as SpaceMoltClient;
  const handler = resolveHandler(['server-help', 'buy'], { ...options, json: true, format: 'json' });
  expect(handler?.name).toBe('server-help');
  if (!handler) return;
  const parsed = handler.parse(['server-help', 'buy'], {
    ...options,
    json: true,
    format: 'json',
    profile: 'pilot',
  });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const result = await handler.run(parsed.payload, { ...options, json: true, format: 'json', profile: 'pilot' }, client);
  const { context, stdout } = captureContext();

  const exitCode = await handler.render(
    result,
    { ...options, json: true, format: 'json', profile: 'pilot' },
    client,
    context,
  );

  expect(exitCode).toBe(0);
  expect(stdout.join('\n')).not.toContain('CLI command:');
  expect(JSON.parse(stdout.join('\n'))).toEqual({
    structuredContent: {
      tool: 'spacemolt_market',
      action: 'buy',
    },
  });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
bun test src/local-command-handlers.test.ts
```

Expected: the human mapping test fails because the `server-help` renderer does not append a `CLI command:` section.

- [ ] **Step 3: Update command type imports**

Modify the existing import from `./commands.ts` in `src/local-command-handlers.ts`:

```ts
import type { CommandConfig, LocalCommandConfig } from './commands.ts';
```

- [ ] **Step 4: Add server target extraction helpers**

Add these helpers in `src/local-command-handlers.ts` near `createServerHelpHandler`:

```ts
function findStringValue(value: unknown, keys: string[]): string | undefined {
  if (typeof value === 'string') return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  for (const nested of Object.values(record)) {
    const found = findStringValue(nested, keys);
    if (found) return found;
  }
  return undefined;
}

function extractServerHelpTarget(result: CommandRunResult): { tool: string; action: string } | undefined {
  const containers = [result.response.structuredContent, result.response.result].filter(
    (value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
  );
  for (const container of containers) {
    const tool = findStringValue(container, ['tool', 'tool_name', 'server_tool']);
    const action = findStringValue(container, ['action', 'action_name', 'command']);
    if (tool && action) return { tool, action };
  }
  return undefined;
}
```

- [ ] **Step 5: Add local command mapping helper**

Add this helper in `src/local-command-handlers.ts`:

```ts
function findLocalCommandForServerTarget(
  target: { tool: string; action: string },
  commands: Record<string, CommandConfig | LocalCommandConfig>,
): string | undefined {
  return Object.entries(commands)
    .filter(
      ([, config]) => 'route' in config && config.route.tool === target.tool && config.route.action === target.action,
    )
    .map(([command]) => command)
    .sort((a, b) => a.localeCompare(b))[0];
}
```

- [ ] **Step 6: Add human-only rendering helper**

Add this helper in `src/local-command-handlers.ts`:

```ts
function shouldPrintServerHelpLocalMapping(options: GlobalOptions): boolean {
  return (
    !options.json &&
    options.format !== 'json' &&
    !options.structured &&
    !options.jq &&
    !options.field &&
    !options.fields?.length
  );
}

function printServerHelpLocalMapping(
  result: CommandRunResult,
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> &
    Partial<Pick<CommandRegistrySnapshot, 'allCommands'>>,
  context?: CliRuntimeContext,
): void {
  const target = extractServerHelpTarget(result);
  if (!target) return;
  const allCommands = registrySnapshot.allCommands ?? registrySnapshot.commands;
  const localCommand = findLocalCommandForServerTarget(target, allCommands);
  if (!localCommand) return;
  const writer = context?.writer.out.bind(context.writer) ?? console.log;
  writer('');
  writer('CLI command:');
  writer(`  ${getUsageLine(localCommand, allCommands)}`);
}
```

Add `getUsageLine` to the existing imports from `./help.ts`:

```ts
  getUsageLine,
```

- [ ] **Step 7: Wire mapping into server-help render**

Modify the `createServerHelpHandler` signature in `src/local-command-handlers.ts`:

```ts
function createServerHelpHandler(
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> &
    Partial<Pick<CommandRegistrySnapshot, 'allCommands'>> = BUNDLED_COMMAND_REGISTRY,
): CommandHandler<ServerHelpPayload, CommandRunResult> {
```

Modify the `server-help` branch in `resolveHandler`:

```ts
    if (commandName === 'server-help') return createServerHelpHandler(registrySnapshot);
```

Modify the `help --server` branch in `resolveHandler`:

```ts
  if (commandName === 'help' && argv[1] === '--server') {
    return createServerHelpHandler(registrySnapshot);
  }
```

Modify `createServerHelpHandler.render` in `src/local-command-handlers.ts`:

```ts
    async render(result, options, client, context) {
      const exitCode = await renderResponse(result, options, client, context);
      if (exitCode === 0 && shouldPrintServerHelpLocalMapping(options)) {
        printServerHelpLocalMapping(result, registrySnapshot, context);
      }
      return exitCode;
    },
```

- [ ] **Step 8: Run the focused tests and verify they pass**

Run:

```bash
bun test src/local-command-handlers.test.ts
```

Expected: all tests in `src/local-command-handlers.test.ts` pass.

- [ ] **Step 9: Commit Task 5**

Run:

```bash
git add src/local-command-handlers.ts src/local-command-handlers.test.ts
git commit -m "Map server help targets to local commands"
```

---

### Task 6: Remove Stale Server Help Filter Warning

**Files:**
- Modify: `src/response-renderer.ts`
- Test: `src/response-renderer.test.ts`

- [ ] **Step 1: Replace the stale-warning test**

Replace the existing test named `renderResponse warns when old server help filters are ignored by the API` in `src/response-renderer.test.ts` with:

```ts
test('renderResponse does not warn for legacy server help filter payloads', async () => {
  const capture = fakeContext();
  const exitCode = await renderResponse(
    {
      command: 'help',
      displayCommand: 'help',
      payload: { category: 'Navigation' },
      response: { result: 'All server commands' },
    },
    { ...baseOptions, noTimestamp: true, format: 'table' },
    { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
    capture.context,
  );

  expect(exitCode).toBe(0);
  expect(capture.text()).toContain('All server commands');
  expect(capture.stderr.join('\n')).not.toContain('server help returns the full unfiltered list');
  expect(capture.stderr.join('\n')).not.toContain('topic/category/command filters are ignored');
});
```

- [ ] **Step 2: Run the focused test and verify it fails or the stale code remains covered**

Run:

```bash
bun test src/response-renderer.test.ts
```

Expected: the new test fails because the renderer still emits the stale warning for command `help` with a legacy `category` payload.

- [ ] **Step 3: Remove stale warning function and call**

Delete this function from `src/response-renderer.ts`:

```ts
function warnAboutUnsupportedServerHelpFilters(
  commandRun: CommandRunResult,
  options: { isJson: boolean; hasProjection: boolean; writer?: CliRuntimeContext['writer']; plain?: boolean },
): void {
  if (options.isJson || options.hasProjection || commandRun.command !== 'help') return;
  const payload = commandRun.payload ?? {};
  if (payload.category === undefined && payload.command === undefined) return;

  const warn = options.writer?.err.bind(options.writer) ?? console.error;
  const colors = colorsForPlain(Boolean(options.plain));
  warn(
    `${colors.yellow}Note:${colors.reset} server help returns the full unfiltered list (topic/category/command filters are ignored). Use spacemolt help <command> or spacemolt help <group> for local filtered help.`,
  );
}
```

Delete this call from `renderResponse`:

```ts
  warnAboutUnsupportedServerHelpFilters(commandRun, { isJson, hasProjection, writer, plain: options.plain });
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
bun test src/response-renderer.test.ts
```

Expected: all tests in `src/response-renderer.test.ts` pass.

- [ ] **Step 5: Commit Task 6**

Run:

```bash
git add src/response-renderer.ts src/response-renderer.test.ts
git commit -m "Remove stale server help filter warning"
```

---

### Task 7: Run Metadata and Golden Verification

**Files:**
- Modify if needed: `src/golden-output/**`

- [ ] **Step 1: Run command metadata tests**

Run:

```bash
bun test src/command-metadata.test.ts src/completion.test.ts
```

Expected: tests pass. If completion tests fail because `server-help` changed generated shell completion output, inspect the failure and update only the expected completion assertions or goldens that correspond to local command discovery.

- [ ] **Step 2: Run output golden tests**

Run:

```bash
bun test src/output-golden.test.ts
```

Expected: tests may fail because top-level local help output now includes `Live server help:`.

- [ ] **Step 3: Update help goldens if the output-golden test requests it**

Run only after confirming the diff is limited to intentional local help text:

```bash
UPDATE_GOLDENS=1 bun test src/output-golden.test.ts
```

Expected: golden files update only for help-related output cases.

- [ ] **Step 4: Re-run output golden tests**

Run:

```bash
bun test src/output-golden.test.ts
```

Expected: all output golden tests pass.

- [ ] **Step 5: Commit Task 7 if golden files changed**

If `git status --short` shows changes under `src/golden-output/`, run:

```bash
git add src/golden-output
git commit -m "Update help output goldens for server help"
```

If no golden files changed, do not create a commit for this task.

---

### Task 8: Final Verification

**Files:**
- No new source files expected.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
bun test src/help.test.ts src/local-command-handlers.test.ts src/response-renderer.test.ts src/command-metadata.test.ts src/completion.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: TypeScript reports no errors.

- [ ] **Step 4: Run lint**

Run:

```bash
bun run lint
```

Expected: lint reports no errors.

- [ ] **Step 5: Run build**

Run:

```bash
bun run build
```

Expected: build completes successfully.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected:

- `git diff --check` exits 0.
- `git status --short` shows only intentional source, test, and golden changes not yet committed.
- `git diff --stat` matches the implementation scope in this plan.

- [ ] **Step 7: Commit final remaining changes if any**

If there are intentional uncommitted changes after verification, run:

```bash
git add src/commands.ts src/help.ts src/local-command-handlers.ts src/response-renderer.ts src/help.test.ts src/local-command-handlers.test.ts src/response-renderer.test.ts src/command-metadata.test.ts src/completion.test.ts src/golden-output
git commit -m "Expose live server help explicitly"
```

If all task commits already captured the changes and `git status --short` is clean, do not create another commit.

---

## Spec Coverage Review

- Local help remains default: Tasks 1, 2, 4, and 8 preserve and test local `help`, `--help`, and trailing help behavior.
- Explicit server help entrypoint: Tasks 1 and 3 add `server-help [topic]`.
- `help --server` alias: Task 4 adds and tests it.
- Do not expose every generated help route: Task 3 uses one synthetic `spacemolt/help` route config.
- Unknown local topics get hints without network calls: Task 2 adds local search hints only.
- API-backed command help gets server pointer: Task 2 adds and tests it.
- Server tool/action maps to local command: Task 5 adds and tests human-only mapping.
- Machine-readable output stays API-shaped: Task 5 tests JSON output does not include mapping text.
- Stale filter warning removed: Task 6 removes and tests the warning path.
- Metadata, completion, goldens, typecheck, lint, build: Tasks 7 and 8 cover final verification.
