# OpenAPI Consistency Schema-Aware Prose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `report:openapi-consistency` classify operation description prose as request, response, neutral, or ambiguous before producing response-schema findings.

**Architecture:** Keep the existing single analyzer module and add an internal prose-target classification layer inside `src/test-support/openapi-consistency.ts`. Operation-level response-prose checks will inspect only response-target segments by default, while `--include-low` and `--high-recall` include ambiguous fuzzy candidates as speculative findings.

**Tech Stack:** Bun test runner, TypeScript, existing OpenAPI schema utilities in `src/test-support/openapi-schema.ts`, report CLI in `scripts/report-openapi-consistency.ts`.

---

## File Structure

- Modify: `src/test-support/openapi-consistency.ts`
  - Add `ProseTarget` and classified operation prose helpers.
  - Add explicit request-prose checking for non-example request body field names absent from `requestBody`.
  - Replace broad operation-description response scanning with target-specific segment scanning.
  - Let response-target segments force response-candidate extraction so display verbs such as `shows` and `reports` still synthesize field compounds.
  - Keep component-prose scanning opt-in and unchanged except for shared option behavior.
  - Mark ambiguous operation findings as speculative and include them only when `includeLowConfidence` is true.
- Modify: `src/test-support/openapi-consistency.test.ts`
  - Add failing tests for request prose, explicit request/prose mismatches, response display verbs, permission prose, help-route tool names, and error-response prose.
  - Update existing ambiguous `Use base_fare` and `Use repair_cost` tests to assert default suppression and high-recall inclusion.
- Modify: `scripts/report-openapi-consistency.ts`
  - Add `--high-recall` as an alias for `--include-low`.
- Modify: `scripts/report-openapi-consistency.test.ts`
  - Add CLI parser coverage for `--high-recall`.

---

### Task 1: Add Regression Tests For Schema-Aware Prose Targets

**Files:**
- Modify: `src/test-support/openapi-consistency.test.ts`
- Test: `src/test-support/openapi-consistency.test.ts`

- [ ] **Step 1: Add request-prose regression test**

Add this test inside the existing `describe('operation response prose mismatch filtering', () => { ... })` block, near the other operation response scan tests.

```ts
  test('operation response scan treats request-only prose as request context', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_market/create_buy_order';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_market/create_buy_order',
      "Use item_id 'fuel' to post a buy order. Sort previews with sort_by 'price_asc'. Credits are escrowed before fills.",
      {
        item_id: { type: 'string' },
        sort_by: { type: 'string' },
      },
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);
    const requestFields = findProseFieldMismatches(spec)
      .filter((f) => f.kind === 'prose-field-mismatch' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('item_id');
    expect(fields).not.toContain('fuel');
    expect(fields).not.toContain('buy_order');
    expect(requestFields).not.toContain('fuel');
    expect(requestFields).not.toContain('buy_order');
    expect(requestFields).not.toContain('price_asc');
  });
```

- [ ] **Step 1a: Add explicit request/prose mismatch regression test**

Add this test near the request-prose response-suppression test. It covers the design requirement that clear request-body prose should be checked against `requestBody`, not merely suppressed from response findings.

```ts
  test('prose-field analyzer reports explicit request prose absent from request schema', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_faction/post_mission';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_faction/post_mission',
      'Pass target_base_id when posting a delivery mission.',
      {
        mission_type: { type: 'string' },
      },
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
      },
    );

    const requestFindings = findProseFieldMismatches(spec).filter(
      (f) => f.kind === 'prose-field-mismatch' && f.route === route,
    );
    const requestFinding = requestFindings.find((f) => f.field === 'target_base_id');
    const responseFields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(requestFinding).toBeDefined();
    expect(requestFinding?.confidence).toBe('medium');
    expect(requestFinding?.severity).toBe('medium');
    expect(requestFinding?.evidence.candidateProvenance).toContain('request context');
    expect(requestFindings.map((f) => f.field)).toEqual(['target_base_id']);
    expect(responseFields).not.toContain('target_base_id');
  });
```

- [ ] **Step 1b: Add display-verb response-prose regression test**

Add this test in the same `operation response prose mismatch filtering` block. It protects real SpaceMolt prose styles such as `Shows ...`, `Lists ...`, and `Also reports ...`, which often describe returned data without saying `response fields`.

```ts
  test('operation response scan treats display verbs as response context', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/list_station_passengers';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/list_station_passengers',
      "Shows each passenger's base fare. Also reports fare_surge for the station.",
      {},
      {
        type: 'object',
        properties: {
          fare_surge: { type: 'number' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toContain('base_fare');
    expect(fields).not.toContain('fare_surge');
  });
```

- [ ] **Step 2: Add permission-prose regression test**

Add this test in the same `operation response prose mismatch filtering` block.

```ts
  test('operation response scan treats permission prose as neutral context', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_faction/create_role';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_faction/create_role',
      'Requires `manage_roles` permission. Priority must exceed the new role priority.',
      {
        name: { type: 'string' },
      },
      {
        type: 'object',
        properties: {
          role: { type: 'object' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('manage_roles');
  });
```

- [ ] **Step 3: Add help-route tool-name regression test**

Add this test in the same `operation response prose mismatch filtering` block.

```ts
  test('operation response scan treats help route tool names as neutral context', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_auth/help';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_auth/help',
      'Returns documentation for all actions available in spacemolt_auth (same as GET). Pass an optional topic in the body for focused help.',
      {
        topic: { type: 'string' },
      },
      {
        type: 'object',
        properties: {
          actions: { type: 'array' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('spacemolt_auth');
    expect(fields).not.toContain('topic');
  });
```

- [ ] **Step 4: Add error-response prose regression test**

Add this test in the same `operation response prose mismatch filtering` block.

```ts
  test('operation response scan does not report error-response prose as missing 200-response fields', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/craft';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/craft',
      'The error response details may include missing_materials when the station lacks inputs.',
      {
        id: { type: 'string' },
        quantity: { type: 'integer' },
      },
      {
        type: 'object',
        properties: {
          queued: { type: 'boolean' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('missing_materials');
  });
```

- [ ] **Step 5: Run focused tests and verify the new tests fail**

Run:

```bash
/home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: FAIL. At least one of the new tests reports an unwanted `missing-response-field-prose` field such as `buy_order`, `manage_roles`, `spacemolt_auth`, or `missing_materials`, or fails to report the new request/response true-positive fields such as `target_base_id` or `base_fare`.

- [ ] **Step 6: Commit the failing tests**

Run:

```bash
git add src/test-support/openapi-consistency.test.ts
git commit -m "test: cover schema-aware OpenAPI prose targets"
```

---

### Task 2: Add Internal Prose Target Classification

**Files:**
- Modify: `src/test-support/openapi-consistency.ts`
- Test: `src/test-support/openapi-consistency.test.ts`

- [ ] **Step 1: Add target types after `ReportOptions`**

Add this code after the `ReportOptions` interface.

```ts
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
```

- [ ] **Step 2: Add sentence splitting helper after `splitDescriptionBlocks`**

Add this helper below `splitDescriptionBlocks`.

```ts
function splitDescriptionSentences(block: string): string[] {
  const matches = block.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [block];
  return matches.map((part) => part.trim()).filter(Boolean);
}
```

- [ ] **Step 3: Add context helpers after `isActionCatalogBlock`**

Find `function isActionCatalogBlock` and add these helpers immediately after it.

```ts
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
```

- [ ] **Step 4: Add target classification helpers after the context helpers**

Add this code after the helpers from Step 3.

```ts
function hasResponseContext(text: string, responseFields: Set<string>): boolean {
  if (hasExplicitFieldList(text)) return true;
  const hasResponseNoun = /\b(?:response|result|returns?|returned|structuredContent|details)\b/i.test(text);
  const hasReturnVerb = /\b(?:returns?|returned|shows|includes?|contains?|has)\b/i.test(text);
  const hasFieldNoun = /\b(?:fields?|keys?|payload|result|response|details)\b/i.test(text);
  if (hasResponseNoun && hasReturnVerb && hasFieldNoun) return true;

  const hasDisplayVerb = /\b(?:shows?|lists?|reports?|summari[sz]es|carries)\b/i.test(text);
  if (hasDisplayVerb && (mentionsAnyResponseField(text, responseFields) || hasFieldLikeResponseCandidate(text))) {
    return true;
  }

  return false;
}

function hasRequestContext(text: string, requestFields: Set<string>): boolean {
  if (/\b(?:accepts?|payload|request|parameters?|pass|specify|set|call with|omit)\b/i.test(text)) return true;
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

  const response = hasResponseContext(text, context.responseFields);
  const request = hasRequestContext(text, context.requestFields);

  if (response && !request) return 'response';
  if (request && !response) return 'request';
  if (response && request) return 'ambiguous';
  return 'ambiguous';
}
```

- [ ] **Step 4a: Add target-aware candidate extraction**

Add an internal extraction option so response-classified sentences can synthesize field compounds even when they lack the older generic cues used by `classifyBlock`.

```ts
interface CandidateExtractionOptions {
  forceRelevant?: boolean;
}
```

Update these helpers to accept the option with a default:

```ts
function harvestFieldCandidates(text: string | undefined, options: CandidateExtractionOptions = {}): FieldCandidate[] {
  // ...
  const useBlock = options.forceRelevant || relevant || afterExample;
  const provenanceLabel = options.forceRelevant && !relevant ? 'forced response context' : label;
  // use provenanceLabel anywhere this helper currently writes `label`
}

export function extractResponseFieldCandidates(text: string | undefined): string[] {
  const rich = extractResponseFieldCandidatesWithProvenance(text);
  return rich.map((c) => c.term);
}

export function extractResponseFieldCandidatesWithProvenance(
  text: string | undefined,
  options: CandidateExtractionOptions = {},
): FieldCandidate[] {
  if (!text) return [];
  const base = harvestFieldCandidates(text, options);
  // ...
  const useBlock = options.forceRelevant || relevant || afterExample;
  const provenanceLabel = options.forceRelevant && !relevant ? 'forced response context' : label;
  // use provenanceLabel for field-list and compound provenance in this function too
}
```

Keep the public `extractResponseFieldCandidates(text)` call compatible by not requiring the option. Only operation response scanning and `hasFieldLikeResponseCandidate` should pass `{ forceRelevant: true }`.

- [ ] **Step 5: Replace `collectOperationResponseCandidateText` with segment collection**

Replace the existing `collectOperationResponseCandidateText` function with this function.

```ts
function collectOperationResponseCandidateSegments(
  description: string | undefined,
  context: OperationProseContext,
): ClassifiedOperationProseSegment[] {
  if (!description) return [];
  const segments: ClassifiedOperationProseSegment[] = [];

  for (const block of splitDescriptionBlocks(description)) {
    const blockSegments = isExampleBlock(block) || isRateLimitBlock(block) || isActionCatalogBlock(block)
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
```

- [ ] **Step 6: Update `shouldSuppressOperationResponseCandidate` signature**

Replace the current function signature:

```ts
function shouldSuppressOperationResponseCandidate(
  candidate: FieldCandidate,
  routeSig: string,
  sourceText: string,
  requestFields: Set<string>,
  knownOperationTerms: Set<string>,
): boolean {
```

with:

```ts
function shouldSuppressOperationResponseCandidate(
  candidate: FieldCandidate,
  routeSig: string,
  sourceText: string,
  requestFields: Set<string>,
  knownOperationTerms: Set<string>,
  target: ProseTarget,
): boolean {
```

Then replace the two request-field suppressions inside that function:

```ts
  if (requestFields.has(term)) return true;
  if (termPresentIn(term, requestFields)) return true;
```

with:

```ts
  if (target !== 'response' && requestFields.has(term)) return true;
  if (target !== 'response' && termPresentIn(term, requestFields)) return true;
```

- [ ] **Step 7: Run focused tests and verify TypeScript errors or failing tests remain**

Run:

```bash
/home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: FAIL because the operation scan still calls `collectOperationResponseCandidateText` and calls `shouldSuppressOperationResponseCandidate` with the old argument list.

---

### Task 2a: Add Explicit Request-Prose Mismatch Checks

**Files:**
- Modify: `src/test-support/openapi-consistency.ts`
- Test: `src/test-support/openapi-consistency.test.ts`

- [ ] **Step 1: Add request segment collection**

Add this helper near `collectOperationResponseCandidateSegments`.

```ts
function collectOperationRequestCandidateSegments(
  description: string | undefined,
  context: OperationProseContext,
): ClassifiedOperationProseSegment[] {
  if (!description) return [];
  const segments: ClassifiedOperationProseSegment[] = [];

  for (const block of splitDescriptionBlocks(description)) {
    const blockSegments = isExampleBlock(block) || isRateLimitBlock(block) || isActionCatalogBlock(block)
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
```

- [ ] **Step 2: Add request-prose suppression helper**

Add this helper near `shouldSuppressOperationResponseCandidate`. It keeps the new request-prose path focused on literal field names and command syntax, not narrative compounds or example values.

```ts
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

function isBareQuotedRequestValue(candidate: FieldCandidate, sourceText: string): boolean {
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
```

- [ ] **Step 3: Add non-example request prose scan inside `findProseFieldMismatches`**

Keep the existing JSON example loop unchanged. Add `const knownOperationTerms = collectKnownOperationTerms(spec);` once near the top of `findProseFieldMismatches`, after `const only = options.only;`. After the JSON example loop, classify request-target description segments and emit lower-confidence `prose-field-mismatch` findings for explicit request prose fields absent from the request schema.

```ts
    const responseCandidateFields = collectResponseCandidateFields(spec, routeSig);
    const requestSegments = collectOperationRequestCandidateSegments(op.description as string | undefined, {
      routeSig,
      requestFields: new Set(Object.keys(props || {})),
      responseFields: responseCandidateFields.fields,
      knownOperationTerms,
      includeAmbiguous: Boolean(options.includeLowConfidence),
    });

    for (const segment of requestSegments) {
      if (isExampleBlock(segment.text)) continue; // JSON examples are handled above with high confidence.

      const rich = harvestFieldCandidates(segment.text, { forceRelevant: true }).filter((c) => !isNoiseTerm(c.term));
      for (const candidate of rich) {
        const term = candidate.term;
        if (termPresentIn(term, new Set(Object.keys(props || {})))) continue;
        if (shouldSuppressOperationRequestCandidate(candidate, routeSig, segment.text, knownOperationTerms)) continue;

        const confidence = segment.target === 'ambiguous' ? 'speculative' : 'medium';
        const severity = segment.target === 'ambiguous' ? 'low' : 'medium';
        findings.push({
          id: `prose-field-mismatch|${routeSig}|${term}`,
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
```

If this creates duplicate IDs with JSON example findings, keep the existing high-confidence example finding. The final `buildConsistencyReport` de-dup currently keeps the first finding for an ID, so leave the JSON example loop before this new prose loop.

- [ ] **Step 4: Run focused tests**

Run:

```bash
/home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: the explicit request/prose mismatch test now passes. Response-classification tests may still fail until Task 3 routes response checks through classified segments.

---

### Task 3: Route Operation Response Checks Through Classified Segments

**Files:**
- Modify: `src/test-support/openapi-consistency.ts`
- Test: `src/test-support/openapi-consistency.test.ts`

- [ ] **Step 1: Replace the operation branch inside `findResponseProseMismatches`**

Inside `findResponseProseMismatches`, replace the operation-description block from:

```ts
    const responseCandidateText = collectOperationResponseCandidateText(op.description as string | undefined);
    if (!responseCandidateText) continue;
    const rich = extractResponseFieldCandidatesWithProvenance(responseCandidateText).filter(
      (c) => !isNoiseTerm(c.term),
    );
    if (rich.length === 0) continue;

    const responseCandidateFields = collectResponseCandidateFields(spec, routeSig);

    const reqProps = getRequestSchemaForPath(spec, apiPath);
    const reqFields = new Set(Object.keys(reqProps || {}));

    for (const candidate of rich) {
      const term = candidate.term;
      if (
        shouldSuppressOperationResponseCandidate(
          candidate,
          routeSig,
          responseCandidateText,
          reqFields,
          knownOperationTerms,
        )
      )
        continue;
      if (shouldSuppressKnownCodeTerm(candidate, responseCandidateText)) continue;
      if (termPresentIn(term, responseCandidateFields.fields)) continue;
      const prov = candidate.provenance;

      findings.push({
        id: `missing-response-field-prose|${routeSig}|${term}`,
        kind: 'missing-response-field-prose',
        severity: 'medium',
        route: routeSig,
        schemaName: responseCandidateFields.primarySchemaName,
        field: term,
        message: `prose references "${term}" but it is absent from the response schema for ${routeSig}`,
        evidence: {
          proseExcerpt: responseCandidateText.slice(0, 280),
          responseCandidates: responseCandidateFields.responseCandidates,
          candidateProvenance: prov,
        },
        suggestedAction: 'Add the field to the response schema if the server actually returns it, or update prose.',
        confidence: 'medium',
      });
    }
```

with:

```ts
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
```

- [ ] **Step 2: Run focused tests and verify new regression tests pass or expose narrow issues**

Run:

```bash
/home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: FAIL only where existing tests still expect ambiguous `Use base_fare` and `Use repair_cost` prose in default output.

- [ ] **Step 3: Commit the classifier implementation**

Run:

```bash
git add src/test-support/openapi-consistency.ts
git commit -m "fix: classify OpenAPI operation prose targets"
```

---

### Task 4: Update Ambiguous Prose Tests For High-Recall Mode

**Files:**
- Modify: `src/test-support/openapi-consistency.test.ts`
- Test: `src/test-support/openapi-consistency.test.ts`

- [ ] **Step 1: Replace the `Use base_fare` test**

Find the test named:

```ts
test('operation response scan keeps use prose for field-like response terms', () => {
```

Replace the whole test with:

```ts
  test('operation response scan suppresses ambiguous use prose by default and keeps it in high-recall mode', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/test_use_field_prose';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/test_use_field_prose',
      'Use base_fare to audit pricing.',
      {},
      {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
      },
    );

    const defaultFields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(defaultFields).not.toContain('base_fare');

    const highRecallFinding = findResponseProseMismatches(spec, { includeLowConfidence: true }).find(
      (f) => f.kind === 'missing-response-field-prose' && f.route === route && f.field === 'base_fare',
    );

    expect(highRecallFinding).toBeDefined();
    expect(highRecallFinding?.confidence).toBe('speculative');
    expect(highRecallFinding?.severity).toBe('low');
    expect(highRecallFinding?.evidence.candidateProvenance).toContain('ambiguous context');
  });
```

- [ ] **Step 2: Replace the `Use repair_cost` test**

Find the test named:

```ts
test('operation response scan keeps command-prefix field-like response terms', () => {
```

Replace the whole test with:

```ts
  test('operation response scan keeps command-prefix ambiguous terms only in high-recall mode', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/test_repair_cost_prose';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/test_repair_cost_prose',
      'Use repair_cost to audit pricing.',
      {},
      {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
      },
    );

    const defaultFields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(defaultFields).not.toContain('repair_cost');

    const highRecallFinding = findResponseProseMismatches(spec, { includeLowConfidence: true }).find(
      (f) => f.kind === 'missing-response-field-prose' && f.route === route && f.field === 'repair_cost',
    );

    expect(highRecallFinding).toBeDefined();
    expect(highRecallFinding?.confidence).toBe('speculative');
    expect(highRecallFinding?.severity).toBe('low');
    expect(highRecallFinding?.evidence.candidateProvenance).toContain('ambiguous context');
  });
```

- [ ] **Step 3: Run focused tests and verify they pass**

Run:

```bash
/home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: PASS. All `openapi-consistency.test.ts` tests pass.

- [ ] **Step 4: Commit the test expectation update**

Run:

```bash
git add src/test-support/openapi-consistency.test.ts
git commit -m "test: classify ambiguous OpenAPI prose as high recall"
```

---

### Task 5: Add `--high-recall` CLI Alias

**Files:**
- Modify: `scripts/report-openapi-consistency.test.ts`
- Modify: `scripts/report-openapi-consistency.ts`
- Test: `scripts/report-openapi-consistency.test.ts`

- [ ] **Step 1: Add failing parser test**

Add this test inside `describe('report-openapi-consistency args', () => { ... })`.

```ts
  test('parses high-recall as an include-low alias', () => {
    expect(parseArgs(['--high-recall'])).toMatchObject({
      json: false,
      includeLow: true,
      includeComponentProse: false,
    });
  });
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
/home/hermes/.bun/bin/bun test scripts/report-openapi-consistency.test.ts
```

Expected: FAIL because `--high-recall` is not parsed yet.

- [ ] **Step 3: Update parser usage comment**

In `scripts/report-openapi-consistency.ts`, update the usage block by adding this line after the existing `--include-component-prose` usage line:

```ts
 *   bun run report:openapi-consistency --high-recall
```

- [ ] **Step 4: Parse `--high-recall`**

In `parseArgs`, replace:

```ts
    } else if (a === '--include-low' || a === '--low-confidence') {
      args.includeLow = true;
```

with:

```ts
    } else if (a === '--include-low' || a === '--low-confidence' || a === '--high-recall') {
      args.includeLow = true;
```

- [ ] **Step 5: Run parser tests and verify they pass**

Run:

```bash
/home/hermes/.bun/bin/bun test scripts/report-openapi-consistency.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the CLI alias**

Run:

```bash
git add scripts/report-openapi-consistency.ts scripts/report-openapi-consistency.test.ts
git commit -m "feat: add high-recall OpenAPI consistency flag"
```

---

### Task 6: Verify Report Behavior Against The Cached v0.471.0 Spec

**Files:**
- Modify only if Task 6 reveals a specific failing assertion from earlier tasks.
- Test: report commands and focused tests.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
/home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts scripts/report-openapi-consistency.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the default report**

Run:

```bash
/home/hermes/.bun/bin/bun scripts/report-openapi-consistency.ts
```

Expected: exit 0. Inspect output and confirm the default report does not include these fields as `missing-response-field-prose`:

```text
spacemolt_auth
manage_roles
drone_control
speed_ticks
ammo_item
station_type
insufficient_credits
```

Also confirm the default report still preserves route-bound response-prose signal from the cached v0.471.0 spec. Unless the cached spec or prose has been intentionally fixed, it should still include a response-context finding such as:

```text
POST /api/v2/spacemolt/list_station_passengers field=base_fare
```

If that exact finding disappears because the schema was fixed, verify another real response-context finding remains, preferably from prose using `shows`, `reports`, `lists`, or `summarizes`.

- [ ] **Step 3: Run high-recall report**

Run:

```bash
/home/hermes/.bun/bin/bun scripts/report-openapi-consistency.ts --high-recall --only view_market
```

Expected: exit 0. Use a real route filter so the option path is exercised against cached OpenAPI data. If high-recall adds ambiguous findings, they must be `severity: low` / `confidence: speculative` in JSON mode and must not replace default medium-confidence response-context findings.

- [ ] **Step 4: Run API metadata and golden tests**

Run:

```bash
/home/hermes/.bun/bin/bun test src/api-sync.test.ts
/home/hermes/.bun/bin/bun test src/output-golden.test.ts
```

Expected: PASS for both commands.

- [ ] **Step 5: Commit verification-driven cleanup**

Run this only when Task 6 required code or test adjustments:

```bash
git add src/test-support/openapi-consistency.ts src/test-support/openapi-consistency.test.ts scripts/report-openapi-consistency.ts scripts/report-openapi-consistency.test.ts
git commit -m "fix: refine schema-aware OpenAPI prose report"
```

Expected when no adjustments were needed: skip this step and keep the previous commits.

---

### Task 7: Final Review

**Files:**
- Review: `src/test-support/openapi-consistency.ts`
- Review: `src/test-support/openapi-consistency.test.ts`
- Review: `scripts/report-openapi-consistency.ts`
- Review: `scripts/report-openapi-consistency.test.ts`

- [ ] **Step 1: Inspect final diff**

Run:

```bash
git status --short --untracked-files=all
git log --oneline -5
```

Expected: working tree clean. Recent commits include the tests, classifier, ambiguous prose expectation update, and `--high-recall` parser alias.

- [ ] **Step 2: Confirm acceptance criteria**

Check each item manually:

```text
Default report suppresses permissions, tool names, route names, and request-only concepts as missing 200-response fields.
Explicit non-example request prose reports request/prose mismatches without promoting narrative compounds or quoted values to fields.
Explicit response field prose still reports missing route-bound response fields.
Response prose using display verbs such as shows, lists, reports, and summarizes still reports route-bound response-schema drift.
Request examples still produce prose-field-mismatch for payload keys absent from request schemas.
High-recall behavior is available through --high-recall and --include-low.
Focused tests cover request, explicit request mismatch, response display verbs, neutral, error-response, and high-recall paths.
Report scripts remain local, diagnostic, and exit zero by default.
```

- [ ] **Step 3: Summarize implementation**

Prepare a short final note with:

```text
Implemented schema-aware operation prose classification for report:openapi-consistency.
Added explicit request-prose mismatch checks for non-example request body field references.
Added --high-recall as an alias for --include-low.
Updated ambiguous prose tests so default output is stricter while high-recall retains fuzzy findings.
Verified with openapi-consistency tests, parser tests, api-sync, output-golden, and the default report.
```
