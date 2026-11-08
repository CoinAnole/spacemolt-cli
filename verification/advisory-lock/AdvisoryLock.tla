----------------------------- MODULE AdvisoryLock -----------------------------
\* acquireAdvisoryLock / publishLock / removeStaleAdvisoryLock /
\* staleAdvisoryLockDecision in src/advisory-lock.ts.
\* One lock stands in for the session file and the id cache. Each real file has
\* its own lock of this shape, and the critical section applies both merges.
\* There is no config.json.lock. ${lock}.break is the only right to unlink the
\* lock, unless ReapClaim is FALSE. The nested ${lock}.break.break crash is
\* outside this model, as a crash of rename is. The 30 second timer, the 2
\* second timeout, and a third saver are outside this model.
\*
\* open(wx) and the token write of the main lock are separate actions. After
\* open, the body is empty and the process is not in the critical section.
\* The confirming read and unlink are separate, and so are the break file's
\* read and unlink. unlinkSync does not read the body again.

EXTENDS FiniteSets, Integers, TLC

CONSTANTS Recheck, StartTime, TokenMatch, ReapClaim

Proc == {"a", "b"}
Bodies == {"stale", "empty", "a", "b", "reused"}
Phases == {
  "idle", "reading", "judging", "claiming", "rereading", "restatting",
  "unlinking", "unclaiming", "clearing", "publishing",
  "holding", "loaded", "releasing", "dropping", "done", "crashed"
}
LeasePhases == {"rereading", "restatting", "unlinking", "unclaiming", "clearing"}

Sessions == [password: BOOLEAN, expiry: 0..2]
Shared == [present: BOOLEAN, name: {"", "alpha"}, ctx: SUBSET {"a", "b"}, seen: 0..2]
Caches == [ship: BOOLEAN, poi: BOOLEAN, shared: Shared]

VARIABLES
  phase, lock, age, opener, observed, lease,
  session, snap, cache, csnap,
  pidReused, intruder, intruderPhase

vars == <<
  phase, lock, age, opener, observed, lease,
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

\* The first stat. A dead numeric body is a candidate at any age. A live owner
\* is a candidate when the body is old or that process started after the lock.
\* StartTime FALSE keeps a young live pid, including a reused one. An empty
\* body is a candidate only when it is old. This does not look again later.
RemovalCandidate(p) ==
  LET body == observed[p]
      kind == OwnerKind(body)
  IN \/ kind = "dead"
     \/ /\ kind = "alive"
        /\ \/ age = "old"
           \/ StartedAfter(body)
     \/ /\ kind = "undef"
        /\ age = "old"

Critical(p) == phase[p] \in {"holding", "loaded", "releasing", "dropping"}

Init ==
  /\ phase = [p \in Proc |-> "idle"]
  /\ lock = "stale"
  /\ age = "young"
  /\ opener = "none"
  /\ observed = [p \in Proc |-> "none"]
  /\ lease = "none"
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
  /\ IF lock = "none"
       THEN /\ lock' = "empty"
            /\ age' = "young"
            /\ opener' = p
            /\ phase' = [phase EXCEPT ![p] = "publishing"]
       ELSE /\ phase' = [phase EXCEPT ![p] = "reading"]
            /\ UNCHANGED <<lock, age, opener>>
  /\ UNCHANGED <<lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

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
  /\ UNCHANGED <<observed, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* First readFileSync. ENOENT means the reaper is done; try to publish again.
ReadLock(p) ==
  /\ phase[p] = "reading"
  /\ IF lock = "none"
       THEN /\ phase' = [phase EXCEPT ![p] = "idle"]
            /\ UNCHANGED observed
       ELSE /\ observed' = [observed EXCEPT ![p] = lock]
            /\ phase' = [phase EXCEPT ![p] = "judging"]
  /\ UNCHANGED <<lock, age, opener, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* kill(pid, 0), the first stat, and the start-time read when the owner is
\* alive. ENOENT on the stat bails out the same way as a missing first read.
\* A young empty body, and a young live owner who did not start after the lock,
\* go back to idle and do not take the lease. This action does not unlink.
Judge(p) ==
  /\ phase[p] = "judging"
  /\ IF lock = "none"
       THEN /\ phase' = [phase EXCEPT ![p] = "idle"]
            /\ observed' = [observed EXCEPT ![p] = "none"]
       ELSE IF RemovalCandidate(p)
            THEN /\ phase' = [phase EXCEPT ![p] = "claiming"]
                 /\ UNCHANGED observed
            ELSE /\ phase' = [phase EXCEPT ![p] = "idle"]
                 /\ observed' = [observed EXCEPT ![p] = "none"]
  /\ UNCHANGED <<lock, age, opener, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* open(wx) of ${lock}.break. The process stays in claiming, and keeps the body
\* it already observed, until the lease is free. ReapClaim FALSE skips the
\* lease, which is deleting the exclusive create. This action does not unlink.
Claim(p) ==
  /\ phase[p] = "claiming"
  /\ IF ~ReapClaim
       THEN /\ phase' = [phase EXCEPT ![p] = "rereading"]
            /\ UNCHANGED lease
       ELSE /\ lease = "none"
            /\ lease' = p
            /\ phase' = [phase EXCEPT ![p] = "rereading"]
  /\ UNCHANGED <<lock, age, opener, observed, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Confirming readFileSync. Enabled only for the lease holder, unless ReapClaim
\* is FALSE. ENOENT, or a body other than observed when Recheck is on, does not
\* unlink. An empty body that still matches goes to the second stat. Any other
\* matching removal candidate goes to unlinking. A refusal drops the lease.
Reread(p) ==
  /\ phase[p] = "rereading"
  /\ \/ lease = p
     \/ ~ReapClaim
  /\ IF lock = "none"
       THEN phase' = [phase EXCEPT ![p] = "unclaiming"]
       ELSE IF Recheck /\ lock # observed[p]
            THEN phase' = [phase EXCEPT ![p] = "unclaiming"]
            ELSE IF observed[p] = "empty" /\ lock = "empty"
                 THEN phase' = [phase EXCEPT ![p] = "restatting"]
                 ELSE phase' = [phase EXCEPT ![p] = "unlinking"]
  /\ UNCHANGED <<lock, age, opener, observed, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Second stat of an empty file. It is not part of Judge. A young empty file is
\* left alone. An old empty file goes to unlinking. This action does not unlink.
\* A different save can unlink an old empty file and create a new one while this
\* save still holds the earlier empty read. Both reads are empty. This stat is
\* what shows the new file is young.
SecondStat(p) ==
  /\ phase[p] = "restatting"
  /\ \/ lease = p
     \/ ~ReapClaim
  /\ IF lock = "none"
       THEN phase' = [phase EXCEPT ![p] = "unclaiming"]
       ELSE IF Recheck /\ lock # observed[p]
            THEN phase' = [phase EXCEPT ![p] = "unclaiming"]
            ELSE IF lock = "empty" /\ age = "young"
                 THEN phase' = [phase EXCEPT ![p] = "unclaiming"]
                 ELSE phase' = [phase EXCEPT ![p] = "unlinking"]
  /\ UNCHANGED <<lock, age, opener, observed, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* unlinkSync of the lock. It does not read. It removes whatever directory
\* entry is there. Enabled only while this saver holds the lease, unless
\* ReapClaim is FALSE. The lease is dropped afterwards.
Unlink(p) ==
  /\ phase[p] = "unlinking"
  /\ \/ lease = p
     \/ ~ReapClaim
  /\ lock' = "none"
  /\ opener' = "none"
  /\ age' = "young"
  /\ phase' = [phase EXCEPT ![p] = "unclaiming"]
  /\ UNCHANGED <<observed, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Read of the break file in dropOwn. Every exit from the reap comes here,
\* including a refused reap. A saver does not return to idle while holding it.
DropClaimRead(p) ==
  /\ phase[p] = "unclaiming"
  /\ phase' = [phase EXCEPT ![p] = "clearing"]
  /\ UNCHANGED <<lock, age, opener, observed, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* unlink of the break file, only when it is still this saver's.
DropClaimUnlink(p) ==
  /\ phase[p] = "clearing"
  /\ lease' = IF lease = p THEN "none" ELSE lease
  /\ observed' = [observed EXCEPT ![p] = "none"]
  /\ phase' = [phase EXCEPT ![p] = "idle"]
  /\ UNCHANGED <<lock, age, opener, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Both payload reads. One critical section covers both files.
Load(p) ==
  /\ phase[p] = "holding"
  /\ snap' = [snap EXCEPT ![p] = session]
  /\ csnap' = [csnap EXCEPT ![p] = cache]
  /\ phase' = [phase EXCEPT ![p] = "loaded"]
  /\ UNCHANGED <<lock, age, opener, observed, lease, session, cache, pidReused, intruder, intruderPhase>>

\* Both merges and both renames. A crash between the two renames is out of model.
Save(p) ==
  /\ phase[p] = "loaded"
  /\ session' = MergeSession(p, snap[p])
  /\ cache' = MergeCache(p, csnap[p])
  /\ snap' = [snap EXCEPT ![p] = EmptySession]
  /\ csnap' = [csnap EXCEPT ![p] = EmptyCache]
  /\ phase' = [phase EXCEPT ![p] = "releasing"]
  /\ UNCHANGED <<lock, age, opener, observed, lease, pidReused, intruder, intruderPhase>>

\* Release read. TokenMatch is current === token. A missing file is success.
ReleaseRead(p) ==
  /\ phase[p] = "releasing"
  /\ IF lock = "none"
       THEN phase' = [phase EXCEPT ![p] = "done"]
       ELSE IF ~TokenMatch \/ lock = p
            THEN phase' = [phase EXCEPT ![p] = "dropping"]
            ELSE phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<lock, age, opener, observed, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Release unlink. The token compare already happened. This action does not read.
ReleaseUnlink(p) ==
  /\ phase[p] = "dropping"
  /\ lock' = "none"
  /\ opener' = "none"
  /\ age' = "young"
  /\ phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<observed, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

\* Exit inside the critical section, or between open and the token write.
\* The release does not run. publishing is not the critical section.
\* A crash while holding the break file is outside this model.
Crash(p) ==
  /\ phase[p] \in {"publishing", "holding", "loaded", "releasing", "dropping"}
  /\ phase' = [phase EXCEPT ![p] = "crashed"]
  /\ snap' = [snap EXCEPT ![p] = EmptySession]
  /\ csnap' = [csnap EXCEPT ![p] = EmptyCache]
  /\ UNCHANGED <<lock, age, opener, observed, lease, session, cache, pidReused, intruder, intruderPhase>>

\* The empty file a crashed publisher left behind. Not the open that created it.
AgeEmpty ==
  /\ lock = "empty"
  /\ age = "young"
  /\ \A p \in Proc : phase[p] # "publishing"
  /\ intruderPhase # "publishing"
  /\ age' = "old"
  /\ UNCHANGED <<phase, lock, opener, observed, lease, session, snap, cache, csnap, pidReused, intruder, intruderPhase>>

KernelReissue ==
  /\ pidReused = FALSE
  /\ pidReused' = TRUE
  /\ UNCHANGED <<phase, lock, age, opener, observed, lease, session, snap, cache, csnap, intruder, intruderPhase>>

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
  /\ UNCHANGED <<phase, observed, lease, session, snap, cache, csnap, pidReused, intruder>>

IntruderWrite ==
  /\ intruderPhase = "publishing"
  /\ IF lock = "empty" /\ opener = "intruder"
       THEN /\ lock' = "reused"
            /\ opener' = "none"
            /\ age' = "young"
       ELSE UNCHANGED <<lock, opener, age>>
  /\ intruderPhase' = "holding"
  /\ intruder' = TRUE
  /\ UNCHANGED <<phase, observed, lease, session, snap, cache, csnap, pidReused>>

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
  /\ UNCHANGED <<phase, lock, age, opener, observed, lease, session, snap, cache, csnap, pidReused>>

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
  /\ UNCHANGED <<phase, observed, lease, session, snap, cache, csnap, pidReused>>

Done ==
  /\ \A p \in Proc : phase[p] \in {"done", "crashed"}
  /\ intruderPhase = "out"
  /\ UNCHANGED vars

Next ==
  \/ \E p \in Proc :
       OpenWx(p) \/ WriteToken(p) \/ ReadLock(p) \/ Judge(p) \/ Claim(p)
         \/ Reread(p) \/ SecondStat(p) \/ Unlink(p)
         \/ DropClaimRead(p) \/ DropClaimUnlink(p)
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
  /\ lease \in Proc \cup {"none"}
  /\ \A p \in Proc : lease = p => phase[p] \in LeasePhases
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
