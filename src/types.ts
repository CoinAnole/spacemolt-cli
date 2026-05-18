// =============================================================================

export interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  username?: string;
  password?: string;
  player_id?: string;
}

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
  dryRun: boolean;
  profile?: string;
  fields?: string[];
  format?: OutputFormat;
  noTimestamp: boolean;
  compact: boolean;
  watch?: number;
  jq?: string;
  args: string[];
}

export type OutputFormat = 'table' | 'json' | 'yaml' | 'text';

export interface CredentialProfile {
  name: string;
  username?: string;
  password?: string;
  empire?: string;
  registration_code?: string;
}

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
