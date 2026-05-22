import { applyCommandPayloadTransforms, applyPayloadTransforms } from './args.ts';
import { type CommandConfig, routeToPath, V2_TOOL_MAP, type V2Route } from './commands.ts';
import { ERROR_REGISTRY } from './errors.ts';
import { getObjectResult, getStructuredResult, isRecord, trimTrailingSlash } from './response.ts';
import {
  createDefaultConfig,
  MAX_RATE_LIMIT_RETRIES,
  MAX_SESSION_RECOVERY_ATTEMPTS,
  type SpaceMoltConfig,
} from './runtime.ts';
import { profileNameForUsername, SessionManager } from './session.ts';
import { requestJson } from './transport.ts';
import type { APIResponse, JsonRequestOptions, Session } from './types.ts';

const SESSION_ERROR_CODES = new Set(
  Object.entries(ERROR_REGISTRY)
    .filter(([, entry]) => entry.auth && entry.retryable)
    .map(([code]) => code),
);

function appendQueryPayload(url: string, payload?: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) return url;

  const parsedUrl = new URL(url);
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === undefined) continue;
      parsedUrl.searchParams.append(key, String(item));
    }
  }
  return parsedUrl.toString();
}

export interface SpaceMoltClientOptions {
  config?: SpaceMoltConfig;
  transport?: {
    requestJson<T>(url: string, options?: JsonRequestOptions): Promise<{ status: number; data: T }>;
  };
  sessionStore?: {
    getSession(profile?: string): Promise<Session>;
    loadSession(profile?: string): Promise<Session | null>;
    saveSession(session: Session, profile?: string): Promise<void>;
    createSession(profile?: string): Promise<Session>;
    authenticateProfileSession(session: Session): Promise<APIResponse | null>;
    ensureDefaultProfile?(profile?: string): void;
  };
  clock?: {
    now(): number;
  };
  sleep?: (ms: number) => Promise<void>;
  logger?: {
    debug(message: string): void;
    error(message: string): void;
    warn(message: string): void;
  };
}

export class SpaceMoltClient {
  public readonly config: SpaceMoltConfig;
  private readonly transport: NonNullable<SpaceMoltClientOptions['transport']>;
  private readonly sessionStore: NonNullable<SpaceMoltClientOptions['sessionStore']>;
  private readonly clock: NonNullable<SpaceMoltClientOptions['clock']>;
  private readonly sleep: NonNullable<SpaceMoltClientOptions['sleep']>;
  private readonly logger: NonNullable<SpaceMoltClientOptions['logger']>;
  private readonly maxSessionRecoveryAttempts: number;
  private readonly maxRateLimitRetries: number;

  constructor(options: SpaceMoltClientOptions = {}) {
    this.config = options.config ?? createDefaultConfig();
    this.transport = options.transport ?? { requestJson };
    this.sessionStore =
      options.sessionStore ??
      new SessionManager({
        apiBase: this.config.apiBase,
        profile: this.config.profile,
        profileIsExplicit: this.config.profileIsExplicit,
        debug: this.config.debug,
      });
    this.clock = options.clock ?? { now: Date.now };
    this.sleep = options.sleep ?? ((ms) => Bun.sleep(ms));
    this.logger = options.logger ?? {
      debug: (msg) => console.log(`[DEBUG] ${msg}`),
      error: (msg) => console.error(msg),
      warn: (msg) => console.log(msg),
    };
    this.maxSessionRecoveryAttempts = MAX_SESSION_RECOVERY_ATTEMPTS;
    this.maxRateLimitRetries = MAX_RATE_LIMIT_RETRIES;
  }

  get baseUrl(): string {
    return trimTrailingSlash(this.config.apiBase);
  }

  get jsonOutput(): boolean {
    return this.config.jsonOutput;
  }

  get debug(): boolean {
    return this.config.debug;
  }

  async execute(command: string, payload?: Record<string, unknown>): Promise<APIResponse> {
    const mapping = V2_TOOL_MAP[command];
    if (!mapping) throw new Error(`Command "${command}" has no v2 route mapping.`);

    payload = applyPayloadTransforms(command, payload ?? {});

    return this.executeRoute(command, mapping, payload);
  }

  async executeCommandConfig(
    command: string,
    commandConfig: Pick<CommandConfig, 'arrayFields' | 'route'>,
    payload?: Record<string, unknown>,
  ): Promise<APIResponse> {
    const transformedPayload = applyCommandPayloadTransforms(commandConfig, payload ?? {});
    return this.executeRoute(command, commandConfig.route, transformedPayload);
  }

  private async executeRoute(
    command: string,
    mapping: V2Route,
    payload: Record<string, unknown>,
  ): Promise<APIResponse> {
    if (mapping.defaults) {
      payload = { ...mapping.defaults, ...payload };
    }

    const url = `${this.baseUrl}/${routeToPath(mapping)}`;
    const method = mapping.method || 'POST';

    const sessionProfile = this.sessionProfileForCommand(command, payload);
    let session = await this.sessionStore.getSession(sessionProfile);
    let sessionRecoveryAttempts = 0;
    let rateLimitRetries = 0;

    while (true) {
      if (command !== 'login' && command !== 'register') {
        const authError = await this.sessionStore.authenticateProfileSession(session);
        if (authError) return authError;
      }

      const data = await this.sendRequest(session, url, method, payload, sessionProfile);

      if (data.error && SESSION_ERROR_CODES.has(data.error.code)) {
        if (
          command === 'login' ||
          command === 'register' ||
          sessionRecoveryAttempts >= this.maxSessionRecoveryAttempts
        ) {
          return data;
        }
        sessionRecoveryAttempts += 1;
        const recoveredSession = await this.recoverSession();
        if (!recoveredSession) return data;
        session = recoveredSession;
        continue;
      }

      const retryAfter = data.error?.retry_after ?? data.error?.wait_seconds;
      if (data.error?.code === 'rate_limited' && retryAfter !== undefined) {
        if (rateLimitRetries >= this.maxRateLimitRetries) return data;
        rateLimitRetries += 1;
        const waitMs = Math.ceil(retryAfter) * 1000;
        if (!this.jsonOutput) {
          this.logger.warn(`[RATE LIMITED] Waiting ${Math.ceil(retryAfter)} seconds before retry...`);
        }
        await this.sleep(waitMs);
        continue;
      }

      if (command === 'login' || command === 'register') {
        await this.persistSuccessfulCredentials(command, payload, data);
      }

      return data;
    }
  }

  private async sendRequest(
    currentSession: Session,
    requestUrl: string,
    requestMethod: string,
    requestPayload?: Record<string, unknown>,
    sessionProfile?: string,
  ): Promise<APIResponse> {
    const finalRequestUrl = requestMethod === 'GET' ? appendQueryPayload(requestUrl, requestPayload) : requestUrl;

    if (this.debug) {
      this.logger.debug(`Request: ${requestMethod} ${finalRequestUrl}`);
      this.logger.debug(`Route: v2`);
      this.logger.debug(`Session: ${currentSession.id.substring(0, 8)}...`);
      if (requestPayload) {
        const safePayload = { ...requestPayload };
        if (safePayload.password) safePayload.password = '***';
        this.logger.debug(`${requestMethod === 'GET' ? 'Query' : 'Payload'}: ${JSON.stringify(safePayload)}`);
      }
    }

    const startTime = this.clock.now();
    const response = await this.transport.requestJson<APIResponse>(finalRequestUrl, {
      method: requestMethod,
      sessionId: currentSession.id,
      payload: requestMethod === 'POST' && requestPayload ? requestPayload : undefined,
    });
    const elapsed = this.clock.now() - startTime;

    const data = response.data;

    if (this.debug) {
      this.logger.debug(`Response: ${response.status} (${elapsed}ms)`);
      if (data.error) this.logger.debug(`Error: ${data.error.code} - ${data.error.message}`);
      if (data.notifications?.length) this.logger.debug(`Notifications: ${data.notifications.length}`);
    }

    if (data.session) {
      currentSession.expires_at = data.session.expires_at;
      if (data.session.player_id) currentSession.player_id = data.session.player_id;
      await this.sessionStore.saveSession(currentSession, sessionProfile);
    }

    return data;
  }

  private async loginWithSession(currentSession: Session, username: string, password: string): Promise<APIResponse> {
    const loginMapping = V2_TOOL_MAP.login;
    if (!loginMapping) throw new Error('Command "login" has no v2 route mapping.');
    const loginPayload = applyPayloadTransforms('login', { username, password });
    const loginUrl = `${this.baseUrl}/${routeToPath(loginMapping)}`;
    return this.sendRequest(currentSession, loginUrl, loginMapping.method || 'POST', loginPayload);
  }

  private sessionProfileForCommand(command: string, payload: Record<string, unknown>): string | undefined {
    if (command !== 'login' && command !== 'register') return undefined;
    if (this.config.profileIsExplicit) return undefined;
    return typeof payload.username === 'string' ? profileNameForUsername(payload.username) : undefined;
  }

  private async persistSuccessfulCredentials(
    command: string,
    payload: Record<string, unknown>,
    response: APIResponse,
  ): Promise<void> {
    if (response.error) return;

    const profileForDefault = this.sessionProfileForCommand(command, payload);
    const session = await this.sessionStore.loadSession(profileForDefault);
    if (!session) return;

    let changed = false;

    if (command === 'login') {
      if (typeof payload.username === 'string' && typeof payload.password === 'string') {
        session.username = payload.username;
        session.password = payload.password;
        changed = true;
      }
      const playerId = this.extractPlayerId(response);
      if (playerId) {
        session.player_id = playerId;
        changed = true;
      }
    }

    if (command === 'register') {
      if (typeof payload.username === 'string') {
        session.username = payload.username;
        changed = true;
      }
      const resultRecord = getStructuredResult(response) || getObjectResult(response);
      const password = typeof resultRecord?.password === 'string' ? resultRecord.password : undefined;
      if (password) {
        session.password = password;
        changed = true;
      }
      const playerId = this.extractPlayerId(response);
      if (playerId) {
        session.player_id = playerId;
        changed = true;
      }
    }

    if (changed) {
      this.sessionStore.ensureDefaultProfile?.(profileForDefault);
      await this.sessionStore.saveSession(session, profileForDefault);
      if (this.debug) this.logger.debug(`Saved ${command} credentials to session`);
    }
  }

  private extractPlayerId(response: APIResponse): string | undefined {
    const resultRecord = getStructuredResult(response) || getObjectResult(response);
    const player = isRecord(resultRecord?.player) ? resultRecord.player : undefined;
    return typeof player?.id === 'string'
      ? player.id
      : typeof resultRecord?.player_id === 'string'
        ? resultRecord.player_id
        : response.session?.player_id;
  }

  private async recoverSession(): Promise<Session | null> {
    if (this.debug) this.logger.debug(`Session expired, creating new session...`);
    const oldSession = await this.sessionStore.loadSession();
    const newSession = await this.sessionStore.createSession();
    if (oldSession?.username && oldSession?.password) {
      newSession.username = oldSession.username;
      newSession.password = oldSession.password;
      await this.sessionStore.saveSession(newSession);
      if (this.debug) this.logger.debug(`Re-authenticating as ${oldSession.username}...`);
      const loginResp = await this.loginWithSession(newSession, oldSession.username, oldSession.password);
      if (loginResp.error) {
        if (!this.jsonOutput) {
          this.logger.error(`[SESSION] Session expired and auto-login failed: ${loginResp.error.message}`);
          this.logger.error(`Run "spacemolt login <username> <password>" to re-authenticate.`);
        }
        return null;
      }
      if (!this.jsonOutput) {
        this.logger.debug(`[SESSION] Session recovered, re-authenticated as ${oldSession.username}`);
      }
    }
    return newSession;
  }
}

export const defaultClient = new SpaceMoltClient();

export async function execute(command: string, payload?: Record<string, unknown>): Promise<APIResponse> {
  return defaultClient.execute(command, payload);
}
