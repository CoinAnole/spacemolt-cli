import { c, emitLine, finiteNumber, formatter, isRecord } from './helpers.ts';

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean') return undefined;
  return finiteNumber(value);
}

function formatNumber(value: unknown): string | undefined {
  const number = numberValue(value);
  if (number === undefined) return undefined;
  return number.toLocaleString();
}

function formatCredits(value: unknown): string | undefined {
  const number = formatNumber(value);
  return number === undefined ? undefined : `${number} cr`;
}

function formatCompactNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatBps(value: unknown): string | undefined {
  const number = numberValue(value);
  if (number === undefined) return undefined;
  return `${formatCompactNumber(number / 100)}%`;
}

function formatPolicyTimestamp(value: unknown): string | undefined {
  const timestamp = numberValue(value);
  if (timestamp === undefined) return undefined;
  const date = new Date(timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000);
  if (Number.isNaN(date.getTime())) return formatNumber(value);
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function joinParts(parts: Array<string | undefined>, fallback = ''): string {
  return parts.filter((part): part is string => Boolean(part)).join(', ') || fallback;
}

function formatCitizenship(policy: Record<string, unknown>): string {
  if (policy.citizenship_open === false) return 'Closed';

  const parts: string[] = [];
  if (policy.citizenship_auto_approve === true) {
    parts.push('Auto-approved');
  } else {
    const fee = formatCredits(policy.citizenship_fee);
    const minBalance = formatCredits(policy.citizenship_min_balance);
    const minRep = formatNumber(policy.citizenship_min_reputation);
    const requirements = [
      fee === undefined ? undefined : `Fee ${fee}`,
      minBalance === undefined ? undefined : `min balance ${minBalance}`,
      minRep === undefined ? undefined : `min rep ${minRep}`,
    ].filter((part): part is string => Boolean(part));
    parts.push(requirements.length ? requirements.join(', ') : 'Open');
  }

  if (policy.citizenship_exclusive === true) parts.push('exclusive');
  return parts.join('; ');
}

function formatTaxes(policy: Record<string, unknown>): string {
  return joinParts([
    formatBps(policy.sales_tax_bps) && `Sales ${formatBps(policy.sales_tax_bps)}`,
    formatBps(policy.income_tax_bps) && `income ${formatBps(policy.income_tax_bps)}`,
    formatBps(policy.property_tax_bps) && `property ${formatBps(policy.property_tax_bps)}`,
    formatBps(policy.default_foreign_sales_tax_bps) &&
      `foreign default ${formatBps(policy.default_foreign_sales_tax_bps)}`,
    formatBps(policy.stateless_sales_tax_bps) && `stateless ${formatBps(policy.stateless_sales_tax_bps)}`,
  ]);
}

function formatForeignOverrides(value: unknown): string {
  if (!isRecord(value)) return '';
  return Object.entries(value)
    .map(([empire, bps]) => {
      const tax = formatBps(bps);
      return tax === undefined ? undefined : `${empire} ${tax}`;
    })
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

function formatBpsMap(value: unknown): string {
  if (!isRecord(value)) return '';
  return Object.entries(value)
    .map(([empire, bps]) => {
      const amount = formatBps(bps);
      return amount === undefined ? undefined : `${empire} ${amount}`;
    })
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

function formatFees(policy: Record<string, unknown>): string {
  const evictionGrace = formatNumber(policy.eviction_grace_cycles);
  return joinParts([
    formatBps(policy.listing_fee_bps) && `Listing ${formatBps(policy.listing_fee_bps)}`,
    formatBps(policy.ship_listing_fee_bps) && `ship ${formatBps(policy.ship_listing_fee_bps)}`,
    formatBps(policy.facility_rent_multiplier_bps) && `rent ${formatBps(policy.facility_rent_multiplier_bps)}`,
    evictionGrace === undefined ? undefined : `eviction grace ${evictionGrace} cycles`,
  ]);
}

function formatCosts(policy: Record<string, unknown>): string {
  const fuelTax = formatNumber(policy.fuel_tax_per_unit);
  const repairCost = formatNumber(policy.repair_cost_per_hull);
  const startingCredits = formatCredits(policy.starting_credits);
  return joinParts([
    fuelTax === undefined ? undefined : `Fuel ${fuelTax} cr/unit`,
    repairCost === undefined ? undefined : `repair ${repairCost} cr/hull`,
    startingCredits === undefined ? undefined : `starting ${startingCredits}`,
  ]);
}

function formatLaw(policy: Record<string, unknown>): string {
  const attackBounty = formatCredits(policy.bounty_attack);
  const killBounty = formatCredits(policy.bounty_kill);
  const delinquencyBounty = formatNumber(policy.tax_delinquency_bounty_per_credit);
  return joinParts([
    attackBounty === undefined ? undefined : `Attack bounty ${attackBounty}`,
    killBounty === undefined ? undefined : `kill bounty ${killBounty}`,
    delinquencyBounty === undefined ? undefined : `tax delinquency ${delinquencyBounty}/credit`,
  ]);
}

function formatEnforcement(policy: Record<string, unknown>): string {
  const jailHours = formatNumber(policy.jail_duration_hours);
  const shootThreshold = formatNumber(policy.shoot_on_sight_threshold);
  const customsFine = formatBps(policy.customs_fine_multiplier_bps);
  return joinParts([
    jailHours === undefined ? undefined : `jail ${jailHours}h`,
    shootThreshold === undefined ? undefined : `shoot <= ${shootThreshold}`,
    customsFine === undefined ? undefined : `customs fine ${customsFine}`,
  ]);
}

function formatReputation(policy: Record<string, unknown>): string {
  const attackPenalty = formatNumber(policy.rep_penalty_attack);
  const killPenalty = formatNumber(policy.rep_penalty_kill);
  const restore = formatBps(policy.bounty_rep_restoration_bps);
  const restoreCap = formatNumber(policy.bounty_rep_restoration_cap);
  const decay = formatNumber(policy.rep_decay_amount);
  const tradeFillCap = formatNumber(policy.rep_trade_fill_cap);
  const tradeFillDivisor = formatNumber(policy.rep_trade_fill_divisor);
  const citizenBaseline = formatNumber(policy.rep_baseline_citizen);
  const outsiderBaseline = formatNumber(policy.rep_baseline_outsider);
  return joinParts([
    attackPenalty === undefined ? undefined : `Attack -${attackPenalty}`,
    killPenalty === undefined ? undefined : `kill -${killPenalty}`,
    restore === undefined ? undefined : `restore ${restore}${restoreCap === undefined ? '' : ` cap ${restoreCap}`}`,
    decay === undefined ? undefined : `decay ${decay}`,
    tradeFillCap === undefined || tradeFillDivisor === undefined
      ? undefined
      : `trade fill cap ${tradeFillCap} per ${tradeFillDivisor}`,
    citizenBaseline === undefined || outsiderBaseline === undefined
      ? undefined
      : `baseline ${citizenBaseline}/${outsiderBaseline}`,
  ]);
}

function formatContraband(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return 'None';
  return value.map(String).join(', ');
}

function policyRows(empires: unknown[]): Array<Record<string, unknown>> {
  return empires.filter(isRecord).map((policy) => ({
    empire: policy.empire_id,
    citizenship: formatCitizenship(policy),
    taxes: formatTaxes(policy),
    foreign: formatForeignOverrides(policy.foreign_sales_tax_bps),
    incomeDeductions: formatBpsMap(policy.foreign_income_tax_deduction),
    fees: formatFees(policy),
    costs: formatCosts(policy),
    law: formatLaw(policy),
    enforcement: formatEnforcement(policy),
    reputation: formatReputation(policy),
    contraband: formatContraband(policy.contraband_items),
    updated: formatPolicyTimestamp(policy.policy_updated_at),
  }));
}

function emitPolicyLine(label: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  emitLine(`  ${label}: ${value}`);
}

export const empireFormatters = [
  formatter(
    (r) => {
      if (r.income_tax === undefined && r.property_tax === undefined && r.sales_tax_rates === undefined) return false;
      emitLine(`\n${c.bright}=== Tax Estimate ===${c.reset}`);
      if (r.tax_collection_active !== undefined) emitLine(`Collection active: ${r.tax_collection_active}`);
      if (r.taxable_income_to_date !== undefined) emitLine(`Taxable income: ${r.taxable_income_to_date}`);
      if (r.income_tax !== undefined) emitLine(`Income tax: ${r.income_tax}`);
      if (r.income_tax_total !== undefined) emitLine(`Income tax total: ${r.income_tax_total}`);
      if (r.assessed_property_value !== undefined) emitLine(`Assessed property: ${r.assessed_property_value}`);
      if (r.property_tax !== undefined) emitLine(`Property tax: ${r.property_tax}`);
      if (r.property_tax_total !== undefined) emitLine(`Property tax total: ${r.property_tax_total}`);
      if (isRecord(r.sales_tax_rates)) emitLine(`Sales tax rates: ${formatBpsMap(r.sales_tax_rates)}`);
      if (isRecord(r.taxable_income_by_source)) {
        emitLine(
          `Income by source: ${Object.entries(r.taxable_income_by_source)
            .map(([key, value]) => `${key} ${value}`)
            .join(', ')}`,
        );
      }
      if (isRecord(r.assessed_property_by_ship)) {
        emitLine(
          `Property by ship: ${Object.entries(r.assessed_property_by_ship)
            .map(([key, value]) => `${key} ${value}`)
            .join(', ')}`,
        );
      }
      if (r.last_assessed_at) emitLine(`Last assessed: ${r.last_assessed_at}`);
      if (r.next_assessment_approx_seconds !== undefined)
        emitLine(`Next assessment approx: ${r.next_assessment_approx_seconds}s`);
      if (r.note) emitLine(`${c.dim}${r.note}${c.reset}`);
      return true;
    },
    { commands: ['get_tax_estimate'] },
  ),

  formatter(
    (result) => {
      if (!Array.isArray(result.empires)) return false;

      const rows = policyRows(result.empires);
      emitLine(
        `\n${c.bright}${result.empires.length === 1 ? '=== Empire Policy ===' : '=== Empire Policies ==='}${c.reset}`,
      );
      if (rows.length === 0) {
        emitLine('(None)');
        return true;
      }

      for (const row of rows) {
        emitLine('');
        emitLine(`${c.bright}${row.empire ?? 'unknown'}${c.reset}`);
        emitPolicyLine('Citizenship', row.citizenship);
        emitPolicyLine('Taxes', row.taxes);
        emitPolicyLine('Foreign Overrides', row.foreign);
        emitPolicyLine('Foreign Income Deductions', row.incomeDeductions);
        emitPolicyLine('Fees', row.fees);
        emitPolicyLine('Costs', row.costs);
        emitPolicyLine('Bounties', row.law);
        emitPolicyLine('Enforcement', row.enforcement);
        emitPolicyLine('Reputation', row.reputation);
        emitPolicyLine('Contraband', row.contraband);
        emitPolicyLine('Updated', row.updated);
      }
      return true;
    },
    { commands: ['get_empire_info'] },
  ),
];
