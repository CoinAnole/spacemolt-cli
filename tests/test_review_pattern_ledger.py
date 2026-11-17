"""Subprocess contract for the review-pattern ledger program."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PROGRAM = REPO / ".grok" / "review_pattern_ledger.py"
TRACKED = REPO / ".grok" / "review-pattern-ledger.jsonl"
EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
INVALID = b'{"ok":false,"error":"invalid"}\n'
MISMATCH = b'{"ok":false,"error":"mismatch"}\n'
EMPTY_READ = (
    f'{{"ok":true,"entries":[],"file_bytes":0,"file_sum":0,"file_sha256":"{EMPTY_SHA}","active_count":0}}\n'
).encode()
EMPTY_DIFF = b"DIFF_OK yes\nDIFF_COUNT 0\nEND_DIFF\n"
FAILED_DIFF = b"DIFF_OK no\nDIFF_COUNT 0\nEND_DIFF\n"
SKIP_CHECK = (
    b"OP check\n"
    b"DIFF_OK yes\n"
    b"DIFF_COUNT 0\n"
    b"END_DIFF\n"
    b"CHECK_RAN no\n"
    b"CHECK_OK skipped\n"
    b"SUMMARY_TRUNCATED no\n"
    b"CHECK_COUNT 0\n"
    b"END_CHECK\n"
)
FAIL_SKIP = (
    b"OP check\n"
    b"DIFF_OK no\n"
    b"DIFF_COUNT 0\n"
    b"END_DIFF\n"
    b"CHECK_RAN no\n"
    b"CHECK_OK skipped\n"
    b"SUMMARY_TRUNCATED no\n"
    b"CHECK_COUNT 0\n"
    b"END_CHECK\n"
)
RECHECK_SKIP = (
    b"OP recheck\n"
    b"DIFF_OK yes\n"
    b"DIFF_COUNT 0\n"
    b"END_DIFF\n"
    b"CHECK_RAN no\n"
    b"CHECK_OK skipped\n"
    b"SUMMARY_TRUNCATED no\n"
    b"CHECK_COUNT 0\n"
    b"END_CHECK\n"
)
SYNTHETIC = "test step passed: no targeted test file exists\n"

GIT_STUB = r"""#!/usr/bin/python3
import json
import os
import sys

log = os.environ.get("STUB_LOG", "")
args = sys.argv[1:]
if log:
    try:
        parent = open(f"/proc/{os.getppid()}/comm", encoding="utf-8").read().strip()
    except OSError:
        parent = ""
    with open(log, "a", encoding="utf-8") as handle:
        handle.write(
            "GIT "
            + json.dumps({"argv": args, "lc_all": os.environ.get("LC_ALL", ""), "parent": parent})
            + "\n"
        )
if args[:2] == ["cat-file", "-e"]:
    cat = os.environ.get("GIT_CAT", "absent")
    if cat == "absent":
        sys.stderr.write(
            "fatal: path '.grok/review-pattern-ledger.jsonl' does not exist in 'HEAD'\n"
        )
        raise SystemExit(1)
    if cat == "present":
        raise SystemExit(0)
    sys.stderr.write("fatal: not a git repository\n")
    raise SystemExit(128)
mode = os.environ.get("GIT_MODE", "empty")
if mode == "fail":
    sys.stderr.write("git failed\n")
    raise SystemExit(2)
outputs = {
    "empty": ("", ""),
    "space": (
        "ok.py\nfoo bar.py\nfoo..bar.py\n../no.py\n~/secret.py\n/abs.py\n",
        "new.py\n",
    ),
    "added": (
        "src/a.ts\nsrc/b.ts\nnode_modules/x.ts\nsrc/b.test.ts\n",
        "",
    ),
    "helpers": (
        "src/api.ts\nsrc/display/helpers.ts\nnode_modules/x.ts\n",
        "",
    ),
    "vendor": (
        "README.md\nnode_modules/x.ts\n.grok/foo.ts\n",
        "src/output-golden.test.ts\n",
    ),
    "else": (
        "src/other.ts\nREADME.md\n",
        "",
    ),
}
diff_out, other_out = outputs.get(mode, ("", ""))
if args[:3] == ["diff", "--name-only", "HEAD"]:
    sys.stdout.write(diff_out)
    raise SystemExit(0)
if args == ["ls-files", "--others", "--exclude-standard"]:
    sys.stdout.write(other_out)
    raise SystemExit(0)
sys.stderr.write("unexpected git args\n")
raise SystemExit(2)
"""

TOOL_STUB = r"""#!/usr/bin/python3
import json
import os
import sys

log = os.environ.get("STUB_LOG", "")
name = os.path.basename(sys.argv[0])
if log:
    try:
        parent = open(f"/proc/{os.getppid()}/comm", encoding="utf-8").read().strip()
    except OSError:
        parent = ""
    present = [
        key
        for key in ("UPDATE_GOLDENS", "LIVE_API_SYNC", "STRICT_FIXTURE_SCHEMA_DIVERGENCES")
        if key in os.environ
    ]
    with open(log, "a", encoding="utf-8") as handle:
        handle.write(
            "TOOL "
            + json.dumps(
                {
                    "argv": sys.argv,
                    "parent": parent,
                    "cwd": os.getcwd(),
                    "present": present,
                }
            )
            + "\n"
        )
if os.environ.get("BUN_UNLINK") == "1":
    try:
        os.remove(sys.argv[0])
    except OSError:
        pass
code = int(os.environ.get("EXIT_" + name, "0"))
text = os.environ.get("OUT_" + name, "")
sys.stdout.write(text)
raise SystemExit(code)
"""


def write_exe(path: str, text: str, executable: bool = True) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(textwrap.dedent(text))
    os.chmod(path, 0o755 if executable else 0o644)


def row(
    quote: str = "text",
    line: int = 10,
    family: str = "comment",
    file: str = "spacemolt_tools/x.py",
) -> dict[str, object]:
    return {"family": family, "file": file, "line": line, "quote": quote}


def keep_line(entry: dict[str, object]) -> bytes:
    body = {
        "family": entry["family"],
        "file": entry["file"],
        "line": entry["line"],
        "quote": entry["quote"],
    }
    return json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode() + b"\n"


def drop_line(entry: dict[str, object]) -> bytes:
    body = {
        "op": "drop",
        "family": entry["family"],
        "file": entry["file"],
        "line": entry["line"],
        "quote": entry["quote"],
    }
    return json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode() + b"\n"


def canonical(raw: bytes, *, drop: bool) -> bool:
    if raw == b"" or not raw.endswith(b"\n") or raw.startswith(b"\n") or b"\n\n" in raw:
        return False
    for line in raw.split(b"\n")[:-1]:
        try:
            obj = json.loads(line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False
        if not isinstance(obj, dict):
            return False
        if drop:
            if set(obj) != {"op", "family", "file", "line", "quote"} or obj.get("op") != "drop":
                return False
        elif set(obj) != {"family", "file", "line", "quote"}:
            return False
        rebuilt: dict[str, object] = {
            "family": obj["family"],
            "file": obj["file"],
            "line": obj["line"],
            "quote": obj["quote"],
        }
        if drop:
            rebuilt = {"op": "drop", **rebuilt}
        encoded = json.dumps(rebuilt, ensure_ascii=False, separators=(",", ":")).encode()
        if encoded != line:
            return False
    return True


def request(mode: str, raw: bytes, rows: list[dict[str, object]], **overrides: object) -> str:
    body: dict[str, object] = {
        "mode": mode,
        "expect_bytes": len(raw),
        "expect_sum": sum(raw),
        "expect_sha256": hashlib.sha256(raw).hexdigest(),
        "rows": rows,
    }
    body.update(overrides)
    return json.dumps(body)


def check_request(**overrides: object) -> str:
    body: dict[str, object] = {
        "op": "check",
        "baseline_ok": True,
        "baseline_files": [],
        "edited": [],
        "check_files": [],
        "baseline_succeeded": True,
    }
    body.update(overrides)
    return json.dumps(body)


def parse_census(text: str, count: int) -> list[tuple[str, int]] | None:
    if not isinstance(text, str) or text == "" or count < 0:
        return None
    seen: set[int] = set()
    found: dict[int, tuple[str, int]] = {}
    got: int | None = None
    for line in text.splitlines():
        line = line.strip()
        if line == "":
            continue
        if line.startswith("COUNT "):
            if got is not None:
                return None
            number = line[6:]
            if not number.isdigit():
                return None
            got = int(number)
            if got != count:
                return None
            continue
        fields = [field for field in line.split(" ") if field != ""]
        if len(fields) != 3 or not fields[0].isdigit() or not fields[2].isdigit():
            return None
        index = int(fields[0])
        kind = fields[1]
        hits = int(fields[2])
        if index < 0 or index >= count or index in seen:
            return None
        if kind not in {"ON", "MOVED", "ABSENT"}:
            return None
        if kind == "ABSENT" and hits != 0:
            return None
        if kind != "ABSENT" and hits < 1:
            return None
        seen.add(index)
        found[index] = (kind, hits)
    if got != count or len(found) != count:
        return None
    return [found[index] for index in range(count)]


def _split_check(stdout: str) -> tuple[str, str]:
    marker = "END_CHECK\n"
    index = stdout.find(marker)
    if index < 0:
        raise AssertionError(stdout)
    end = index + len(marker)
    return stdout[:end], stdout[end:]


class ReviewPatternLedgerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = self.tmp.name
        self.ledger = os.path.join(self.root, "ledger.jsonl")
        self.bin_dir = os.path.join(self.root, "bin")
        self.log_path = os.path.join(self.root, "stub-log")
        os.makedirs(self.bin_dir)
        write_exe(os.path.join(self.bin_dir, "git"), GIT_STUB)
        write_exe(os.path.join(self.bin_dir, "bun"), TOOL_STUB)

    def run_prog(
        self,
        args: list[str],
        stdin: str = "",
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[bytes]:
        if env is None:
            env = self.stub_env()
        return subprocess.run(
            [sys.executable, str(PROGRAM), *args],
            input=stdin.encode(),
            capture_output=True,
            cwd=self.root,
            env=env,
            check=False,
        )

    def ledger_args(self, path: str | None = None) -> list[str]:
        return ["--ledger", path or self.ledger, "--root", self.root]

    def stub_env(self, **extra: str) -> dict[str, str]:
        env = os.environ.copy()
        env["PATH"] = self.bin_dir
        env["STUB_LOG"] = self.log_path
        env["LC_ALL"] = "en_US.UTF-8"
        env.pop("GIT_DIR", None)
        env.pop("GIT_WORK_TREE", None)
        env.update(extra)
        return env

    def log_text(self) -> str:
        if not os.path.exists(self.log_path):
            return ""
        with open(self.log_path, encoding="utf-8") as handle:
            return handle.read()

    def reset_log(self) -> None:
        if os.path.exists(self.log_path):
            os.remove(self.log_path)

    def git_calls(self) -> list[dict[str, object]]:
        calls = []
        for line in self.log_text().splitlines():
            if line.startswith("GIT "):
                calls.append(json.loads(line[4:]))
        return calls

    def tool_calls(self) -> list[dict[str, object]]:
        calls = []
        for line in self.log_text().splitlines():
            if line.startswith("TOOL "):
                calls.append(json.loads(line[5:]))
        return calls

    def assert_result(
        self,
        proc: subprocess.CompletedProcess[bytes],
        code: int,
        stdout: bytes | None = None,
    ) -> None:
        message = proc.stderr.decode() + "\n" + proc.stdout.decode()
        self.assertEqual(proc.returncode, code, message)
        if code == 0:
            self.assertEqual(proc.stderr, b"")
        else:
            prefix = f"review-pattern-ledger: {code} ".encode()
            self.assertTrue(proc.stderr.startswith(prefix), proc.stderr)
        if stdout is not None:
            self.assertEqual(proc.stdout, stdout)

    def write_ledger(self, raw: bytes, path: str | None = None) -> None:
        with open(path or self.ledger, "wb") as handle:
            handle.write(raw)

    def read_ledger(self, path: str | None = None) -> bytes:
        target = path or self.ledger
        with open(target, "rb") as handle:
            return handle.read()

    def write_rel(self, rel: str, body: bytes = b"\n") -> None:
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(body)

    def test_read_key_order_and_canonical_keep_drop_lines(self) -> None:
        quote = 'ç—\t"→'
        entry = row(quote=quote)
        kept = keep_line(entry)
        self.write_ledger(kept)
        proc = self.run_prog(["read", *self.ledger_args()])
        body = {
            "ok": True,
            "entries": [entry],
            "file_bytes": len(kept),
            "file_sum": sum(kept),
            "file_sha256": hashlib.sha256(kept).hexdigest(),
            "active_count": 1,
        }
        expected = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode() + b"\n"
        self.assert_result(proc, 0, expected)
        self.assertIn(b"\\t", kept)
        self.assertNotIn(b"\t", kept)
        self.assertIn("→".encode(), kept)
        self.assertNotIn(b"\\u2192", kept)
        self.assertIn("ç".encode(), kept)
        self.assertNotIn(b"\\u00e7", kept)
        self.assertTrue(canonical(kept, drop=False))
        self.assertFalse(canonical(kept, drop=True))

        dropped = drop_line(entry)
        drop_path = self.ledger + ".drop"
        proc = self.run_prog(
            ["append", *self.ledger_args(drop_path)],
            request("drop", b"", [entry]),
        )
        self.assert_result(proc, 0)
        self.assertEqual(self.read_ledger(drop_path), dropped)
        self.assertTrue(canonical(dropped, drop=True))
        self.assertFalse(canonical(dropped, drop=False))
        self.assertIn("→".encode(), dropped)
        self.assertNotIn(b"\\u2192", dropped)
        loaded = json.loads(proc.stdout)
        self.assertEqual(loaded["appended"], 1)
        self.assertFalse(loaded["idempotent"])
        self.assertEqual(loaded["file_sha256"], hashlib.sha256(dropped).hexdigest())

    def test_extra_op_bad_mode_and_nul_do_not_write(self) -> None:
        prefix = keep_line(row(quote="kept"))
        self.write_ledger(prefix)
        extra = {**row(), "op": "drop"}
        for mode in ("keep", "drop"):
            with self.subTest(mode=mode):
                payload = request(mode, prefix, [extra])
                for command in ("plan", "append"):
                    proc = self.run_prog([command, *self.ledger_args()], payload)
                    self.assert_result(proc, 2, INVALID)
                self.assertEqual(self.read_ledger(), prefix)
        missing = os.path.join(self.root, "missing.jsonl")
        proc = self.run_prog(
            ["append", *self.ledger_args(missing)],
            request("keep", b"", [extra]),
        )
        self.assert_result(proc, 2, INVALID)
        self.assertFalse(os.path.exists(missing))
        proc = self.run_prog(
            ["plan", *self.ledger_args()],
            request("other", prefix, [row()]),
        )
        self.assert_result(proc, 2, INVALID)
        self.assertEqual(self.read_ledger(), prefix)
        nul = row(quote="bad\x00quote")
        proc = self.run_prog(
            ["append", *self.ledger_args(missing)],
            request("keep", b"", [nul]),
        )
        self.assert_result(proc, 2, INVALID)
        self.assertFalse(os.path.exists(missing))
        surrogate = row(quote="\ud800")
        for command in ("plan", "append"):
            proc = self.run_prog([command, *self.ledger_args(missing)], request("keep", b"", [surrogate]))
            self.assert_result(proc, 2, INVALID)
        for family in ("repeated", "doc"):
            bad = row(family=family)
            for command in ("plan", "append"):
                proc = self.run_prog([command, *self.ledger_args(missing)], request("keep", b"", [bad]))
                self.assert_result(proc, 2, INVALID)
        self.assertFalse(os.path.exists(missing))

    def test_append_match_second_append_and_changed_payload(self) -> None:
        prefix = keep_line(row(quote="old"))
        added = row(quote="new", line=11)
        payload = keep_line(added)
        self.write_ledger(prefix)
        req = request("keep", prefix, [added])
        plan = self.run_prog(["plan", *self.ledger_args()], req)
        self.assert_result(plan, 0)
        planned = json.loads(plan.stdout)
        self.assertFalse(planned["already"])
        self.assertEqual(planned["next_file_sha256"], hashlib.sha256(prefix + payload).hexdigest())
        self.assertEqual(planned["next_active_count"], 2)
        first = self.run_prog(["append", *self.ledger_args()], req)
        self.assert_result(first, 0)
        self.assertEqual(self.read_ledger(), prefix + payload)
        self.assertEqual(json.loads(first.stdout)["appended"], 1)
        self.assertFalse(json.loads(first.stdout)["idempotent"])
        second = self.run_prog(["append", *self.ledger_args()], req)
        self.assert_result(second, 0)
        self.assertEqual(self.read_ledger(), prefix + payload)
        again = json.loads(second.stdout)
        self.assertEqual(again["appended"], 0)
        self.assertTrue(again["idempotent"])
        changed = request("keep", prefix, [row(quote="other", line=12)])
        for command in ("plan", "append"):
            proc = self.run_prog([command, *self.ledger_args()], changed)
            self.assert_result(proc, 3, MISMATCH)
        self.assertEqual(self.read_ledger(), prefix + payload)

    def test_idempotent_suffix_active_count_matches_read(self) -> None:
        entry = row(quote="same")
        prefix = keep_line(entry)
        full = prefix + prefix
        self.write_ledger(full)
        req = request("keep", prefix, [entry])
        plan = self.run_prog(["plan", *self.ledger_args()], req)
        self.assert_result(plan, 0)
        planned = json.loads(plan.stdout)
        read = self.run_prog(["read", *self.ledger_args()])
        self.assert_result(read, 0)
        loaded = json.loads(read.stdout)
        self.assertTrue(planned["already"])
        self.assertEqual(planned["next_active_count"], loaded["active_count"])
        self.assertEqual(planned["next_active_count"], 2)
        self.assertEqual(planned["next_file_sha256"], loaded["file_sha256"])
        before = self.read_ledger()
        append = self.run_prog(["append", *self.ledger_args()], req)
        self.assert_result(append, 0)
        self.assertEqual(self.read_ledger(), before)
        self.assertTrue(json.loads(append.stdout)["idempotent"])

        drop_prefix = keep_line(row(quote="gone"))
        drop_payload = drop_line(row(quote="gone"))
        self.write_ledger(drop_prefix + drop_payload)
        drop_req = request("drop", drop_prefix, [row(quote="gone")])
        drop_plan = self.run_prog(["plan", *self.ledger_args()], drop_req)
        self.assert_result(drop_plan, 0)
        drop_read = self.run_prog(["read", *self.ledger_args()])
        self.assert_result(drop_read, 0)
        self.assertTrue(json.loads(drop_plan.stdout)["already"])
        self.assertEqual(json.loads(drop_plan.stdout)["next_active_count"], 0)
        self.assertEqual(json.loads(drop_read.stdout)["active_count"], 0)
        before = self.read_ledger()
        drop_append = self.run_prog(["append", *self.ledger_args()], drop_req)
        self.assert_result(drop_append, 0)
        self.assertEqual(self.read_ledger(), before)

    def test_foreign_prefix_truncated_middle_and_sum_collision(self) -> None:
        prefix = keep_line(row(quote="old"))
        payload = keep_line(row(quote="new", line=11))
        cases = {
            "foreign": b"FOREIGN-PREFIX\n" + payload,
            "truncated": prefix[:-5],
            "middle": prefix[:8] + b"X" + prefix[8:],
        }
        collided = bytearray(prefix)
        collided[0] = (collided[0] + 1) & 0xFF
        collided[-1] = (collided[-1] - 1) & 0xFF
        self.assertEqual(sum(collided), sum(prefix))
        self.assertNotEqual(hashlib.sha256(bytes(collided)).digest(), hashlib.sha256(prefix).digest())
        cases["sum"] = bytes(collided)
        req = request("keep", prefix, [row(quote="new", line=11)])
        for name, raw in cases.items():
            with self.subTest(name=name):
                self.write_ledger(raw)
                for command in ("plan", "append"):
                    proc = self.run_prog([command, *self.ledger_args()], req)
                    self.assert_result(proc, 3, MISMATCH)
                self.assertEqual(self.read_ledger(), raw)

    def test_flock_blocks_then_appends(self) -> None:
        import fcntl

        prefix = keep_line(row(quote="held"))
        added = row(quote="after", line=11)
        self.write_ledger(prefix)
        fd = os.open(self.ledger, os.O_RDWR)
        fcntl.flock(fd, fcntl.LOCK_EX)
        proc = subprocess.Popen(
            [sys.executable, str(PROGRAM), "append", *self.ledger_args()],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.root,
        )

        def _stop() -> None:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)

        self.addCleanup(_stop)
        assert proc.stdin is not None
        proc.stdin.write(request("keep", prefix, [added]).encode())
        proc.stdin.close()
        try:
            time.sleep(0.6)
            if proc.poll() is not None:
                out, err = proc.communicate()
                self.fail(f"append finished while the lock was held: {proc.returncode} {err!r} {out!r}")
        finally:
            os.close(fd)
        out, err = proc.communicate(timeout=5)
        self.assertEqual(proc.returncode, 0, err)
        self.assertEqual(self.read_ledger(), prefix + keep_line(added))
        self.assertEqual(json.loads(out)["appended"], 1)

    def test_invalid_ledger_files(self) -> None:
        valid = keep_line(row(file="a.py", line=1, quote="q"))
        samples = {
            "true": b'{"family":"comment","file":"a.py","line":true,"quote":"q"}\n',
            "float": b'{"family":"comment","file":"a.py","line":1.5,"quote":"q"}\n',
            "repeated": b'{"family":"repeated","file":"a.py","line":1,"quote":"q"}\n',
            "doc": b'{"family":"doc","file":"a.py","line":1,"quote":"q"}\n',
            "extra": b'{"family":"comment","file":"a.py","line":1,"quote":"q","extra":1}\n',
            "eof": valid[:-1],
            "leading": b"\n" + valid,
            "blank": valid + b"\n" + valid,
            "zero": b"",
            "spaces": b"   \n",
            "surrogate": b'{"family":"comment","file":"a.py","line":1,"quote":"\\ud800"}\n',
        }
        for name, raw in samples.items():
            with self.subTest(name=name):
                self.write_ledger(raw)
                proc = self.run_prog(["read", *self.ledger_args()])
                self.assert_result(proc, 2, INVALID)
                self.assertEqual(self.read_ledger(), raw)

    def test_cli_families_round_trip(self) -> None:
        entries = [
            row(family="comment", file="src/a.ts", line=1, quote="c"),
            row(family="helper", file="src/b.ts", line=2, quote="h"),
            row(family="presence", file="src/c.ts", line=3, quote="p"),
            row(family="test", file="src/c.test.ts", line=4, quote="t"),
        ]
        raw = b"".join(keep_line(entry) for entry in entries)
        self.write_ledger(raw)
        proc = self.run_prog(["read", *self.ledger_args()])
        self.assert_result(proc, 0)
        loaded = json.loads(proc.stdout)
        self.assertEqual(loaded["entries"], entries)
        self.assertEqual(loaded["active_count"], 4)

    def test_drop_then_readd_and_double_drop(self) -> None:
        first = row(quote="q", line=1, file="a.py")
        second = row(quote="q", line=2, file="a.py")
        other = row(quote="other", line=3, file="a.py")
        restored = row(quote="q", line=4, file="a.py")
        raw = b"".join(
            [
                keep_line(first),
                keep_line(second),
                keep_line(other),
                drop_line(first),
                keep_line(restored),
            ]
        )
        self.write_ledger(raw)
        proc = self.run_prog(["read", *self.ledger_args()])
        self.assert_result(proc, 0)
        loaded = json.loads(proc.stdout)
        self.assertEqual(loaded["entries"], [other, restored])
        self.assertEqual(loaded["active_count"], 2)

        one = keep_line(first) + drop_line(first)
        two = one + drop_line(first)
        one_path = self.ledger + ".one"
        two_path = self.ledger + ".two"
        self.write_ledger(one, one_path)
        self.write_ledger(two, two_path)
        one_read = self.run_prog(["read", *self.ledger_args(one_path)])
        two_read = self.run_prog(["read", *self.ledger_args(two_path)])
        self.assert_result(one_read, 0)
        self.assert_result(two_read, 0)
        self.assertEqual(json.loads(one_read.stdout)["entries"], [])
        self.assertEqual(json.loads(two_read.stdout)["entries"], json.loads(one_read.stdout)["entries"])

    def test_missing_git_absent_and_probe_argv(self) -> None:
        env = self.stub_env(GIT_CAT="absent")
        proc = self.run_prog(["read", "--root", self.root], env=env)
        self.assert_result(proc, 0, EMPTY_READ)
        default = os.path.join(self.root, ".grok", "review-pattern-ledger.jsonl")
        self.assertFalse(os.path.exists(default))
        calls = self.git_calls()
        self.assertEqual(
            calls[0]["argv"],
            ["cat-file", "-e", "HEAD:.grok/review-pattern-ledger.jsonl"],
        )
        self.assertEqual(calls[0]["lc_all"], "C")
        self.assertNotIn(calls[0]["parent"], {"sh", "bash", "dash"})

        for cat in ("other", "present"):
            with self.subTest(cat=cat):
                self.reset_log()
                proc = self.run_prog(["read", "--root", self.root], env=self.stub_env(GIT_CAT=cat))
                self.assert_result(proc, 2, INVALID)
                self.assertFalse(os.path.exists(default))

        empty_bin = os.path.join(self.root, "empty-bin")
        os.makedirs(empty_bin)
        proc = self.run_prog(["read", "--root", self.root], env=self.stub_env(PATH=empty_bin))
        self.assert_result(proc, 2, INVALID)
        self.assertFalse(os.path.exists(default))

        self.reset_log()
        missing = os.path.join(self.root, "skipped.jsonl")
        proc = self.run_prog(["read", *self.ledger_args(missing)], env=self.stub_env(GIT_CAT="other"))
        self.assert_result(proc, 0, EMPTY_READ)
        self.assertNotIn("cat-file", self.log_text())
        self.assertFalse(os.path.exists(missing))

    def test_empty_prefix_create_and_other_missing_paths(self) -> None:
        quote = 'ç—\t"'
        entry = row(quote=quote)
        payload = keep_line(entry)
        req = request("keep", b"", [entry])
        plan = self.run_prog(["plan", *self.ledger_args()], req)
        self.assert_result(plan, 0)
        planned = json.loads(plan.stdout)
        self.assertFalse(planned["already"])
        self.assertEqual(planned["payload_sha256"], hashlib.sha256(payload).hexdigest())
        self.assertEqual(planned["next_file_sha256"], hashlib.sha256(payload).hexdigest())
        self.assertEqual(planned["next_file_bytes"], len(payload))
        self.assertEqual(planned["next_file_sum"], sum(payload))
        self.assertEqual(planned["next_active_count"], 1)
        self.assertFalse(os.path.exists(self.ledger))
        first = self.run_prog(["append", *self.ledger_args()], req)
        self.assert_result(first, 0)
        self.assertEqual(self.read_ledger(), payload)
        second = self.run_prog(["append", *self.ledger_args()], req)
        self.assert_result(second, 0)
        self.assertEqual(self.read_ledger(), payload)
        self.assertTrue(json.loads(second.stdout)["idempotent"])
        reread = self.run_prog(["read", *self.ledger_args()])
        self.assert_result(reread, 0)
        again = self.run_prog(["plan", *self.ledger_args()], req)
        self.assert_result(again, 0)
        self.assertEqual(
            json.loads(again.stdout)["next_active_count"],
            json.loads(reread.stdout)["active_count"],
        )

        absent = os.path.join(self.root, "not-empty.jsonl")
        nonempty = request("keep", b"x", [entry])
        for command in ("plan", "append"):
            proc = self.run_prog([command, *self.ledger_args(absent)], nonempty)
            self.assert_result(proc, 3, MISMATCH)
        self.assertFalse(os.path.exists(absent))

        old = os.path.join(self.root, ".grok", "review-pattern-ledger.json")
        os.makedirs(os.path.dirname(old))
        with open(old, "wb") as handle:
            handle.write(b"{}\n")
        beside = os.path.join(self.root, "beside.jsonl")
        empty_req = request("keep", b"", [entry])
        read = self.run_prog(["read", *self.ledger_args(beside)])
        self.assert_result(read, 2, INVALID)
        for command in ("plan", "append"):
            proc = self.run_prog([command, *self.ledger_args(beside)], empty_req)
            self.assert_result(proc, 3, MISMATCH)
        self.assertFalse(os.path.exists(beside))

    def test_empty_rows_do_not_create_or_write(self) -> None:
        req = request("keep", b"", [])
        plan = self.run_prog(["plan", *self.ledger_args()], req)
        self.assert_result(plan, 0)
        planned = json.loads(plan.stdout)
        self.assertFalse(planned["already"])
        self.assertEqual(planned["payload_bytes"], 0)
        self.assertEqual(planned["next_file_sha256"], EMPTY_SHA)
        self.assertEqual(planned["next_active_count"], 0)
        self.assertFalse(os.path.exists(self.ledger))
        append = self.run_prog(["append", *self.ledger_args()], req)
        self.assert_result(append, 0)
        self.assertFalse(os.path.exists(self.ledger))
        prefix = keep_line(row())
        self.write_ledger(prefix)
        existing = request("keep", prefix, [])
        append = self.run_prog(["append", *self.ledger_args()], existing)
        self.assert_result(append, 0)
        self.assertEqual(self.read_ledger(), prefix)
        self.assertEqual(json.loads(append.stdout)["appended"], 0)

    def test_zero_byte_matches_empty_snapshot_for_plan(self) -> None:
        self.write_ledger(b"")
        entry = row(quote="z", line=1)
        req = request("keep", b"", [entry])
        read = self.run_prog(["read", *self.ledger_args()])
        self.assert_result(read, 2, INVALID)
        plan = self.run_prog(["plan", *self.ledger_args()], req)
        self.assert_result(plan, 0)
        planned = json.loads(plan.stdout)
        self.assertFalse(planned["already"])
        self.assertEqual(planned["next_active_count"], 1)
        self.assertEqual(self.read_ledger(), b"")
        append = self.run_prog(["append", *self.ledger_args()], req)
        self.assert_result(append, 0)
        self.assertEqual(self.read_ledger(), keep_line(entry))

    def test_classify_rules_and_census_parse(self) -> None:
        with open(os.path.join(self.root, "src.py"), "wb") as handle:
            handle.write(b"other\nneedle\nneedle\n")
        with open(os.path.join(self.root, "foo..bar"), "wb") as handle:
            handle.write(b"alpha\n")
        os.makedirs(os.path.join(self.root, "adir"))
        entries = [
            {"file": "missing.py", "line": 1, "quote": "needle"},
            {"file": "src.py", "line": 2, "quote": "needle"},
            {"file": "src.py", "line": 1, "quote": "needle"},
            {"file": "../x.py", "line": 1, "quote": "needle"},
            {"file": "foo..bar", "line": 1, "quote": "alpha"},
            {"file": "", "line": 1, "quote": "needle"},
            {"file": "/etc/passwd", "line": 1, "quote": "needle"},
            {"file": "foo/../../etc/passwd", "line": 1, "quote": "needle"},
            {"file": "adir", "line": 1, "quote": "needle"},
        ]
        proc = self.run_prog(
            ["classify", "--root", self.root],
            json.dumps({"entries": entries}),
        )
        expected = (
            "0 ABSENT 0\n"
            "1 ON 2\n"
            "2 MOVED 2\n"
            "3 ABSENT 0\n"
            "4 ON 1\n"
            "5 ABSENT 0\n"
            "6 ABSENT 0\n"
            "7 ABSENT 0\n"
            "8 ABSENT 0\n"
            "COUNT 9\n"
        )
        self.assert_result(proc, 0, expected.encode())
        parsed = parse_census(proc.stdout.decode(), 9)
        self.assertEqual(
            parsed,
            [
                ("ABSENT", 0),
                ("ON", 2),
                ("MOVED", 2),
                ("ABSENT", 0),
                ("ON", 1),
                ("ABSENT", 0),
                ("ABSENT", 0),
                ("ABSENT", 0),
                ("ABSENT", 0),
            ],
        )
        self.assertIsNone(parse_census("0 ON 1\n0 MOVED 1\nCOUNT 2\n", 2))
        self.assertIsNone(parse_census("0 ABSENT 1\nCOUNT 1\n", 1))
        self.assertIsNone(parse_census("0 ON 1\nCOUNT 2\n", 2))
        lone = self.run_prog(
            ["classify", "--root", self.root],
            json.dumps({"entries": [{"file": "src.py", "line": 1, "quote": "\ud800"}]}),
        )
        self.assert_result(lone, 0, b"0 ABSENT 0\nCOUNT 1\n")
        empty = self.run_prog(["classify", "--root", self.root], '{"entries":[]}')
        self.assert_result(empty, 0, b"COUNT 0\n")
        for payload in ("[]", '{"entries":"no"}', "not-json"):
            with self.subTest(payload=payload):
                proc = self.run_prog(["classify", "--root", self.root], payload)
                self.assert_result(proc, 2, INVALID)

    def test_diff_git_rules(self) -> None:
        proc = self.run_prog(["diff", "--root", self.root], env=self.stub_env(GIT_MODE="empty"))
        self.assert_result(proc, 0, EMPTY_DIFF)
        self.assertNotIn("TOOL", self.log_text())
        self.assertEqual(
            [call["argv"] for call in self.git_calls()],
            [
                ["diff", "--name-only", "HEAD"],
                ["ls-files", "--others", "--exclude-standard"],
            ],
        )
        self.reset_log()
        proc = self.run_prog(["diff", "--root", self.root], env=self.stub_env(GIT_MODE="fail"))
        self.assert_result(proc, 0, FAILED_DIFF)
        self.assertNotIn("TOOL", self.log_text())
        self.reset_log()
        proc = self.run_prog(["diff", "--root", self.root], env=self.stub_env(GIT_MODE="space"))
        self.assert_result(
            proc,
            0,
            b"DIFF_OK yes\nDIFF_COUNT 2\nDIFF ok.py\nDIFF new.py\nEND_DIFF\n",
        )
        empty_bin = os.path.join(self.root, "empty-bin")
        os.makedirs(empty_bin)
        proc = self.run_prog(["diff", "--root", self.root], env=self.stub_env(PATH=empty_bin))
        self.assert_result(proc, 1, b"")

    def test_check_skip_headers(self) -> None:
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(edited=["README.md"]),
            env=self.stub_env(GIT_MODE="empty"),
        )
        self.assert_result(proc, 0, SKIP_CHECK)
        self.assertEqual(self.tool_calls(), [])

        self.reset_log()
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(edited=["README.md"]),
            env=self.stub_env(GIT_MODE="fail"),
        )
        self.assert_result(proc, 0, FAIL_SKIP)
        self.assertEqual(self.tool_calls(), [])

        self.reset_log()
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(op="recheck"),
            env=self.stub_env(GIT_MODE="empty"),
        )
        self.assert_result(proc, 0, RECHECK_SKIP)
        self.assertEqual(self.tool_calls(), [])

        self.reset_log()
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(),
            env=self.stub_env(GIT_MODE="vendor"),
        )
        vendor = (
            "OP check\n"
            "DIFF_OK yes\n"
            "DIFF_COUNT 4\n"
            "DIFF README.md\n"
            "DIFF node_modules/x.ts\n"
            "DIFF .grok/foo.ts\n"
            "DIFF src/output-golden.test.ts\n"
            "END_DIFF\n"
            "CHECK_RAN no\n"
            "CHECK_OK skipped\n"
            "SUMMARY_TRUNCATED no\n"
            "CHECK_COUNT 0\n"
            "END_CHECK\n"
        )
        self.assert_result(proc, 0, vendor.encode())
        self.assertEqual(self.tool_calls(), [])

    def test_check_else_branch_drops_non_ts(self) -> None:
        edited = [
            "README.md",
            "src/api.ts",
            "src/api.ts",
            "src/display/social.fixtures.ts",
            "src/display/foo.test.ts",
            "src/display/combat-effects.ts",
            "node_modules/pkg.ts",
            "src/generated/x.ts",
            "src/generated-extra.ts",
            "src/test-support/x.ts",
            "src/test-support.ts",
            "src/output-golden.test.ts",
            "src/golden-output/x.ts",
            "notes.md",
            "coverage/x.ts",
            "build/x.ts",
            "dist/x.ts",
            "spacemolt-docs/x.ts",
            ".git/config.ts",
            ".grok/x.ts",
            "package.json",
            "script.sh",
            "setup.ps1",
            "bun.lock",
            "src/display.ts",
        ]
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(baseline_ok=False, baseline_succeeded=False, edited=edited),
            env=self.stub_env(GIT_MODE="else"),
        )
        self.assert_result(proc, 0)
        header, summary = _split_check(proc.stdout.decode())
        self.assertEqual(
            header,
            "OP check\n"
            "DIFF_OK yes\n"
            "DIFF_COUNT 2\n"
            "DIFF src/other.ts\n"
            "DIFF README.md\n"
            "END_DIFF\n"
            "CHECK_RAN yes\n"
            "CHECK_OK yes\n"
            "SUMMARY_TRUNCATED no\n"
            "CHECK_COUNT 6\n"
            "CHECK src/api.ts\n"
            "CHECK src/display/foo.test.ts\n"
            "CHECK src/display/combat-effects.ts\n"
            "CHECK src/generated-extra.ts\n"
            "CHECK src/test-support.ts\n"
            "CHECK src/display.ts\n"
            "END_CHECK\n",
        )
        self.assertNotIn("CHECK README.md\n", header)
        self.assertNotIn("CHECK src/other.ts\n", header)
        self.assertNotIn("CHECK src/output-golden.test.ts\n", header)
        calls = self.tool_calls()
        self.assertEqual(
            [call["argv"][1:] for call in calls],
            [["run", "lint"], ["run", "typecheck"], ["test", "src/output-golden.test.ts"]],
        )
        bun = calls[0]["argv"][0]
        self.assertIsInstance(bun, str)
        golden = f"{bun} test src/output-golden.test.ts exit 0\n"
        self.assertIn(f"{bun} run typecheck exit 0\n{SYNTHETIC}{golden}", summary)

    def test_check_added_files_and_edited_filter(self) -> None:
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(
                baseline_files=["src/a.ts"],
                edited=["src/a.ts", "src/c.ts"],
            ),
            env=self.stub_env(GIT_MODE="added"),
        )
        self.assert_result(proc, 0)
        header, summary = _split_check(proc.stdout.decode())
        self.assertEqual(
            header,
            "OP check\n"
            "DIFF_OK yes\n"
            "DIFF_COUNT 4\n"
            "DIFF src/a.ts\n"
            "DIFF src/b.ts\n"
            "DIFF node_modules/x.ts\n"
            "DIFF src/b.test.ts\n"
            "END_DIFF\n"
            "CHECK_RAN yes\n"
            "CHECK_OK yes\n"
            "SUMMARY_TRUNCATED no\n"
            "CHECK_COUNT 3\n"
            "CHECK src/b.ts\n"
            "CHECK src/b.test.ts\n"
            "CHECK src/a.ts\n"
            "END_CHECK\n",
        )
        self.assertNotIn("src/c.ts", header)
        self.assertNotIn("CHECK node_modules/x.ts\n", header)
        for call in self.tool_calls():
            self.assertNotIn("test", call["argv"][1:])
        self.assertTrue(summary.endswith(SYNTHETIC))
        self.assertNotIn("output-golden", summary)

    def test_recheck_keeps_check_files_and_adds_editable(self) -> None:
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(
                op="recheck",
                baseline_files=["src/api.ts"],
                check_files=["src/api.ts", "src/api.ts"],
                edited=["src/ignored.ts"],
            ),
            env=self.stub_env(GIT_MODE="helpers"),
        )
        self.assert_result(proc, 0)
        header, _summary = _split_check(proc.stdout.decode())
        self.assertTrue(header.startswith("OP recheck\n"))
        self.assertIn(
            "CHECK_COUNT 2\nCHECK src/api.ts\nCHECK src/display/helpers.ts\nEND_CHECK\n",
            header,
        )
        self.assertNotIn("CHECK node_modules/x.ts\n", header)
        self.assertNotIn("src/ignored.ts", header)
        self.assertIn("DIFF node_modules/x.ts\n", header)

        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(
                op="recheck",
                baseline_files=["src/api.ts"],
                check_files=["README.md"],
                edited=["src/ignored.ts"],
            ),
            env=self.stub_env(GIT_MODE="helpers"),
        )
        self.assert_result(proc, 0)
        header, _summary = _split_check(proc.stdout.decode())
        self.assertIn(
            "CHECK_COUNT 2\nCHECK README.md\nCHECK src/display/helpers.ts\nEND_CHECK\n",
            header,
        )

        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(
                op="recheck",
                baseline_ok=False,
                baseline_succeeded=False,
                check_files=["README.md", "src/api.ts"],
                edited=["src/display/helpers.ts"],
            ),
            env=self.stub_env(GIT_MODE="helpers"),
        )
        self.assert_result(proc, 0)
        header, _summary = _split_check(proc.stdout.decode())
        self.assertIn(
            "CHECK_COUNT 2\nCHECK README.md\nCHECK src/api.ts\nEND_CHECK\n",
            header,
        )
        self.assertNotIn("CHECK src/display/helpers.ts\n", header)

    def test_targeted_argv_golden_and_synthetic_newline(self) -> None:
        for name in (
            "src/display/helpers.deep-core.test.ts",
            "src/display/helpers.depletion.test.ts",
            "src/display/helpers.over-capacity.test.ts",
            "src/display/helpers.resource-workability.test.ts",
            "src/display/helpers.sovereign-mint.test.ts",
            "src/display/social.test.ts",
            "src/display/social.alpha.test.ts",
            "src/display/social.fixtures.test.ts",
            "src/display/combat.test.ts",
            "src/display/combat.extra.test.ts",
            "src/display/combat.test.more.test.ts",
            "src/display/combat-effects.test.ts",
            "src/display/bare-effects.test.ts",
            "src/display/notifications.test.ts",
            "src/notifications.test.ts",
            "src/notifications.more.test.ts",
            "src/notification-summary.test.ts",
        ):
            self.write_rel(name)
        nested = os.path.join(self.root, "src", "display", "helpers.nested.test.ts")
        os.makedirs(nested)
        with open(os.path.join(nested, "inside.ts"), "wb") as handle:
            handle.write(b"\n")

        cases = {
            "helpers": (
                ["src/display/helpers.ts"],
                [
                    "src/display/helpers.deep-core.test.ts",
                    "src/display/helpers.depletion.test.ts",
                    "src/display/helpers.over-capacity.test.ts",
                    "src/display/helpers.resource-workability.test.ts",
                    "src/display/helpers.sovereign-mint.test.ts",
                ],
                True,
                False,
            ),
            "social": (
                ["src/display/social.ts"],
                [
                    "src/display/social.test.ts",
                    "src/display/social.alpha.test.ts",
                    "src/display/social.fixtures.test.ts",
                ],
                True,
                False,
            ),
            "combat": (
                ["src/display/combat.ts"],
                [
                    "src/display/combat.test.ts",
                    "src/display/combat.extra.test.ts",
                    "src/display/combat.test.more.test.ts",
                ],
                True,
                False,
            ),
            "combat-test": (
                ["src/display/combat.test.ts"],
                ["src/display/combat.test.ts"],
                False,
                False,
            ),
            "depletion-only": (
                ["src/display/helpers.depletion.test.ts"],
                ["src/display/helpers.depletion.test.ts"],
                False,
                False,
            ),
            "notifications": (
                ["src/notifications.ts"],
                ["src/notifications.test.ts", "src/notifications.more.test.ts"],
                True,
                False,
            ),
            "bare": (["src/display/bare.ts"], [], True, True),
            "api": (["src/api.ts"], [], False, True),
            "display-file": (["src/display.ts"], [], False, True),
            "preview": (["src/preview.ts"], [], True, True),
        }
        for name, (edited, targeted, golden, synthetic) in cases.items():
            with self.subTest(name=name):
                self.reset_log()
                proc = self.run_prog(
                    ["check", "--root", self.root],
                    check_request(baseline_ok=False, baseline_succeeded=False, edited=edited),
                    env=self.stub_env(
                        GIT_MODE="empty",
                        UPDATE_GOLDENS="1",
                        LIVE_API_SYNC="1",
                        STRICT_FIXTURE_SCHEMA_DIVERGENCES="1",
                    ),
                )
                self.assert_result(proc, 0)
                _header, summary = _split_check(proc.stdout.decode())
                calls = self.tool_calls()
                bun = calls[0]["argv"][0]
                self.assertEqual(calls[0]["argv"][1:], ["run", "lint"])
                self.assertEqual(calls[1]["argv"][1:], ["run", "typecheck"])
                self.assertEqual(calls[0]["cwd"], self.root)
                self.assertEqual(calls[0]["present"], [])
                self.assertNotIn(calls[0]["parent"], {"sh", "bash", "dash"})
                rest = [call["argv"][1:] for call in calls[2:]]
                expected_rest: list[list[str]] = []
                if targeted:
                    expected_rest.append(["test", *targeted])
                if golden:
                    expected_rest.append(["test", "src/output-golden.test.ts"])
                self.assertEqual(rest, expected_rest)
                if synthetic:
                    self.assertIn(f"{bun} run typecheck exit 0\n{SYNTHETIC}", summary)
                    self.assertEqual(summary.count(SYNTHETIC), 1)
                    if golden:
                        golden_line = f"{bun} test src/output-golden.test.ts exit 0\n"
                        self.assertIn(f"{bun} run typecheck exit 0\n{SYNTHETIC}{golden_line}", summary)
                    else:
                        self.assertTrue(summary.endswith(SYNTHETIC))
                        self.assertNotIn("output-golden", summary)
                else:
                    self.assertNotIn(SYNTHETIC, summary)
                if name == "combat":
                    joined = " ".join(str(part) for call in calls for part in call["argv"])
                    self.assertNotIn("combat-effects", joined)
                if name == "helpers":
                    joined = " ".join(str(part) for call in calls for part in call["argv"])
                    self.assertNotIn("src/display/helpers.test.ts", joined)
                    self.assertNotIn("helpers.nested", joined)
                if name == "notifications":
                    joined = " ".join(str(part) for call in calls for part in call["argv"])
                    self.assertNotIn("notification-summary", joined)
                    self.assertNotIn("src/display/notifications.test.ts", joined)
                if name == "bare":
                    joined = " ".join(str(part) for call in calls for part in call["argv"])
                    self.assertNotIn("bare-effects", joined)

    def test_check_ok_no_and_clip(self) -> None:
        def summary_for(payload: str, code: int) -> str:
            bun = self.tool_calls()[0]["argv"][0]
            parts = []
            for args in ("run lint", "run typecheck"):
                block = f"{bun} {args} exit {code}\n" + payload
                if not block.endswith("\n"):
                    block += "\n"
                parts.append(block)
            parts.append(SYNTHETIC)
            return "".join(parts)

        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(baseline_ok=False, baseline_succeeded=False, edited=["src/api.ts"]),
            env=self.stub_env(GIT_MODE="empty", OUT_bun="x" * 1500),
        )
        self.assert_result(proc, 0)
        header, summary = _split_check(proc.stdout.decode())
        self.assertIn("CHECK_OK yes\n", header)
        self.assertIn("SUMMARY_TRUNCATED no\n", header)
        self.assertEqual(summary, summary_for("x" * 1500, 0))

        self.reset_log()
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(baseline_ok=False, baseline_succeeded=False, edited=["src/api.ts"]),
            env=self.stub_env(GIT_MODE="empty", EXIT_bun="1", OUT_bun="y" * 1501),
        )
        self.assert_result(proc, 0)
        header, summary = _split_check(proc.stdout.decode())
        self.assertEqual(header.count("CHECK_OK no\n"), 1)
        self.assertIn("SUMMARY_TRUNCATED yes\n", header)
        self.assertEqual(summary, summary_for("y" * 1500, 1))
        self.assertEqual([call["argv"][1:] for call in self.tool_calls()], [["run", "lint"], ["run", "typecheck"]])

        self.reset_log()
        decoy = "CHECK_OK yes\n" + ("x" * 2000)
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(baseline_ok=False, baseline_succeeded=False, edited=["src/api.ts"]),
            env=self.stub_env(GIT_MODE="fail", EXIT_bun="1", OUT_bun=decoy),
        )
        self.assert_result(proc, 0)
        header, summary = _split_check(proc.stdout.decode())
        self.assertIn("DIFF_OK no\nDIFF_COUNT 0\nEND_DIFF\n", header)
        self.assertEqual(header.count("CHECK_OK no\n"), 1)
        self.assertNotIn("CHECK_OK yes", header)
        self.assertIn("SUMMARY_TRUNCATED yes\n", header)
        self.assertIn("CHECK_OK yes", summary)
        self.assertEqual(summary, summary_for(decoy[:1500], 1))
        self.assertEqual(len(decoy[:1500]), 1500)
        self.assertEqual([call["argv"][2] for call in self.tool_calls()], ["lint", "typecheck"])

    def test_bun_resolution_and_spawn_failure(self) -> None:
        git_only = os.path.join(self.root, "git-only")
        os.makedirs(git_only)
        write_exe(os.path.join(git_only, "git"), GIT_STUB)
        home_bun = os.path.join(self.root, ".bun", "bin", "bun")
        write_exe(home_bun, TOOL_STUB)
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(baseline_ok=False, baseline_succeeded=False, edited=["src/api.ts"]),
            env=self.stub_env(GIT_MODE="empty", PATH=git_only, HOME=self.root),
        )
        self.assert_result(proc, 0)
        self.assertEqual(self.tool_calls()[0]["argv"][0], home_bun)
        self.assertEqual(self.tool_calls()[0]["argv"][1:], ["run", "lint"])

        self.reset_log()
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(baseline_ok=False, baseline_succeeded=False, edited=["src/api.ts"]),
            env=self.stub_env(GIT_MODE="empty", HOME=self.root),
        )
        self.assert_result(proc, 0)
        self.assertEqual(self.tool_calls()[0]["argv"][0], os.path.join(self.bin_dir, "bun"))

        self.reset_log()
        os.chmod(home_bun, 0o644)
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(baseline_ok=False, baseline_succeeded=False, edited=["src/api.ts"]),
            env=self.stub_env(GIT_MODE="empty", PATH=git_only, HOME=self.root),
        )
        self.assert_result(proc, 1, b"")
        self.assertEqual(self.tool_calls(), [])
        self.assertNotIn("run lint", self.log_text())

        self.reset_log()
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(baseline_ok=False, baseline_succeeded=False, edited=["src/api.ts"]),
            env=self.stub_env(GIT_MODE="empty", PATH=git_only, HOME=os.path.join(self.root, "no-home")),
        )
        self.assert_result(proc, 1, b"")
        self.assertEqual(self.tool_calls(), [])
        self.assertNotIn("typecheck", self.log_text())
        self.assertNotIn("TOOL ", self.log_text())

        self.reset_log()
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(edited=["src/api.ts"]),
            env=self.stub_env(PATH=os.path.join(self.root, "empty-missing"), HOME=os.path.join(self.root, "no-home")),
        )
        self.assert_result(proc, 1, b"")
        self.assertNotIn("TOOL ", self.log_text())

        self.reset_log()
        proc = self.run_prog(
            ["check", "--root", self.root],
            check_request(baseline_ok=False, baseline_succeeded=False, edited=["src/api.ts"]),
            env=self.stub_env(GIT_MODE="empty", BUN_UNLINK="1"),
        )
        self.assert_result(proc, 1, b"")
        calls = self.tool_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["argv"][1:], ["run", "lint"])
        self.assertNotIn("typecheck", self.log_text())

    def test_usage_and_committed_ledger_parses(self) -> None:
        proc = self.run_prog([])
        self.assert_result(proc, 1, b"")
        if not TRACKED.is_file():
            self.skipTest("ledger absent")
        before = TRACKED.read_bytes()
        proc = self.run_prog(["read", "--ledger", str(TRACKED), "--root", self.root])
        self.assertEqual(TRACKED.read_bytes(), before)
        self.assert_result(proc, 0)
        loaded = json.loads(proc.stdout)
        self.assertTrue(loaded["ok"])
        self.assertEqual(loaded["active_count"], len(loaded["entries"]))
        self.assertEqual(loaded["file_bytes"], len(before))
        self.assertEqual(loaded["file_sum"], sum(before))
        self.assertEqual(loaded["file_sha256"], hashlib.sha256(before).hexdigest())
        for entry in loaded["entries"]:
            self.assertEqual(set(entry), {"family", "file", "line", "quote"})


if __name__ == "__main__":
    unittest.main()
