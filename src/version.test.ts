import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// Re-implement compareVersions for testing (since it's not exported)
function compareVersions(current: string, latest: string): number {
  const currentParts = current.replace(/^v/, '').split('.').map(Number);
  const latestParts = latest.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const curr = currentParts[i] || 0;
    const lat = latestParts[i] || 0;
    if (lat > curr) return 1;  // latest is newer
    if (lat < curr) return -1; // current is newer
  }
  return 0; // equal
}

describe("compareVersions", () => {
  test("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.6.5", "0.6.5")).toBe(0);
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0);
  });

  test("returns 1 when latest is newer (major)", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(1);
    expect(compareVersions("0.6.5", "1.0.0")).toBe(1);
  });

  test("returns 1 when latest is newer (minor)", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(1);
    expect(compareVersions("0.6.5", "0.7.0")).toBe(1);
  });

  test("returns 1 when latest is newer (patch)", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(1);
    expect(compareVersions("0.6.5", "0.6.6")).toBe(1);
  });

  test("returns -1 when current is newer", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBe(-1);
    expect(compareVersions("1.1.0", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.1", "1.0.0")).toBe(-1);
  });

  test("handles versions with different segment counts", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
    expect(compareVersions("1.0", "1.0.1")).toBe(1);
    expect(compareVersions("1.0.1", "1.0")).toBe(-1);
  });

  test("handles v prefix", () => {
    expect(compareVersions("v0.6.5", "v0.6.6")).toBe(1);
    expect(compareVersions("0.6.5", "v0.6.6")).toBe(1);
    expect(compareVersions("v0.6.5", "0.6.6")).toBe(1);
  });
});

describe("version sync", () => {
  test("package.json and client.ts VERSION match", () => {
    const pkgPath = path.join(import.meta.dir, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const pkgVersion = pkg.version;

    const clientPath = path.join(import.meta.dir, "client.ts");
    const clientSrc = fs.readFileSync(clientPath, "utf-8");
    const match = clientSrc.match(/const VERSION = '([^']+)'/);
    expect(match).not.toBeNull();
    const clientVersion = match![1];

    expect(clientVersion).toBe(pkgVersion);
  });
});

// Re-implement convertPayloadTypes and NUMERIC_FIELDS for testing
const NUMERIC_FIELDS = new Set([
  'quantity', 'price_each', 'new_price', 'slot_idx', 'weapon_idx', 'page', 'limit', 'offset',
  'coverage_percent', 'offer_credits', 'request_credits', 'credits', 'index', 'ticks', 'amount', 'count',
  'priority', 'expiration_hours', 'per_page', 'level', 'max_price', 'price', 'page_size',
]);

function convertPayloadTypes(payload: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (NUMERIC_FIELDS.has(key)) {
      const num = parseFloat(value);
      if (!isNaN(num)) { result[key] = num; continue; }
    }
    if (value === 'true') { result[key] = true; continue; }
    if (value === 'false') { result[key] = false; continue; }
    result[key] = value;
  }
  return result;
}

describe("convertPayloadTypes", () => {
  test("converts numeric fields to numbers", () => {
    const result = convertPayloadTypes({ quantity: "10", price: "500", page_size: "20", max_price: "10000" });
    expect(result.quantity).toBe(10);
    expect(result.price).toBe(500);
    expect(result.page_size).toBe(20);
    expect(result.max_price).toBe(10000);
  });

  test("leaves non-numeric fields as strings", () => {
    const result = convertPayloadTypes({ item_id: "ore_iron", ship_class: "prospector" });
    expect(result.item_id).toBe("ore_iron");
    expect(result.ship_class).toBe("prospector");
  });

  test("converts boolean strings", () => {
    const result = convertPayloadTypes({ provide_materials: "true", auto_list: "false" });
    expect(result.provide_materials).toBe(true);
    expect(result.auto_list).toBe(false);
  });

  test("handles mixed payload", () => {
    const result = convertPayloadTypes({ type: "ships", page: "2", page_size: "10", search: "mining" });
    expect(result.type).toBe("ships");
    expect(result.page).toBe(2);
    expect(result.page_size).toBe(10);
    expect(result.search).toBe("mining");
  });
});
