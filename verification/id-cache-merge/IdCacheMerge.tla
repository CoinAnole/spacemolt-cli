----------------------------- MODULE IdCacheMerge ----------------------------
\* Clause 2. cacheIdsFromResponse and saveIdCache in src/id-cache.ts.
\* Two processes each finish one save of a different key.
\* IdCacheLock is the advisory lock held from before loadIdCacheSync through
\* saveIdCache's final hardenPermissions. FALSE deletes that lock.
\* Acquire is open of <profile>.ids.json.lock. Release is the unlink after
\* the final chmod. loadIdCacheSync reads <profile>.ids.json. saveIdCache
\* writes a private temp file and rename replaces the cache path. Each action
\* below is one filesystem call on that path. mergeHints is not in this spec.
\* For two different keys the code keeps every key in the snapshot plus the
\* key this response saw.
\* MergeExisting is that load and that walk over existing.
\* FALSE deletes loadIdCacheSync and merges with []. SkipLoad is that deleted
\* load. It is disabled while MergeExisting is TRUE.
\*
\* ship is kind ship, id ship-1, sourceCommand list_ships.
\* poi is kind poi, id sol_earth, sourceCommand get_system.
\* The 500-hint cap is not in this spec.

EXTENDS TLC

CONSTANTS MergeExisting, IdCacheLock

ASSUME MergeExisting \in BOOLEAN
ASSUME IdCacheLock \in BOOLEAN

Writers == {"ship", "poi"}

Phases == {
  "start",
  "locked",
  "chmod_cache",
  "reading",
  "dir",
  "chmod_dir",
  "opening",
  "writing",
  "syncing",
  "closing",
  "renaming",
  "chmod_final",
  "releasing",
  "done"
}

VARIABLES phase, snapshot, file, fileExists, lock

vars == <<phase, snapshot, file, fileExists, lock>>

Init ==
  /\ phase = [p \in Writers |-> "start"]
  /\ snapshot = [p \in Writers |-> {}]
  /\ file = {}
  /\ fileExists = FALSE
  /\ lock = ""

Acquire(p) ==
  /\ IdCacheLock
  /\ phase[p] = "start"
  /\ lock = ""
  /\ lock' = p
  /\ phase' = [phase EXCEPT ![p] = "locked"]
  /\ UNCHANGED <<snapshot, file, fileExists>>

\* existsSync on the cache path. A missing file becomes [] and is not read.
\* ~MergeExisting does not look. SkipLoad is that branch.
Exists(p) ==
  /\ MergeExisting
  /\ phase[p] = IF IdCacheLock THEN "locked" ELSE "start"
  /\ IF fileExists
       THEN /\ phase' = [phase EXCEPT ![p] = "chmod_cache"]
            /\ UNCHANGED snapshot
       ELSE /\ snapshot' = [snapshot EXCEPT ![p] = {}]
            /\ phase' = [phase EXCEPT ![p] = "dir"]
  /\ UNCHANGED <<file, fileExists, lock>>

SkipLoad(p) ==
  /\ ~MergeExisting
  /\ phase[p] = IF IdCacheLock THEN "locked" ELSE "start"
  /\ snapshot' = [snapshot EXCEPT ![p] = {}]
  /\ phase' = [phase EXCEPT ![p] = "dir"]
  /\ UNCHANGED <<file, fileExists, lock>>

\* hardenPermissions before the read. chmod does not change keys.
ChmodCache(p) ==
  /\ phase[p] = "chmod_cache"
  /\ phase' = [phase EXCEPT ![p] = "reading"]
  /\ UNCHANGED <<snapshot, file, fileExists, lock>>

\* readFileSync. This snapshot is what mergeHints receives as existing.
Read(p) ==
  /\ phase[p] = "reading"
  /\ snapshot' = [snapshot EXCEPT ![p] = file]
  /\ phase' = [phase EXCEPT ![p] = "dir"]
  /\ UNCHANGED <<file, fileExists, lock>>

\* existsSync on the parent directory. It is already there, so mkdir does not run.
DirExists(p) ==
  /\ phase[p] = "dir"
  /\ phase' = [phase EXCEPT ![p] = "chmod_dir"]
  /\ UNCHANGED <<snapshot, file, fileExists, lock>>

\* hardenPermissions on the directory.
ChmodDir(p) ==
  /\ phase[p] = "chmod_dir"
  /\ phase' = [phase EXCEPT ![p] = "opening"]
  /\ UNCHANGED <<snapshot, file, fileExists, lock>>

\* open(tmp, wx). The temp name has pid, Date.now(), and a random suffix.
\* The other save does not read that path.
OpenTemp(p) ==
  /\ phase[p] = "opening"
  /\ phase' = [phase EXCEPT ![p] = "writing"]
  /\ UNCHANGED <<snapshot, file, fileExists, lock>>

WriteTemp(p) ==
  /\ phase[p] = "writing"
  /\ phase' = [phase EXCEPT ![p] = "syncing"]
  /\ UNCHANGED <<snapshot, file, fileExists, lock>>

SyncTemp(p) ==
  /\ phase[p] = "syncing"
  /\ phase' = [phase EXCEPT ![p] = "closing"]
  /\ UNCHANGED <<snapshot, file, fileExists, lock>>

CloseTemp(p) ==
  /\ phase[p] = "closing"
  /\ phase' = [phase EXCEPT ![p] = "renaming"]
  /\ UNCHANGED <<snapshot, file, fileExists, lock>>

\* rename(tmp, cachePath). This is the call that replaces the cache keys.
Rename(p) ==
  /\ phase[p] = "renaming"
  /\ file' = IF MergeExisting THEN snapshot[p] \cup {p} ELSE {p}
  /\ fileExists' = TRUE
  /\ phase' = [phase EXCEPT ![p] = "chmod_final"]
  /\ UNCHANGED <<snapshot, lock>>

\* hardenPermissions on the cache path after the rename.
ChmodFinal(p) ==
  /\ phase[p] = "chmod_final"
  /\ IF IdCacheLock
       THEN phase' = [phase EXCEPT ![p] = "releasing"]
       ELSE phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<snapshot, file, fileExists, lock>>

Release(p) ==
  /\ IdCacheLock
  /\ phase[p] = "releasing"
  /\ lock' = ""
  /\ phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<snapshot, file, fileExists>>

Done ==
  /\ \A p \in Writers : phase[p] = "done"
  /\ UNCHANGED vars

Next ==
  \/ \E p \in Writers :
       Acquire(p) \/ Exists(p) \/ SkipLoad(p) \/ ChmodCache(p) \/ Read(p)
         \/ DirExists(p) \/ ChmodDir(p) \/ OpenTemp(p) \/ WriteTemp(p)
         \/ SyncTemp(p) \/ CloseTemp(p) \/ Rename(p) \/ ChmodFinal(p)
         \/ Release(p)
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in [Writers -> Phases]
  /\ snapshot \in [Writers -> SUBSET Writers]
  /\ file \subseteq Writers
  /\ fileExists \in BOOLEAN
  /\ ~fileExists => file = {}
  /\ lock \in Writers \cup {""}

\* Two completed cacheIdsFromResponse saves of different keys both still
\* contain their keys.
BothKeys ==
  (\A p \in Writers : phase[p] = "done") => file = Writers

=============================================================================
