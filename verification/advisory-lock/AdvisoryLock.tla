----------------------------- MODULE AdvisoryLock -----------------------------
\* acquireAdvisoryLock / publishLock / removeStaleAdvisoryLock /
\* staleAdvisoryLockDecision in src/advisory-lock.ts.
\* One lock stands in for the session file and the id cache. Each real file has
\* its own lock of this shape, and the critical section applies both merges.
\* There is no config.json.lock.break.
\*
\* open(wx) and the token write are separate actions. After open, the body is
\* empty and the process is not in the critical section. The second read and
\* unlink are separate, and so are release's read and release's unlink.
\* unlinkSync does not read the body again.

EXTENDS FiniteSets, Integers, TLC

CONSTANTS Recheck, StartTime, TokenMatch

Proc == {"a", "b"}
Bodies == {"stale", "empty", "a", "b", "reused"}
Phases == {
  "idle", "reading", "judging", "rereading", "unlinking", "publishing",
  "holding", "loaded", "releasing", "dropping", "done", "crashed"
}

Sessions == [password: BOOLEAN, expiry: 0..2]
Shared == [present: BOOLEAN, name: {"", "alpha"}, ctx: SUBSET {"a", "b"}, seen: 0..2]
Caches == [ship: BOOLEAN, poi: BOOLEAN, shared: Shared]

VARIABLES
  phase, lock, age, opener, observed, youngKeep,
  session, snap, cache, csnap,
  pidReused, intruder, intruderPhase

vars == <<
  phase, lock, age, opener, observed, youngKeep,
  session, snap, cache, csnap,
  pidReused, intruder, intruderPhase
>>

EmptyShared == [present |-> FALSE, name |-> "", ctx |-> {}, seen |-> 0]
EmptyCache == [ship |-> FALSE, poi |-> FALSE, shared |-> EmptyShared]
EmptySession == [password |-> FALSE, expiry |-> 0]

\* a is the login save: password present, expiry 1, ship, shared seenAt 1.
\* b is the refresh: password omitted, expiry 2, poi, shared seenAt 2.
Hint(p) ==
  IF p = "a"
  THEN [present |-> TRUE, name |-> "alpha", ctx |-> {"a"}, seen |-> 1]
  ELSE [present |-> TRUE, name |-> "", ctx |-> {"b"}, seen |-> 2]

\* mergeHints orders one key by seenAt, then overlays. An empty newer name
\* does not replace the older name. Context is the older map under the newer.
Overlay(older, newer) ==
  [present |-> TRUE,
   name |-> IF newer.name # "" THEN newer.name ELSE older.name,
   ctx |-> older.ctx \cup newer.ctx,
   seen |-> newer.seen]

MergeShared(existing, incoming) ==
  IF ~existing.present THEN incoming
  ELSE IF existing.seen <= incoming.seen
       THEN Overlay(existing, incoming)
       ELSE Overlay(incoming, existing)

MergeCache(p, shot) ==
  [ship |-> shot.ship \/ (p = "a"),
   poi |-> shot.poi \/ (p = "b"),
   shared |-> MergeShared(shot.shared, Hint(p))]

\* mergePublishedSession for one session id. Empty on-disk is password FALSE
\* and expiry 0, and the same max / omitted-password rules apply.
MergeSession(p, shot) ==
  IF p = "a"
  THEN [password |-> TRUE,
        expiry |-> IF shot.expiry > 1 THEN shot.expiry ELSE 1]
  ELSE [password |-> shot.password,
        expiry |-> IF shot.expiry > 2 THEN shot.expiry ELSE 2]

\* "stale" is the dead owner's old bytes. "reused" is the new process's own
\* token, written after that process started, so its mtime is later.
OwnerKind(body) ==
  CASE body = "empty" -> "undef"
    [] body = "stale" -> IF pidReused THEN "alive" ELSE "dead"
    [] body = "reused" -> IF pidReused THEN "alive" ELSE "dead"
    [] body = "a" -> IF phase["a"] = "crashed" THEN "dead" ELSE "alive"
    [] body = "b" -> IF phase["b"] = "crashed" THEN "dead" ELSE "alive"
    [] OTHER -> "undef"

StartedAfter(body) ==
  /\ StartTime
  /\ pidReused
  /\ body = "stale"

\* Sampled at the kill/stat, before the second read. Age is applied later.
KeepIfYoung(body) ==
  LET kind == OwnerKind(body)
  IN \/ kind = "undef"
     \/ /\ kind = "alive"
        /\ ~StartedAfter(body)

WillUnlink(p) ==
  /\ lock # "none"
  /\ ~(Recheck /\ lock # observed[p])
  /\ \/ ~youngKeep[p]
     \/ age = "old"

Critical(p) == phase[p] \in {"holding", "loaded", "releasing", "dropping"}

Init ==
  /\ phase = [p \in Proc |-> "idle"]
  /\ lock = "stale"
  /\ age = "young"
  /\ opener = "none"
  /\ observed = [p \in Proc |-> "none"]
  /\ youngKeep = [p \in Proc |-> FALSE]
  /\ session = EmptySession
  /\ snap = [p \in Proc |-> EmptySession]
  /\ cache = EmptyCache
  /\ csnap = [p \in Proc |-> EmptyCache]
  /\ pidReused = FALSE
  /\ intruder = FALSE
  /\ intruderPhase = "out"

\* open(wx). The winner's file is empty and young. It is not in the critical
\* section. EEXIST goes to the reaper.
OpenWx(p) ==
  /\ phase[p] = "idle"
  /\ observed' = [observed EXCEPT ![p] = "none"]
  /\ youngKeep' = [youngKeep EXCEPT ![p] = FALSE]
  /\ IF lock = "none"
       THEN /\ lock' = "empty"
            /\ age' = "young"
            /\ opener' = p
            /\ phase' = [phase EXCEPT ![p] = "publishing"]
       ELSE /\ phase' = [phase EXCEPT ![p] = "reading"]
            /\ UNCHANGED <<lock, age, opener>>
  /\ UNCHANGED <<session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* writeFile of the token, then sync and close. A write to an unlinked fd does
\* not put the name back. The caller enters the critical section either way.
WriteToken(p) ==
  /\ phase[p] = "publishing"
  /\ phase' = [phase EXCEPT ![p] = "holding"]
  /\ IF lock = "empty" /\ opener = p
       THEN /\ lock' = p
            /\ opener' = "none"
            /\ age' = "young"
       ELSE UNCHANGED <<lock, opener, age>>
  /\ UNCHANGED <<observed, youngKeep, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* First readFileSync. ENOENT means the reaper is done; try to publish again.
ReadLock(p) ==
  /\ phase[p] = "reading"
  /\ IF lock = "none"
       THEN /\ phase' = [phase EXCEPT ![p] = "idle"]
            /\ UNCHANGED observed
       ELSE /\ observed' = [observed EXCEPT ![p] = lock]
            /\ phase' = [phase EXCEPT ![p] = "judging"]
  /\ UNCHANGED <<lock, age, opener, youngKeep, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* kill(pid, 0), stat, and the start-time read when the owner is alive.
\* ENOENT on the stat bails out the same way as a missing first read.
\* The result is the input to the later decision. This action does not unlink.
Judge(p) ==
  /\ phase[p] = "judging"
  /\ IF lock = "none"
       THEN /\ phase' = [phase EXCEPT ![p] = "idle"]
            /\ observed' = [observed EXCEPT ![p] = "none"]
            /\ UNCHANGED youngKeep
       ELSE /\ youngKeep' = [youngKeep EXCEPT ![p] = KeepIfYoung(observed[p])]
            /\ phase' = [phase EXCEPT ![p] = "rereading"]
            /\ UNCHANGED observed
  /\ UNCHANGED <<lock, age, opener, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Second readFileSync, then staleAdvisoryLockDecision. Recheck is
\* still /= observed. This action does not unlink.
Reread(p) ==
  /\ phase[p] = "rereading"
  /\ IF WillUnlink(p)
       THEN /\ phase' = [phase EXCEPT ![p] = "unlinking"]
            /\ youngKeep' = [youngKeep EXCEPT ![p] = FALSE]
            /\ UNCHANGED observed
       ELSE /\ phase' = [phase EXCEPT ![p] = "idle"]
            /\ observed' = [observed EXCEPT ![p] = "none"]
            /\ youngKeep' = [youngKeep EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<lock, age, opener, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* unlinkSync of the path. It does not read. ENOENT is success.
Unlink(p) ==
  /\ phase[p] = "unlinking"
  /\ lock' = "none"
  /\ opener' = "none"
  /\ age' = "young"
  /\ observed' = [observed EXCEPT ![p] = "none"]
  /\ phase' = [phase EXCEPT ![p] = "idle"]
  /\ UNCHANGED <<youngKeep, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Both payload reads. One critical section covers both files.
Load(p) ==
  /\ phase[p] = "holding"
  /\ snap' = [snap EXCEPT ![p] = session]
  /\ csnap' = [csnap EXCEPT ![p] = cache]
  /\ phase' = [phase EXCEPT ![p] = "loaded"]
  /\ UNCHANGED <<lock, age, opener, observed, youngKeep, session, cache, pidReused, intruder, intruderPhase>>

\* Both merges and both renames. A crash between the two renames is out of model.
Save(p) ==
  /\ phase[p] = "loaded"
  /\ session' = MergeSession(p, snap[p])
  /\ cache' = MergeCache(p, csnap[p])
  /\ snap' = [snap EXCEPT ![p] = EmptySession]
  /\ csnap' = [csnap EXCEPT ![p] = EmptyCache]
  /\ phase' = [phase EXCEPT ![p] = "releasing"]
  /\ UNCHANGED <<lock, age, opener, observed, youngKeep, pidReused, intruder, intruderPhase>>

\* Release read. TokenMatch is current === token. A missing file is success.
ReleaseRead(p) ==
  /\ phase[p] = "releasing"
  /\ IF lock = "none"
       THEN phase' = [phase EXCEPT ![p] = "done"]
       ELSE IF ~TokenMatch \/ lock = p
            THEN phase' = [phase EXCEPT ![p] = "dropping"]
            ELSE phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<lock, age, opener, observed, youngKeep, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Release unlink. The token compare already happened. This action does not read.
ReleaseUnlink(p) ==
  /\ phase[p] = "dropping"
  /\ lock' = "none"
  /\ opener' = "none"
  /\ age' = "young"
  /\ phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<observed, youngKeep, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Exit inside the critical section, or between open and the token write.
\* The release does not run. publishing is not the critical section.
Crash(p) ==
  /\ phase[p] \in {"publishing", "holding", "loaded", "releasing", "dropping"}
  /\ phase' = [phase EXCEPT ![p] = "crashed"]
  /\ snap' = [snap EXCEPT ![p] = EmptySession]
  /\ csnap' = [csnap EXCEPT ![p] = EmptyCache]
  /\ UNCHANGED <<lock, age, opener, observed, youngKeep, session, cache, pidReused, intruder, intruderPhase>>

\* The empty file a crashed publisher left behind. Not the open that created it.
AgeEmpty ==
  /\ lock = "empty"
  /\ age = "young"
  /\ \A p \in Proc : phase[p] # "publishing"
  /\ intruderPhase # "publishing"
  /\ age' = "old"
  /\ UNCHANGED <<phase, lock, opener, observed, youngKeep, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

KernelReissue ==
  /\ pidReused = FALSE
  /\ pidReused' = TRUE
  /\ UNCHANGED <<phase, lock, age, opener, observed, youngKeep, session, snap, cache, csnap, intruder, intruderPhase>>

\* The reused pid publishes only when the name is free. Open and the token
\* write stay separate. publishing is not the critical section.
IntruderOpen ==
  /\ pidReused
  /\ intruderPhase = "out"
  /\ lock = "none"
  /\ lock' = "empty"
  /\ age' = "young"
  /\ opener' = "intruder"
  /\ intruderPhase' = "publishing"
  /\ UNCHANGED <<phase, observed, youngKeep, session, snap, cache, csnap, pidReused, intruder>>

IntruderWrite ==
  /\ intruderPhase = "publishing"
  /\ IF lock = "empty" /\ opener = "intruder"
       THEN /\ lock' = "reused"
            /\ opener' = "none"
            /\ age' = "young"
       ELSE UNCHANGED <<lock, opener, age>>
  /\ intruderPhase' = "holding"
  /\ intruder' = TRUE
  /\ UNCHANGED <<phase, observed, youngKeep, session, snap, cache, csnap, pidReused>>

\* Release read. TokenMatch FALSE unlinks whatever is there. Missing is success.
IntruderRead ==
  /\ intruderPhase = "holding"
  /\ IF lock = "none"
       THEN /\ intruderPhase' = "out"
            /\ intruder' = FALSE
       ELSE IF ~TokenMatch \/ lock = "reused"
            THEN /\ intruderPhase' = "dropping"
                 /\ UNCHANGED intruder
            ELSE /\ intruderPhase' = "out"
                 /\ intruder' = FALSE
  /\ UNCHANGED <<phase, lock, age, opener, observed, youngKeep, session, snap, cache, csnap, pidReused>>

\* Does not take a body that is not its token when TokenMatch is on, even if
\* the name changed after the read.
IntruderUnlink ==
  /\ intruderPhase = "dropping"
  /\ IF TokenMatch /\ lock # "reused"
       THEN UNCHANGED <<lock, age, opener>>
       ELSE /\ lock' = "none"
            /\ age' = "young"
            /\ opener' = "none"
  /\ intruder' = FALSE
  /\ intruderPhase' = "out"
  /\ UNCHANGED <<phase, observed, youngKeep, session, snap, cache, csnap, pidReused>>

Done ==
  /\ \A p \in Proc : phase[p] \in {"done", "crashed"}
  /\ intruderPhase = "out"
  /\ UNCHANGED vars

Next ==
  \/ \E p \in Proc :
       OpenWx(p) \/ WriteToken(p) \/ ReadLock(p) \/ Judge(p) \/ Reread(p) \/ Unlink(p)
         \/ Load(p) \/ Save(p) \/ ReleaseRead(p) \/ ReleaseUnlink(p) \/ Crash(p)
  \/ AgeEmpty
  \/ KernelReissue
  \/ IntruderOpen
  \/ IntruderWrite
  \/ IntruderRead
  \/ IntruderUnlink
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in [Proc -> Phases]
  /\ lock \in Bodies \cup {"none"}
  /\ age \in {"young", "old"}
  /\ opener \in Proc \cup {"intruder", "none"}
  /\ observed \in [Proc -> Bodies \cup {"none"}]
  /\ youngKeep \in [Proc -> BOOLEAN]
  /\ session \in Sessions
  /\ snap \in [Proc -> Sessions]
  /\ cache \in Caches
  /\ csnap \in [Proc -> Caches]
  /\ pidReused \in BOOLEAN
  /\ intruder \in BOOLEAN
  /\ intruderPhase \in {"out", "publishing", "holding", "dropping"}
  /\ intruder = (intruderPhase \in {"holding", "dropping"})

\* While Recheck is on, a saver about to unlink still sees the body it accepted.
UnlinkMatches ==
  Recheck => \A p \in Proc : phase[p] = "unlinking" => lock = observed[p]

\* At most one critical section. The intruder counts only while it holds.
Exclusive ==
  Cardinality({p \in Proc : Critical(p)}) + (IF intruder THEN 1 ELSE 0) <= 1

SessionLanded ==
  (phase["a"] = "done" /\ phase["b"] = "done") =>
    (session.password /\ session.expiry = 2)

CacheLanded ==
  (phase["a"] = "done" /\ phase["b"] = "done") =>
    /\ cache.ship
    /\ cache.poi
    /\ cache.shared.present
    /\ cache.shared.name = "alpha"
    /\ cache.shared.ctx = {"a", "b"}
=============================================================================
