import * as path from 'node:path';
import { gameserverVersionFromSpec } from '../openapi-metadata';

// Reuse some helpers from the fixture comparator (they are already well-tested)
import {
  type OpenApiSpec as FixtureOpenApiSpec,
  getEffectiveSchema,
  loadOpenApiSpec as loadFixtureOpenApiSpec,
  resolveSuccessResponseSchema,
} from './fixture-schema-compare';

export type OpenApiSpec = FixtureOpenApiSpec;

export interface DocExample {
  raw: string;
  parsed: unknown;
  payloadShape: Record<string, unknown> | null;
}

export interface Finding {
  id: string;
  kind:
    | 'prose-field-mismatch'
    | 'overbroad-shared-schema'
    | 'missing-response-field-prose'
    | 'schema-description-inconsistency'
    | 'cli-alias-vs-schema';
  severity: 'high' | 'medium' | 'low' | 'info';
  route?: string;
  schemaName?: string;
  field?: string;
  message: string;
  evidence: {
    proseExcerpt?: string;
    examplePayload?: Record<string, unknown>;
    schemaProperty?: unknown;
    schemaEnum?: string[];
    description?: string;
    sharedWith?: string[];
    cliAlias?: string;
  };
  suggestedAction?: string;
  confidence: 'high' | 'medium' | 'speculative';
}

export interface ConsistencyReport {
  gameserverVersion: string;
  generatedAt: string;
  findings: Finding[];
  summary: {
    total: number;
    byKind: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

export interface ReportOptions {
  only?: string[];
  includeLowConfidence?: boolean;
}

const _DEFAULT_OPENAPI_PATH = path.join(import.meta.dir, '..', '..', 'spacemolt-docs', 'openapi.json');

export function loadOpenApiSpec(customPath?: string): OpenApiSpec {
  return loadFixtureOpenApiSpec(customPath);
}

function normalizeTextForMatch(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Robustly extract JSON examples from operation descriptions. */
export function extractDocExamples(description: string | undefined): DocExample[] {
  if (!description) return [];
  const out: DocExample[] = [];

  // Primary pattern used throughout the spec:
  // **Example:** `{"type": "...", "payload": { ... }}`
  const backtickExample = /\*\*Example:\*\*\s*`([^`]+)`/g;
  const descForRegex = description as string;
  for (let match = backtickExample.exec(descForRegex); match !== null; match = backtickExample.exec(descForRegex)) {
    if (!match[1]) continue;
    const raw = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    try {
      const parsed = JSON.parse(raw);
      const payloadShape = getInnerPayloadShape(parsed);
      out.push({ raw: match[0], parsed, payloadShape });
    } catch {
      // not valid JSON — still keep raw for evidence
      out.push({ raw: match[0], parsed: raw, payloadShape: null });
    }
  }

  // Secondary: fenced ```json blocks (less common in current spec but future-proof)
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (let match = fence.exec(descForRegex); match !== null; match = fence.exec(descForRegex)) {
    if (!match[1]) continue;
    const candidate = match[1].trim();
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) continue;
    try {
      const parsed = JSON.parse(candidate);
      const payloadShape = getInnerPayloadShape(parsed);
      out.push({ raw: match[0], parsed, payloadShape });
    } catch {
      // ignore bad fences
    }
  }

  // Dedup by raw
  const seen = new Set<string>();
  return out.filter((ex) => {
    const key = typeof ex.raw === 'string' ? ex.raw.slice(0, 120) : String(ex.raw);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getInnerPayloadShape(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.payload && typeof obj.payload === 'object' && !Array.isArray(obj.payload)) {
    return obj.payload as Record<string, unknown>;
  }
  // Some examples have no payload wrapper (e.g. simple queries)
  if (obj.type && typeof obj.type === 'string') {
    const { type, ...rest } = obj;
    if (Object.keys(rest).length > 0) return rest;
  }
  // Fall back to top-level if it looks like a direct body
  if (!('type' in obj) && Object.keys(obj).length > 0) return obj;
  return null;
}

/** Extract plausible field names mentioned in prose (heuristic, high-recall). */
export function extractMentionedFieldNames(text: string | undefined): string[] {
  if (!text) return [];
  const fields = new Set<string>();
  const s = text;

  // Keys inside JSON-like structures
  const jsonKey = /"([a-z][a-z0-9_]*)"\s*:/g;
  for (let m = jsonKey.exec(s); m !== null; m = jsonKey.exec(s)) {
    if (m[1]) fields.add(m[1]);
  }

  // Common prose patterns: "foo" or foo= or the <foo> placeholders
  const proseKey = /[`"']([a-z][a-z0-9_]*)[`"']|([a-z][a-z0-9_]*)[=\s:]/g;
  for (let m = proseKey.exec(s); m !== null; m = proseKey.exec(s)) {
    const candidate = m[1] || m[2];
    if (candidate && candidate.length > 1 && candidate.length < 40) {
      fields.add(candidate);
    }
  }
  return [...fields];
}

function schemaRequestProperties(spec: OpenApiSpec, apiPath: string, method: 'get' | 'post' = 'post') {
  const pathItem = spec.paths?.[apiPath];
  if (!pathItem) return {};
  const op: any = pathItem[method];
  if (!op) return {};
  const schema = op.requestBody?.content?.['application/json']?.schema;
  if (!schema) return {};
  const effective = getEffectiveSchema(spec, schema as any);
  return (effective.properties ?? {}) as Record<string, any>;
}

function getRequestSchemaForPath(spec: OpenApiSpec, apiPath: string) {
  const props = schemaRequestProperties(spec, apiPath, 'post');
  if (Object.keys(props).length === 0) {
    // try GET just in case
    return schemaRequestProperties(spec, apiPath, 'get');
  }
  return props;
}

function shapeSignature(props: Record<string, any>): string {
  const keys = Object.keys(props).sort();
  const summary = keys.map((k) => {
    const p = props[k] || {};
    const t = p.type ?? 'unknown';
    const en = p.enum ? p.enum.slice().sort().join('|') : '';
    return `${k}:${t}${en ? `:${en}` : ''}`;
  });
  return summary.join(',');
}

function routeMatchesOnly(route: string, only?: string[]): boolean {
  if (!only || only.length === 0) return true;
  const lower = route.toLowerCase();
  return only.some((o) => lower.includes(o.toLowerCase()));
}

export function findProseFieldMismatches(spec: OpenApiSpec, options: ReportOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const only = options.only;

  for (const [apiPath, methods] of Object.entries(spec.paths || {})) {
    const op: any = methods.post;
    if (!op) continue;
    const routeSig = `POST ${apiPath}`;
    if (!routeMatchesOnly(routeSig, only)) continue;

    const props = getRequestSchemaForPath(spec, apiPath);
    if (Object.keys(props).length === 0) continue;

    const examples = extractDocExamples(op.description as string | undefined);
    for (const ex of examples) {
      const shape = ex.payloadShape;
      if (!shape) continue;

      for (const key of Object.keys(shape)) {
        if (key in props) continue;

        // This is the core mismatch the bug reports describe
        const schemaProp = props[key]; // will be undefined
        const proseExcerpt = (op.description as string | undefined)?.slice(0, 280);

        findings.push({
          id: `prose-field-mismatch|${routeSig}|${key}`,
          kind: 'prose-field-mismatch',
          severity: 'high',
          route: routeSig,
          field: key,
          message: `prose/example uses "${key}" but request schema has no such property (schema uses different name or generic 'id')`,
          evidence: {
            proseExcerpt,
            examplePayload: shape,
            schemaProperty: schemaProp,
          },
          suggestedAction:
            'Align the request schema property name with the documented server help / prose, or update prose examples to use the canonical schema field name.',
          confidence: 'high',
        });
      }
    }

    // Also check the schema property descriptions for self-confusing names (nice-to-have)
    for (const [propName, propSchema] of Object.entries(props)) {
      const desc = (propSchema as any)?.description;
      if (typeof desc === 'string' && /\b(name|destination|station|commission_id)\b/i.test(desc) && propName === 'id') {
        findings.push({
          id: `schema-description-inconsistency|${routeSig}|${propName}`,
          kind: 'schema-description-inconsistency',
          severity: 'medium',
          route: routeSig,
          field: propName,
          message: `schema property is named "${propName}" but its description talks about domain names like name/destination/station`,
          evidence: {
            schemaProperty: propSchema,
            description: desc,
          },
          confidence: 'medium',
        });
      }
    }
  }
  return findings;
}

export function findOverbroadSharedSchemas(spec: OpenApiSpec, options: ReportOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const only = options.only;

  // Group routes by their request shape signature (simple, no long-term fingerprint stability needed)
  const groups = new Map<string, Array<{ route: string; path: string; props: Record<string, any> }>>();

  for (const [apiPath, methods] of Object.entries(spec.paths || {})) {
    const op: any = methods.post;
    if (!op) continue;
    const routeSig = `POST ${apiPath}`;
    if (!routeMatchesOnly(routeSig, only)) continue;

    const props = getRequestSchemaForPath(spec, apiPath);
    if (Object.keys(props).length < 4) continue; // ignore trivial schemas

    const sig = shapeSignature(props);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)?.push({ route: routeSig, path: apiPath, props });
  }

  for (const [_sig, members] of groups.entries()) {
    if (members.length < 2) continue;

    // Look for action-specific paths that still carry the full shared shape
    const actionPaths = members.filter((m) => {
      const last = m.path.split('/').pop() || '';
      return ['job_add', 'transfer', 'buy_listing', 'sell_listing', 'upgrade', 'build'].includes(last);
    });

    if (actionPaths.length === 0) continue;

    // Check for known over-broad fields (direction is the canonical example)
    for (const member of actionPaths) {
      const dir = member.props.direction;
      if (dir && Array.isArray(dir.enum) && dir.enum.length >= 3) {
        const sharedRoutes = members.map((m) => m.route);
        findings.push({
          id: `overbroad-shared-schema|${member.route}|direction`,
          kind: 'overbroad-shared-schema',
          severity: 'high',
          route: member.route,
          field: 'direction',
          message: `dedicated action path uses a shared schema with broad "direction" enum that documents values for other actions`,
          evidence: {
            schemaEnum: dir.enum,
            description: dir.description,
            sharedWith: sharedRoutes.filter((r) => r !== member.route),
          },
          suggestedAction:
            'Give dedicated action paths (job_add, transfer, ...) their own request schemas with appropriately narrowed enums, or use oneOf/discriminators.',
          confidence: 'high',
        });
      }
    }

    // General note for large shared shapes on leaf actions
    if (members.length >= 3 && actionPaths.length > 0) {
      for (const ap of actionPaths) {
        // Avoid duplicate if we already emitted the direction one
        if (findings.some((f) => f.route === ap.route && f.field === 'direction')) continue;
        findings.push({
          id: `overbroad-shared-schema|${ap.route}|shared-shape`,
          kind: 'overbroad-shared-schema',
          severity: 'medium',
          route: ap.route,
          message: `request schema appears to be shared across ${members.length} actions (large overlapping property set)`,
          evidence: {
            sharedWith: members.map((m) => m.route),
          },
          confidence: 'medium',
        });
      }
    }
  }

  return findings;
}

/**
 * Recursively collect all property names reachable in a (possibly effective) schema.
 * Handles properties, array items (any container), oneOf/allOf/anyOf, and refs via getEffectiveSchema.
 * Used to improve detection of fields present in nested response shapes (e.g. passengers[], passenger_arrivals, oneOf variants).
 */
function collectAllPropertyNames(schema: any, spec: OpenApiSpec, seen = new Set<string>()): Set<string> {
  const fields = new Set<string>();
  if (!schema || typeof schema !== 'object') return fields;

  const eff = getEffectiveSchema(spec, schema as any, seen);

  // Direct properties at this level
  if (eff.properties && typeof eff.properties === 'object') {
    for (const [k, sub] of Object.entries(eff.properties as Record<string, any>)) {
      fields.add(k);
      // Recurse into nested object schemas to catch deep fields
      if (sub && typeof sub === 'object') {
        for (const f of collectAllPropertyNames(sub, spec, seen)) fields.add(f);
      }
    }
  }

  // Array items — any array container (passengers, loaded, delivered, stranded, passenger_arrivals.*, etc.)
  if (eff.items) {
    for (const f of collectAllPropertyNames(eff.items, spec, seen)) fields.add(f);
    // Also surface direct item properties
    const itemEff = getEffectiveSchema(spec, eff.items as any, seen);
    if (itemEff.properties && typeof itemEff.properties === 'object') {
      for (const k of Object.keys(itemEff.properties)) fields.add(k);
    }
  }

  // oneOf / allOf / anyOf variants
  for (const variant of [...(eff.oneOf || []), ...(eff.allOf || []), ...(eff.anyOf || [])] as any[]) {
    for (const f of collectAllPropertyNames(variant, spec, seen)) fields.add(f);
  }

  return fields;
}

/**
 * Collect human prose descriptions from a schema subtree (descriptions on the node,
 * its properties, items, and oneOf/allOf/anyOf variants). Avoids schema keywords.
 */
// biome-ignore lint/suspicious/noExplicitAny: schema walking (matches style of collectAllPropertyNames)
function collectDescriptionText(node: any, out: string[] = []): string {
  if (!node || typeof node !== 'object') return out.join('\n');
  if (typeof node.description === 'string') {
    out.push(node.description);
  }
  if (node.properties && typeof node.properties === 'object') {
    for (const p of Object.values(node.properties as Record<string, any>)) {
      collectDescriptionText(p, out);
    }
  }
  if (node.items) {
    collectDescriptionText(node.items, out);
  }
  for (const k of ['oneOf', 'allOf', 'anyOf'] as const) {
    const arr = (node as any)[k];
    if (Array.isArray(arr)) {
      for (const v of arr) collectDescriptionText(v, out);
    }
  }
  return out.join('\n');
}

/** Extract candidate field terms from prose, including compounds like "base fare" -> "base_fare". */
export function extractResponseFieldCandidates(text: string | undefined): string[] {
  if (!text) return [];
  const base = extractMentionedFieldNames(text);
  const cands = new Set(base);

  // Natural-language compounds in docs ("base fare", "speed bonus", "ticks remaining")
  // become snake_case candidates so they can be matched against real schema fields.
  // Only synthesize when neither word is a trivial article/preposition (reduces "a fleet" -> a_fleet noise).
  const compound = /\b([a-z][a-z0-9]*)\s+([a-z][a-z0-9]*)\b/gi;
  let m: RegExpExecArray | null;
  const trivialFirst = new Set([
    'a',
    'an',
    'the',
    'to',
    'of',
    'in',
    'on',
    'for',
    'with',
    'by',
    'at',
    'from',
    'and',
    'or',
    'but',
  ]);
  m = compound.exec(text);
  while (m !== null) {
    const w1 = (m[1] || '').toLowerCase();
    const w2 = (m[2] || '').toLowerCase();
    if (!w1 || !w2) continue;
    if (trivialFirst.has(w1) || trivialFirst.has(w2)) continue;
    const joined = `${m[1]}_${m[2]}`;
    if (joined.length > 2 && joined.length < 50) cands.add(joined);
    m = compound.exec(text);
  }

  // For response-field detection, keep candidates that look like actual documented fields:
  // - contain underscore (the dominant style in this API)
  // - camelCase
  // - or were explicitly quoted/backticked in the source text
  const src = text ?? '';
  const filtered = [...cands].filter((t) => {
    if (t.includes('_')) return true;
    if (/[a-z][A-Z]/.test(t)) return true;
    if (new RegExp(`[\`"']${t}[\`"']`).test(src)) return true;
    return false;
  });
  return filtered;
}

function isNoiseTerm(term: string): boolean {
  const t = term.toLowerCase();
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'into',
    'when',
    'will',
    'can',
    'may',
    'also',
    'each',
    'per',
    'all',
    'one',
    'use',
    'see',
    'via',
    'using',
    'return',
    'returns',
    'include',
    'includes',
    'contain',
    'contains',
    'provide',
    'provides',
    'field',
    'fields',
    'value',
    'values',
    'item',
    'items',
    'list',
    'array',
    'object',
    'response',
    'result',
    'payload',
    'request',
    'example',
    'note',
    'notes',
    'optional',
    'required',
    'default',
    'true',
    'false',
    'null',
    'string',
    'number',
    'integer',
    'boolean',
    'schema',
    'type',
    'properties',
    'description',
    'enum',
    'data',
    'content',
    'structuredcontent',
    'notifications',
    'action',
    'actions',
    'information',
    'containing',
    'entries',
    'report',
    'may',
    'style',
    'variant',
    'variants',
    'inside',
    'with',
    'per',
  ]);
  return stop.has(t);
}

/** Exact + normalized fuzzy (alphanum only) presence check. */
function termPresentIn(term: string, fields: Set<string>): boolean {
  if (fields.has(term)) return true;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tnorm = norm(term);
  for (const f of fields) {
    if (norm(f) === tnorm) return true;
  }
  return false;
}

// Response prose vs schema check. Generalized to any term extracted from prose
// (component descriptions + operation descriptions), not a hardcoded list.
export function findResponseProseMismatches(spec: OpenApiSpec, options: ReportOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const only = options.only;

  // Component schemas: extract terms from their documentation prose and verify presence
  // in the full reachable field set (including nested items/oneOf etc.).
  // Focus on Response/Result/State schemas and a few broad containers to avoid
  // flooding from partial component descriptions that reference fields from larger envelopes.
  // biome-ignore lint/suspicious/noExplicitAny: schema access (matches file style)
  const components = (spec as any).components?.schemas || {};
  for (const [schemaName, schema] of Object.entries(components) as [string, any][]) {
    const name = schemaName;
    const isResponseLike = /Response|Result|State|Status|Output/i.test(name);
    if (!isResponseLike) continue;

    const prose = collectDescriptionText(schema);
    let terms = extractResponseFieldCandidates(prose);
    terms = terms.filter((t) => !isNoiseTerm(t));

    if (terms.length === 0) continue;

    const present = collectAllPropertyNames(schema, spec);
    for (const term of terms) {
      if (termPresentIn(term, present)) continue;

      findings.push({
        id: `missing-response-field-prose|${schemaName}|${term}`,
        kind: 'missing-response-field-prose',
        severity: 'high',
        schemaName,
        field: term,
        message: `prose/patch notes reference ${term} but it is absent from ${schemaName}`,
        evidence: {
          description: typeof schema.description === 'string' ? schema.description.slice(0, 200) : undefined,
        },
        suggestedAction: 'Add the field to the response schema (and bulk variants) if the server actually returns it.',
        confidence: 'medium',
      });
    }
  }

  // Operation descriptions: extract candidate terms, resolve the success response schema
  // (and request schema), and flag terms mentioned in prose that are absent from both.
  // This generalizes beyond any single command family or term.
  for (const [apiPath, methods] of Object.entries(spec.paths || {})) {
    const op: any = methods.post || methods.get;
    if (!op || !op.description) continue;
    const routeSig = `${methods.post ? 'POST' : 'GET'} ${apiPath}`;
    if (!routeMatchesOnly(routeSig, only)) continue;

    let terms = extractResponseFieldCandidates(op.description as string);
    terms = terms.filter((t) => !isNoiseTerm(t));
    if (terms.length === 0) continue;

    let respFields = new Set<string>();
    let primarySchemaName: string | undefined;
    try {
      const resolved = resolveSuccessResponseSchema(spec, routeSig);
      if (resolved.schema && Object.keys(resolved.schema).length > 0) {
        respFields = collectAllPropertyNames(resolved.schema, spec);
        primarySchemaName = resolved.primarySchemaName;
      }
    } catch {
      // resolution failed; proceed with empty respFields
    }

    const reqProps = getRequestSchemaForPath(spec, apiPath);
    const reqFields = new Set(Object.keys(reqProps || {}));

    for (const term of terms) {
      if (termPresentIn(term, respFields) || termPresentIn(term, reqFields)) continue;

      findings.push({
        id: `missing-response-field-prose|${routeSig}|${term}`,
        kind: 'missing-response-field-prose',
        severity: 'medium',
        route: routeSig,
        schemaName: primarySchemaName,
        field: term,
        message: `prose references "${term}" but it is absent from the response schema for ${routeSig}`,
        evidence: {
          proseExcerpt: (op.description as string | undefined)?.slice(0, 280),
        },
        suggestedAction: 'Add the field to the response schema if the server actually returns it, or update prose.',
        confidence: 'medium',
      });
    }
  }

  return findings;
}

function stableId(f: Finding): string {
  return f.id;
}

export function buildConsistencyReport(spec: OpenApiSpec, options: ReportOptions = {}): ConsistencyReport {
  // biome-ignore lint/suspicious/noExplicitAny: version helper accepts the richer loaded document shape
  const version = gameserverVersionFromSpec(spec as any);

  let findings: Finding[] = [
    ...findProseFieldMismatches(spec, options),
    ...findOverbroadSharedSchemas(spec, options),
    ...findResponseProseMismatches(spec, options),
  ];

  // Dedup by stable id
  const byId = new Map<string, Finding>();
  for (const f of findings) {
    const id = stableId(f);
    if (!byId.has(id)) byId.set(id, f);
  }
  findings = [...byId.values()];

  if (!options.includeLowConfidence) {
    findings = findings.filter((f) => f.confidence !== 'speculative');
  }

  // Simple sort: high severity first, then kind
  findings.sort((a, b) => {
    const sev = (s: string) => ['high', 'medium', 'low', 'info'].indexOf(s);
    if (sev(a.severity) !== sev(b.severity)) return sev(a.severity) - sev(b.severity);
    return (a.kind + a.route + (a.field || '')).localeCompare(b.kind + b.route + (b.field || ''));
  });

  const byKind: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] || 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  return {
    gameserverVersion: version,
    generatedAt: new Date().toISOString(),
    findings,
    summary: {
      total: findings.length,
      byKind,
      bySeverity,
    },
  };
}

export function formatConsistencyReport(report: ConsistencyReport, opts: { json?: boolean } = {}): string {
  if (opts.json) {
    return JSON.stringify(report, null, 2);
  }

  const lines: string[] = [];
  lines.push(`OpenAPI Consistency / Reality Report`);
  lines.push(`Gameserver: ${report.gameserverVersion}`);
  lines.push(`Findings: ${report.summary.total}`);
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('No issues detected by the current analyzers.');
    return lines.join('\n');
  }

  const grouped = new Map<string, Finding[]>();
  for (const f of report.findings) {
    if (!grouped.has(f.kind)) grouped.set(f.kind, []);
    grouped.get(f.kind)?.push(f);
  }

  for (const [kind, items] of grouped.entries()) {
    lines.push(`## ${kind} (${items.length})`);
    for (const f of items) {
      lines.push(`- [${f.severity}] ${f.route ?? f.schemaName ?? ''} ${f.field ? `field=${f.field}` : ''}`);
      lines.push(`  ${f.message}`);
      if (f.evidence.proseExcerpt) {
        lines.push(`  prose: ${normalizeTextForMatch(f.evidence.proseExcerpt).slice(0, 160)}...`);
      }
      if (f.evidence.examplePayload) {
        lines.push(`  example keys: ${Object.keys(f.evidence.examplePayload).join(', ')}`);
      }
      if (f.evidence.schemaEnum) {
        lines.push(`  enum in schema: ${f.evidence.schemaEnum.join(' | ')}`);
      }
      if (f.evidence.sharedWith?.length) {
        lines.push(
          `  shared with: ${f.evidence.sharedWith.slice(0, 4).join(', ')}${f.evidence.sharedWith.length > 4 ? ' ...' : ''}`,
        );
      }
      if (f.suggestedAction) {
        lines.push(`  suggestion: ${f.suggestedAction}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('Run with --json for machine-readable output.');
  lines.push('This is a high-recall fuzzy report. Some items require human or LLM review.');

  return lines.join('\n');
}

// Convenience for scripts
export function runReport(options: ReportOptions & { specPath?: string } = {}): ConsistencyReport {
  const spec = loadOpenApiSpec(options.specPath);
  return buildConsistencyReport(spec, options);
}
