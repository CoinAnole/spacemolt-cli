import { highValueCommandFixtures } from '../display/formatter-fixtures.ts';
import { resultFormatters } from '../display/formatters.ts';
import { renderStructuredResult } from '../display/index.ts';

const GOLDEN_COVERAGE_OPT_OUTS: Record<string, string> = {
  get_status_summary: 'Internal display variant selected from get_status --summary; covered by CLI golden output.',
  shipping_accept: 'Curated shipping fixture and golden coverage is added in Task 5 of the implementation plan.',
  shipping_get: 'Curated shipping fixture and golden coverage is added in Task 5 of the implementation plan.',
  shipping_list: 'Curated shipping fixture and golden coverage is added in Task 5 of the implementation plan.',
  shipping_post: 'Curated shipping fixture and golden coverage is added in Task 5 of the implementation plan.',
  shipping_quote: 'Curated shipping fixture and golden coverage is added in Task 5 of the implementation plan.',
  shipping_track: 'Curated shipping fixture and golden coverage is added in Task 5 of the implementation plan.',
  storage_carrier_load:
    'Internal display variant selected from storage deposit payload context; covered by renderResponse behavior tests.',
};

export const FRIENDLY_FORMATTING_TARGETS = [
  'captains_log_get',
  'create_faction',
  'faction_get_invites',
  'faction_intel_status',
  'faction_query_intel',
  'faction_trade_intel_status',
  'faction_visit_room',
  'forum_get_thread',
  'get_commands',
  'get_guide',
  'get_map',
  'get_system_agents',
  'get_tax_estimate',
  'read_note',
  'reload',
  'scan',
  'set_colors',
  'set_status',
  'undock',
  'view_completed_mission',
] as const;

const REQUIRED_HIGH_VALUE_FIXTURE_LABELS: Record<string, string> = {
  catalog_recipes: 'catalog',
  facility_list_detailed: 'facility_list',
};

export interface FormatterGoldenCoverageReport {
  formatterCommands: string[];
  highValueCommands: string[];
  highValueFixtureLabels: string[];
  missing: string[];
  optOuts: Record<string, string>;
  requiredCoverageKeys: string[];
  staleOptOuts: string[];
}

export interface FriendlyFormattingGapReport {
  targets: string[];
  missingHighValueFixtures: string[];
  fallbackOutputs: string[];
}

export function formatterGoldenCoverageReport(): FormatterGoldenCoverageReport {
  const formatterCommands = uniqueSorted(resultFormatters.flatMap((formatter) => formatter.commands ?? []));
  const highValueFixtureLabels = uniqueSorted(Object.keys(highValueCommandFixtures));
  const highValueCommands = uniqueSorted(Object.values(highValueCommandFixtures).map((entry) => entry.command));
  const requiredCoverageKeys = uniqueSorted([...formatterCommands, ...Object.keys(REQUIRED_HIGH_VALUE_FIXTURE_LABELS)]);
  const coveredKeys = new Set([...highValueCommands, ...highValueFixtureLabels]);
  const highValueSet = new Set(highValueCommands);
  const formatterCommandSet = new Set(formatterCommands);
  const optOutSet = new Set(Object.keys(GOLDEN_COVERAGE_OPT_OUTS));
  const missing = requiredCoverageKeys.filter((key) => {
    const optOutCommand = REQUIRED_HIGH_VALUE_FIXTURE_LABELS[key] ?? key;
    return !coveredKeys.has(key) && !optOutSet.has(optOutCommand);
  });
  const staleOptOuts = uniqueSorted(
    Object.keys(GOLDEN_COVERAGE_OPT_OUTS).filter(
      (command) => !formatterCommandSet.has(command) || highValueSet.has(command),
    ),
  );

  return {
    formatterCommands,
    highValueFixtureLabels,
    highValueCommands,
    missing,
    optOuts: GOLDEN_COVERAGE_OPT_OUTS,
    requiredCoverageKeys,
    staleOptOuts,
  };
}

export function friendlyFormattingGapReport(): FriendlyFormattingGapReport {
  const targetSet = new Set<string>(FRIENDLY_FORMATTING_TARGETS);
  const highValueEntries = Object.values(highValueCommandFixtures);
  const coveredTargets = new Set(
    highValueEntries.filter((entry) => targetSet.has(entry.command)).map((entry) => entry.command),
  );
  const missingHighValueFixtures = FRIENDLY_FORMATTING_TARGETS.filter((command) => !coveredTargets.has(command));
  const fallbackOutputs = highValueEntries
    .filter((entry) => targetSet.has(entry.command))
    .flatMap((entry) => {
      const rendered = renderStructuredResult(
        entry.command,
        structuredClone(entry.fixture),
        {
          args: [],
          json: false,
          quiet: false,
          plain: true,
          allowUnknown: false,
          dryRun: false,
          noTimestamp: true,
          compact: false,
        },
        {
          clock: { now: () => new Date('2026-05-29T00:00:00.000Z') },
          output: { json: false, quiet: false, plain: true, format: 'table', compact: false },
        },
      );
      return rendered.stdout.some((line) => line.includes('=== Response ===')) ? [entry.command] : [];
    });

  return {
    targets: [...FRIENDLY_FORMATTING_TARGETS],
    missingHighValueFixtures,
    fallbackOutputs: Array.from(new Set(fallbackOutputs)).sort((a, b) => a.localeCompare(b)),
  };
}

export function formatFormatterCoverageError(report: FormatterGoldenCoverageReport): string {
  if (report.missing.length === 0 && report.staleOptOuts.length === 0) {
    return '';
  }

  const sections: string[] = [];
  if (report.missing.length > 0) {
    sections.push(
      [
        'Command-scoped formatters are missing high-value golden coverage:',
        ...report.missing.map((command) => `- ${command}`),
        '',
        'Add each command or required fixture label to highValueCommandFixtures, or add a documented GOLDEN_COVERAGE_OPT_OUTS entry if command-level golden coverage is intentionally deferred.',
      ].join('\n'),
    );
  }
  if (report.staleOptOuts.length > 0) {
    sections.push(
      [
        'Formatter golden coverage opt-outs are stale:',
        ...report.staleOptOuts.map((command) => `- ${command}`),
        '',
        'Remove stale opt-outs for commands that no longer have command-scoped formatters or are now covered by high-value fixtures.',
      ].join('\n'),
    );
  }
  return sections.join('\n\n');
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
