import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const scriptsDir = import.meta.dir;

describe('local install scripts', () => {
  test('Unix installer stages in the install directory before replacing the target', () => {
    const script = fs.readFileSync(path.join(scriptsDir, 'install-local.sh'), 'utf-8');

    expect(script).toContain('TMP="$(mktemp "$INSTALL_DIR/.${TARGET_NAME}.tmp.XXXXXX")"');
    expect(script).toContain('"$BUN_BIN" scripts/build.ts');
    expect(script).toContain('cp "$ROOT_DIR/spacemolt" "$TMP"');
    expect(script).toContain('chmod 755 "$TMP"');
    expect(script).toContain('mv -f "$TMP" "$TARGET"');
  });

  test('Windows installer uses a stable command shim and versioned executables', () => {
    const script = fs.readFileSync(path.join(scriptsDir, 'install-local.ps1'), 'utf-8');

    expect(script).toContain("$BinDir = Join-Path $InstallDir 'bin'");
    expect(script).toContain("$VersionsDir = Join-Path $InstallDir 'versions'");
    expect(script).toContain('& $Bun scripts/build.ts');
    expect(script).toContain("$Shim = Join-Path $BinDir 'spacemolt.cmd'");
    expect(script).toContain('"%~dp0$RelativeExe" %*');
  });
});
