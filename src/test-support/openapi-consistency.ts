import { gameserverVersionFromSpec } from '../openapi-metadata';

import {
  buildResponseSchemaCandidates,
  collectAllPropertyNames,
  getEffectiveSchema,
  loadOpenApiSpec as loadSharedOpenApiSpec,
  resolveSuccessResponseSchema,
  type OpenApiSpec as SharedOpenApiSpec,
} from './openapi-schema';

export type OpenApiSpec = SharedOpenApiSpec;

export interface DocExample {
  raw: string;
  parsed: unknown;
  payloadShape: Record<string, unknown> | null;
}

/** Rich candidate with provenance for review/debug (used internally; string[] APIs kept for compat). */
export interface FieldCandidate {
  term: string;
  provenance: string;
}

export interface Finding {
  id: string;
  kind:
    | 'prose-field-mismatch'
    | 'overbroad-shared-schema'
    | 'missing-response-field-prose'
    | 'schema-description-inconsistency'
    // 'cli-alias-vs-schema' reserved for future cross-check of curated CLI aliases vs schema fields
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
    schemaEnumValues?: string[];
    description?: string;
    sharedWith?: string[];
    affectedRouteCount?: number;
    flaggedRouteCount?: number;
    unflaggedRoutes?: string[];
    narrowedEnumRoutes?: Array<{
      route: string;
      enum: string[];
    }>;
    enumGroups?: Array<{
      enum: string[];
      routes: string[];
    }>;
    cliAlias?: string;
    responseCandidates?: string[];
    /** Provenance for how this field candidate was synthesized (e.g. from compound, JSON, or loose proseKey in a context block). */
    candidateProvenance?: string;
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
    sharedSchemaClusters?: {
      total: number;
      affectedRoutes: number;
    };
  };
}

export interface ReportOptions {
  only?: string[];
  includeLowConfidence?: boolean;
  includeComponentProse?: boolean;
}

type ProseTarget = 'request' | 'response' | 'neutral' | 'ambiguous';

interface ClassifiedOperationProseSegment {
  text: string;
  target: ProseTarget;
  label: string;
}

interface OperationProseContext {
  routeSig: string;
  requestFields: Set<string>;
  responseFields: Set<string>;
  knownOperationTerms: Set<string>;
  includeAmbiguous: boolean;
}

interface CandidateExtractionOptions {
  forceRelevant?: boolean;
}

const descTextMemo = new WeakMap<object, string>();

export function loadOpenApiSpec(customPath?: string): OpenApiSpec {
  return loadSharedOpenApiSpec(customPath);
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

/** Split description into blocks on blank-line boundaries (\n\n or rate-limit notes). */
function splitDescriptionBlocks(text: string): string[] {
  if (!text) return [];
  // Split on one or more blank lines (handles \n\n and \r\n variants)
  const parts = text.split(/\n\s*\n+/);
  return parts.map((b) => b.trim()).filter(Boolean);
}

function splitDescriptionSentences(block: string): string[] {
  const matches = block.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [block];
  return matches.map((part) => part.trim()).filter(Boolean);
}

/** Return whether this block looks like a rate-limit note (used to bound post-example context). */
function isRateLimitBlock(block: string | undefined): boolean {
  if (!block) return false;
  return /\*\*Rate limited\b|Rate limited\b/i.test(block);
}

/** Return whether this block is/contains the canonical Example section. */
function isExampleBlock(block: string | undefined): boolean {
  if (!block) return false;
  return /\*\*Example:?\*\*/i.test(block) || /^Example:/i.test(block);
}

/**
 * Decide if a block is relevant for field/compound extraction.
 * Relevant near cue words (payload, accepts, Example, parameter, specify, : ) or after an example block
 * until a rate-limit note (per the requested split rules).
 */
function classifyBlock(
  block: string | undefined,
  index: number,
  blocks: readonly (string | undefined)[],
): { relevant: boolean; label: string } {
  if (!block) return { relevant: false, label: 'general' };
  const lower = block.toLowerCase();
  const cues = ['payload', 'accepts', 'example', 'parameter', 'specify', 'specifies'];
  const hasCue = cues.some((c) => lower.includes(c));
  const hasColonTail = /:\s*$/.test(block) || /[=:]\s*["'`]/.test(block);
  const hasCode = /[`"']/.test(block) || /\{[\s\S]*\}/.test(block) || /"[a-z_]+":/.test(block);
  // Already-canonical snake_case tokens or quoted identifiers make the block relevant for recall
  const hasFieldLikeToken = /\b[a-z][a-z0-9_]{2,}\b/.test(block) && block.includes('_');

  // Look at previous block for "after the example block"
  const prevCandidate = index > 0 ? blocks[index - 1] : undefined;
  const prev = (prevCandidate ?? '') as string;
  const prevWasExample = isExampleBlock(prev);

  let label = 'general';
  if (isExampleBlock(block)) label = 'example';
  else if (prevWasExample) label = 'post-example';
  else if (hasCue || hasColonTail) label = 'cue-near';
  else if (hasCode) label = 'code-like';
  else if (hasFieldLikeToken) label = 'field-token';

  const relevant = hasCue || hasColonTail || isExampleBlock(block) || prevWasExample || hasCode || hasFieldLikeToken;

  return { relevant, label };
}

/** Is there a code-like token near the match index (backticks, quotes, braces, =, : or "key": pattern). */
function isNearCodeLikeToken(text: string, index: number | undefined): boolean {
  if (index == null || index < 0) return false;
  const start = Math.max(0, index - 35);
  const end = Math.min(text.length, index + 55);
  const win = text.slice(start, end);
  if (/[`"'[{]/.test(win)) return true;
  if (/[=:]\s*["'`]/.test(win)) return true;
  if (/"[a-z_][a-z0-9_]*"\s*:/.test(win)) return true;
  return false;
}

/**
 * Harvest FieldCandidates (with provenance) from text using only context-relevant blocks.
 * This powers both legacy string[] extractors (compat) and rich paths for provenance.
 */
function harvestFieldCandidates(
  text: string | undefined,
  options: CandidateExtractionOptions = {},
): FieldCandidate[] {
  if (!text) return [];
  const blocks = splitDescriptionBlocks(text);
  const out: FieldCandidate[] = [];
  let afterExample = false;

  for (let i = 0; i < blocks.length; i++) {
    const maybeBlock = blocks[i];
    if (typeof maybeBlock !== 'string' || !maybeBlock) continue;
    const block = maybeBlock as string;
    const { relevant, label } = classifyBlock(block, i, blocks);
    const useBlock = options.forceRelevant || relevant || afterExample;
    const provenanceLabel = options.forceRelevant && !relevant ? 'forced response context' : label;
    if (!useBlock) {
      if (isExampleBlock(block)) afterExample = true;
      if (isRateLimitBlock(block)) afterExample = false;
      continue;
    }

    // JSON keys inside this block (examples are the primary source)
    const jsonKey = /"([a-z][a-z0-9_]*)"\s*:/g;
    for (let m = jsonKey.exec(block); m !== null; m = jsonKey.exec(block)) {
      if (m[1]) {
        const term = m[1];
        const prov =
          isExampleBlock(block) || provenanceLabel === 'example' || provenanceLabel === 'post-example'
            ? `from JSON in example`
            : `from JSON key in ${provenanceLabel} block`;
        out.push({ term, provenance: prov });
      }
    }

    // Loose proseKey: quoted or key= / key: / key<space>
    const proseKey = /[`"']([a-z][a-z0-9_]*)[`"']|([a-z][a-z0-9_]*)[=\s:]/g;
    for (let m = proseKey.exec(block); m !== null; m = proseKey.exec(block)) {
      const candidate = m[1] || m[2];
      if (candidate && candidate.length > 1 && candidate.length < 40) {
        // Try to capture a nearby cue for provenance
        const near = /\b(use|accepts?|specify|payload|parameter|example)\b[^.]{0,20}/i.exec(
          block.slice(Math.max(0, (m.index || 0) - 20), (m.index || 0) + 30),
        );
        const matchedCue = near?.[1];
        const cuePart = matchedCue ? ` after '${matchedCue.toLowerCase()}'` : '';
        out.push({ term: candidate, provenance: `from loose proseKey${cuePart} in ${provenanceLabel}` });
      }
    }

    if (isExampleBlock(block)) afterExample = true;
    if (isRateLimitBlock(block)) afterExample = false;
  }

  // Dedup by term, prefer more-specific provenance (example > cue > general)
  const best = new Map<string, FieldCandidate>();
  for (const c of out) {
    const prev = best.get(c.term);
    if (!prev) {
      best.set(c.term, c);
      continue;
    }
    const rank = (p: string) => (/example/i.test(p) ? 3 : /JSON|cue|proseKey/i.test(p) ? 2 : 1);
    if (rank(c.provenance) > rank(prev.provenance)) best.set(c.term, c);
  }
  return [...best.values()];
}

/** Extract plausible field names mentioned in prose (heuristic, high-recall). Legacy string[] API kept for compat. */
export function extractMentionedFieldNames(text: string | undefined): string[] {
  return harvestFieldCandidates(text).map((c) => c.term);
}

function schemaRequestProperties(spec: OpenApiSpec, apiPath: string, method: 'get' | 'post' = 'post') {
  const pathItem = spec.paths?.[apiPath];
  if (!pathItem) return {};
  // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
  const op: any = pathItem[method];
  if (!op) return {};
  const schema = op.requestBody?.content?.['application/json']?.schema;
  if (!schema) return {};
  // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
  const effective = getEffectiveSchema(spec, schema as any);
  // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
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

function routeMatchesOnly(route: string, only?: string[]): boolean {
  if (!only || only.length === 0) return true;
  const lower = route.toLowerCase();
  return only.some((o) => lower.includes(o.toLowerCase()));
}

function isActionCatalogBlock(block: string | undefined): boolean {
  if (!block) return false;
  return /^\s*Actions:\s/i.test(block);
}

function isHelpDocumentationProse(text: string): boolean {
  return /\bReturns documentation for all actions available in [a-z][a-z0-9_]*\b/i.test(text);
}

function isPermissionProse(text: string): boolean {
  return /\bRequires\b[^.?!]*\bpermission\b/i.test(text);
}

function isErrorResponseProse(text: string): boolean {
  return /\berror response\b|\berror details\b|\berror codes?\b/i.test(text);
}

function hasExplicitFieldList(text: string): boolean {
  return /((?:\b[a-z][a-z0-9_]*\b(?:\s*,\s*(?:and\s+)?|\s+and\s+))+?\b[a-z][a-z0-9_]*\b)\s+(?:fields?|keys?)\b/i.test(
    text,
  );
}

function mentionsKnownOperation(text: string, knownOperationTerms: Set<string>): boolean {
  const lower = text.toLowerCase();
  for (const term of knownOperationTerms) {
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) return true;
  }
  return false;
}

function mentionsAnyField(text: string, fields: Set<string>): boolean {
  for (const field of fields) {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return true;
  }
  return false;
}

function mentionsAnyRequestField(text: string, requestFields: Set<string>): boolean {
  return mentionsAnyField(text, requestFields);
}

function mentionsAnyResponseField(text: string, responseFields: Set<string>): boolean {
  return mentionsAnyField(text, responseFields);
}

function hasFieldLikeResponseCandidate(text: string): boolean {
  if (/\b[a-z][a-z0-9_]*_[a-z0-9_]*\b/.test(text)) return true;
  return extractResponseFieldCandidatesWithProvenance(text, { forceRelevant: true }).some((c) => !isNoiseTerm(c.term));
}

function hasResponseContext(text: string, responseFields: Set<string>): boolean {
  if (hasExplicitFieldList(text)) return true;
  const hasResponseNoun = /\b(?:response|result|returns?|returned|structuredContent|details)\b/i.test(text);
  const hasReturnVerb = /\b(?:returns?|returned|shows|includes?|contains?|has)\b/i.test(text);
  const hasFieldNoun = /\b(?:fields?|keys?|payload|result|response|details)\b/i.test(text);
  if (hasResponseNoun && hasReturnVerb && hasFieldNoun) return true;

  const hasReturnOnlyVerb = /\b(?:returns?|returned)\b/i.test(text);
  if (hasReturnOnlyVerb && hasFieldLikeResponseCandidate(text)) return true;

  const hasDisplayVerb = /\b(?:shows?|lists?|reports?|summari[sz]es|carries)\b/i.test(text);
  if (hasDisplayVerb && (mentionsAnyResponseField(text, responseFields) || hasFieldLikeResponseCandidate(text))) {
    return true;
  }

  return false;
}

function hasRequestContext(text: string, requestFields: Set<string>): boolean {
  if (/\b(?:accepts?|parameters?|pass|specify|set|call with|omit)\b/i.test(text)) return true;
  if (
    /\b(?:payload|request)\b/i.test(text) &&
    !/\b(?:response|result|returns?|returned|structuredContent|details)\b/i.test(text)
  ) {
    return true;
  }
  if (/\buse\s+[a-z][a-z0-9_]*\s*=/i.test(text)) return true;
  return /\buse\b/i.test(text) && mentionsAnyRequestField(text, requestFields);
}

function isNeutralOperationProseSegment(
  text: string,
  routeSig: string,
  knownOperationTerms: Set<string>,
  responseFields: Set<string>,
): boolean {
  if (!text) return true;
  if (isExampleBlock(text)) return true;
  if (isRateLimitBlock(text)) return true;
  if (isActionCatalogBlock(text)) return true;
  if (isHelpDocumentationProse(text)) return true;
  if (isPermissionProse(text)) return true;
  if (isErrorResponseProse(text)) return true;

  const routeLeaf = getRouteLeaf(routeSig).toLowerCase();
  if (routeLeaf && new RegExp(`\\b${routeLeaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
    if (!hasResponseContext(text, responseFields)) return true;
  }

  if (mentionsKnownOperation(text, knownOperationTerms) && !hasResponseContext(text, responseFields)) return true;

  return false;
}

function classifyOperationProseSegment(text: string, context: OperationProseContext): ProseTarget {
  if (isNeutralOperationProseSegment(text, context.routeSig, context.knownOperationTerms, context.responseFields))
    return 'neutral';

  const request = hasRequestContext(text, context.requestFields);
  if (
    request &&
    hasExplicitFieldList(text) &&
    !/\b(?:response|result|returns?|returned|structuredContent|details|shows?|lists?|reports?|summari[sz]es|carries)\b/i.test(
      text,
    )
  ) {
    return 'request';
  }

  const response = hasResponseContext(text, context.responseFields);

  if (response && !request) return 'response';
  if (request && !response) return 'request';
  if (response && request) return 'ambiguous';
  return 'ambiguous';
}

function getRouteLeaf(routeSig: string): string {
  const pathPart = routeSig.split(/\s+/).slice(1).join(' ');
  return pathPart.split('/').filter(Boolean).pop() ?? '';
}

function collectKnownOperationTerms(spec: OpenApiSpec): Set<string> {
  const terms = new Set<string>();
  for (const apiPath of Object.keys(spec.paths || {})) {
    const leaf = apiPath.split('/').filter(Boolean).pop();
    if (leaf) terms.add(leaf.toLowerCase());
  }
  return terms;
}

function collectOperationResponseCandidateSegments(
  description: string | undefined,
  context: OperationProseContext,
): ClassifiedOperationProseSegment[] {
  if (!description) return [];
  const segments: ClassifiedOperationProseSegment[] = [];

  for (const block of splitDescriptionBlocks(description)) {
    const blockSegments =
      isExampleBlock(block) || isRateLimitBlock(block) || isActionCatalogBlock(block)
        ? [block]
        : splitDescriptionSentences(block);

    for (const text of blockSegments) {
      const target = classifyOperationProseSegment(text, context);
      if (target === 'response' || (target === 'ambiguous' && context.includeAmbiguous)) {
        segments.push({
          text,
          target,
          label: target === 'response' ? 'response context' : 'ambiguous context',
        });
      }
    }
  }

  return segments;
}

function collectOperationRequestCandidateSegments(
  description: string | undefined,
  context: OperationProseContext,
): ClassifiedOperationProseSegment[] {
  if (!description) return [];
  const segments: ClassifiedOperationProseSegment[] = [];

  for (const block of splitDescriptionBlocks(description)) {
    const blockSegments =
      isExampleBlock(block) || isRateLimitBlock(block) || isActionCatalogBlock(block)
        ? [block]
        : splitDescriptionSentences(block);

    for (const text of blockSegments) {
      const target = classifyOperationProseSegment(text, context);
      if (target === 'request' || (target === 'ambiguous' && context.includeAmbiguous)) {
        segments.push({
          text,
          target,
          label: target === 'request' ? 'request context' : 'ambiguous context',
        });
      }
    }
  }

  return segments;
}

function shouldSuppressOperationResponseCandidate(
  candidate: FieldCandidate,
  routeSig: string,
  sourceText: string,
  requestFields: Set<string>,
  knownOperationTerms: Set<string>,
  target: ProseTarget,
): boolean {
  const term = candidate.term;
  const lower = term.toLowerCase();
  const routeLeaf = getRouteLeaf(routeSig).toLowerCase();
  const isLooseCommandReference = /loose proseKey|code-like/i.test(candidate.provenance);
  const actionValueTerms = new Set(['help', 'info', 'types']);
  const narrativeCompoundStarters = new Set([
    'each',
    'every',
    'this',
    'their',
    'small',
    'total',
    'same',
    'current',
    'find',
  ]);

  if (/example/i.test(candidate.provenance)) return true;
  if (lower === routeLeaf) return true;
  if (isSkillOrProficiencyReference(term, sourceText)) return true;
  if (target !== 'response' && requestFields.has(term)) return true;
  if (target !== 'response' && termPresentIn(term, requestFields)) return true;
  if (isLooseCommandReference && isQuotedExampleValue(term, sourceText)) return true;
  if (isLooseCommandReference && knownOperationTerms.has(lower)) return true;
  if (isLooseCommandReference && /_passengers?$/.test(lower)) return true;
  if (isLooseCommandReference && actionValueTerms.has(lower)) return true;
  if (/^from compound/.test(candidate.provenance)) {
    if (isHeaderNameCompound(term, sourceText)) return true;
    const starter = lower.split('_')[0];
    if (starter && narrativeCompoundStarters.has(starter)) return true;
  }

  return false;
}

function isSkillOrProficiencyReference(term: string, sourceText: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b\\s+(?:skill|proficiency)s?\\b`, 'i').test(sourceText);
}

function isLiteralRequestFieldCandidate(candidate: FieldCandidate, sourceText: string): boolean {
  const term = candidate.term;
  if (term.includes('_') || /[a-z][A-Z]/.test(term)) return true;

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`["'\`]${escaped}["'\`]\\s*:`, 'i').test(sourceText)) return true;
  if (new RegExp(`\\b${escaped}\\s*[=:]`, 'i').test(sourceText)) return true;
  if (
    /\b(?:options?|parameters?)\s*:/i.test(sourceText) &&
    new RegExp(`\\b${escaped}\\b\\s*(?:\\(|:|=|,)`, 'i').test(sourceText)
  ) {
    return true;
  }

  return false;
}

function isQuotedRequestFieldIdentifier(candidate: FieldCandidate, sourceText: string): boolean {
  const term = candidate.term;
  if (!term.includes('_') && !/[a-z][A-Z]/.test(term)) return false;

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(?:pass|specify|set|omit|accepts?)\\s+["'\`]${escaped}["'\`]`, 'i').test(sourceText);
}

function isBareQuotedRequestValue(candidate: FieldCandidate, sourceText: string): boolean {
  if (isQuotedRequestFieldIdentifier(candidate, sourceText)) return false;

  const escaped = candidate.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`["'\`]${escaped}["'\`](?!\\s*:)`, 'i').test(sourceText);
}

function shouldSuppressOperationRequestCandidate(
  candidate: FieldCandidate,
  routeSig: string,
  sourceText: string,
  knownOperationTerms: Set<string>,
): boolean {
  const term = candidate.term;
  const lower = term.toLowerCase();
  const routeLeaf = getRouteLeaf(routeSig).toLowerCase();

  if (/example/i.test(candidate.provenance)) return true;
  if (!isLiteralRequestFieldCandidate(candidate, sourceText)) return true;
  if (lower === routeLeaf) return true;
  if (knownOperationTerms.has(lower)) return true;
  if (isBareQuotedRequestValue(candidate, sourceText)) return true;
  if (isQuotedExampleValue(term, sourceText)) return true;
  if (shouldSuppressKnownCodeTerm(candidate, sourceText)) return true;

  // Request prose should prefer literal field syntax. Do not turn "buy order"
  // or similar narrative phrases into request schema mismatches by default.
  if (/^from compound/.test(candidate.provenance) && !sourceText.includes(term)) return true;

  return false;
}

function isHeaderNameCompound(term: string, text: string): boolean {
  if (!term || !text || !term.includes('_')) return false;
  const parts = term.split('_').filter(Boolean);
  if (parts.length < 2) return false;

  const phrase = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[-\\s]+');
  const headerPattern = new RegExp(`(?:\\bX[-\\s]+)?${phrase}\\b[^.]{0,80}\\bheader\\b`, 'i');
  return headerPattern.test(text);
}

function isQuotedExampleValue(term: string, text: string): boolean {
  if (!term || !text) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quotedTerm = new RegExp(`["'\`]${escaped}["'\`]`, 'gi');

  for (let match = quotedTerm.exec(text); match !== null; match = quotedTerm.exec(text)) {
    const start = match.index ?? 0;
    const before = text.slice(Math.max(0, start - 40), start);
    if (/\be\.g\.|\b(?:for example|such as|example value)\b/i.test(before)) return true;
  }

  return false;
}

export function findProseFieldMismatches(spec: OpenApiSpec, options: ReportOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const only = options.only;
  const knownOperationTerms = collectKnownOperationTerms(spec);

  for (const [apiPath, methods] of Object.entries(spec.paths || {})) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
    const op: any = methods.post;
    if (!op) continue;
    const routeSig = `POST ${apiPath}`;
    if (!routeMatchesOnly(routeSig, only)) continue;

    const props = getRequestSchemaForPath(spec, apiPath);

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
            candidateProvenance: 'from JSON in example',
          },
          suggestedAction:
            'Align the request schema property name with the documented server help / prose, or update prose examples to use the canonical schema field name.',
          confidence: 'high',
        });
      }
    }

    const requestFields = new Set(Object.keys(props || {}));
    const responseCandidateFields = collectResponseCandidateFields(spec, routeSig);
    const requestSegments = collectOperationRequestCandidateSegments(op.description as string | undefined, {
      routeSig,
      requestFields,
      responseFields: responseCandidateFields.fields,
      knownOperationTerms,
      includeAmbiguous: Boolean(options.includeLowConfidence),
    });

    for (const segment of requestSegments) {
      if (isExampleBlock(segment.text)) continue; // JSON examples are handled above with high confidence.

      const rich = harvestFieldCandidates(segment.text, { forceRelevant: true }).filter((c) => !isNoiseTerm(c.term));
      for (const candidate of rich) {
        const term = candidate.term;
        if (termPresentIn(term, requestFields)) continue;
        if (shouldSuppressOperationRequestCandidate(candidate, routeSig, segment.text, knownOperationTerms)) continue;

        const confidence = segment.target === 'ambiguous' ? 'speculative' : 'medium';
        const severity = segment.target === 'ambiguous' ? 'low' : 'medium';
        const id = `prose-field-mismatch|${routeSig}|${term}`;
        if (findings.some((finding) => finding.id === id)) continue;
        findings.push({
          id,
          kind: 'prose-field-mismatch',
          severity,
          route: routeSig,
          field: term,
          message: `request prose references "${term}" but request schema has no such property`,
          evidence: {
            proseExcerpt: segment.text.slice(0, 280),
            schemaProperty: props[term],
            candidateProvenance: `${candidate.provenance}; ${segment.label}`,
          },
          suggestedAction:
            'Add the field to the request schema if clients can send it, or update prose to use the canonical request field name.',
          confidence,
        });
      }
    }

    // Also check the schema property descriptions for self-confusing names (nice-to-have)
    for (const [propName, propSchema] of Object.entries(props)) {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
      const desc = (propSchema as any)?.description;
      if (typeof desc === 'string' && propName === 'id') {
        // Flag when the canonical 'id' field is documented with prose that implies a domain-specific name.
        // This is intentionally broader than a fixed word list to surface more "friendly name vs id" drift.
        const talksAboutNames = /\b(name|destination|station|commission_id|player|ship|template|mission|item)\b/i.test(
          desc,
        );
        const mentionsAlternatives = /\bor\b|[/|]/.test(desc);
        if (talksAboutNames || mentionsAlternatives) {
          findings.push({
            id: `schema-description-inconsistency|${routeSig}|${propName}`,
            kind: 'schema-description-inconsistency',
            severity: 'medium',
            route: routeSig,
            field: propName,
            message: `schema property is named "${propName}" but its description talks about domain names or alternatives`,
            evidence: {
              schemaProperty: propSchema,
              description: desc,
            },
            confidence: 'medium',
          });
        }
      }
    }
  }
  return findings;
}

const KNOWN_BROAD_ENUM_FIELDS = new Set(['direction', 'mode', 'op', 'operation', 'variant']);

type SharedSchemaMember = {
  route: string;
  path: string;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
  props: Record<string, any>;
};

type EnumGroup = {
  enum: string[];
  routes: string[];
  description?: string;
};

function isBroadEnumField(field: string): boolean {
  return KNOWN_BROAD_ENUM_FIELDS.has(field);
}

function enumValuesFromSchemaField(schema: unknown): string[] | undefined {
  const en = (schema as { enum?: unknown } | undefined)?.enum;
  if (!Array.isArray(en) || en.length === 0) return undefined;
  return en.map(String);
}

function enumGroupKey(values: string[]): string {
  return sortedUnique(values).join('\u0000');
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function descriptionReferencesMultipleActions(description: string | undefined): boolean {
  if (!description || !/\baction\b/i.test(description)) return false;
  const quotedTerms = description.match(/'[^']+'/g) ?? [];
  return quotedTerms.length >= 2;
}

function collectEnumGroupsForField(members: SharedSchemaMember[], field: string): EnumGroup[] {
  const groups = new Map<string, EnumGroup>();

  for (const member of members) {
    const values = enumValuesFromSchemaField(member.props[field]);
    if (!values) continue;

    const key = enumGroupKey(values);
    const existing = groups.get(key);
    if (existing) {
      existing.routes.push(member.route);
      continue;
    }

    groups.set(key, {
      enum: values,
      routes: [member.route],
      description: (member.props[field] as { description?: string } | undefined)?.description,
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      routes: sortedUnique(group.routes),
    }))
    .sort((a, b) => {
      if (b.enum.length !== a.enum.length) return b.enum.length - a.enum.length;
      if (b.routes.length !== a.routes.length) return b.routes.length - a.routes.length;
      return a.enum.join('|').localeCompare(b.enum.join('|'));
    });
}

function collectBroadEnumFields(members: SharedSchemaMember[]): string[] {
  const fields = new Set<string>();

  for (const member of members) {
    for (const [field, schema] of Object.entries(member.props)) {
      const values = enumValuesFromSchemaField(schema);
      if (values && values.length >= 3 && isBroadEnumField(field)) fields.add(field);
    }
  }

  return [...fields].sort();
}

function routeFindingKey(route: string | undefined, field: string | undefined): string {
  return `${route ?? ''}\u0000${field ?? ''}`;
}

function buildOverbroadSharedSchemaClusters(members: SharedSchemaMember[], routeFindings: Finding[]): Finding[] {
  const routeFindingKeys = new Set(
    routeFindings
      .filter((finding) => finding.kind === 'overbroad-shared-schema' && finding.route && finding.field)
      .map((finding) => routeFindingKey(finding.route, finding.field)),
  );
  const clusters: Finding[] = [];

  for (const field of collectBroadEnumFields(members)) {
    const enumGroups = collectEnumGroupsForField(members, field);
    const broadGroups = enumGroups.filter((group) => group.enum.length >= 3);

    for (const group of broadGroups) {
      const flaggedRoutes = group.routes.filter((route) => routeFindingKeys.has(routeFindingKey(route, field)));
      const hasRouteFinding = flaggedRoutes.length > 0;
      const hasMultiActionDescription = descriptionReferencesMultipleActions(group.description);
      if (!hasRouteFinding && !hasMultiActionDescription) continue;
      if (group.routes.length <= flaggedRoutes.length) continue;

      const flaggedRouteSet = new Set(flaggedRoutes);
      const unflaggedRoutes = group.routes.filter((route) => !flaggedRouteSet.has(route));
      const narrowedEnumRoutes = enumGroups
        .filter((candidate) => candidate.enum.length < group.enum.length)
        .flatMap((candidate) =>
          candidate.routes.map((route) => ({
            route,
            enum: candidate.enum,
          })),
        )
        .sort((a, b) => a.route.localeCompare(b.route));
      const firstRoute = group.routes[0] ?? 'unknown-route';

      clusters.push({
        id: `overbroad-shared-schema-cluster|${field}|${firstRoute}`,
        kind: 'overbroad-shared-schema',
        severity: 'info',
        field,
        message: `shared request schema exposes broad "${field}" enum on ${group.routes.length} routes; ${flaggedRoutes.length} are emitted as action findings`,
        evidence: {
          schemaEnum: group.enum,
          schemaEnumValues: group.enum,
          description: group.description,
          sharedWith: group.routes,
          affectedRouteCount: group.routes.length,
          flaggedRouteCount: flaggedRoutes.length,
          unflaggedRoutes,
          narrowedEnumRoutes,
          enumGroups: enumGroups.map((candidate) => ({
            enum: candidate.enum,
            routes: candidate.routes,
          })),
        },
        suggestedAction:
          'Review the shared request schema group and give affected dedicated paths narrower request schemas or a oneOf/discriminator model.',
        confidence: 'high',
      });
    }
  }

  return clusters;
}

export function findOverbroadSharedSchemas(spec: OpenApiSpec, options: ReportOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const only = options.only;

  // Group routes by key set (ignore minor type/enum annotation diffs for "sharing" detection).
  // This catches cases where a component schema or copy is reused with nearly identical fields.
  const groups = new Map<string, SharedSchemaMember[]>();

  for (const [apiPath, methods] of Object.entries(spec.paths || {})) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
    const op: any = methods.post;
    if (!op) continue;
    const routeSig = `POST ${apiPath}`;
    if (!routeMatchesOnly(routeSig, only)) continue;

    const props = getRequestSchemaForPath(spec, apiPath);
    if (Object.keys(props).length < 4) continue; // ignore trivial schemas

    // Prefer key-based grouping for sharing; fall back keeps prior behavior available.
    const sig = keySetSignature(props);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)?.push({ route: routeSig, path: apiPath, props });
  }

  for (const [_sig, members] of groups.entries()) {
    if (members.length < 2) continue;

    // Look for action-specific paths that still carry the (near) shared shape.
    // Use a heuristic rather than a static list so new action routes are considered.
    const actionPaths = members.filter((m) => {
      const last = (m.path.split('/').pop() || '').toLowerCase();
      if (['job_add', 'transfer', 'buy_listing', 'sell_listing', 'upgrade', 'build', 'craft'].includes(last))
        return true;
      // Treat non-query leaf actions as dedicated (avoid get_*, list_*, view_*, search_*, completed_* etc.)
      if (/^(get_|list_|view_|search_|completed_|v2_get_)/.test(last)) return false;
      // Anything with an action verb in the last segment is interesting.
      return (
        /_(add|buy|sell|send|take|make|do|run|start|stop|attack|dock|jump|claim|load|unload|deliver)/.test(last) ||
        last.includes('_')
      );
    });

    if (actionPaths.length === 0) continue;

    // Check for over-broad enum fields on dedicated action paths (generalized beyond just "direction").
    for (const member of actionPaths) {
      for (const [fname, fsch] of Object.entries(member.props)) {
        const en = enumValuesFromSchemaField(fsch);
        if (en && en.length >= 3 && isBroadEnumField(fname)) {
          const sharedRoutes = members.map((m) => m.route);
          const id = `overbroad-shared-schema|${member.route}|${fname}`;
          if (findings.some((f) => f.id === id)) continue;
          findings.push({
            id,
            kind: 'overbroad-shared-schema',
            severity: 'high',
            route: member.route,
            field: fname,
            message: `dedicated action path uses a shared schema with broad "${fname}" enum that documents values for other actions`,
            evidence: {
              schemaEnum: en,
              // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
              description: (fsch as any)?.description,
              sharedWith: sharedRoutes.filter((r) => r !== member.route),
            },
            suggestedAction:
              'Give dedicated action paths (job_add, transfer, ...) their own request schemas with appropriately narrowed enums, or use oneOf/discriminators.',
            confidence: 'high',
          });
        }
      }
    }

    findings.push(...buildOverbroadSharedSchemaClusters(members, findings));

    // General note for large shared shapes on leaf actions (use speculative confidence so it can be filtered).
    if (members.length >= 3 && actionPaths.length > 0) {
      for (const ap of actionPaths) {
        const already = findings.some((f) => f.route === ap.route && f.kind === 'overbroad-shared-schema');
        if (already) continue;
        findings.push({
          id: `overbroad-shared-schema|${ap.route}|shared-shape`,
          kind: 'overbroad-shared-schema',
          severity: 'medium',
          route: ap.route,
          message: `request schema appears to be shared across ${members.length} actions (large overlapping property set)`,
          evidence: {
            sharedWith: members.map((m) => m.route),
          },
          confidence: 'speculative',
        });
      }
    }
  }

  return findings;
}

// biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
function keySetSignature(props: Record<string, any>): string {
  return Object.keys(props).sort().join(',');
}

/**
 * Collect human prose descriptions from a schema subtree (descriptions on the node,
 * its properties, items, and oneOf/allOf/anyOf variants). Avoids schema keywords.
 * Memoized by input node object.
 */
// biome-ignore lint/suspicious/noExplicitAny: schema walking (matches style of collectAllPropertyNames)
function collectDescriptionText(node: any): string {
  if (!node || typeof node !== 'object') return '';
  const cached = descTextMemo.get(node);
  if (cached !== undefined) return cached;

  const parts: string[] = [];
  if (typeof node.description === 'string') {
    parts.push(node.description);
  }
  if (node.properties && typeof node.properties === 'object') {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
    for (const p of Object.values(node.properties as Record<string, any>)) {
      const sub = collectDescriptionText(p);
      if (sub) parts.push(sub);
    }
  }
  if (node.items) {
    const sub = collectDescriptionText(node.items);
    if (sub) parts.push(sub);
  }
  for (const k of ['oneOf', 'allOf', 'anyOf'] as const) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
    const arr = (node as any)[k];
    if (Array.isArray(arr)) {
      for (const v of arr) {
        const sub = collectDescriptionText(v);
        if (sub) parts.push(sub);
      }
    }
  }
  const joined = parts.join('\n');
  descTextMemo.set(node, joined);
  return joined;
}

/** Positive allow-list of first-word stems known to start real schema compounds (e.g. base_fare, speed_bonus). */
const goodCompoundStems = new Set([
  'base',
  'speed',
  'tow',
  'cargo',
  'fuel',
  'hull',
  'scan',
  'stealth',
  'mission',
  'job',
  'item',
  'order',
  'buy',
  'sell',
  'listing',
  'player',
  'target',
  'station',
  'system',
  'berth',
  'passenger',
  'crew',
  'weapon',
  'ammo',
  'shield',
  'power',
  'module',
  'facility',
  'recipe',
  'template',
  'xp',
  'level',
  'ticks',
  'travel',
  'jump',
  'dock',
  'load',
  'unload',
]);

/** Plausible right-hand sides for two-word field references in docs (kept from prior logic). */
const compoundableTail = new Set([
  'id',
  'name',
  'type',
  'count',
  'fare',
  'bonus',
  'ticks',
  'remaining',
  'level',
  'xp',
  'price',
  'cost',
  'capacity',
  'quantity',
  'amount',
  'limit',
  'rate',
  'speed',
  'value',
  'time',
  'duration',
  'cooldown',
  'progress',
  'status',
  'result',
  'fuel',
  'hull',
  'scan',
  'stealth',
  'reputation',
  'skill',
  'hint',
  'location',
  'details',
  'item',
  'listing',
  'order',
  'job',
  'template',
  'recipe',
  'passenger',
  'events',
  'log',
  'system',
  'station',
  'base',
]);

/** Extract candidate field terms from prose, including compounds like "base fare" -> "base_fare".
 *  Now context-sensitive: compounds and loose keys are only synthesized inside relevant blocks.
 *  Legacy string[] kept; use the WithProvenance variant for review provenance.
 */
export function extractResponseFieldCandidates(text: string | undefined): string[] {
  const rich = extractResponseFieldCandidatesWithProvenance(text);
  return rich.map((c) => c.term);
}

function extractFieldListTerms(block: string): string[] {
  const out: string[] = [];
  const fieldList =
    /((?:\b[a-z][a-z0-9_]*\b(?:\s*,\s*(?:and\s+)?|\s+and\s+))+?\b[a-z][a-z0-9_]*\b)\s+(?:fields?|properties|keys?)\b/gi;

  for (let m = fieldList.exec(block); m !== null; m = fieldList.exec(block)) {
    const list = m[1];
    if (!list) continue;
    const tokens = list.match(/\b[a-z][a-z0-9_]*\b/gi) ?? [];
    for (const token of tokens) {
      if (/^(and|or)$/i.test(token)) continue;
      if (!token.includes('_') && !/[a-z][A-Z]/.test(token)) continue;
      out.push(token);
    }
  }

  return sortedUnique(out);
}

/** Rich variant that returns provenance for each synthesized candidate. */
export function extractResponseFieldCandidatesWithProvenance(
  text: string | undefined,
  options: CandidateExtractionOptions = {},
): FieldCandidate[] {
  if (!text) return [];
  // Start with context-sensitive base candidates (JSON + loose proseKey in relevant blocks only)
  const base = harvestFieldCandidates(text, options);
  const byTerm = new Map<string, FieldCandidate>();
  for (const c of base) byTerm.set(c.term, c);

  // Compound synthesis — strictly inside relevant blocks (context-sensitive).
  // Token-pair walk (not regex exec) avoids skipping adjacent pairs like "speed bonus" after "and speed".
  const blocks = splitDescriptionBlocks(text);
  let afterExample = false;

  const trivialSecond = new Set([
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

  for (let i = 0; i < blocks.length; i++) {
    const maybeBlock = blocks[i];
    if (typeof maybeBlock !== 'string' || !maybeBlock) continue;
    const block = maybeBlock as string;
    const { relevant, label } = classifyBlock(block, i, blocks);
    const useBlock = options.forceRelevant || relevant || afterExample;
    const provenanceLabel = options.forceRelevant && !relevant ? 'forced response context' : label;
    if (!useBlock) {
      if (isExampleBlock(block)) afterExample = true;
      if (isRateLimitBlock(block)) afterExample = false;
      continue;
    }

    for (const term of extractFieldListTerms(block)) {
      const existing = byTerm.get(term);
      if (!existing || !/example|JSON/i.test(existing.provenance)) {
        byTerm.set(term, { term, provenance: `from field list in ${provenanceLabel}` });
      }
    }

    const words = block.match(/\b([a-z][a-z0-9]*)\b/gi) || [];
    for (let wi = 0; wi < words.length - 1; wi++) {
      const w1raw = words[wi];
      const w2raw = words[wi + 1];
      if (!w1raw || !w2raw) continue;
      const w1 = w1raw.toLowerCase();
      const w2 = w2raw.toLowerCase();
      if (trivialSecond.has(w2)) continue;
      if (!compoundableTail.has(w2)) continue;
      if (trivialSecond.has(w1)) continue; // never start compound with "and speed" etc.

      const approxIdx = block.toLowerCase().indexOf(`${w1} ${w2}`);
      const nearCode = isNearCodeLikeToken(block, approxIdx >= 0 ? approxIdx : undefined);
      const goodStem = goodCompoundStems.has(w1);

      if (!goodStem && !nearCode) continue;

      if (!goodStem) {
        const badStarters = new Set([
          'most',
          'any',
          'only',
          'your',
          'our',
          'their',
          'its',
          'this',
          'that',
          'some',
          'other',
          'each',
          'every',
          'held',
          'goods',
          'longer',
          'are',
          'is',
          'was',
          'were',
          'be',
          'been',
          'you',
          'we',
          'they',
          'it',
          'no',
          'not',
          'can',
          'will',
          'must',
          'do',
          'does',
          'did',
          'have',
          'has',
          'had',
          'get',
          'gets',
          'got',
          'make',
          'see',
          'use',
          'using',
          'via',
          'new',
          'all',
          'per',
          'and',
          'the',
        ]);
        if (badStarters.has(w1)) continue;
      }

      const joined = `${w1raw}_${w2raw}`;
      if (joined.length <= 2 || joined.length >= 50) continue;

      const prov = `from compound '${w1raw} ${w2raw}' in ${provenanceLabel}`;
      const existing = byTerm.get(joined);
      if (!existing || !/example|JSON/i.test(existing.provenance)) {
        byTerm.set(joined, { term: joined, provenance: prov });
      }
    }

    if (isExampleBlock(block)) afterExample = true;
    if (isRateLimitBlock(block)) afterExample = false;
  }

  // Final documented-field filter (underscore, camel, or was quoted in source)
  const src = text;
  const q = '["`\']';
  const filtered: FieldCandidate[] = [];
  for (const c of byTerm.values()) {
    const t = c.term;
    if (
      t.includes('_') ||
      /[a-z][A-Z]/.test(t) ||
      new RegExp(`${q}${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${q}`).test(src)
    ) {
      filtered.push(c);
    }
  }
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
    'rate',
    'limited',
    'mutation',
    'tick',
    'ticks',
    'seconds',
    'active',
    'hold',
    'goods',
    'units',
    'reclaimed',
    'confiscated',
    'provided',
    'delivery',
    'pays',
    'only',
    'most',
    'any',
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

const KNOWN_ERROR_CODE_TERMS = new Set([
  'session_required',
  'session_invalid',
  'not_authenticated',
  'rate_limited',
  'command_error',
  'invalid_params',
  'invalid_json',
  'payload_too_large',
  'method_not_allowed',
  'missing_action',
  'unknown_command',
  'missing_materials',
]);

function sentenceContainingTerm(sourceText: string, matchIndex: number): string {
  const startBoundary = Math.max(
    sourceText.lastIndexOf('.', matchIndex),
    sourceText.lastIndexOf('!', matchIndex),
    sourceText.lastIndexOf('?', matchIndex),
  );
  const endCandidates = ['.', '!', '?']
    .map((punct) => sourceText.indexOf(punct, matchIndex))
    .filter((index) => index >= 0);
  const endBoundary = endCandidates.length > 0 ? Math.min(...endCandidates) : sourceText.length;
  return sourceText.slice(startBoundary + 1, endBoundary).trim();
}

function isKnownCodeResponseFieldContext(term: string, sourceText: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const termPattern = new RegExp(`\\b${escaped}\\b`, 'gi');
  const responseFieldContext = new RegExp(
    `\\b(?:response|result|payload|structuredContent)\\b[^.?!]{0,120}\\b(?:includes?|contains?|has|returns?)\\b[^.?!]{0,80}\\b${escaped}\\b|\\b(?:includes?|contains?|has|returns?)\\b[^.?!]{0,80}\\b${escaped}\\b[^.?!]{0,80}\\b(?:field|fields|details|payload|result)\\b|\\b${escaped}\\b[^.?!]{0,80}\\b(?:field|fields|details|payload|result)\\b`,
    'i',
  );
  const errorCodeContext = /\b(?:error\s+)?codes?\b/i;

  for (let match = termPattern.exec(sourceText); match !== null; match = termPattern.exec(sourceText)) {
    const sentence = sentenceContainingTerm(sourceText, match.index);
    if (responseFieldContext.test(sentence) && !errorCodeContext.test(sentence)) return true;
  }

  return false;
}

function shouldSuppressKnownCodeTerm(candidate: FieldCandidate, sourceText: string): boolean {
  const term = candidate.term.toLowerCase();
  if (!KNOWN_ERROR_CODE_TERMS.has(term)) return false;
  return !isKnownCodeResponseFieldContext(term, sourceText);
}

function isGenericResponseEnvelope(schemaName: string, schema: unknown): boolean {
  if (/^V2Response$/i.test(schemaName)) return true;
  if (!schema || typeof schema !== 'object') return false;

  const properties = (schema as { properties?: Record<string, unknown> }).properties;
  if (!properties) return false;
  const envelopeFieldCount = ['result', 'structuredContent', 'notifications', 'session', 'error'].filter(
    (field) => field in properties,
  ).length;
  return (
    envelopeFieldCount >= 3 && ('result' in properties || 'structuredContent' in properties || 'error' in properties)
  );
}

function collectResponseCandidateFields(
  spec: OpenApiSpec,
  routeSig: string,
): { fields: Set<string>; primarySchemaName?: string; responseCandidates: string[] } {
  const fields = new Set<string>();
  const responseCandidates = new Set<string>();
  let primarySchemaName: string | undefined;

  try {
    const resolved = resolveSuccessResponseSchema(spec, routeSig);
    primarySchemaName = resolved.primarySchemaName;
    if (!resolved.schema || Object.keys(resolved.schema).length === 0) {
      return { fields, primarySchemaName, responseCandidates: [] };
    }

    const candidates = buildResponseSchemaCandidates(spec, resolved.schema, resolved.primarySchemaName);
    for (const candidate of candidates) {
      responseCandidates.add(candidate.comparedAgainst || candidate.label);
      if (!primarySchemaName && candidate.primarySchemaName) primarySchemaName = candidate.primarySchemaName;
      for (const field of collectAllPropertyNames(candidate.schema, spec)) fields.add(field);
    }

    if (candidates.length === 0) {
      for (const field of collectAllPropertyNames(resolved.schema, spec)) fields.add(field);
    }
  } catch {
    // Schema resolution is diagnostic-only here. An empty field set lets the report
    // surface the prose candidate rather than failing the whole report.
  }

  return { fields, primarySchemaName, responseCandidates: [...responseCandidates] };
}

// Response prose vs schema check. Generalized to any term extracted from prose
// (component descriptions + operation descriptions), not a hardcoded list.
export function findResponseProseMismatches(spec: OpenApiSpec, options: ReportOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const only = options.only;
  const knownOperationTerms = collectKnownOperationTerms(spec);

  if (options.includeComponentProse) {
    // Component schemas: extract terms from their documentation prose and verify presence
    // in the full reachable field set (including nested items/oneOf etc.).
    // Focus on Response/Result/State schemas and a few broad containers to avoid
    // flooding from partial component descriptions that reference fields from larger envelopes.
    // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
    const components = (spec as any).components?.schemas || {};
    // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
    for (const [schemaName, schema] of Object.entries(components) as [string, any][]) {
      const name = schemaName;
      const isResponseLike = /Response|Result|State|Status|Output/i.test(name);
      if (!isResponseLike) continue;
      if (only?.length && !routeMatchesOnly(name, only)) continue;

      const prose = collectDescriptionText(schema);
      const rich = extractResponseFieldCandidatesWithProvenance(prose);
      let terms = rich.map((c) => c.term);
      terms = terms.filter((t) => !isNoiseTerm(t));

      if (terms.length === 0) continue;

      const present = collectAllPropertyNames(schema, spec);
      const genericEnvelope = isGenericResponseEnvelope(schemaName, schema);
      for (const term of terms) {
        if (termPresentIn(term, present)) continue;
        const prov = rich.find((c) => c.term === term)?.provenance;

        findings.push({
          id: `missing-response-field-prose|${schemaName}|${term}`,
          kind: 'missing-response-field-prose',
          severity: genericEnvelope ? 'info' : 'high',
          schemaName,
          field: term,
          message: `prose/patch notes reference ${term} but it is absent from ${schemaName}`,
          evidence: {
            description: typeof schema.description === 'string' ? schema.description.slice(0, 200) : undefined,
            candidateProvenance: prov,
          },
          suggestedAction: genericEnvelope
            ? 'Prefer route-bound response findings for generic envelopes; this component prose is intentionally broad.'
            : 'Add the field to the response schema (and bulk variants) if the server actually returns it.',
          confidence: 'medium',
        });
      }
    }
  }

  // Operation descriptions: classify prose first, then compare response-target terms
  // against the success response schema. Request-target prose is checked separately.
  // This generalizes beyond any single command family or term.
  for (const [apiPath, methods] of Object.entries(spec.paths || {})) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic OpenAPI schema traversal
    const op: any = methods.post || methods.get;
    if (!op || !op.description) continue;
    const routeSig = `${methods.post ? 'POST' : 'GET'} ${apiPath}`;
    if (!routeMatchesOnly(routeSig, only)) continue;

    const reqProps = getRequestSchemaForPath(spec, apiPath);
    const reqFields = new Set(Object.keys(reqProps || {}));
    const responseCandidateFields = collectResponseCandidateFields(spec, routeSig);
    const segments = collectOperationResponseCandidateSegments(op.description as string | undefined, {
      routeSig,
      requestFields: reqFields,
      responseFields: responseCandidateFields.fields,
      knownOperationTerms,
      includeAmbiguous: Boolean(options.includeLowConfidence),
    });
    if (segments.length === 0) continue;

    for (const segment of segments) {
      const rich = extractResponseFieldCandidatesWithProvenance(segment.text, {
        forceRelevant: segment.target === 'response',
      }).filter((c) => !isNoiseTerm(c.term));
      if (rich.length === 0) continue;

      for (const candidate of rich) {
        const term = candidate.term;
        if (
          shouldSuppressOperationResponseCandidate(
            candidate,
            routeSig,
            segment.text,
            reqFields,
            knownOperationTerms,
            segment.target,
          )
        )
          continue;
        if (shouldSuppressKnownCodeTerm(candidate, segment.text)) continue;
        if (termPresentIn(term, responseCandidateFields.fields)) continue;

        const confidence = segment.target === 'ambiguous' ? 'speculative' : 'medium';
        const severity = segment.target === 'ambiguous' ? 'low' : 'medium';
        const provenance = `${candidate.provenance}; ${segment.label}`;

        findings.push({
          id: `missing-response-field-prose|${routeSig}|${term}`,
          kind: 'missing-response-field-prose',
          severity,
          route: routeSig,
          schemaName: responseCandidateFields.primarySchemaName,
          field: term,
          message: `prose references "${term}" but it is absent from the response schema for ${routeSig}`,
          evidence: {
            proseExcerpt: segment.text.slice(0, 280),
            responseCandidates: responseCandidateFields.responseCandidates,
            candidateProvenance: provenance,
          },
          suggestedAction: 'Add the field to the response schema if the server actually returns it, or update prose.',
          confidence,
        });
      }
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

  // Note: WeakMap caches are object-keyed. Fresh plain objects created in tests (makeMinimalSpec)
  // or a freshly loaded spec will naturally miss prior entries. No explicit clear needed.

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
  const sharedSchemaClusterFindings = findings.filter(
    (f) => f.kind === 'overbroad-shared-schema' && f.id.startsWith('overbroad-shared-schema-cluster|'),
  );
  const sharedSchemaClusters =
    sharedSchemaClusterFindings.length > 0
      ? {
          total: sharedSchemaClusterFindings.length,
          affectedRoutes: sharedSchemaClusterFindings.reduce(
            (sum, finding) => sum + (finding.evidence.affectedRouteCount ?? 0),
            0,
          ),
        }
      : undefined;

  return {
    gameserverVersion: version,
    generatedAt: new Date().toISOString(),
    findings,
    summary: {
      total: findings.length,
      byKind,
      bySeverity,
      ...(sharedSchemaClusters ? { sharedSchemaClusters } : {}),
    },
  };
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function previewList(values: string[] | undefined): string | undefined {
  if (!values?.length) return undefined;
  return values.join(', ');
}

function previewNarrowedEnumRoutes(values: Array<{ route: string; enum: string[] }> | undefined): string | undefined {
  if (!values?.length) return undefined;
  return values.map((value) => `${value.route} (${value.enum.join(' | ')})`).join(', ');
}

export function formatConsistencyReport(report: ConsistencyReport, opts: { json?: boolean } = {}): string {
  if (opts.json) {
    return JSON.stringify(report, null, 2);
  }

  const lines: string[] = [];
  lines.push(`OpenAPI Consistency / Reality Report`);
  lines.push(`Gameserver: ${report.gameserverVersion}`);
  lines.push(`Findings: ${report.summary.total}`);
  if (report.summary.sharedSchemaClusters) {
    lines.push(
      `Shared schema clusters: ${pluralize(report.summary.sharedSchemaClusters.total, 'cluster')}, ${pluralize(
        report.summary.sharedSchemaClusters.affectedRoutes,
        'affected route',
      )}`,
    );
  }
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
      if (f.evidence.candidateProvenance) {
        lines.push(`  provenance: ${f.evidence.candidateProvenance}`);
      }
      if (f.evidence.responseCandidates?.length) {
        lines.push(`  response candidates: ${f.evidence.responseCandidates.join(', ')}`);
      }
      if (f.evidence.schemaEnum) {
        lines.push(`  enum in schema: ${f.evidence.schemaEnum.join(' | ')}`);
      }
      if (f.evidence.affectedRouteCount !== undefined) {
        lines.push(`  affected routes: ${f.evidence.affectedRouteCount}`);
      }
      if (f.evidence.flaggedRouteCount !== undefined) {
        lines.push(`  individually flagged: ${f.evidence.flaggedRouteCount}`);
      }
      const unflaggedRoutes = previewList(f.evidence.unflaggedRoutes);
      if (unflaggedRoutes) {
        lines.push(`  unflagged affected routes: ${unflaggedRoutes}`);
      }
      const narrowedSiblings = previewNarrowedEnumRoutes(f.evidence.narrowedEnumRoutes);
      if (narrowedSiblings) {
        lines.push(`  narrowed siblings: ${narrowedSiblings}`);
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
