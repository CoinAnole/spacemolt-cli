const INDENT = '  ';

export function toYaml(value: unknown, level = 0): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return yamlString(value);
  if (Array.isArray(value)) return yamlArray(value, level);
  if (typeof value === 'object') return yamlObject(value as Record<string, unknown>, level);
  return String(value);
}

function yamlString(value: string): string {
  if (value === '') return '""';
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  if (/[\s:{}[\],&*?|'%-]/.test(value) || /^(true|false|null|yes|no|on|off)$/i.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function yamlArray(items: unknown[], level: number): string {
  if (items.length === 0) return '[]';
  const prefix = INDENT.repeat(level);
  const lines: string[] = [];
  for (const item of items) {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const keys = Object.keys(item);
      if (keys.length === 0) {
        lines.push(`${prefix}- {}`);
        continue;
      }
      const first = keys[0];
      if (!first) {
        lines.push(`${prefix}- {}`);
        continue;
      }
      const rest = keys.slice(1);
      lines.push(`${prefix}- ${first}: ${inlineYaml((item as Record<string, unknown>)[first])}`);
      for (const key of rest) {
        lines.push(`${prefix}${INDENT}${key}: ${inlineYaml((item as Record<string, unknown>)[key])}`);
      }
    } else {
      lines.push(`${prefix}- ${inlineYaml(item)}`);
    }
  }
  return `\n${lines.join('\n')}`;
}

function yamlObject(obj: Record<string, unknown>, level: number): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return '{}';
  const prefix = INDENT.repeat(level);
  const lines: string[] = [];
  for (const key of keys) {
    const val = obj[key];
    if (Array.isArray(val) && val.length === 0) {
      lines.push(`${prefix}${key}: []`);
    } else if (typeof val === 'object' && val !== null && Object.keys(val).length === 0) {
      lines.push(`${prefix}${key}: {}`);
    } else if (typeof val === 'object' && val !== null) {
      lines.push(`${prefix}${key}:${toYaml(val, level + 1)}`);
    } else {
      lines.push(`${prefix}${key}: ${inlineYaml(val)}`);
    }
  }
  return `\n${lines.join('\n')}`;
}

function inlineYaml(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return yamlString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map((v) => inlineYaml(v)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return `{${entries.map(([k, v]) => `${k}: ${inlineYaml(v)}`).join(', ')}}`;
  }
  return String(value);
}
