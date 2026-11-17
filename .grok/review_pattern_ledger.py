"""Review-pattern ledger read, plan, append, classify, diff, and check."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from typing import Any, NoReturn

FAMILIES = ("comment", "helper", "presence", "test")
ROW_KEYS = frozenset({"family", "file", "line", "quote"})
DROP_KEYS = frozenset({"op", "family", "file", "line", "quote"})
CLIP = 1500
COMMANDS = frozenset({"read", "plan", "append", "classify", "diff", "check"})
CHILD_ENV_STRIP = ("UPDATE_GOLDENS", "LIVE_API_SYNC", "STRICT_FIXTURE_SCHEMA_DIVERGENCES")
SYNTHETIC_TEST = b"test step passed: no targeted test file exists\n"


def finish(code: int, reason: str, stdout: bytes = b"") -> NoReturn:
    if code != 0:
        sys.stderr.write(f"review-pattern-ledger: {code} {reason}\n")
        sys.stderr.flush()
    sys.stdout.buffer.write(stdout)
    sys.stdout.buffer.flush()
    raise SystemExit(code)


def dump_json(body: dict[str, Any]) -> bytes:
    return json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"


INVALID = dump_json({"ok": False, "error": "invalid"})
MISMATCH = dump_json({"ok": False, "error": "mismatch"})


def is_relative_repo_path(path: str) -> bool:
    text = path.strip()
    if text == "":
        return False
    if text.startswith("/") or text.startswith("~"):
        return False
    if ".." in text or "\\" in text or " " in text:
        return False
    return True


def is_vendor(path: str) -> bool:
    if path == "node_modules" or path.startswith("node_modules/"):
        return True
    if path == "spacemolt-docs" or path.startswith("spacemolt-docs/"):
        return True
    if path == "src/generated" or path.startswith("src/generated/"):
        return True
    if path == "src/golden-output" or path.startswith("src/golden-output/"):
        return True
    if path == "src/test-support" or path.startswith("src/test-support/"):
        return True
    if path == "src/output-golden.test.ts":
        return True
    if path == ".grok" or path.startswith(".grok/") or path == ".git" or path.startswith(".git/"):
        return True
    if path == "dist" or path.startswith("dist/") or path == "build" or path.startswith("build/"):
        return True
    if path == "coverage" or path.startswith("coverage/"):
        return True
    return False


def path_ok(path: str) -> bool:
    if not is_relative_repo_path(path):
        return False
    if is_vendor(path):
        return False
    if path.endswith((".md", ".json", ".sh", ".ps1", ".lock")):
        return False
    return True


# Other copy of editable and needs_golden: .grok/workflows/review-pattern-cleanup.rhai
def editable(path: str) -> bool:
    if not path_ok(path) or not path.endswith(".ts"):
        return False
    return not path.endswith(".fixtures.ts")


def needs_golden(files: list[str]) -> bool:
    for file in files:
        if not file.endswith(".ts") or file.endswith(".test.ts") or file.endswith(".fixtures.ts"):
            continue
        if file.startswith("src/display/"):
            return True
        if file in {
            "src/notification-format-shared.ts",
            "src/notification-summary.ts",
            "src/notifications.ts",
            "src/preview.ts",
        }:
            return True
    return False


def sha256_hex(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def prefix_ok(buf: bytes, expect_bytes: int, expect_sum: int, expect_sha: str) -> bool:
    return len(buf) == expect_bytes and sum(buf) == expect_sum and sha256_hex(buf) == expect_sha


def suffix_ok(buf: bytes, payload: bytes, expect_bytes: int, expect_sum: int, expect_sha: str) -> bool:
    if not payload:
        return False
    size = len(payload)
    if len(buf) < size or buf[-size:] != payload:
        return False
    return prefix_ok(buf[:-size], expect_bytes, expect_sum, expect_sha)


def git_reports_absent(root: str) -> bool | None:
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    try:
        proc = subprocess.run(
            ["git", "cat-file", "-e", "HEAD:.grok/review-pattern-ledger.jsonl"],
            cwd=root,
            env=env,
            capture_output=True,
            check=False,
        )
    except OSError:
        return None
    if proc.returncode != 0 and b"does not exist in" in proc.stderr:
        return True
    return False


def missing_state(explicit: bool, root: str) -> str:
    old_json = os.path.join(root, ".grok", "review-pattern-ledger.json")
    if os.path.exists(old_json):
        return "invalid"
    if explicit:
        return "empty"
    if git_reports_absent(root) is True:
        return "empty"
    return "invalid"


def parse_ledger(raw: bytes) -> list[dict[str, Any]] | None:
    if raw == b"" or raw.strip(b" \t\r\n") == b"":
        return None
    if not raw.endswith(b"\n") or raw.startswith(b"\n") or b"\n\n" in raw:
        return None
    entries: list[dict[str, Any]] = []
    for line in raw.split(b"\n")[:-1]:
        try:
            obj = json.loads(line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        if not isinstance(obj, dict):
            return None
        keys = set(obj)
        if keys == ROW_KEYS:
            is_drop = False
        elif keys == DROP_KEYS and obj.get("op") == "drop":
            is_drop = True
        else:
            return None
        family = obj["family"]
        file_name = obj["file"]
        line_no = obj["line"]
        quote = obj["quote"]
        if family not in FAMILIES:
            return None
        if not isinstance(file_name, str) or file_name == "" or not isinstance(quote, str):
            return None
        if type(line_no) is not int or line_no <= 0:
            return None
        try:
            file_name.encode()
            quote.encode()
        except UnicodeEncodeError:
            return None
        if is_drop:
            entries = [
                kept
                for kept in entries
                if not (kept["family"] == family and kept["file"] == file_name and kept["quote"] == quote)
            ]
        else:
            entries.append({"family": family, "file": file_name, "line": line_no, "quote": quote})
    return entries


def encode_payload(mode: str, rows: list[Any]) -> bytes | None:
    chunks: list[bytes] = []
    for row in rows:
        if not isinstance(row, dict) or set(row) != ROW_KEYS:
            return None
        family = row["family"]
        file_name = row["file"]
        line_no = row["line"]
        quote = row["quote"]
        if family not in FAMILIES:
            return None
        if not isinstance(file_name, str) or file_name == "" or "\x00" in file_name:
            return None
        if not isinstance(quote, str) or "\x00" in quote:
            return None
        if type(line_no) is not int or line_no <= 0:
            return None
        try:
            file_name.encode()
            quote.encode()
        except UnicodeEncodeError:
            return None
        body: dict[str, Any] = {
            "family": family,
            "file": file_name,
            "line": line_no,
            "quote": quote,
        }
        if mode == "drop":
            body = {"op": "drop", **body}
        chunks.append(dump_json(body))
    return b"".join(chunks)


def parse_request(obj: Any) -> tuple[str, int, int, str, list[Any]] | None:
    if not isinstance(obj, dict):
        return None
    mode = obj.get("mode")
    if mode not in ("keep", "drop"):
        return None
    expect_bytes = obj.get("expect_bytes")
    expect_sum = obj.get("expect_sum")
    expect_sha = obj.get("expect_sha256")
    rows = obj.get("rows")
    if type(expect_bytes) is not int or expect_bytes < 0:
        return None
    if type(expect_sum) is not int or expect_sum < 0:
        return None
    if not isinstance(expect_sha, str) or len(expect_sha) != 64:
        return None
    if any(char not in "0123456789abcdef" for char in expect_sha):
        return None
    if not isinstance(rows, list):
        return None
    return mode, expect_bytes, expect_sum, expect_sha, rows


def load_bytes(path: str) -> bytes:
    try:
        with open(path, "rb") as handle:
            return handle.read()
    except OSError:
        finish(1, "io")


def read_all(fd: int) -> bytes:
    chunks: list[bytes] = []
    while True:
        chunk = os.read(fd, 1024 * 1024)
        if not chunk:
            return b"".join(chunks)
        chunks.append(chunk)


def same_inode(write_fd: int, read_fd: int, path: str) -> bool:
    write_stat = os.fstat(write_fd)
    read_stat = os.fstat(read_fd)
    path_stat = os.stat(path)
    return (
        write_stat.st_ino == read_stat.st_ino == path_stat.st_ino
        and write_stat.st_dev == read_stat.st_dev == path_stat.st_dev
    )


def write_all(fd: int, payload: bytes) -> bool:
    view = memoryview(payload)
    while view:
        try:
            written = os.write(fd, view)
        except OSError:
            return False
        if written <= 0:
            return False
        view = view[written:]
    return True


def read_document(entries: list[dict[str, Any]], raw: bytes) -> bytes:
    return dump_json(
        {
            "ok": True,
            "entries": entries,
            "file_bytes": len(raw),
            "file_sum": sum(raw),
            "file_sha256": sha256_hex(raw),
            "active_count": len(entries),
        }
    )


def plan_document(already: bool, payload: bytes, projected: bytes, active_count: int) -> bytes:
    return dump_json(
        {
            "ok": True,
            "already": already,
            "payload_bytes": len(payload),
            "payload_sum": sum(payload),
            "payload_sha256": sha256_hex(payload),
            "next_file_bytes": len(projected),
            "next_file_sum": sum(projected),
            "next_file_sha256": sha256_hex(projected),
            "next_active_count": active_count,
        }
    )


def append_document(appended: int, idempotent: bool, raw: bytes) -> bytes:
    return dump_json(
        {
            "ok": True,
            "appended": appended,
            "idempotent": idempotent,
            "file_bytes": len(raw),
            "file_sum": sum(raw),
            "file_sha256": sha256_hex(raw),
        }
    )


def project(
    raw: bytes,
    payload: bytes,
    expect_bytes: int,
    expect_sum: int,
    expect_sha: str,
) -> tuple[bool, bytes] | None:
    if suffix_ok(raw, payload, expect_bytes, expect_sum, expect_sha):
        return True, raw
    if prefix_ok(raw, expect_bytes, expect_sum, expect_sha):
        return False, raw + payload
    return None


def command_read(path: str, explicit: bool, root: str) -> None:
    if not os.path.exists(path):
        if missing_state(explicit, root) == "empty":
            finish(0, "", read_document([], b""))
        finish(2, "invalid", INVALID)
    raw = load_bytes(path)
    entries = parse_ledger(raw)
    if entries is None:
        finish(2, "invalid", INVALID)
    finish(0, "", read_document(entries, raw))


def prepare_update(
    path: str,
    explicit: bool,
    root: str,
    obj: Any,
) -> tuple[bytes, bool, int, int, str]:
    parsed = parse_request(obj)
    if parsed is None:
        finish(2, "invalid", INVALID)
    mode, expect_bytes, expect_sum, expect_sha, rows = parsed
    payload = encode_payload(mode, rows)
    if payload is None:
        finish(2, "invalid", INVALID)
    if os.path.exists(path):
        return payload, False, expect_bytes, expect_sum, expect_sha
    empty = missing_state(explicit, root) == "empty" and prefix_ok(b"", expect_bytes, expect_sum, expect_sha)
    if not empty:
        finish(3, "mismatch", MISMATCH)
    return payload, True, expect_bytes, expect_sum, expect_sha


def command_plan(path: str, explicit: bool, root: str, obj: Any) -> None:
    payload, missing, expect_bytes, expect_sum, expect_sha = prepare_update(path, explicit, root, obj)
    raw = b"" if missing else load_bytes(path)
    projected = project(raw, payload, expect_bytes, expect_sum, expect_sha)
    if projected is None:
        finish(3, "mismatch", MISMATCH)
    already, projected_bytes = projected
    if projected_bytes == b"":
        count = 0
    else:
        entries = parse_ledger(projected_bytes)
        if entries is None:
            finish(2, "invalid", INVALID)
        count = len(entries)
    finish(0, "", plan_document(already, payload, projected_bytes, count))


def command_append(path: str, explicit: bool, root: str, obj: Any) -> None:
    payload, missing, expect_bytes, expect_sum, expect_sha = prepare_update(path, explicit, root, obj)
    if missing and payload == b"":
        finish(0, "", append_document(0, False, b""))
    try:
        fd = os.open(path, os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o644)
    except OSError:
        finish(1, "io")
    read_fd = -1
    try:
        try:
            import fcntl

            fcntl.flock(fd, fcntl.LOCK_EX)
        except (ImportError, OSError):
            finish(4, "flock")
        try:
            read_fd = os.open(path, os.O_RDONLY)
            if not same_inode(fd, read_fd, path):
                finish(3, "mismatch", MISMATCH)
            raw = read_all(read_fd)
        except OSError:
            finish(1, "io")
        projected = project(raw, payload, expect_bytes, expect_sum, expect_sha)
        if projected is None:
            finish(3, "mismatch", MISMATCH)
        already, projected_bytes = projected
        if already or payload == b"":
            finish(0, "", append_document(0, already, projected_bytes))
        if not write_all(fd, payload):
            finish(4, "short-write")
        finish(0, "", append_document(payload.count(b"\n"), False, projected_bytes))
    finally:
        if read_fd >= 0:
            os.close(read_fd)
        os.close(fd)


def classify_one(root: str, entry: Any) -> tuple[str, int]:
    if not isinstance(entry, dict):
        return "ABSENT", 0
    file_name = entry.get("file", "")
    line_no = entry.get("line", 0)
    quote = entry.get("quote", "")
    if not isinstance(file_name, str):
        file_name = ""
    if type(line_no) is not int:
        line_no = 0
    if not isinstance(quote, str):
        quote = ""
    if file_name == "" or file_name.startswith("/") or file_name.startswith("\\") or ".." in file_name.split("/"):
        return "ABSENT", 0
    try:
        quote_bytes = quote.encode()
    except UnicodeEncodeError:
        return "ABSENT", 0
    path = os.path.join(root, file_name)
    try:
        if not os.path.isfile(path):
            return "ABSENT", 0
        with open(path, "rb") as handle:
            raw = handle.read()
    except (OSError, UnicodeEncodeError):
        return "ABSENT", 0
    lines = raw.split(b"\n")
    hits = 0
    for row in lines:
        if quote_bytes in row:
            hits += 1
    on_line = 1 <= line_no <= len(lines) and quote_bytes in lines[line_no - 1]
    if hits == 0:
        return "ABSENT", 0
    if on_line:
        return "ON", hits
    return "MOVED", hits


def command_classify(root: str, obj: Any) -> None:
    if not isinstance(obj, dict) or not isinstance(obj.get("entries"), list):
        finish(2, "invalid", INVALID)
    lines = []
    entries = obj["entries"]
    for index, entry in enumerate(entries):
        status, hits = classify_one(root, entry)
        lines.append(f"{index} {status} {hits}")
    lines.append(f"COUNT {len(entries)}")
    finish(0, "", ("\n".join(lines) + "\n").encode("utf-8"))


def git_name_lists(root: str) -> tuple[bool, list[str]] | None:
    commands = (
        ["git", "diff", "--name-only", "HEAD"],
        ["git", "ls-files", "--others", "--exclude-standard"],
    )
    paths: list[str] = []
    ok = True
    for command in commands:
        try:
            proc = subprocess.run(command, cwd=root, capture_output=True, check=False)
        except OSError:
            return None
        if proc.returncode != 0:
            ok = False
            continue
        if not ok:
            continue
        for line in proc.stdout.decode("utf-8", "replace").splitlines():
            if line == "" or not is_relative_repo_path(line):
                continue
            paths.append(line)
    if not ok:
        return False, []
    return True, unique_paths(paths)


def diff_header(ok: bool, paths: list[str]) -> list[str]:
    lines = ["DIFF_OK yes" if ok else "DIFF_OK no", f"DIFF_COUNT {len(paths)}"]
    for path in paths:
        lines.append(f"DIFF {path}")
    lines.append("END_DIFF")
    return lines


def command_diff(root: str) -> None:
    found = git_name_lists(root)
    if found is None:
        finish(1, "spawn")
    ok, paths = found
    finish(0, "", ("\n".join(diff_header(ok, paths)) + "\n").encode())


def unique_paths(paths: list[str]) -> list[str]:
    return list(dict.fromkeys(paths))


def added_files(before: list[str], after: list[str]) -> list[str]:
    prior = set(before)
    found: list[str] = []
    for path in after:
        if path not in prior and editable(path):
            found.append(path)
    return found


def select_files(
    op: str,
    baseline_succeeded: bool,
    after_ok: bool,
    after_files: list[str],
    baseline_files: list[str],
    edited: list[str],
    check_files: list[str],
) -> list[str]:
    if op == "check":
        if baseline_succeeded and after_ok:
            edited_hit = [path for path in edited if editable(path) and path in after_files]
            return unique_paths([*added_files(baseline_files, after_files), *edited_hit])
        return [path for path in unique_paths(edited) if editable(path)]
    extra = added_files(baseline_files, after_files) if baseline_succeeded and after_ok else []
    return unique_paths([*check_files, *extra])


def string_list(value: Any) -> list[str] | None:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        return None
    return value


def parse_check(obj: Any) -> tuple[str, bool, list[str], list[str], list[str]] | None:
    if not isinstance(obj, dict):
        return None
    op = obj.get("op")
    if op not in ("check", "recheck"):
        return None
    if type(obj.get("baseline_ok")) is not bool or type(obj.get("baseline_succeeded")) is not bool:
        return None
    baseline_files = string_list(obj.get("baseline_files"))
    edited = string_list(obj.get("edited"))
    check_files = string_list(obj.get("check_files"))
    if baseline_files is None or edited is None or check_files is None:
        return None
    return op, obj["baseline_succeeded"], baseline_files, edited, check_files


def targeted_tests(root: str, files: list[str]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    def consider(path: str) -> None:
        if path in seen or not os.path.isfile(os.path.join(root, path)):
            return
        seen.add(path)
        found.append(path)

    for path in files:
        if path.endswith(".test.ts"):
            consider(path)
        if not path.endswith(".ts") or path.endswith(".test.ts") or path.endswith(".fixtures.ts"):
            continue
        directory, base = os.path.split(path)
        stem = base[: -len(".ts")]
        direct = os.path.join(directory, stem + ".test.ts")
        consider(direct)
        directory_abs = os.path.join(root, directory) if directory else root
        try:
            names = sorted(os.listdir(directory_abs))
        except OSError:
            continue
        prefix = stem + "."
        suffix = ".test.ts"
        for name in names:
            if not name.startswith(prefix) or not name.endswith(suffix):
                continue
            middle = name[len(prefix) : -len(suffix)]
            if middle == "":
                continue
            consider(os.path.join(directory, name))
    return found


def run_checks(root: str, files: list[str]) -> tuple[bool, bool, bytes, bool]:
    bun = shutil.which("bun")
    if not bun:
        home_bun = os.path.expanduser("~/.bun/bin/bun")
        if os.path.isfile(home_bun) and os.access(home_bun, os.X_OK):
            bun = home_bun
        else:
            return False, False, b"", True
    env = os.environ.copy()
    for key in CHILD_ENV_STRIP:
        env.pop(key, None)
    parts: list[bytes] = []
    truncated = False
    all_ok = True

    def spawn(argv: list[str]) -> bool:
        nonlocal truncated, all_ok
        try:
            proc = subprocess.run(argv, cwd=root, env=env, capture_output=True, check=False)
        except OSError:
            return False
        if proc.returncode != 0:
            all_ok = False
        combined = proc.stdout + proc.stderr
        if len(combined) > CLIP:
            combined = combined[:CLIP]
            truncated = True
        block = f"{' '.join(argv)} exit {proc.returncode}\n".encode() + combined
        if not block.endswith(b"\n"):
            block += b"\n"
        parts.append(block)
        return True

    targeted = targeted_tests(root, files)
    if not spawn([bun, "run", "lint"]):
        return False, False, b"", True
    if not spawn([bun, "run", "typecheck"]):
        return False, False, b"", True
    if targeted:
        if not spawn([bun, "test", *targeted]):
            return False, False, b"", True
    else:
        parts.append(SYNTHETIC_TEST)
    if needs_golden(files) and not spawn([bun, "test", "src/output-golden.test.ts"]):
        return False, False, b"", True
    return all_ok, truncated, b"".join(parts), False


def check_text(
    op: str,
    diff_ok: bool,
    diff_paths: list[str],
    ran: str,
    check_ok: str,
    truncated: str,
    files: list[str],
) -> bytes:
    lines = [f"OP {op}", *diff_header(diff_ok, diff_paths)]
    lines.extend(
        [
            f"CHECK_RAN {ran}",
            f"CHECK_OK {check_ok}",
            f"SUMMARY_TRUNCATED {truncated}",
            f"CHECK_COUNT {len(files)}",
        ]
    )
    for path in files:
        lines.append(f"CHECK {path}")
    lines.append("END_CHECK")
    return ("\n".join(lines) + "\n").encode("utf-8")


def command_check(root: str, obj: Any) -> None:
    parsed = parse_check(obj)
    if parsed is None:
        finish(2, "invalid", INVALID)
    op, baseline_succeeded, baseline_files, edited, check_files = parsed
    found = git_name_lists(root)
    if found is None:
        finish(1, "spawn")
    after_ok, after_files = found
    files = select_files(
        op,
        baseline_succeeded,
        after_ok,
        after_files,
        baseline_files,
        edited,
        check_files,
    )
    if not files:
        finish(0, "", check_text(op, after_ok, after_files, "no", "skipped", "no", []))
    all_ok, truncated, summary, spawn_failed = run_checks(root, files)
    if spawn_failed:
        finish(1, "spawn")
    finish(
        0,
        "",
        check_text(
            op,
            after_ok,
            after_files,
            "yes",
            "yes" if all_ok else "no",
            "yes" if truncated else "no",
            files,
        )
        + summary,
    )


def read_stdin_json() -> Any:
    try:
        return json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        finish(2, "invalid", INVALID)


def main(argv: list[str]) -> None:
    if not argv or argv[0] not in COMMANDS:
        finish(1, "usage")
    command = argv[0]
    ledger: str | None = None
    root: str | None = None
    index = 1
    while index < len(argv):
        flag = argv[index]
        if flag not in {"--ledger", "--root"} or index + 1 >= len(argv):
            finish(1, "usage")
        value = argv[index + 1]
        if flag == "--ledger":
            if ledger is not None:
                finish(1, "usage")
            ledger = value
        else:
            if root is not None:
                finish(1, "usage")
            root = value
        index += 2
    cwd = os.getcwd()
    root_dir = os.path.join(cwd, root) if root is not None else cwd
    if ledger is None:
        path = os.path.join(cwd, ".grok", "review-pattern-ledger.jsonl")
        explicit = False
    else:
        path = os.path.join(cwd, ledger)
        explicit = True
    if command == "read":
        command_read(path, explicit, root_dir)
    elif command == "plan":
        command_plan(path, explicit, root_dir, read_stdin_json())
    elif command == "append":
        command_append(path, explicit, root_dir, read_stdin_json())
    elif command == "classify":
        command_classify(root_dir, read_stdin_json())
    elif command == "diff":
        command_diff(root_dir)
    else:
        command_check(root_dir, read_stdin_json())


if __name__ == "__main__":
    main(sys.argv[1:])
