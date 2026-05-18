import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMMANDS, routeToPath, V2_TOOL_MAP } from './commands.ts';
import { trimTrailingSlash } from './response.ts';
import { API_BASE, c, VERSION } from './runtime.ts';
import { ACTIVE_PROFILE, getSessionPath, loadSession } from './session.ts';
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
}

function pass(name: string, message: string, detail?: string): DoctorCheck {
  return { name, ok: true, message, detail };
}

function fail(name: string, message: string, detail?: string): DoctorCheck {
  return { name, ok: false, message, detail };
}

export async function runDoctor(): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  try {
    const resp = await requestJson(`${trimTrailingSlash(API_BASE)}/session`, {
      method: 'GET',
      timeoutMs: 5000,
    });
    checks.push(pass('api', `reachable (HTTP ${resp.status})`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push(fail('api', 'unreachable', msg));
  }

  try {
    const sessionPath = getSessionPath();
    const exists = fs.existsSync(sessionPath);
    checks.push(exists ? pass('session', sessionPath) : pass('session', sessionPath, 'file does not exist yet'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push(fail('session', 'error resolving path', msg));
  }

  checks.push(pass('profile', ACTIVE_PROFILE || 'default'));

  try {
    const session = await loadSession();
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
  return { ok, checks };
}

export function printDoctorResult(result: DoctorResult): void {
  console.log(`${c.bright}SpaceMolt Doctor${c.reset}\n`);
  for (const check of result.checks) {
    const icon = check.ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    const status = check.ok ? '' : ` ${c.dim}${check.message}${c.reset}`;
    console.log(`  ${icon} ${check.name}${status}`);
    if (check.detail && !check.ok) {
      for (const line of check.detail.split('\n')) {
        console.log(`      ${c.dim}${line}${c.reset}`);
      }
    }
  }
  console.log('');
  if (result.ok) {
    console.log(`${c.green}All checks passed.${c.reset}`);
  } else {
    const failed = result.checks.filter((check) => !check.ok).length;
    console.log(`${c.red}${failed} check(s) failed.${c.reset}`);
  }
}
