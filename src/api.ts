import { SINGLE_ENDPOINT_TOOLS, V2_TOOL_MAP } from './commands.ts';
import { normalizeCommandPayload, trimTrailingSlash } from './response.ts';
import { API_BASE, c, DEBUG, JSON_OUTPUT, MAX_RATE_LIMIT_RETRIES, MAX_SESSION_RECOVERY_ATTEMPTS } from './runtime.ts';
import { authenticateProfileSession, createSession, getSession, loadSession, saveSession } from './session.ts';
import { requestJson } from './transport.ts';
import type { APIResponse, Session } from './types.ts';

export async function execute(command: string, payload?: Record<string, unknown>): Promise<APIResponse> {
  const mapping = V2_TOOL_MAP[command];
  if (!mapping) throw new Error(`Command "${command}" has no v2 route mapping.`);

  payload = normalizeCommandPayload(command, payload);

  // Merge static defaults (e.g., target=faction) into payload
  if (mapping.defaults) {
    payload = { ...mapping.defaults, ...payload };
  }

  const routePath =
    mapping.tool === mapping.action || SINGLE_ENDPOINT_TOOLS.has(mapping.tool)
      ? mapping.tool
      : `${mapping.tool}/${mapping.action}`;
  const url = `${trimTrailingSlash(API_BASE)}/${routePath}`;
  const method = mapping.method || 'POST';
  const routeKind: 'v2' = 'v2';

  async function sendRequest(
    currentSession: Session,
    requestUrl: string,
    requestMethod: string,
    requestPayload?: Record<string, unknown>,
  ): Promise<APIResponse> {
    if (DEBUG) {
      console.log(`${c.dim}[DEBUG] Request: ${requestMethod} ${requestUrl}${c.reset}`);
      console.log(`${c.dim}[DEBUG] Route: ${routeKind}${c.reset}`);
      console.log(`${c.dim}[DEBUG] Session: ${currentSession.id.substring(0, 8)}...${c.reset}`);
      if (requestPayload) {
        const safePayload = { ...requestPayload };
        if (safePayload.password) safePayload.password = '***';
        console.log(`${c.dim}[DEBUG] Payload: ${JSON.stringify(safePayload)}${c.reset}`);
      }
    }

    const startTime = Date.now();
    const response = await requestJson<APIResponse>(requestUrl, {
      method: requestMethod,
      sessionId: currentSession.id,
      payload: requestMethod === 'POST' && requestPayload ? requestPayload : undefined,
    });
    const elapsed = Date.now() - startTime;

    const data = response.data;

    if (DEBUG) {
      console.log(`${c.dim}[DEBUG] Response: ${response.status} (${elapsed}ms)${c.reset}`);
      if (data.error) console.log(`${c.dim}[DEBUG] Error: ${data.error.code} - ${data.error.message}${c.reset}`);
      if (data.notifications?.length)
        console.log(`${c.dim}[DEBUG] Notifications: ${data.notifications.length}${c.reset}`);
    }

    // Update session
    if (data.session) {
      currentSession.expires_at = data.session.expires_at;
      if (data.session.player_id) currentSession.player_id = data.session.player_id;
      await saveSession(currentSession);
    }

    return data;
  }

  async function request(currentSession: Session, requestPayload?: Record<string, unknown>): Promise<APIResponse> {
    return sendRequest(currentSession, url, method, requestPayload);
  }

  async function login(currentSession: Session, username: string, password: string): Promise<APIResponse> {
    const loginMapping = V2_TOOL_MAP.login;
    if (!loginMapping) throw new Error('Command "login" has no v2 route mapping.');
    const loginPayload = normalizeCommandPayload('login', { username, password });
    const loginRoutePath =
      loginMapping.tool === loginMapping.action || SINGLE_ENDPOINT_TOOLS.has(loginMapping.tool)
        ? loginMapping.tool
        : `${loginMapping.tool}/${loginMapping.action}`;
    const loginUrl = `${trimTrailingSlash(API_BASE)}/${loginRoutePath}`;
    return sendRequest(currentSession, loginUrl, loginMapping.method || 'POST', loginPayload);
  }

  async function recoverSession(): Promise<Session | null> {
    if (DEBUG) console.log(`${c.dim}[DEBUG] Session expired, creating new session...${c.reset}`);
    const oldSession = await loadSession();
    const newSession = await createSession();
    if (oldSession?.username && oldSession?.password) {
      newSession.username = oldSession.username;
      newSession.password = oldSession.password;
      await saveSession(newSession);
      // Auto-re-login with stored credentials
      if (DEBUG) console.log(`${c.dim}[DEBUG] Re-authenticating as ${oldSession.username}...${c.reset}`);
      const loginResp = await login(newSession, oldSession.username, oldSession.password);
      if (loginResp.error) {
        if (!JSON_OUTPUT) {
          console.error(
            `${c.red}[SESSION]${c.reset} Session expired and auto-login failed: ${loginResp.error.message}`,
          );
          console.error(`${c.yellow}Run "spacemolt login <username> <password>" to re-authenticate.${c.reset}`);
        }
        return null;
      }
      if (!JSON_OUTPUT) {
        console.log(`${c.dim}[SESSION]${c.reset} Session recovered, re-authenticated as ${oldSession.username}`);
      }
    }
    return newSession;
  }

  let session = await getSession();
  let sessionRecoveryAttempts = 0;
  let rateLimitRetries = 0;

  while (true) {
    if (command !== 'login' && command !== 'register') {
      const authError = await authenticateProfileSession(session);
      if (authError) return authError;
    }

    const data = await request(session, payload);

    // Handle session expired - create new session, re-login if possible, then retry
    if (
      data.error?.code === 'session_invalid' ||
      data.error?.code === 'invalid_session' ||
      data.error?.code === 'session_expired'
    ) {
      if (command === 'login' || command === 'register' || sessionRecoveryAttempts >= MAX_SESSION_RECOVERY_ATTEMPTS) {
        return data;
      }
      sessionRecoveryAttempts += 1;
      const recoveredSession = await recoverSession();
      if (!recoveredSession) return data;
      session = recoveredSession;
      continue;
    }

    // Handle rate limit on queries - wait and retry
    const retryAfter = data.error?.retry_after ?? data.error?.wait_seconds;
    if (data.error?.code === 'rate_limited' && retryAfter !== undefined) {
      if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) return data;
      rateLimitRetries += 1;
      const waitMs = Math.ceil(retryAfter) * 1000;
      if (!JSON_OUTPUT) {
        console.log(`${c.yellow}[RATE LIMITED]${c.reset} Waiting ${Math.ceil(retryAfter)} seconds before retry...`);
      }
      await Bun.sleep(waitMs);
      continue;
    }

    return data;
  }
}
