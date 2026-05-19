import type { SpaceMoltConfig } from './runtime.ts';

export type CliEnv = Record<string, string | undefined>;

export interface CliWriter {
  out(message?: string): void;
  err(message?: string): void;
  writeOut?(chunk: string): void;
}

export interface CliClock {
  now(): Date;
}

export interface CliRuntimeContext {
  env: CliEnv;
  writer: CliWriter;
  clock: CliClock;
  sleep(ms: number): Promise<void>;
  config?: SpaceMoltConfig;
}

export function createDefaultCliRuntimeContext(config?: SpaceMoltConfig): CliRuntimeContext {
  const out = console.log.bind(console);
  const err = console.error.bind(console);
  const writeOut = process.stdout.write.bind(process.stdout);
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
        writeOut(chunk);
      },
    },
    clock: {
      now() {
        return new Date();
      },
    },
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    config,
  };
}

export function withResolvedConfig(context: CliRuntimeContext | undefined, config: SpaceMoltConfig): CliRuntimeContext {
  return {
    ...(context ?? createDefaultCliRuntimeContext()),
    config,
  };
}

export async function withCliWriter<T>(writer: CliWriter, fn: () => Promise<T> | T): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWrite = process.stdout.write;

  console.log = (...args: unknown[]) => {
    writer.out(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    writer.err(args.map(String).join(' '));
  };
  process.stdout.write = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void,
  ) => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    if (writer.writeOut) writer.writeOut(text);
    else writer.out(text);

    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (cb) cb();
    return true;
  }) as typeof process.stdout.write;

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalWrite;
  }
}
