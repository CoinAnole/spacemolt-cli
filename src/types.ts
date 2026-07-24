// =============================================================================

export interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  username?: string;
  password?: string;
  player_id?: string;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type CliPayload = Record<string, JsonValue>;

export interface APIResponse {
  result?: string | Record<string, unknown>;
  structuredContent?: Record<string, unknown>;
  notifications?: Array<{ type: string; msg_type?: string; data: unknown; timestamp: string }>;
  session?: { id: string; player_id?: string; created_at: string; expires_at: string };
  error?: { code: string; message: string; wait_seconds?: number; retry_after?: number };
}

export interface GlobalOptions {
  json: boolean;
  quiet: boolean;
  plain: boolean;
  debug?: boolean;
  allowUnknown: boolean;
  dryRun: boolean;
  rawNotifications?: boolean;
  /** Inline omittedHint + extra preferred scalars only; never nested bulky dumps (K16 / PR 8). */
  verboseNotifications?: boolean;
  /** jq path soft-resolve only — unrelated to ID-cache payload resolution. */
  fuzzy?: boolean;
  /**
   * Effective soft ID payload resolution (prefix/substring).
   * After runner merge: always concrete true|false.
   * Before merge (unit tests / direct preparePayload): treat undefined as false (strict).
   */
  fuzzyIds?: boolean;
  /**
   * True iff --fuzzy-ids or --no-fuzzy-ids appeared on the CLI.
   * Used only by resolveFuzzyIdsEnabled; not read by preparePayload.
   */
  fuzzyIdsCliExplicit?: boolean;
  profile?: string;
  field?: string;
  fields?: string[];
  format?: OutputFormat;
  noTimestamp: boolean;
  compact: boolean;
  structured?: boolean;
  watch?: number;
  jq?: string;
  keys?: string;
  outputSearch?: string;
  outputSearchKeys?: string;
  outputSearchValues?: string;
  outputSearchRegex?: string;
  args: string[];
}

export type OutputFormat = 'table' | 'json' | 'yaml' | 'text';

export interface CommandGroup {
  key: string;
  label: string;
  aliases: string[];
  categories: string[];
}

export interface JsonRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  sessionId?: string;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
  userAgent?: string;
}

export interface JsonResponse<T> {
  status: number;
  ok: boolean;
  data: T;
}

export interface CommandSearchMatch {
  command: string;
  score: number;
}
