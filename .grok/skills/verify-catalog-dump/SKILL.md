---
name: verify-catalog-dump
description: >
  Check loadCatalogDump: a failed fetch returns the previous catalog and does
  not move fetchedAt forward, a 304 with no cache file is an error, a 304 with
  a cache returns that catalog and may move fetchedAt forward, and a fresh
  file does not call the network unless refresh is set. Use when editing
  loadCatalogDump, readCatalogDumpCache, parseCacheFile, isCacheFresh,
  parseMaxAgeSeconds, or writeCatalogDumpCache in src/catalog-dump-cache.ts,
  and before finishing a change that touches those functions.
user-invocable: true
---

# Verify the catalog dump cache

## Property

A failed fetch returns the previous catalog and does not move `fetchedAt` forward; a 304 with no cache file is an error; a 304 with a cache returns that same catalog and may move `fetchedAt` forward; a fresh file does not call the network unless `refresh` is set.

Harm: a rate limit or a bad body is treated as a new catalog, and later commands trade on it for the whole max-age.

This is not a TLA+ model. `/statechart` does not apply. Nothing model-checks TypeScript. Do not hand-model `loadCatalogDump`. `scripts/verify-catalog-dump.ts` calls the real function with a fake `fetch` and a temp directory. `expectOf` is the promise below, not a second copy of the function. When they disagree, report the sequence. Do not edit `expectOf` so the current code passes.

The file is `catalog-dump.json`, from `catalogDumpCachePath`. `now` is passed in `LoadCatalogDumpOptions`.

Fresh means `isCacheFresh`: `Date.parse(fetchedAt)` is finite, and `now - fetchedAt < maxAgeSeconds * 1000`. An age equal to `maxAgeSeconds` is stale.

What each response does:

- **HTTP 200 JSON object.** The body is the new catalog. The file is rewritten. `fetchedAt` is this load's `now`. The scripted response sends `etag: "from-200"` and `Cache-Control: public, max-age=3600`, so the file stores that etag and `maxAgeSeconds` 3600. `version` is the body's string `version`.
- **HTTP 304 with a cache.** The returned catalog is the cached catalog, not the 304 body. `fetchedAt` is rewritten to this load's `now`. The scripted 304 sends `etag: "revalidated"` and `Cache-Control: max-age=120`, so those replace the stored etag and `maxAgeSeconds`. The catalog object contents stay.
- **HTTP 304 with no cache file.** `error.code` is `invalid_response`. No file is created.
- **HTTP 429, HTTP 500, or a thrown fetch, with a cache.** The returned catalog is the cached catalog. `catalog-dump.json` is not rewritten. `fetchedAt` stays. HTTP 500 is the non-OK status in the alphabet; the code reaches it through `!response.ok` after the 304 and 429 checks.
- **HTTP 429, HTTP 500, or a thrown fetch, with no cache file.** Those are errors: `rate_limited`, `http_error`, and `network_error`. No file is created.
- **HTTP 200 whose body is not a JSON object.** `invalid_response`. The body is not stored. `fetchedAt` does not move. A cache file is left byte for byte. This load does not return the cached catalog. The next load can still read the file. This is not the failed-fetch fallback.
- **`refresh: true`.** The load fetches even when the file is fresh. `refresh: false` on a fresh file does not call `fetch`.

`writeCatalogDumpCache` is awaited before the 200 return and before the 304 return. `loadCatalogDump` does not catch that rejection. A failed write does not return the new body. The checker does not inject a write error. Do not add a fake failing writer.

## When a change touches this

Run the check if a diff touches `loadCatalogDump`, `readCatalogDumpCache`, `parseCacheFile`, `isCacheFresh`, `parseMaxAgeSeconds`, or `writeCatalogDumpCache` in `src/catalog-dump-cache.ts`.

```bash
git diff fbd4f141c76d47fc638fc87120805a902195ebcc -- src/catalog-dump-cache.ts
```

Replace that hash when the coverage record below moves. A change only inside `warnCachedDump` or `defaultCatalogDumpCacheDir` does not change this promise. Say so, and do not move the sync commit. A change only inside `runCommand` in `src/response-renderer.ts` is not this check. The checker calls `loadCatalogDump` itself.

## Coverage

| What | Where |
| --- | --- |
| Fresh file returns without a fetch unless `refresh` is set | `loadCatalogDump`, the `isCacheFresh` check before `fetch` |
| One fetch, then 304, 429, other non-OK, the thrown fetch, or the 200 body | `loadCatalogDump` after that check |
| `fetchedAt` moves only on 200 and on 304 with a cache | the two `writeCatalogDumpCache` calls |
| A cache file is a miss when it cannot be parsed | `readCatalogDumpCache`, `parseCacheFile` |
| Age compared with `maxAgeSeconds` | `isCacheFresh` |
| `Cache-Control` `max-age` and the 3600 default | `parseMaxAgeSeconds`, `DEFAULT_MAX_AGE_SECONDS` |
| The file that the next load reads | `writeCatalogDumpCache`, `catalogDumpCachePath` |

Sync commit: `fbd4f141c76d47fc638fc87120805a902195ebcc`. That commit is the product code this describes. The checker and this skill do not change those functions. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A passing run by itself is not that confirmation.

## Run

From the repo root, with Bun on `PATH` (this run used Bun 1.4.4; no other install):

```bash
bun run verify:catalog-dump
```

Pass prints `verify-catalog-dump: pass`, then the sequence count and probe count. It explores 468 sequences and 13 probes, in 913 calls to `loadCatalogDump`. It finishes in about a tenth of a second. Exit 0.

Fail prints `verify-catalog-dump: fail` and exits 1. The first lines are the counterexample. Do not weaken the property, the alphabet, or a probe to make a red run green.

## Bounds and assumptions

The sequence search tries every order of these, for one call and then for two calls. Each call returns, and the branch stops there. A second fetch inside that call is a failure. The next call is a new `loadCatalogDump` on the same `catalog-dump.json`.

Cache file at the start of a sequence:

- cache miss: no file
- fresh cache: `fetchedAt` `2026-09-07T11:30:00.000Z`, etag `"cached"`, `maxAgeSeconds` 3600, catalog `{ "version": "cached-version", "marker": "cached" }`
- stale cache: the same file with `fetchedAt` `2026-09-07T10:00:00.000Z`

Each call is `refresh` false or `refresh` true, and one prepared response. The response is sent only if that call fetches.

- HTTP 200 JSON object `{ "version": "200-version", "marker": "from-200" }`, etag `"from-200"`, `Cache-Control: public, max-age=3600`
- HTTP 304 with body `{ "version": "304-version", "marker": "from-304" }`, etag `"revalidated"`, `Cache-Control: max-age=120`
- HTTP 429 with body `{ "version": "429-version", "marker": "from-429" }`
- HTTP 500 with body `{ "version": "500-version", "marker": "from-500" }`
- thrown fetch `Error('socket hang up')`
- HTTP 200 whose body is the JSON array `[{ "marker": "from-200-array" }]`

Load 1 uses `now` `2026-09-07T12:00:00.000Z`. Load 2 uses `now` one second later. The fresh file is still fresh. The stale file is still stale. A 200 or a 304 on load 1 is fresh on load 2, so load 2 receives a 429 or a 304 only when `refresh` is true. Those sequences are in the 468:

- cache miss, `refresh` false, HTTP 200, then `refresh` true, HTTP 429: the catalog is the 200 body, and `fetchedAt` stays on load 1's `now`
- cache miss, `refresh` false, HTTP 200, then `refresh` true, HTTP 304: the catalog is still the 200 body, and `fetchedAt` becomes load 2's `now`
- fresh cache, then `refresh` false, then `refresh` false again: `fetch` is not called
- stale cache, `refresh` false, HTTP 500: the stale catalog is returned and `fetchedAt` stays `2026-09-07T10:00:00.000Z`

The search reports the shortest failing sequence. One-call sequences run before two-call sequences.

The 13 probes sit outside that product. Age equal to `maxAgeSeconds` fetches. Age 1ms under it does not. A 200 with no etag and no `Cache-Control` stores `maxAgeSeconds` 3600 and omits `etag`. A 200 body of `null`, `1`, `"catalog"`, or `true` is `invalid_response` with a stale cache and with no file, and the file is not rewritten. A 200 body `{not-json` is the same, with the message `Catalog dump response was not valid JSON.`

On every fetch, the URL is `https://game.spacemolt.com/api/catalog.json`, the method is GET, and `If-None-Match` is the cache etag when the file has one. The no-etag probe has no `If-None-Match`.

Assumptions, enforced by the harness:

- `fetch` is the fake passed in `LoadCatalogDumpOptions`. It does not read `AbortSignal`. `timeoutMs` is 1 so the process does not wait out `FETCH_TIMEOUT_MS`. The signal does not decide the result.
- `now` is the date above, not `Date.now()`.
- The directory is an empty temp dir. The checker deletes the files between sequences. Nothing else writes `catalog-dump.json`.
- Catalogs are compared by JSON contents. A 304 returns the cached contents. The second load parses the file again, so it is not the same object reference.
- The 429 and 500 bodies are JSON objects so a path that stores them is visible. The code does not read those bodies on the current branches.

## Read a failure

Replay the printed loads against `loadCatalogDump`. Each arrow is one call. "On load N" is the call that broke the promise. The prepared response was sent only if that line says `fetch` was called, or if the returned catalog is the response body.

It is a bug when every step is a branch `loadCatalogDump` actually takes, and the promise above forbids the returned catalog, the `fetchedAt` move, or the missing error. Report it in those words. Do not change product code unless the user asked. Do not edit the promise so the current code passes.

It is a modeling error when the harness could not follow the code:

- `Response alphabet is ...` or `Named sequence missing` — the script's own guard. A response was dropped. Put it back.
- `fetch URL was` or `fetch method was` — compare with the `fetchImpl` call in `loadCatalogDump`. A different URL or method is a bug if that call changed. A harness that mis-read `init.headers` is a modeling error.
- `If-None-Match was` — the code sets that header from `cache.etag` after `parseCacheFile`. An absent header when the file has an etag is a behavior change. A checker that expected a different etag than the one it wrote is a modeling error.
- `loadCatalogDump threw` — these responses are supposed to return an `APIResponse`. A throw of `socket hang up` means the `fetch` catch no longer catches. A throw on HTTP 200 or HTTP 304, in a writable temp dir, means `writeCatalogDumpCache` rejected before the return. That is a bug if the directory is writable. A throw whose message is about the temp dir itself is a harness failure.
- The message text changed and the `error.code` is still the branch the promise names (`invalid_response`, `rate_limited`, `http_error`, `network_error`). Update the expected message. Do not treat that as a new catalog.

A failure that looks like the scratch below is a bug. In the HTTP 429 branch, when a cache exists, parsing the body and writing it as `catalog` with `fetchedAt` set to `now` makes `bun run verify:catalog-dump` exit 1. The shortest sequence is:

```
fresh cache → refresh true, HTTP 429
On load 1:
returned {"version":"429-version","marker":"from-429"}. Expected catalog {"version":"cached-version","marker":"cached"}.
The response body was used as the catalog.
fetchedAt moved from 2026-09-07T11:30:00.000Z to 2026-09-07T12:00:00.000Z. catalog-dump.json was rewritten.
The stored catalog changed from {"version":"cached-version","marker":"cached"} to {"version":"429-version","marker":"from-429"}.
The response body was written into catalog-dump.json.
A failed fetch returns the previous catalog and does not move fetchedAt forward.
```

Put that 429 branch back to `return { structuredContent: cache.catalog }` with no write. The code at the sync commit does not read the 429 body.

Returning `{ structuredContent: { ok: true } }` for a 304 when `cache` is missing fails earlier:

```
cache miss → refresh false, HTTP 304
On load 1:
returned catalog {"ok":true}. Expected invalid_response and no catalog.
A 304 with no cache file is invalid_response.
```

Put back `invalid_response` with the message `Catalog dump returned 304 without a local cache.`

## Update the check when the change is intended

1. Re-read `loadCatalogDump`, `readCatalogDumpCache`, `parseCacheFile`, `isCacheFresh`, `parseMaxAgeSeconds`, and `writeCatalogDumpCache` at the new commit. Write down each new status check, each write of `fetchedAt`, and any change to what a fresh file is.
2. Edit `scripts/verify-catalog-dump.ts` from that reading. Change the property only when the product change says so (the code comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence. Keep a 200 that is not a JSON object as `invalid_response` that does not rewrite the file, unless the product change says that body is now a catalog or a failed-fetch fallback. Keep `expectOf` as the promise. Do not copy `loadCatalogDump` into it.
3. Run `bun run verify:catalog-dump`.
4. Break the new behavior in the real code, the way the 429 scratch above does, or the 304 scratch if that was the clause that changed. Run the command again and confirm it fails. Restore `src/catalog-dump-cache.ts`. Run once more and confirm `verify-catalog-dump: pass`.
5. Move the sync commit in this skill to that commit only after steps 1–4. If step 1 found a branch the checker still does not drive, do not move the hash. Either extend the checker or leave the hash and say what is unconfirmed.

If the covered code changed and this check was not re-run, use `/maintain-formal-verification-skill`.

## What a pass does not cover

A pass is these 468 sequences and 13 probes. It is not every catalog a server can send.

It does not cover two writers, a torn temp file, a crash between write and rename, permission errors, or a failed `writeCatalogDumpCache`. The source awaits that write and does not catch it, so a failed write does not return the body. This run never makes the write fail.

It does not cover gzip or `Content-Encoding`, the real network, TLS, or the abort timer firing. `Accept-Encoding: gzip` is sent and not asserted. The fake `fetch` returns an already-decoded body.

It does not cover HTTP 201, 204, 301, 302, 400, 401, 403, 404, or 503. Only 200, 304, 429, and 500 are driven. Statuses other than 200, 304, and 429 share the `!response.ok` branch with 500, and that sharing is not itself driven.

It does not cover a corrupt cache file, a missing key, an empty etag, a negative `maxAgeSeconds`, or a `fetchedAt` that `Date.parse` rejects. `parseCacheFile` treats several of those as a miss. The sequences use valid files only. A looser parser that accepts a corrupt file is not checked. A stricter parser that rejects the valid files above fails this check.

It does not cover `max-age=0`, `s-maxage`, or a `Cache-Control` that does not match `max-age=<digits>`. The 304 and 200 headers in the sequences are the two values above. The missing-header 200 is one probe.

It does not cover a JSON object whose `version` is not a string. The code stores `version` `''` and still accepts the object as the catalog.

Sequences stop at two calls. The file after the second call is checked. A third call is not run.

The check stops at the returned catalog and `catalog-dump.json`. It does not run a later trade against that catalog. Warning lines from `warnCachedDump` and the debug cache-hit line are not checked. `defaultCatalogDumpCacheDir` and `runCommand`'s `catalog_dump` branch are not driven.
