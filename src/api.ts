import { applyPayloadTransforms } from './args.ts';
import { routeToPath, V2_TOOL_MAP } from './commands.ts';
import { ERROR_REGISTRY } from './errors.ts';
import { trimTrailingSlash } from './response.ts';
import { API_BASE, DEBUG, JSON_OUTPUT, MAX_RATE_LIMIT_RETRIES, MAX_SESSION_RECOVERY_ATTEMPTS } from './runtime.ts';
import { authenticateProfileSession, createSession, getSession, loadSession, saveSession } from './session.ts';
import { requestJson } from './transport.ts';
import type { APIResponse, JsonRequestOptions, Session } from './types.ts';

const SESSION_ERROR_CODES = new Set(
  Object.entries(ERROR_REGISTRY)
    .filter(([, entry]) => entry.auth && entry.retryable)
    .map(([code]) => code),
);

export interface SpaceMoltClientOptions {
  transport: {
    requestJson<T>(url: string, options?: JsonRequestOptions): Promise<{ status: number; data: T }>;
  };
  sessionStore: {
    getSession(): Promise<Session>;
    loadSession(): Promise<Session | null>;
    saveSession(session: Session): Promise<void>;
    createSession(): Promise<Session>;
    authenticateProfileSession(session: Session): Promise<APIResponse | null>;
  };
  clock: {
    now(): number;
  };
  sleep: (ms: number) => Promise<void>;
  logger: {
    debug(message: string): void;
    error(message: string): void;
    warn(message: string): void;
  };
}

export class SpaceMoltClient {
  private readonly transport: SpaceMoltClientOptions['transport'];
  private readonly sessionStore: SpaceMoltClientOptions['sessionStore'];
  private readonly clock: SpaceMoltClientOptions['clock'];
  private readonly sleep: SpaceMoltClientOptions['sleep'];
  private readonly logger: SpaceMoltClientOptions['logger'];
  private readonly baseUrl: string;
  private readonly maxSessionRecoveryAttempts: number;
  private readonly maxRateLimitRetries: number;
  private readonly jsonOutput: boolean;

  constructor(options: SpaceMoltClientOptions) {
    this.transport = options.transport;
    this.sessionStore = options.sessionStore;
    this.clock = options.clock;
    this.sleep = options.sleep;
    this.logger = options.logger;
    this.baseUrl = trimTrailingSlash(API_BASE);
    this.maxSessionRecoveryAttempts = MAX_SESSION_RECOVERY_ATTEMPTS;
    this.maxRateLimitRetries = MAX_RATE_LIMIT_RETRIES;
    this.jsonOutput = JSON_OUTPUT;
  }

  async execute(command: string, payload?: Record<string, unknown>): Promise<APIResponse> {
    const mapping = V2_TOOL_MAP[command];
    if (!mapping) throw new Error(`Command "${command}" has no v2 route mapping.`);

    payload = applyPayloadTransforms(command, payload ?? {});

    if (mapping.defaults) {
      payload = { ...mapping.defaults, ...payload };
    }

    const url = `${this.baseUrl}/${routeToPath(mapping)}`;
    const method = mapping.method || 'POST';

    let session = await this.sessionStore.getSession();
    let sessionRecoveryAttempts = 0;
    let rateLimitRetries = 0;

    while (true) {
      if (command !== 'login' && command !== 'register') {
        const authError = await this.sessionStore.authenticateProfileSession(session);
        if (authError) return authError;
      }

      const data = await this.sendRequest(session, url, method, payload);

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

      return data;
    }
  }

  private async sendRequest(
    currentSession: Session,
    requestUrl: string,
    requestMethod: string,
    requestPayload?: Record<string, unknown>,
  ): Promise<APIResponse> {
    if (DEBUG) {
      this.logger.debug(`Request: ${requestMethod} ${requestUrl}`);
      this.logger.debug(`Route: v2`);
      this.logger.debug(`Session: ${currentSession.id.substring(0, 8)}...`);
      if (requestPayload) {
        const safePayload = { ...requestPayload };
        if (safePayload.password) safePayload.password = '***';
        this.logger.debug(`Payload: ${JSON.stringify(safePayload)}`);
      }
    }

    const startTime = this.clock.now();
    const response = await this.transport.requestJson<APIResponse>(requestUrl, {
      method: requestMethod,
      sessionId: currentSession.id,
      payload: requestMethod === 'POST' && requestPayload ? requestPayload : undefined,
    });
    const elapsed = this.clock.now() - startTime;

    const data = response.data;

    if (DEBUG) {
      this.logger.debug(`Response: ${response.status} (${elapsed}ms)`);
      if (data.error) this.logger.debug(`Error: ${data.error.code} - ${data.error.message}`);
      if (data.notifications?.length) this.logger.debug(`Notifications: ${data.notifications.length}`);
    }

    if (data.session) {
      currentSession.expires_at = data.session.expires_at;
      if (data.session.player_id) currentSession.player_id = data.session.player_id;
      await this.sessionStore.saveSession(currentSession);
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

  private async recoverSession(): Promise<Session | null> {
    if (DEBUG) this.logger.debug(`Session expired, creating new session...`);
    const oldSession = await this.sessionStore.loadSession();
    const newSession = await this.sessionStore.createSession();
    if (oldSession?.username && oldSession?.password) {
      newSession.username = oldSession.username;
      newSession.password = oldSession.password;
      await this.sessionStore.saveSession(newSession);
      if (DEBUG) this.logger.debug(`Re-authenticating as ${oldSession.username}...`);
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

const defaultClient = new SpaceMoltClient({
  transport: { requestJson },
  sessionStore: { getSession, loadSession, saveSession, createSession, authenticateProfileSession },
  clock: { now: Date.now },
  sleep: (ms) => Bun.sleep(ms),
  logger: {
    debug: (msg) => console.log(`[DEBUG] ${msg}`),
    error: (msg) => console.error(msg),
    warn: (msg) => console.log(msg),
  },
});

export async function execute(command: string, payload?: Record<string, unknown>): Promise<APIResponse> {
  return defaultClient.execute(command, payload);
}
