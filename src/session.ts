import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getObjectResult, getStructuredResult, isRecord, trimTrailingSlash } from './response.ts';
import { API_BASE, c, DEBUG, VERSION } from './runtime.ts';
import { requestJson } from './transport.ts';
import type { APIResponse, CredentialProfile, Session } from './types.ts';

export let ACTIVE_PROFILE: string | undefined;
const SESSION_FILE_MODE = 0o600;
const SESSION_DIR_MODE = 0o700;
const SPACEMOLT_HOME = path.join(os.homedir(), '.hermes', 'spacemolt');
const DEFAULT_SESSION_PATH = path.join(SPACEMOLT_HOME, 'session.json');
const DEFAULT_CREDENTIALS_PATH = path.join(SPACEMOLT_HOME, 'spacemolt_credentials.yaml');
const LEGACY_CREDENTIALS_PATH = path.join(os.homedir(), '.hermes', 'spacemolt_credentials.yaml');

export function validateProfileName(profile: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) {
    throw new Error('Profile names may only contain letters, numbers, dots, dashes, and underscores.');
  }
  return profile;
}

export function getCredentialsPath(): string {
  if (fs.existsSync(DEFAULT_CREDENTIALS_PATH)) return DEFAULT_CREDENTIALS_PATH;
  if (fs.existsSync(LEGACY_CREDENTIALS_PATH)) return LEGACY_CREDENTIALS_PATH;
  return path.join(process.cwd(), 'spacemolt_credentials.yaml');
}

export function parseCredentialProfiles(contents: string): CredentialProfile[] {
  const profiles: CredentialProfile[] = [];
  let inCredentials = false;
  let current: CredentialProfile | undefined;

  for (const line of contents.split(/\r?\n/)) {
    if (/^credentials:\s*$/.test(line)) {
      inCredentials = true;
      continue;
    }
    if (!inCredentials || line.trim() === '' || line.trimStart().startsWith('#')) continue;

    const profileMatch = line.match(/^ {2}([A-Za-z0-9._-]+):\s*$/);
    if (profileMatch?.[1]) {
      current = { name: profileMatch[1] };
      profiles.push(current);
      continue;
    }

    const fieldMatch = line.match(/^ {4}([A-Za-z0-9_]+):\s*(.*)$/);
    if (current && fieldMatch?.[1]) {
      const rawValue = (fieldMatch[2] || '').trim();
      const value = rawValue.replace(/^["']|["']$/g, '');
      if (['username', 'password', 'empire', 'registration_code'].includes(fieldMatch[1])) {
        current[fieldMatch[1] as keyof Omit<CredentialProfile, 'name'>] = value;
      }
    }
  }

  return profiles;
}

export function loadCredentialProfiles(): CredentialProfile[] {
  try {
    return parseCredentialProfiles(fs.readFileSync(getCredentialsPath(), 'utf-8'));
  } catch {
    return [];
  }
}

export function findCredentialProfile(name: string): CredentialProfile | undefined {
  return loadCredentialProfiles().find((profile) => profile.name === name);
}

export function showProfiles(): void {
  const profiles = loadCredentialProfiles();
  if (!profiles.length) {
    console.log(`No profiles found in ${getCredentialsPath()}.`);
    return;
  }

  console.log(`${c.bright}Profiles${c.reset}`);
  for (const profile of profiles) {
    const user = profile.username ? ` username=${profile.username}` : '';
    const empire = profile.empire ? ` empire=${profile.empire}` : '';
    console.log(`  ${profile.name}${user}${empire}`);
  }
}

export function getSessionPath(): string {
  if (process.env.SPACEMOLT_SESSION) return process.env.SPACEMOLT_SESSION;
  if (ACTIVE_PROFILE) {
    return path.join(SPACEMOLT_HOME, 'sessions', `${ACTIVE_PROFILE}.json`);
  }
  return DEFAULT_SESSION_PATH;
}

export function hardenPermissions(targetPath: string, mode: number): void {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(targetPath, mode);
  } catch {
    /* best effort */
  }
}

export async function loadSession(): Promise<Session | null> {
  try {
    const sessionPath = getSessionPath();
    const file = Bun.file(sessionPath);
    if (await file.exists()) hardenPermissions(sessionPath, SESSION_FILE_MODE);
    if (await file.exists()) return await file.json();
  } catch {
    /* no session */
  }
  return null;
}

export async function saveSession(session: Session): Promise<void> {
  const sessionPath = getSessionPath();
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

export async function createSession(): Promise<Session> {
  if (DEBUG) console.log(`${c.dim}[DEBUG] Creating new session...${c.reset}`);
  const response = await requestJson<APIResponse>(`${trimTrailingSlash(API_BASE)}/session`, {
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
  const profile = ACTIVE_PROFILE ? findCredentialProfile(ACTIVE_PROFILE) : undefined;
  if (profile?.username) session.username = profile.username;
  if (profile?.password) session.password = profile.password;
  await saveSession(session);
  return session;
}

export function isSessionExpired(session: Session): boolean {
  return Date.now() > new Date(session.expires_at).getTime() - 60000;
}

export async function getSession(): Promise<Session> {
  const session = await loadSession();
  return !session || isSessionExpired(session) ? createSession() : session;
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

export async function authenticateProfileSession(session: Session): Promise<APIResponse | null> {
  if (!ACTIVE_PROFILE || !session.username || !session.password || session.player_id) return null;

  if (DEBUG)
    console.log(`${c.dim}[DEBUG] Authenticating profile ${ACTIVE_PROFILE} as ${session.username}...${c.reset}`);
  const response = await requestJson<APIResponse>(`${trimTrailingSlash(API_BASE)}/spacemolt_auth/login`, {
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
  await saveSession(session);
  return null;
}

export function setActiveProfile(profile: string | undefined): void {
  ACTIVE_PROFILE = profile;
}
