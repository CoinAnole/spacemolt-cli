import * as fs from 'node:fs';

const LOCK_MODE = 0o600;

let clkTckCache: number | undefined;
let clkTckCached = false;

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

export function staleAdvisoryLockDecision(args: {
  observed: string;
  still: string;
  ownerAlive: boolean | undefined;
  processStartedAfterLock: boolean;
  ageMs: number;
  staleMs: number;
}): 'keep' | 'remove' {
  if (args.still !== args.observed) return 'keep';
  if (args.ownerAlive === true && !args.processStartedAfterLock && args.ageMs < args.staleMs) return 'keep';
  if (args.ownerAlive === undefined && args.ageMs < args.staleMs) return 'keep';
  return 'remove';
}

/** Field 22 of /proc/<pid>/stat. comm may contain ')' and spaces. */
export function procStatStartTicks(statLine: string): number | undefined {
  const close = statLine.lastIndexOf(')');
  if (close < 0) return undefined;
  const token = statLine
    .slice(close + 1)
    .trim()
    .split(/\s+/)[19];
  if (token === undefined) return undefined;
  const value = Number(token);
  return Number.isFinite(value) ? value : undefined;
}

export function processStartedAfterLock(args: {
  statLine: string;
  btimeSec: number;
  clkTck: number;
  mtimeMs: number;
}): boolean {
  if (!Number.isFinite(args.btimeSec) || !Number.isFinite(args.clkTck) || args.clkTck <= 0) return false;
  if (!Number.isFinite(args.mtimeMs)) return false;
  const starttime = procStatStartTicks(args.statLine);
  if (starttime === undefined) return false;
  return (args.btimeSec + starttime / args.clkTck) * 1000 > args.mtimeMs;
}

export function lockOwnerAlive(pid: number): boolean | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrno(error, 'ESRCH')) return false;
    return true;
  }
}

function readClkTck(): number | undefined {
  if (clkTckCached) return clkTckCache;
  clkTckCached = true;
  try {
    const result = Bun.spawnSync(['getconf', 'CLK_TCK'], { stdout: 'pipe', stderr: 'pipe' });
    if (result.exitCode !== 0) return undefined;
    const value = Number(result.stdout.toString().trim());
    if (!Number.isFinite(value) || value <= 0) return undefined;
    clkTckCache = value;
    return value;
  } catch {
    return undefined;
  }
}

function readBtimeSec(): number | undefined {
  const text = fs.readFileSync('/proc/stat', 'utf8');
  const match = /^btime\s+(\d+)/m.exec(text);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function processStartedAfterLockForPid(pid: number, mtimeMs: number): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const statLine = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const btimeSec = readBtimeSec();
    const clkTck = readClkTck();
    if (btimeSec === undefined || clkTck === undefined) return false;
    return processStartedAfterLock({ statLine, btimeSec, clkTck, mtimeMs });
  } catch {
    return false;
  }
}

function removeStaleAdvisoryLock(lockPath: string, staleMs: number): boolean {
  let observed: string;
  try {
    observed = fs.readFileSync(lockPath, 'utf8');
  } catch (error) {
    return isErrno(error, 'ENOENT');
  }

  const pid = Number.parseInt(observed, 10);
  const ownerAlive = lockOwnerAlive(pid);
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(lockPath).mtimeMs;
  } catch (error) {
    return isErrno(error, 'ENOENT');
  }
  const startedAfter = ownerAlive === true ? processStartedAfterLockForPid(pid, mtimeMs) : false;

  try {
    const still = fs.readFileSync(lockPath, 'utf8');
    if (
      staleAdvisoryLockDecision({
        observed,
        still,
        ownerAlive,
        processStartedAfterLock: startedAfter,
        ageMs: Date.now() - mtimeMs,
        staleMs,
      }) !== 'remove'
    ) {
      return false;
    }
    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    return isErrno(error, 'ENOENT');
  }
}

async function publishLock(lockPath: string, token: string): Promise<void> {
  const handle = await fs.promises.open(lockPath, 'wx', LOCK_MODE);
  let published = false;
  let failure: unknown;
  try {
    await handle.writeFile(token, 'utf8');
    await handle.sync();
    published = true;
  } catch (error) {
    failure = error;
  } finally {
    await handle.close().catch((error: unknown) => {
      if (failure === undefined) failure = error;
    });
  }
  if (!published) {
    try {
      fs.unlinkSync(lockPath);
    } catch (error) {
      if (!isErrno(error, 'ENOENT')) throw error;
    }
  }
  if (failure !== undefined) throw failure;
}

function releaseLock(lockPath: string, token: string): void {
  let current: string;
  try {
    current = fs.readFileSync(lockPath, 'utf8');
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return;
    throw error;
  }
  if (current !== token) return;
  try {
    fs.unlinkSync(lockPath);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return;
    throw error;
  }
}

export async function acquireAdvisoryLock(
  lockPath: string,
  options: { timeoutMs: number; retryMs: number; staleMs: number; timeoutError: string },
): Promise<() => Promise<void>> {
  const deadline = Date.now() + options.timeoutMs;
  while (true) {
    const token = `${process.pid} ${Date.now().toString(16)}${Math.random().toString(16).slice(2)}\n`;
    try {
      await publishLock(lockPath, token);
      return async () => {
        releaseLock(lockPath, token);
      };
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) throw error;
      if (removeStaleAdvisoryLock(lockPath, options.staleMs)) continue;
      if (Date.now() >= deadline) throw new Error(options.timeoutError);
      await Bun.sleep(options.retryMs);
    }
  }
}
