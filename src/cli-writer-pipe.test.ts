import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const cliContextPath = path.join(import.meta.dir, 'cli-context.ts');
const childPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-cli-writer-pipe-')), 'child.ts');

fs.writeFileSync(
  childPath,
  `import { fstatSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const mode = process.argv[2];
if (mode !== 'epipe') {
  if (!fstatSync(1).isFIFO()) {
    writeSync(2, Buffer.from('stdout is not a FIFO; a socket capture does not reproduce the 64KB cut\\n'));
    process.exit(2);
  }
}

const { createDefaultCliRuntimeContext, withCliWriter } = await import(pathToFileURL(${JSON.stringify(cliContextPath)}).href);
const context = createDefaultCliRuntimeContext();
const writer = context.writer;
const tracked = {
  out(message = '') {
    writer.out(message);
  },
  err(message = '') {
    writer.err(message);
  },
  writeOut: writer.writeOut
    ? (chunk: string) => {
        writer.writeOut?.(chunk);
      }
    : undefined,
};

await withCliWriter(tracked, async () => {
  if (mode === 'out') {
    tracked.out('A'.repeat(200_000));
  } else if (mode === 'writeOut') {
    tracked.writeOut('B'.repeat(200_000));
  } else if (mode === 'watch') {
    tracked.writeOut('\\x1b[2J\\x1b[H');
    tracked.out('A'.repeat(200_000));
  } else if (mode === 'epipe') {
    for (let i = 0; i < 64; i++) tracked.writeOut('C'.repeat(65_536));
  } else {
    writeSync(2, Buffer.from('unknown writer pipe mode\\n'));
    process.exit(2);
  }
});
process.exit(0);
`,
);

const skipFifo = process.platform === 'win32';

function runFifo(mode: string): { stdout: Buffer; stderr: Buffer; exitCode: number } {
  // A direct stdout: 'pipe' is a socket on Bun 1.4.2 and does not reproduce the cut.
  const result = Bun.spawnSync({
    cmd: ['sh', '-c', 'set -o pipefail; bun "$1" "$2" | cat', 'sh', childPath, mode],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

function expectFifo(mode: string, expected: Buffer): void {
  const result = runFifo(mode);
  expect({
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    bytes: result.stdout.byteLength,
  }).toEqual({
    exitCode: 0,
    stderr: '',
    bytes: expected.byteLength,
  });
  expect(result.stdout.equals(expected)).toBe(true);
}

describe('piped stdout', () => {
  test.skipIf(skipFifo)('writer.out of 200KB stays intact on a FIFO', () => {
    expectFifo('out', Buffer.concat([Buffer.alloc(200_000, 'A'), Buffer.from('\n')]));
  });

  test.skipIf(skipFifo)('writeOut of 200KB stays intact on a FIFO and adds no newline', () => {
    expectFifo('writeOut', Buffer.alloc(200_000, 'B'));
  });

  test.skipIf(skipFifo)('watch clear then writer.out stays ordered on a FIFO', () => {
    expectFifo('watch', Buffer.concat([Buffer.from('\x1b[2J\x1b[H'), Buffer.alloc(200_000, 'A'), Buffer.from('\n')]));
  });

  test.skipIf(skipFifo)(
    'writeOut returns on EPIPE without a stack',
    async () => {
      const child = Bun.spawn({
        cmd: [process.execPath, childPath, 'epipe'],
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stderrText = new Response(child.stderr).text();
      await child.stdout.cancel();
      expect(await child.exited).toBe(0);
      expect(await stderrText).toBe('');
    },
    5_000,
  );
});
