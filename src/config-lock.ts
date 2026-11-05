import * as fs from 'node:fs';
import { lockOwnerAlive } from './advisory-lock.ts';

const LOCK_MODE = 0o600;
const CONFIG_LOCK_RETRY_MS = 10;
const CONFIG_LOCK_TIMEOUT_MS = 2_000;
const CONFIG_LOCK_STALE_MS = 30_000;
/**
 * `config.json.lock`, then `.break`, then `.break.break`. A busy lease past this
 * waits out the acquire timeout. Recovering it would need another lease whose
 * crash has the same shape.
 */
const MAX_CLAIM_DEPTH = 3;
const CONFIG_LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));

declare const lockTokenBrand: unique symbol;

/** Exact bytes this process wrote with `wx`: `${pid} ${nonce}\n`. */
type LockToken = string & { readonly [lockTokenBrand]: true };

/**
 * Only `unparsable` carries an age. A running pid has nothing to time out.
 * `exited` is for that body. A later process given the same pid writes a new nonce.
 */
type LockOwner = { kind: 'running' } | { kind: 'exited' } | { kind: 'unparsable'; ageMs: number };

type OwnerLook = LockOwner | 'gone' | 'error';

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

function mintLockToken(): LockToken {
  return `${process.pid} ${Date.now().toString(16)}${Math.random().toString(16).slice(2)}\n` as LockToken;
}

/**
 * Creates `target` and writes a token no other publish can repeat.
 * `undefined` means the name is already there. A failed write leaves the file:
 * it is empty or partial, and the next look treats it as a body with no pid.
 */
function publishFresh(target: string): LockToken | undefined {
  const token = mintLockToken();
  let fd: number;
  try {
    fd = fs.openSync(target, 'wx', LOCK_MODE);
  } catch (error) {
    if (isErrno(error, 'EEXIST')) return undefined;
    throw error;
  }
  try {
    fs.writeFileSync(fd, token, 'utf-8');
    fs.fsyncSync(fd);
    return token;
  } finally {
    fs.closeSync(fd);
  }
}

/** Unlinks `target` only when it still holds `token`. A missing file is success. */
function dropOwn(target: string, token: LockToken): void {
  let current: string;
  try {
    current = fs.readFileSync(target, 'utf-8');
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return;
    throw error;
  }
  if (current !== token) return;
  try {
    fs.unlinkSync(target);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return;
    throw error;
  }
}

function readOwner(target: string, body: string): OwnerLook {
  const alive = lockOwnerAlive(Number.parseInt(body, 10));
  if (alive === true) return { kind: 'running' };
  if (alive === false) {
    try {
      fs.statSync(target);
      return { kind: 'exited' };
    } catch (error) {
      return isErrno(error, 'ENOENT') ? 'gone' : 'error';
    }
  }
  try {
    const ageMs = Date.now() - fs.statSync(target).mtimeMs;
    return { kind: 'unparsable', ageMs };
  } catch (error) {
    return isErrno(error, 'ENOENT') ? 'gone' : 'error';
  }
}

/** A running pid is kept at any age. A dead numeric pid is removed at once. A body with no pid waits 30 seconds. */
function abandoned(owner: LockOwner): boolean {
  if (owner.kind === 'running') return false;
  if (owner.kind === 'exited') return true;
  return owner.ageMs >= CONFIG_LOCK_STALE_MS;
}

/**
 * Removes `target` only while this process holds `${target}.break`, and only
 * after a second read still returns the body it judged. The nonce makes a
 * reused pid fail that read. The lease is why a second saver is not also
 * between that read and `unlink`. For a body with no pid, the second read
 * also checks the age again, so a new empty file does not match an old one.
 * Those two calls stay separate. The nonce does not join them.
 */
function removeIfAbandoned(target: string, depth: number): 'retry-now' | 'wait' {
  let observed: string;
  try {
    observed = fs.readFileSync(target, 'utf-8');
  } catch (error) {
    return isErrno(error, 'ENOENT') ? 'retry-now' : 'wait';
  }

  const owner = readOwner(target, observed);
  if (owner === 'gone') return 'retry-now';
  if (owner === 'error' || !abandoned(owner)) return 'wait';

  const claimPath = `${target}.break`;
  let claim: LockToken | undefined;
  try {
    claim = publishFresh(claimPath);
  } catch {
    return 'wait';
  }
  if (claim === undefined) {
    if (depth + 1 >= MAX_CLAIM_DEPTH) return 'wait';
    return removeIfAbandoned(claimPath, depth + 1);
  }

  try {
    let still: string;
    try {
      still = fs.readFileSync(target, 'utf-8');
    } catch (error) {
      return isErrno(error, 'ENOENT') ? 'retry-now' : 'wait';
    }
    if (still !== observed) return 'wait';
    if (owner.kind === 'unparsable') {
      const again = readOwner(target, still);
      if (again === 'gone') return 'retry-now';
      if (again === 'error' || !abandoned(again)) return 'wait';
    }
    try {
      fs.unlinkSync(target);
    } catch (error) {
      return isErrno(error, 'ENOENT') ? 'retry-now' : 'wait';
    }
    return 'retry-now';
  } finally {
    try {
      dropOwn(claimPath, claim);
    } catch {
      /* this process is alive, so the claim stays until it exits */
    }
  }
}

function acquire(lockPath: string, configPath: string): LockToken {
  const deadline = Date.now() + CONFIG_LOCK_TIMEOUT_MS;
  while (true) {
    const token = publishFresh(lockPath);
    if (token !== undefined) return token;
    if (removeIfAbandoned(lockPath, 0) === 'retry-now') continue;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting to update CLI configuration at ${configPath}.`);
    }
    Atomics.wait(CONFIG_LOCK_SLEEP, 0, 0, CONFIG_LOCK_RETRY_MS);
  }
}

/**
 * Runs `critical` while this process holds `${configPath}.lock`.
 * Synchronous. The directory must already exist.
 */
export function withConfigLock<T>(configPath: string, critical: () => T): T {
  const lockPath = `${configPath}.lock`;
  const token = acquire(lockPath, configPath);
  try {
    return critical();
  } finally {
    dropOwn(lockPath, token);
  }
}
