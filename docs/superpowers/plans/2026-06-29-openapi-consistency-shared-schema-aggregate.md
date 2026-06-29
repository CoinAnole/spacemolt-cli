# OpenAPI Consistency Shared Schema Aggregate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OpenAPI consistency report show the full affected route count for overbroad shared request-schema enum groups without expanding every affected route into a high-severity finding.

**Architecture:** Keep the current route-level `overbroad-shared-schema` analyzer and add an aggregate cluster pass inside `findOverbroadSharedSchemas`. The cluster pass summarizes broad enum groups, unflagged affected routes, narrowed siblings, and aggregate counts; formatter and summary output render that evidence without changing existing route-level finding semantics.

**Tech Stack:** Bun test runner, TypeScript, existing `src/test-support/openapi-consistency.ts` reporter and `src/test-support/openapi-consistency.test.ts` tests.

---

## File Structure

- Modify `src/test-support/openapi-consistency.ts`
  - Extend `Finding.evidence` with aggregate shared-schema fields.
  - Extend `ConsistencyReport.summary` with `sharedSchemaClusters`.
  - Add helpers for enum grouping, broad enum detection, route-list formatting, and cluster finding construction.
  - Add cluster finding generation inside `findOverbroadSharedSchemas`.
  - Add shared-schema cluster aggregation to `buildConsistencyReport`.
  - Add human formatter lines for aggregate evidence.
- Modify `src/test-support/openapi-consistency.test.ts`
  - Add failing tests for shared-schema cluster evidence.
  - Add failing tests for narrowed sibling evidence.
  - Add a no-cluster regression when every affected route is already flagged.
  - Add formatter coverage for aggregate evidence lines.

---

### Task 1: Add Failing Tests For Shared Schema Clusters

**Files:**
- Modify: `src/test-support/openapi-consistency.test.ts`
- Test: `src/test-support/openapi-consistency.test.ts`

- [ ] **Step 1: Import the human formatter for formatter coverage**

In the import from `./openapi-consistency`, add `formatConsistencyReport`.

```ts
import {
  buildConsistencyReport,
  extractDocExamples,
  extractMentionedFieldNames,
  extractResponseFieldCandidatesWithProvenance,
  type FieldCandidate,
  findOverbroadSharedSchemas,
  findProseFieldMismatches,
  findResponseProseMismatches,
  formatConsistencyReport,
  type OpenApiSpec,
} from './openapi-consistency';
```

- [ ] **Step 2: Add tests after the existing `overbroad-shared-schema analyzer` test**

Append these tests inside `describe('overbroad-shared-schema analyzer', () => { ... })`, after `flags dedicated paths that share a broad direction enum`.

```ts
  test('adds an info cluster when broad enum affected routes exceed route-level findings', () => {
    const spec = makeMinimalSpec();
    const broadFacilitySchema = {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        description: "Transfer direction for 'transfer' action or job direction for 'job_add'.",
      },
      facility_id: { type: 'string' },
      foo: { type: 'string' },
      bar: { type: 'string' },
      baz: { type: 'integer' },
    };

    addPostOperation(spec, '/api/v2/spacemolt_facility/build', 'build', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/buy_listing', 'buy listing', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/list', 'list', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/types', 'types', broadFacilitySchema);

    const findings = findOverbroadSharedSchemas(spec);
    const cluster = findings.find((f) => f.id.startsWith('overbroad-shared-schema-cluster|direction|'));

    expect(cluster).toBeDefined();
    expect(cluster?.severity).toBe('info');
    expect(cluster?.confidence).toBe('high');
    expect(cluster?.evidence.schemaEnum).toEqual(['to_faction', 'to_player', 'forward', 'reverse']);
    expect(cluster?.evidence.affectedRouteCount).toBe(4);
    expect(cluster?.evidence.flaggedRouteCount).toBe(2);
    expect(cluster?.evidence.unflaggedRoutes).toEqual([
      'POST /api/v2/spacemolt_facility/list',
      'POST /api/v2/spacemolt_facility/types',
    ]);
  });

  test('records narrowed enum siblings for shared schema clusters', () => {
    const spec = makeMinimalSpec();
    const broadFacilitySchema = {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        description: "Transfer direction for 'transfer' action or job direction for 'job_add'.",
      },
      facility_id: { type: 'string' },
      foo: { type: 'string' },
      bar: { type: 'string' },
      baz: { type: 'integer' },
    };
    const jobAddSchema = {
      ...broadFacilitySchema,
      direction: {
        type: 'string',
        enum: ['forward', 'reverse'],
        description: "Job direction: 'forward' crafts, 'reverse' recycles.",
      },
    };
    const transferSchema = {
      ...broadFacilitySchema,
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player'],
        description: "Transfer direction: 'to_faction' or 'to_player'.",
      },
    };

    addPostOperation(spec, '/api/v2/spacemolt_facility/build', 'build', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/buy_listing', 'buy listing', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/list', 'list', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/job_add', 'job add', jobAddSchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/transfer', 'transfer', transferSchema);

    const findings = findOverbroadSharedSchemas(spec);
    const cluster = findings.find((f) => f.id.startsWith('overbroad-shared-schema-cluster|direction|'));

    expect(cluster?.evidence.narrowedEnumRoutes).toEqual([
      {
        route: 'POST /api/v2/spacemolt_facility/job_add',
        enum: ['forward', 'reverse'],
      },
      {
        route: 'POST /api/v2/spacemolt_facility/transfer',
        enum: ['to_faction', 'to_player'],
      },
    ]);
    expect(cluster?.evidence.enumGroups).toEqual([
      {
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        routes: [
          'POST /api/v2/spacemolt_facility/build',
          'POST /api/v2/spacemolt_facility/buy_listing',
          'POST /api/v2/spacemolt_facility/list',
        ],
      },
      {
        enum: ['forward', 'reverse'],
        routes: ['POST /api/v2/spacemolt_facility/job_add'],
      },
      {
        enum: ['to_faction', 'to_player'],
        routes: ['POST /api/v2/spacemolt_facility/transfer'],
      },
    ]);
  });

  test('does not add an aggregate cluster when all broad enum routes are individually flagged', () => {
    const spec = makeMinimalSpec();
    const broadFacilitySchema = {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        description: "Transfer direction for 'transfer' action or job direction for 'job_add'.",
      },
      facility_id: { type: 'string' },
      foo: { type: 'string' },
      bar: { type: 'string' },
      baz: { type: 'integer' },
    };

    addPostOperation(spec, '/api/v2/spacemolt_facility/build', 'build', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/buy_listing', 'buy listing', broadFacilitySchema);

    const findings = findOverbroadSharedSchemas(spec);

    expect(findings.some((f) => f.id.startsWith('overbroad-shared-schema-cluster|'))).toBe(false);
  });
```

- [ ] **Step 3: Add formatter coverage after `describe('full report build', ...)`**

Add this new describe block after the existing full-report test.

```ts
describe('openapi consistency report formatter', () => {
  test('renders shared schema aggregate evidence', () => {
    const output = formatConsistencyReport({
      gameserverVersion: 'v0.test.1',
      generatedAt: '2026-06-29T00:00:00.000Z',
      findings: [
        {
          id: 'overbroad-shared-schema-cluster|direction|POST /api/v2/spacemolt_facility/build',
          kind: 'overbroad-shared-schema',
          severity: 'info',
          field: 'direction',
          message: 'shared request schema exposes broad "direction" enum on 4 routes; 2 are emitted as action findings',
          evidence: {
            schemaEnum: ['to_faction', 'to_player', 'forward', 'reverse'],
            affectedRouteCount: 4,
            flaggedRouteCount: 2,
            unflaggedRoutes: [
              'POST /api/v2/spacemolt_facility/list',
              'POST /api/v2/spacemolt_facility/types',
            ],
            narrowedEnumRoutes: [
              {
                route: 'POST /api/v2/spacemolt_facility/job_add',
                enum: ['forward', 'reverse'],
              },
            ],
          },
          confidence: 'high',
        },
      ],
      summary: {
        total: 1,
        byKind: { 'overbroad-shared-schema': 1 },
        bySeverity: { info: 1 },
        sharedSchemaClusters: { total: 1, affectedRoutes: 4 },
      },
    });

    expect(output).toContain('Shared schema clusters: 1 cluster, 4 affected routes');
    expect(output).toContain('affected routes: 4');
    expect(output).toContain('individually flagged: 2');
    expect(output).toContain(
      'unflagged affected routes: POST /api/v2/spacemolt_facility/list, POST /api/v2/spacemolt_facility/types',
    );
    expect(output).toContain('narrowed siblings: POST /api/v2/spacemolt_facility/job_add (forward | reverse)');
  });
});
```

- [ ] **Step 4: Run the focused tests and confirm expected failures**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: FAIL. The new failures should be missing cluster findings or missing aggregate formatter output. Existing unrelated tests should not fail.

- [ ] **Step 5: Commit failing tests**

```bash
git add src/test-support/openapi-consistency.test.ts
git commit -m "test: cover OpenAPI shared schema aggregate reporting"
```

---

### Task 2: Add Shared Schema Aggregate Evidence Types

**Files:**
- Modify: `src/test-support/openapi-consistency.ts`
- Test: `src/test-support/openapi-consistency.test.ts`

- [ ] **Step 1: Extend `Finding.evidence` and `ConsistencyReport.summary` types**

In `Finding.evidence`, add these optional fields after `sharedWith?: string[];`.

```ts
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
```

In `ConsistencyReport.summary`, add `sharedSchemaClusters`.

```ts
  summary: {
    total: number;
    byKind: Record<string, number>;
    bySeverity: Record<string, number>;
    sharedSchemaClusters?: {
      total: number;
      affectedRoutes: number;
    };
  };
```

- [ ] **Step 2: Run focused tests to confirm the failure has moved to behavior**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: FAIL. The TypeScript syntax/runtime should be clean; failures should still be assertions about missing cluster data or formatter lines.

- [ ] **Step 3: Commit type support**

```bash
git add src/test-support/openapi-consistency.ts
git commit -m "feat: add shared schema aggregate evidence types"
```

---

### Task 3: Implement Cluster Detection In The Analyzer

**Files:**
- Modify: `src/test-support/openapi-consistency.ts`
- Test: `src/test-support/openapi-consistency.test.ts`

- [ ] **Step 1: Add helper constants and functions before `findOverbroadSharedSchemas`**

Insert this block immediately before `export function findOverbroadSharedSchemas`.

```ts
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
  return values.join('\u0000');
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
```

- [ ] **Step 2: Add cluster construction helper after the helper block**

Place this function after `routeFindingKey`.

```ts
function buildOverbroadSharedSchemaClusters(
  members: SharedSchemaMember[],
  routeFindings: Finding[],
): Finding[] {
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
```

- [ ] **Step 3: Update `findOverbroadSharedSchemas` to use the helpers**

Inside `findOverbroadSharedSchemas`, change the groups declaration to use `SharedSchemaMember`.

```ts
  const groups = new Map<string, SharedSchemaMember[]>();
```

Remove the old `// biome-ignore lint/suspicious/noExplicitAny` comment above that groups declaration, because the `SharedSchemaMember` alias now owns the `any` suppression.

Replace the local `KNOWN_BROAD` check in the per-route loop with the helper:

```ts
        const en = enumValuesFromSchemaField(fsch);
        if (en && en.length >= 3 && isBroadEnumField(fname)) {
```

Delete this local constant from inside the function, because the module-level `KNOWN_BROAD_ENUM_FIELDS` replaces it:

```ts
    const KNOWN_BROAD = new Set(['direction', 'mode', 'op', 'operation', 'variant']);
```

Keep the existing finding body, but remove `.map(String)` from `schemaEnum` because `en` is already string values:

```ts
              schemaEnum: en,
```

After the per-route enum-finding loop and before the speculative shared-shape section, add:

```ts
    findings.push(...buildOverbroadSharedSchemaClusters(members, findings));
```

- [ ] **Step 4: Run focused tests and confirm analyzer tests pass while formatter still fails**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: FAIL only on formatter and/or summary output expectations. The cluster analyzer tests should pass.

- [ ] **Step 5: Commit analyzer implementation**

```bash
git add src/test-support/openapi-consistency.ts
git commit -m "feat: summarize OpenAPI shared schema enum clusters"
```

---

### Task 4: Add Summary Aggregation And Human Output

**Files:**
- Modify: `src/test-support/openapi-consistency.ts`
- Test: `src/test-support/openapi-consistency.test.ts`

- [ ] **Step 1: Add helpers for pluralization and preview formatting before `formatConsistencyReport`**

Insert this block immediately before `export function formatConsistencyReport`.

```ts
function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function previewList(values: string[] | undefined, limit = 4): string | undefined {
  if (!values || values.length === 0) return undefined;
  const visible = values.slice(0, limit).join(', ');
  return values.length > limit ? `${visible} ...` : visible;
}

function previewNarrowedEnumRoutes(
  routes: Array<{ route: string; enum: string[] }> | undefined,
  limit = 4,
): string | undefined {
  if (!routes || routes.length === 0) return undefined;
  const visible = routes
    .slice(0, limit)
    .map((entry) => `${entry.route} (${entry.enum.join(' | ')})`)
    .join(', ');
  return routes.length > limit ? `${visible} ...` : visible;
}
```

- [ ] **Step 2: Add `sharedSchemaClusters` aggregation in `buildConsistencyReport`**

After the `byKind` and `bySeverity` loop, add:

```ts
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
```

Then update the returned `summary` object:

```ts
    summary: {
      total: findings.length,
      byKind,
      bySeverity,
      ...(sharedSchemaClusters ? { sharedSchemaClusters } : {}),
    },
```

- [ ] **Step 3: Render summary-level cluster counts**

In `formatConsistencyReport`, after `lines.push(\`Findings: ${report.summary.total}\`);`, add:

```ts
  if (report.summary.sharedSchemaClusters) {
    lines.push(
      `Shared schema clusters: ${pluralize(report.summary.sharedSchemaClusters.total, 'cluster')}, ${pluralize(
        report.summary.sharedSchemaClusters.affectedRoutes,
        'affected route',
      )}`,
    );
  }
```

- [ ] **Step 4: Render finding-level aggregate evidence**

Inside the finding loop in `formatConsistencyReport`, after the existing `schemaEnum` block and before `sharedWith`, add:

```ts
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
```

- [ ] **Step 5: Run focused tests and confirm all pass**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: PASS. All tests in `src/test-support/openapi-consistency.test.ts` should pass.

- [ ] **Step 6: Commit summary and formatter implementation**

```bash
git add src/test-support/openapi-consistency.ts src/test-support/openapi-consistency.test.ts
git commit -m "feat: render OpenAPI shared schema aggregate scope"
```

---

### Task 5: Verify Against The Real Facility Report

**Files:**
- Modify: none unless verification reveals a defect
- Test: `src/test-support/openapi-consistency.test.ts`
- Test: `scripts/report-openapi-consistency.ts`

- [ ] **Step 1: Run the focused unit tests**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the facility-only report**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun run report:openapi-consistency --only facility
```

Expected: exit code 0. Output should include:

```text
Shared schema clusters:
affected routes: 25
individually flagged: 19
unflagged affected routes:
narrowed siblings:
```

The exact total finding count may change because this plan adds one info finding.

- [ ] **Step 3: Verify JSON evidence is complete**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun scripts/report-openapi-consistency.ts --only facility --json > /tmp/openapi-facility-consistency.json
jq '.summary.sharedSchemaClusters, (.findings[] | select(.id|startswith("overbroad-shared-schema-cluster|direction|")) | .evidence | {affectedRouteCount, flaggedRouteCount, unflaggedRoutes, narrowedEnumRoutes, enumGroups})' /tmp/openapi-facility-consistency.json
```

Expected: JSON includes `affectedRouteCount`, `flaggedRouteCount`, `unflaggedRoutes`, `narrowedEnumRoutes`, and `enumGroups`. For the current cached spec, `affectedRouteCount` should be `25` and `flaggedRouteCount` should be `19`.

- [ ] **Step 4: Run typecheck**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit any verification fixes**

If Steps 1-4 required code changes, commit those changes:

```bash
git add src/test-support/openapi-consistency.ts src/test-support/openapi-consistency.test.ts
git commit -m "fix: align shared schema aggregate report verification"
```

If Steps 1-4 pass without changes, do not create an empty commit.

---

## Final Verification

Run these commands before marking the implementation complete:

```bash
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun run report:openapi-consistency --only facility
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun scripts/report-openapi-consistency.ts --only facility --json > /tmp/openapi-facility-consistency.json
jq '.summary.sharedSchemaClusters' /tmp/openapi-facility-consistency.json
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun run typecheck
```

Expected final state:

- Focused tests pass.
- Facility report exits 0 and includes shared schema cluster output.
- JSON summary includes `sharedSchemaClusters`.
- JSON cluster evidence includes complete route lists.
- Typecheck passes.
- `git status --short` shows no unintended changes.
