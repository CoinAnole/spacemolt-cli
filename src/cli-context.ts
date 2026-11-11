import { writeSync } from 'node:fs';
import type { SpaceMoltConfig } from './runtime.ts';
import type { OutputFormat } from './types.ts';

export type CliEnv = Record<string, string | undefined>;

export interface CliWriter {
  out(message?: string): void;
  err(message?: string): void;
  writeOut?(chunk: string): void;
}

export interface CliClock {
  now(): Date;
}

export interface CliOutputOptions {
  json?: boolean;
  jsonOutput?: boolean;
  debug?: boolean;
  quiet?: boolean;
  plain?: boolean;
  format?: OutputFormat;
  compact?: boolean;
}

export interface CliRuntimeContext {
  env: CliEnv;
  writer: CliWriter;
  clock: CliClock;
  /** Resolve after the delay, or promptly when the optional signal is aborted. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  config?: SpaceMoltConfig;
  output?: CliOutputOptions;
}

// Do not bind or replace process.stdout.write. On Bun 1.4.2 that truncates
// piped console.log at 65536 bytes. writeSync(1) does not.
function writeStdoutSync(text: string): void {
  if (text.length === 0) return;
  const buffer = Buffer.from(text);
  let offset = 0;
  while (offset < buffer.length) {
    let written: number;
    try {
      written = writeSync(1, buffer, offset, buffer.length - offset);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === 'EPIPE') return;
      if (code === 'EAGAIN' || code === 'EWOULDBLOCK' || code === 'EINTR') continue;
      throw error;
    }
    if (written <= 0) throw new Error(`stdout write stalled after ${offset} of ${buffer.length} bytes`);
    offset += written;
  }
}

export function createDefaultCliRuntimeContext(config?: SpaceMoltConfig): CliRuntimeContext {
  const out = console.log.bind(console);
  const err = console.error.bind(console);
  return {
    env: process.env,
    writer: {
      out(message = '') {
        out(message);
      },
      err(message = '') {
        err(message);
      },
      writeOut(chunk) {
        writeStdoutSync(chunk);
      },
    },
    clock: {
      now() {
        return new Date();
      },
    },
    sleep(ms, signal) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', finish);
          resolve();
        };
        const timer = setTimeout(finish, ms);
        if (signal?.aborted) finish();
        else signal?.addEventListener('abort', finish, { once: true });
      });
    },
    config,
    output: config
      ? {
          json: config.jsonOutput,
          jsonOutput: config.jsonOutput,
          debug: config.debug,
          quiet: config.quiet,
          plain: config.plain,
          format: config.format,
          compact: config.compact,
        }
      : undefined,
  };
}

export async function withCliWriter<T>(writer: CliWriter, fn: () => Promise<T> | T): Promise<T> {
  const restore = installCliWriter(writer);
  try {
    return await fn();
  } finally {
    restore();
  }
}

export function withCliWriterSync<T>(writer: CliWriter, fn: () => T): T {
  const restore = installCliWriter(writer);
  try {
    return fn();
  } finally {
    restore();
  }
}

function installCliWriter(writer: CliWriter): () => void {
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    writer.out(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    writer.err(args.map(String).join(' '));
  };

  return () => {
    console.log = originalLog;
    console.error = originalError;
  };
}
