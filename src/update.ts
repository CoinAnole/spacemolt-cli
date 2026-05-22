import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CliClock, CliEnv, CliWriter } from './cli-context.ts';
import { c, DEBUG, GITHUB_REPO, UPDATE_CHECK_INTERVAL_MS, VERSION } from './runtime.ts';
import { getSpacemoltHome } from './session.ts';
import { requestJson } from './transport.ts';
import type { JsonResponse } from './types.ts';

// =============================================================================

const UPDATE_NOTIFY_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours between update notifications

export interface UpdateCheckCache {
  checked_at: string;
  latest_version: string;
  notified_at?: string; // when we last showed the update notice
  notified_version?: string; // which version we last notified about
}

export interface UpdateCheckOptions {
  env?: CliEnv;
  clock?: CliClock;
  cachePath?: string;
  transport?: (
    url: string,
    options: { headers: Record<string, string>; timeoutMs: number },
  ) => Promise<JsonResponse<{ tag_name: string }>>;
  writer?: CliWriter;
  version?: string;
  repo?: string;
  debug?: boolean;
}

export function getUpdateCachePath(): string {
  return path.join(getSpacemoltHome(), 'update-check.json');
}

export async function loadUpdateCache(cachePath = getUpdateCachePath()): Promise<UpdateCheckCache | null> {
  try {
    const file = Bun.file(cachePath);
    if (await file.exists()) return await file.json();
  } catch {
    /* no cache */
  }
  return null;
}

export async function saveUpdateCache(cache: UpdateCheckCache, cachePath = getUpdateCachePath()): Promise<void> {
  const parentDir = path.dirname(cachePath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
  await Bun.write(cachePath, JSON.stringify(cache, null, 2));
}

export function compareVersions(current: string, latest: string): number {
  const currentParts = current.replace(/^v/, '').split('.').map(Number);
  const latestParts = latest.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const curr = currentParts[i] || 0;
    const lat = latestParts[i] || 0;
    if (lat > curr) return 1; // latest is newer
    if (lat < curr) return -1; // current is newer
  }
  return 0; // equal
}

export async function checkForUpdates(options: UpdateCheckOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const clock = options.clock ?? { now: () => new Date() };
  const cachePath = options.cachePath ?? getUpdateCachePath();
  const transport = options.transport ?? requestJson<{ tag_name: string }>;
  const writer = options.writer ?? {
    out(message = '') {
      console.log(message);
    },
    err() {},
  };
  const version = options.version ?? VERSION;
  const repo = options.repo ?? GITHUB_REPO;
  const debug = options.debug ?? DEBUG;

  // Skip update check by default unless explicitly enabled
  if (env.SPACEMOLT_UPDATE_CHECK !== 'true') return;

  try {
    // Check cache to avoid spamming GitHub API
    let cache = await loadUpdateCache(cachePath);
    let latestVersion: string | null = null;

    if (cache) {
      const lastCheck = new Date(cache.checked_at).getTime();
      if (clock.now().getTime() - lastCheck < UPDATE_CHECK_INTERVAL_MS) {
        // Use cached result
        latestVersion = cache.latest_version;
      }
    }

    // Fetch from GitHub if cache is stale or missing
    if (!latestVersion) {
      const response = await transport(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'SpaceMolt-Client' },
        timeoutMs: 3000,
      });

      if (!response.ok) {
        if (debug) writer.out(`${c.dim}[DEBUG] Update check failed: HTTP ${response.status}${c.reset}`);
        return;
      }

      latestVersion = response.data.tag_name.replace(/^v/, '');

      // Update cache with fresh check time
      cache = { ...cache, checked_at: clock.now().toISOString(), latest_version: latestVersion } as UpdateCheckCache;
      await saveUpdateCache(cache, cachePath);
    }

    // Check if update is available
    if (compareVersions(version, latestVersion) <= 0) return;

    // Only show notification if we haven't recently notified about this version
    const isNewVersion = cache?.notified_version !== latestVersion;
    const lastNotified = cache?.notified_at ? new Date(cache.notified_at).getTime() : 0;
    const notifyExpired = clock.now().getTime() - lastNotified > UPDATE_NOTIFY_INTERVAL_MS;

    if (isNewVersion || notifyExpired) {
      printUpdateNotice(latestVersion, writer, version, repo);
      if (cache) {
        await saveUpdateCache(
          {
            ...cache,
            notified_at: clock.now().toISOString(),
            notified_version: latestVersion,
          },
          cachePath,
        );
      }
    }
  } catch (error) {
    // Silently ignore update check failures - don't disrupt the user's workflow
    if (debug) {
      const msg = error instanceof Error ? error.message : String(error);
      writer.out(`${c.dim}[DEBUG] Update check failed: ${msg}${c.reset}`);
    }
  }
}

export function printUpdateNotice(
  latestVersion: string,
  writer?: CliWriter,
  currentVersion = VERSION,
  repo = GITHUB_REPO,
): void {
  const out = writer?.out.bind(writer) ?? console.log;
  out(`${c.yellow}╭─────────────────────────────────────────────────────────────╮${c.reset}`);
  out(
    `${c.yellow}│${c.reset}  ${c.bright}Update available!${c.reset} ${c.dim}v${currentVersion}${c.reset} → ${c.green}v${latestVersion}${c.reset}                        ${c.yellow}│${c.reset}`,
  );
  out(
    `${c.yellow}│${c.reset}  Run: ${c.cyan}curl -fsSL https://spacemolt.com/install.sh | bash${c.reset}  ${c.yellow}│${c.reset}`,
  );
  out(
    `${c.yellow}│${c.reset}  Or download from: ${c.cyan}https://github.com/${repo}/releases${c.reset}   ${c.yellow}│${c.reset}`,
  );
  out(`${c.yellow}╰─────────────────────────────────────────────────────────────╯${c.reset}`);
  out('');
}
