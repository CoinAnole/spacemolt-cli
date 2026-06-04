import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliWriter } from './cli-context.ts';
import { buildCommandRegistrySnapshot } from './command-registry.ts';
import { COMMANDS, routeSignature, routeToPath, V2_TOOL_MAP } from './commands.ts';
import { GENERATED_API_ROUTES } from './generated/api-commands.ts';
import { defaultOpenApiCacheDir, loadCachedGeneratedRoutes } from './openapi-cache.ts';
import { colorsForPlain } from './output-style.ts';
import { trimTrailingSlash } from './response.ts';
import { API_BASE, type SpaceMoltConfig, VERSION } from './runtime.ts';
import { ACTIVE_PROFILE, getDefaultProfile, SessionManager, tryGetSessionPath } from './session.ts';
import { requestJson } from './transport.ts';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
  detail?: string;
}

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
  cachedOpenApiRoutes: number;
  dynamicCommands: number;
}

function pass(name: string, message: string, detail?: string): DoctorCheck {
  return { name, ok: true, message, detail };
}

function fail(name: string, message: string, detail?: string): DoctorCheck {
  return { name, ok: false, message, detail };
}

export async function runDoctor(config?: SpaceMoltConfig, env: NodeJS.ProcessEnv = process.env): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  let cachedOpenApiRoutes = 0;
  let dynamicCommands = 0;

  const apiBase = config?.apiBase || API_BASE;
  const profile = config ? config.profile : ACTIVE_PROFILE;
  const defaultProfile = getDefaultProfile(undefined, undefined, env);
  const sessionPath = tryGetSessionPath(config, env);

  const sessionStore = new SessionManager({
    apiBase,
    profile,
    debug: config?.debug,
    env,
  });

  try {
    const resp = await requestJson(`${trimTrailingSlash(apiBase)}/session`, {
      method: 'GET',
      timeoutMs: 5000,
    });
    checks.push(pass('api', `reachable (HTTP ${resp.status})`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push(fail('api', 'unreachable', msg));
  }

  try {
    if (!sessionPath) {
      checks.push(
        pass(
          'session',
          'not initialized',
          'No default profile set. Run login, use --profile or SPACEMOLT_PROFILE, or run "spacemolt profile default <name>".',
        ),
      );
    } else {
      const exists = fs.existsSync(sessionPath);
      checks.push(exists ? pass('session', sessionPath) : pass('session', sessionPath, 'file does not exist yet'));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push(fail('session', 'error resolving path', msg));
  }

  const profileMessage = profile
    ? `Active profile: ${profile}`
    : defaultProfile
      ? `Default profile: ${defaultProfile}`
      : 'No default profile set.';
  checks.push(pass('profile', profileMessage));

  try {
    const session = sessionPath ? await sessionStore.loadSession() : null;
    if (!session) {
      checks.push(pass('auth', 'no session (run login or register)'));
    } else if (session.player_id) {
      checks.push(pass('auth', `player ${session.player_id}`));
    } else if (session.username) {
      checks.push(pass('auth', `username ${session.username}`, 'not authenticated'));
    } else {
      checks.push(pass('auth', 'session exists but no credentials'));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push(fail('auth', 'error loading session', msg));
  }

  checks.push(pass('version', `v${VERSION}`));

  try {
    const cachedRoutes = loadCachedGeneratedRoutes(defaultOpenApiCacheDir(env));
    cachedOpenApiRoutes = cachedRoutes ? Object.keys(cachedRoutes).length : 0;
    if (cachedRoutes) {
      const registry = buildCommandRegistrySnapshot({
        generatedRoutes: { ...(GENERATED_API_ROUTES as typeof cachedRoutes), ...cachedRoutes },
        dynamicGeneratedRoutes: cachedRoutes,
        includeDynamic: true,
      });
      const cachedRouteSignatures = new Set(Object.keys(cachedRoutes));
      const curatedRouteSignatures = new Set(Object.values(COMMANDS).map((command) => routeSignature(command.route)));
      dynamicCommands = Object.values(registry.commands).filter((command) => {
        const signature = routeSignature(command.route);
        return cachedRouteSignatures.has(signature) && !curatedRouteSignatures.has(signature);
      }).length;
    }

    checks.push(
      pass(
        'openapi-cache',
        `${cachedOpenApiRoutes} cached OpenAPI ${cachedOpenApiRoutes === 1 ? 'route' : 'routes'}`,
        `${dynamicCommands} dynamic ${dynamicCommands === 1 ? 'command' : 'commands'}`,
      ),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push(fail('openapi-cache', 'error reading cached OpenAPI metadata', msg));
  }

  try {
    const specPath = path.join(import.meta.dir, '..', 'spacemolt-docs', 'openapi.json');
    if (!fs.existsSync(specPath)) {
      checks.push(pass('drift', 'skipped (no local OpenAPI spec)'));
    } else {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as {
        paths: Record<string, { get?: unknown; post?: unknown }>;
      };

      const clientCommands = new Set(Object.keys(COMMANDS));
      const v2ToolMap = Object.fromEntries(
        Object.entries(V2_TOOL_MAP).map(([command, mapping]) => [
          command,
          { route: routeToPath(mapping, { includeApiPrefix: true }), method: mapping.method || 'POST' },
        ]),
      );

      const v2Routes = new Set(
        Object.entries(spec.paths).flatMap(([route, methods]) => {
          const routes: string[] = [];
          if (methods.get) routes.push(`GET ${route}`);
          if (methods.post) routes.push(`POST ${route}`);
          return routes;
        }),
      );

      const staleMappings = Object.entries(v2ToolMap)
        .filter(([, mapping]) => !v2Routes.has(`${mapping.method} ${mapping.route}`))
        .map(([command, mapping]) => `${command} -> ${mapping.method} ${mapping.route}`);

      const mappedRoutes = new Set(Object.values(v2ToolMap).map((m) => `${m.method} ${m.route}`));
      const SPEC_ROUTES_COVERED_BY_ALIASES = new Set(['GET /api/v2/notifications']);

      const unmappedSpecRoutes = [...v2Routes]
        .filter((route) => !route.endsWith('/help'))
        .filter((route) => !SPEC_ROUTES_COVERED_BY_ALIASES.has(route))
        .filter((route) => !mappedRoutes.has(route));

      const unmappedCommands = [...clientCommands].filter((cmd) => !(cmd in V2_TOOL_MAP));

      if (staleMappings.length === 0 && unmappedSpecRoutes.length === 0 && unmappedCommands.length === 0) {
        checks.push(
          pass(
            'drift',
            'no drift detected',
            `spec has ${v2Routes.size} routes, client has ${clientCommands.size} commands`,
          ),
        );
      } else {
        const detail = [
          staleMappings.length > 0 ? `${staleMappings.length} stale mappings` : '',
          unmappedSpecRoutes.length > 0 ? `${unmappedSpecRoutes.length} unmapped spec routes` : '',
          unmappedCommands.length > 0 ? `${unmappedCommands.length} unmapped commands` : '',
        ]
          .filter(Boolean)
          .join(', ');
        let fullDetail = detail;
        if (staleMappings.length > 0) fullDetail += `\nStale: ${staleMappings.join(', ')}`;
        if (unmappedSpecRoutes.length > 0) fullDetail += `\nUnmapped routes: ${unmappedSpecRoutes.join(', ')}`;
        if (unmappedCommands.length > 0) fullDetail += `\nUnmapped commands: ${unmappedCommands.join(', ')}`;
        checks.push(fail('drift', detail, fullDetail));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push(fail('drift', 'error checking drift', msg));
  }

  const ok = checks.every((check) => check.ok);
  return { ok, checks, cachedOpenApiRoutes, dynamicCommands };
}

export function printDoctorResult(result: DoctorResult, writer?: CliWriter, options?: { plain?: boolean }): void {
  const out = writer?.out.bind(writer) ?? console.log;
  const c = colorsForPlain(Boolean(options?.plain));
  out(`${c.bright}SpaceMolt Doctor${c.reset}\n`);
  for (const check of result.checks) {
    const icon = check.ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    const status = check.message ? ` ${c.dim}${check.message}${c.reset}` : '';
    out(`  ${icon} ${check.name}${status}`);
    if (check.detail) {
      for (const line of check.detail.split('\n')) {
        out(`      ${c.dim}${line}${c.reset}`);
      }
    }
  }
  out('');
  if (result.ok) {
    out(`${c.green}All checks passed.${c.reset}`);
  } else {
    const failed = result.checks.filter((check) => !check.ok).length;
    out(`${c.red}${failed} check(s) failed.${c.reset}`);
  }
}
