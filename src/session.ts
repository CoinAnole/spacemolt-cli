import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getObjectResult, getStructuredResult, isRecord, trimTrailingSlash } from './response.ts';
import { API_BASE, c, DEBUG, VERSION } from './runtime.ts';
import { requestJson } from './transport.ts';
import type { APIResponse, Session } from './types.ts';

export let ACTIVE_PROFILE: string | undefined;
const SESSION_FILE_MODE = 0o600;
const SESSION_DIR_MODE = 0o700;
type EnvLike = Record<string, string | undefined>;

export function getSpacemoltHome(
  homeDir = os.homedir(),
  platform: string = process.platform,
  env: EnvLike = process.env,
): string {
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support', 'spacemolt-cli');
  if (platform === 'win32') {
    return path.win32.join(env.APPDATA || path.win32.join(homeDir, 'AppData', 'Roaming'), 'spacemolt-cli');
  }
  const configHome = env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
  return path.join(configHome, 'spacemolt-cli');
}

export interface CliConfig {
  defaultProfile?: string;
  [key: string]: unknown;
}

export function getCliConfigPath(homeDir?: string, platform?: string, env?: EnvLike): string {
  return path.join(getSpacemoltHome(homeDir, platform, env), 'config.json');
}

export function validateProfileName(profile: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) {
    throw new Error('Profile names may only contain letters, numbers, dots, dashes, and underscores.');
  }
  return profile;
}

export function profileNameForUsername(username: string): string {
  try {
    return validateProfileName(username);
  } catch {
    return validateProfileName(`user_${Buffer.from(username, 'utf-8').toString('base64url')}`);
  }
}

interface ProfileSessionSummary {
  name: string;
  username?: string;
  playerId?: string;
  isDefault?: boolean;
}

export function getProfileSessionsDir(homeDir?: string, platform?: string, env?: EnvLike): string {
  return path.join(getSpacemoltHome(homeDir, platform, env), 'sessions');
}

export function listProfileSessions(homeDir?: string, platform?: string, env?: EnvLike): ProfileSessionSummary[] {
  const sessionsDir = getProfileSessionsDir(homeDir, platform, env);
  const defaultProfile = getDefaultProfile(homeDir, platform, env);
  try {
    return fs
      .readdirSync(sessionsDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          !entry.name.endsWith('_state.json') &&
          !entry.name.endsWith('.ids.json'),
      )
      .map((entry) => {
        const name = path.basename(entry.name, '.json');
        try {
          const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, entry.name), 'utf-8'));
          return {
            name,
            username: typeof session.username === 'string' ? session.username : undefined,
            playerId: typeof session.player_id === 'string' ? session.player_id : undefined,
            isDefault: name === defaultProfile,
          };
        } catch {
          return { name, isDefault: name === defaultProfile };
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function showProfiles(homeDir?: string, platform?: string, env?: EnvLike): void {
  const profiles = listProfileSessions(homeDir, platform, env);
  if (!profiles.length) {
    console.log(`No profiles found in ${getProfileSessionsDir(homeDir, platform, env)}.`);
    return;
  }

  console.log(`${c.bright}Profiles${c.reset}`);
  for (const profile of profiles) {
    const marker = profile.isDefault ? '* ' : '  ';
    console.log(`${marker}${profile.name}`);
  }
}

export function getSessionPath(config?: { profile?: string }, env?: EnvLike): string {
  if (config) {
    const manager = new SessionManager({
      profile: config.profile,
      env,
    });
    return manager.getSessionPath();
  }
  return new SessionManager({ env }).getSessionPath();
}

export function tryGetSessionPath(config?: { profile?: string }, env?: EnvLike): string | undefined {
  try {
    return getSessionPath(config, env);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('No default profile set.')) return undefined;
    throw err;
  }
}

export function hardenPermissions(targetPath: string, mode: number): void {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(targetPath, mode);
  } catch {
    /* best effort */
  }
}

export function loadCliConfig(homeDir?: string, platform?: string, env?: EnvLike): CliConfig {
  try {
    const config = JSON.parse(fs.readFileSync(getCliConfigPath(homeDir, platform, env), 'utf-8'));
    if (!isRecord(config)) return {};
    if (config.defaultProfile === undefined) return { ...config };
    if (typeof config.defaultProfile !== 'string') return {};
    return { ...config, defaultProfile: validateProfileName(config.defaultProfile) };
  } catch {
    return {};
  }
}

export function saveCliConfig(config: CliConfig, homeDir?: string, platform?: string, env?: EnvLike): void {
  const configPath = getCliConfigPath(homeDir, platform, env);
  const parentDir = path.dirname(configPath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true, mode: SESSION_DIR_MODE });
  hardenPermissions(parentDir, SESSION_DIR_MODE);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: SESSION_FILE_MODE,
  });
  hardenPermissions(configPath, SESSION_FILE_MODE);
}

export function getDefaultProfile(homeDir?: string, platform?: string, env?: EnvLike): string | undefined {
  return loadCliConfig(homeDir, platform, env).defaultProfile;
}

export function setDefaultProfile(profile: string, homeDir?: string, platform?: string, env?: EnvLike): void {
  saveCliConfig(
    { ...loadCliConfig(homeDir, platform, env), defaultProfile: validateProfileName(profile) },
    homeDir,
    platform,
    env,
  );
}

export function showDefaultProfile(
  writer?: { out(message: string): void },
  homeDir?: string,
  platform?: string,
  env?: EnvLike,
): void {
  const defaultProfile = getDefaultProfile(homeDir, platform, env);
  const message = defaultProfile ? `Default profile: ${defaultProfile}` : 'No default profile set.';
  if (writer) writer.out(message);
  else console.log(message);
}

export interface SessionManagerOptions {
  apiBase?: string;
  profile?: string;
  profileIsExplicit?: boolean;
  debug?: boolean;
  transport?: typeof requestJson;
  clock?: () => number;
  env?: EnvLike;
}

export class SessionManager {
  private readonly _apiBase?: string;
  private readonly _profile?: string;
  private readonly _profileIsExplicit: boolean;
  private readonly _debug?: boolean;
  private readonly _transport: typeof requestJson;
  private readonly _clock: () => number;
  private readonly _env: EnvLike;

  constructor(options: SessionManagerOptions = {}) {
    this._apiBase = options.apiBase;
    this._profile = options.profile;
    this._profileIsExplicit = Boolean(options.profileIsExplicit);
    this._debug = options.debug;
    this._transport = options.transport ?? requestJson;
    this._clock = options.clock ?? Date.now;
    this._env = options.env ?? process.env;
  }

  get apiBase(): string {
    return this._apiBase ?? API_BASE;
  }

  get profile(): string | undefined {
    return this._profile ?? ACTIVE_PROFILE;
  }

  get debug(): boolean {
    return this._debug ?? DEBUG;
  }

  getSessionPath(profileOverride?: string): string {
    const profile = this.effectiveProfile(profileOverride);
    if (!profile) {
      throw new Error('No default profile set. Run "spacemolt login <username> <password>" or use "--profile <name>".');
    }
    return path.join(
      getSpacemoltHome(undefined, undefined, this._env),
      'sessions',
      `${validateProfileName(profile)}.json`,
    );
  }

  private effectiveProfile(profileOverride?: string): string | undefined {
    const selectedProfile = this.profile;
    return this._profileIsExplicit
      ? (selectedProfile ?? profileOverride ?? getDefaultProfile(undefined, undefined, this._env))
      : (profileOverride ?? selectedProfile ?? getDefaultProfile(undefined, undefined, this._env));
  }

  async loadSession(profileOverride?: string): Promise<Session | null> {
    const sessionPath = this.getSessionPath(profileOverride);
    try {
      const file = Bun.file(sessionPath);
      if (await file.exists()) hardenPermissions(sessionPath, SESSION_FILE_MODE);
      if (await file.exists()) return await file.json();
    } catch {
      /* no session */
    }
    return null;
  }

  async saveSession(session: Session, profileOverride?: string): Promise<void> {
    const sessionPath = this.getSessionPath(profileOverride);
    const parentDir = path.dirname(sessionPath);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true, mode: SESSION_DIR_MODE });
    hardenPermissions(parentDir, SESSION_DIR_MODE);

    const tmpPath = path.join(
      parentDir,
      `.${path.basename(sessionPath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
    );
    const contents = `${JSON.stringify(session, null, 2)}\n`;

    try {
      const handle = await fs.promises.open(tmpPath, 'wx', SESSION_FILE_MODE);
      try {
        await handle.writeFile(contents, 'utf-8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      hardenPermissions(tmpPath, SESSION_FILE_MODE);
      await fs.promises.rename(tmpPath, sessionPath);
      hardenPermissions(sessionPath, SESSION_FILE_MODE);
    } catch (err) {
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        /* best effort */
      }
      throw err;
    }
  }

  async createSession(profileOverride?: string): Promise<Session> {
    if (this.debug) console.log(`${c.dim}[DEBUG] Creating new session...${c.reset}`);
    const response = await this._transport<APIResponse>(`${trimTrailingSlash(this.apiBase)}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `SpaceMolt-Client/${VERSION}` },
    });
    const data = response.data;
    if (data.error) throw new Error(`Failed to create session: ${data.error.message}`);
    if (!data.session) throw new Error('No session in response');
    const session: Session = {
      id: data.session.id,
      created_at: data.session.created_at,
      expires_at: data.session.expires_at,
    };
    await this.saveSession(session, profileOverride);
    return session;
  }

  isSessionExpired(session: Session): boolean {
    return this._clock() > new Date(session.expires_at).getTime() - 60000;
  }

  async getSession(profileOverride?: string): Promise<Session> {
    const session = await this.loadSession(profileOverride);
    return !session || this.isSessionExpired(session) ? this.createSession(profileOverride) : session;
  }

  ensureDefaultProfile(profile?: string): void {
    if (getDefaultProfile(undefined, undefined, this._env)) return;
    const effectiveProfile = this.effectiveProfile(profile);
    if (!effectiveProfile) return;
    setDefaultProfile(effectiveProfile, undefined, undefined, this._env);
  }

  async authenticateProfileSession(session: Session): Promise<APIResponse | null> {
    const profName = this.effectiveProfile();
    if (!profName || !session.username || !session.password || session.player_id) return null;

    if (this.debug)
      console.log(`${c.dim}[DEBUG] Authenticating profile ${profName} as ${session.username}...${c.reset}`);
    const response = await this._transport<APIResponse>(`${trimTrailingSlash(this.apiBase)}/spacemolt_auth/login`, {
      method: 'POST',
      sessionId: session.id,
      payload: { username: session.username, password: session.password },
    });
    const data = response.data;
    if (data.error) return data;

    if (data.session) {
      session.expires_at = data.session.expires_at;
      if (data.session.player_id) session.player_id = data.session.player_id;
    }
    const playerId = extractPlayerId(data);
    if (playerId) session.player_id = playerId;
    await this.saveSession(session);
    return null;
  }
}

const legacySessionManager = new SessionManager();

export async function loadSession(): Promise<Session | null> {
  return legacySessionManager.loadSession();
}

export function extractPlayerId(response: APIResponse): string | undefined {
  const structured = getStructuredResult(response);
  const result = getObjectResult(response);
  const resultRecord = structured || result;
  const player = isRecord(resultRecord?.player) ? resultRecord.player : undefined;
  return typeof player?.id === 'string'
    ? player.id
    : typeof resultRecord?.player_id === 'string'
      ? resultRecord.player_id
      : response.session?.player_id;
}

export function setActiveProfile(profile: string | undefined): void {
  ACTIVE_PROFILE = profile;
}
