# OpenAPI Consistency Schema-Aware Prose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `report:openapi-consistency` classify operation description prose as request, response, neutral, or ambiguous before producing response-schema findings.

**Architecture:** Keep the existing single analyzer module and add an internal prose-target classification layer inside `src/test-support/openapi-consistency.ts`. Operation-level response-prose checks will inspect only response-target segments by default, while `--include-low` and `--high-recall` include ambiguous fuzzy candidates as speculative findings.

**Tech Stack:** Bun test runner, TypeScript, existing OpenAPI schema utilities in `src/test-support/openapi-schema.ts`, report CLI in `scripts/report-openapi-consistency.ts`.

---

## File Structure

- Modify: `src/test-support/openapi-consistency.ts`
  - Add `ProseTarget` and classified operation prose helpers.
  - Replace broad operation-description response scanning with target-specific segment scanning.
  - Keep component-prose scanning opt-in and unchanged except for shared option behavior.
  - Mark ambiguous operation findings as speculative and include them only when `includeLowConfidence` is true.
- Modify: `src/test-support/openapi-consistency.test.ts`
  - Add failing tests for request prose, permission prose, help-route tool names, and error-response prose.
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
      "Use item_id 'fuel' to post a buy order. Credits are escrowed before fills.",
      {
        item_id: { type: 'string' },
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

    expect(fields).not.toContain('item_id');
    expect(fields).not.toContain('fuel');
    expect(fields).not.toContain('buy_order');
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

Expected: FAIL. At least one of the new tests reports an unwanted `missing-response-field-prose` field such as `buy_order`, `manage_roles`, `spacemolt_auth`, or `missing_materials`.

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

function mentionsAnyRequestField(text: string, requestFields: Set<string>): boolean {
  for (const field of requestFields) {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return true;
  }
  return false;
}
```

- [ ] **Step 4: Add target classification helpers after the context helpers**

Add this code after the helpers from Step 3.

```ts
function hasResponseContext(text: string): boolean {
  if (hasExplicitFieldList(text)) return true;
  const hasResponseNoun = /\b(?:response|result|returns?|returned|structuredContent|details)\b/i.test(text);
  const hasReturnVerb = /\b(?:returns?|returned|shows|includes?|contains?|has)\b/i.test(text);
  const hasFieldNoun = /\b(?:fields?|keys?|payload|result|response|details)\b/i.test(text);
  return hasResponseNoun && hasReturnVerb && hasFieldNoun;
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
    if (!hasResponseContext(text)) return true;
  }

  if (mentionsKnownOperation(text, knownOperationTerms) && !hasResponseContext(text)) return true;

  return false;
}

function classifyOperationProseSegment(text: string, context: OperationProseContext): ProseTarget {
  if (isNeutralOperationProseSegment(text, context.routeSig, context.knownOperationTerms)) return 'neutral';

  const response = hasResponseContext(text);
  const request = hasRequestContext(text, context.requestFields);

  if (response && !request) return 'response';
  if (request && !response) return 'request';
  if (response && request) return 'ambiguous';
  return 'ambiguous';
}
```

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
      knownOperationTerms,
      includeAmbiguous: Boolean(options.includeLowConfidence),
    });
    if (segments.length === 0) continue;

    for (const segment of segments) {
      const rich = extractResponseFieldCandidatesWithProvenance(segment.text).filter((c) => !isNoiseTerm(c.term));
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

- [ ] **Step 3: Run high-recall report**

Run:

```bash
/home/hermes/.bun/bin/bun scripts/report-openapi-consistency.ts --high-recall --only test_use_field_prose
```

Expected: exit 0. For the real cached spec this filter may produce no findings because the test route is synthetic; the parser and option path are already verified by Task 5.

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
Explicit response field prose still reports missing route-bound response fields.
Request examples still produce prose-field-mismatch for payload keys absent from request schemas.
High-recall behavior is available through --high-recall and --include-low.
Focused tests cover request, response, neutral, error-response, and high-recall paths.
Report scripts remain local, diagnostic, and exit zero by default.
```

- [ ] **Step 3: Summarize implementation**

Prepare a short final note with:

```text
Implemented schema-aware operation prose classification for report:openapi-consistency.
Added --high-recall as an alias for --include-low.
Updated ambiguous prose tests so default output is stricter while high-recall retains fuzzy findings.
Verified with openapi-consistency tests, parser tests, api-sync, output-golden, and the default report.
```
