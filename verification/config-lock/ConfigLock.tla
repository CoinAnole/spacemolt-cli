------------------------------ MODULE ConfigLock ------------------------------
\* withConfigLock in src/config-lock.ts, called by updateCliConfig and saveCliConfig.
\* publishFresh opens with wx, then writes `${pid} ${nonce}`. Until that write the
\* file exists and is empty. A non-numeric body is unparsable. abandoned() keeps a
\* young one and removes an old one. A running pid is kept at any age. A dead
\* numeric pid is removed at once.
\*
\* After the break-file lease is held, removeIfAbandoned reads the body again
\* (`still !== observed`) and, for an unparsable body, stats again. SecondAge is
\* that second stat. It is not part of Judge. open(wx) cannot replace an empty
\* file that is still in the directory. A different save can unlink an old empty
\* file and create a new one while this save still holds the earlier empty read.
\* Both reads return an empty body. The second stat is what shows the new file
\* is young.
\*
\* config.json.lock.break is the only right to unlink the lock. The nested
\* config.json.lock.break.break file is the same rule one level down. A crash
\* while holding the deepest break file is outside this model, as a crash of
\* rename is. The 2 second timeout, the real-time 30 second timer, and a third
\* saver are outside this model. Age is young or old, not a clock.

EXTENDS FiniteSets, Integers, TLC

CONSTANTS Recheck, FreshToken, ReapClaim, SecondAge

Proc == {"a", "b"}
Bodies == {"stale", "a", "b", "reused", "empty"}
Phases == {
  "idle", "publishing", "reading", "judging", "claiming", "rereading", "restatting",
  "unlinking", "unclaiming", "clearing",
  "holding", "loaded", "releasing", "dropping", "done", "crashed"
}

VARIABLES phase, lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created
vars == <<phase, lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

Field(p) == IF p = "a" THEN "profile" ELSE "agent"

\* Liveness is the pid inside the body, not the body itself.
PidOf(body) == IF body \in {"stale", "reused"} THEN "dead" ELSE body
IntruderBody == IF FreshToken THEN "reused" ELSE "stale"

Alive(pid) ==
  \/ /\ pid \in Proc
     /\ phase[pid] # "crashed"
  \/ /\ pid = "dead"
     /\ pidReused

Critical(p) == phase[p] \in {"holding", "loaded", "releasing", "dropping"}

Init ==
  /\ phase = [p \in Proc |-> "idle"]
  /\ lock = "stale"
  /\ observed = [p \in Proc |-> "none"]
  /\ lease = "none"
  /\ config = {}
  /\ snapshot = [p \in Proc |-> {}]
  /\ pidReused = FALSE
  /\ intruder = FALSE
  /\ intruderPhase = "out"
  /\ age = "old"
  /\ created = "none"

\* wx on config.json.lock. The file is empty until WriteToken. EEXIST starts a reap.
Open(p) ==
  /\ phase[p] = "idle"
  /\ IF lock = "none"
       THEN /\ lock' = "empty"
            /\ age' = "young"
            /\ created' = p
            /\ phase' = [phase EXCEPT ![p] = "publishing"]
       ELSE /\ phase' = [phase EXCEPT ![p] = "reading"]
            /\ UNCHANGED <<lock, age, created>>
  /\ UNCHANGED <<observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

\* writeFileSync of `${pid} ${nonce}` on the fd from Open. A removed or replaced
\* name stays gone: the bytes go to the fd this process already holds.
WriteToken(p) ==
  /\ phase[p] = "publishing"
  /\ IF lock = "empty" /\ created = p
       THEN /\ lock' = p
            /\ created' = "none"
            /\ age' = "old"
       ELSE UNCHANGED <<lock, created, age>>
  /\ phase' = [phase EXCEPT ![p] = "holding"]
  /\ UNCHANGED <<observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

\* writeFileSync throws. The empty file stays. This save does not enter the
\* critical section, and the saver can try again.
FailWrite(p) ==
  /\ phase[p] = "publishing"
  /\ phase' = [phase EXCEPT ![p] = "idle"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

\* The empty file becomes old only once nobody is still between Open and WriteToken.
Age ==
  /\ lock = "empty"
  /\ age = "young"
  /\ \A p \in Proc : phase[p] # "publishing"
  /\ age' = "old"
  /\ UNCHANGED <<phase, lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, created>>

\* First read of the lock file. ENOENT sends the saver back to try again.
ReadLock(p) ==
  /\ phase[p] = "reading"
  /\ IF lock = "none"
       THEN /\ phase' = [phase EXCEPT ![p] = "idle"]
            /\ UNCHANGED observed
       ELSE /\ observed' = [observed EXCEPT ![p] = lock]
            /\ phase' = [phase EXCEPT ![p] = "judging"]
  /\ UNCHANGED <<lock, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

\* kill(pid, 0), then stat. A young empty body is not abandoned. An old empty
\* body is. This step does not stat a second time.
Judge(p) ==
  /\ phase[p] = "judging"
  /\ IF lock = "none"
       THEN phase' = [phase EXCEPT ![p] = "idle"]
       ELSE IF observed[p] = "empty"
            THEN IF lock = "empty" /\ age = "old"
                 THEN phase' = [phase EXCEPT ![p] = "claiming"]
                 ELSE phase' = [phase EXCEPT ![p] = "idle"]
            ELSE IF Alive(PidOf(observed[p]))
                 THEN phase' = [phase EXCEPT ![p] = "idle"]
                 ELSE phase' = [phase EXCEPT ![p] = "claiming"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

\* wx on config.json.lock.break, plus that token write.
\* ReapClaim FALSE skips the lease, which is deleting the exclusive create.
Claim(p) ==
  /\ phase[p] = "claiming"
  /\ IF ~ReapClaim
       THEN /\ phase' = [phase EXCEPT ![p] = "rereading"]
            /\ UNCHANGED lease
       ELSE IF lease = "none"
            THEN /\ lease' = p
                 /\ phase' = [phase EXCEPT ![p] = "rereading"]
            ELSE /\ phase' = [phase EXCEPT ![p] = "idle"]
                 /\ UNCHANGED lease
  /\ UNCHANGED <<lock, observed, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

\* Second read. Recheck is `still !== observed`. An empty match goes to the
\* second stat when SecondAge is on. This action does not unlink.
Reread(p) ==
  /\ phase[p] = "rereading"
  /\ \/ lease = p
     \/ ~ReapClaim
  /\ IF lock = "none"
       THEN phase' = [phase EXCEPT ![p] = "unclaiming"]
       ELSE IF Recheck /\ lock # observed[p]
            THEN phase' = [phase EXCEPT ![p] = "unclaiming"]
            ELSE IF SecondAge /\ observed[p] = "empty" /\ lock = "empty"
                 THEN phase' = [phase EXCEPT ![p] = "restatting"]
                 ELSE phase' = [phase EXCEPT ![p] = "unlinking"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

\* stat inside the second readOwner. A young empty file is left in place.
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
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

\* unlink of the lock. It does not read. UnlinkMatches says the body is still
\* the one Reread accepted whenever Recheck is on.
Unlink(p) ==
  /\ phase[p] = "unlinking"
  /\ \/ lease = p
     \/ ~ReapClaim
  /\ lock' = "none"
  /\ created' = "none"
  /\ age' = "old"
  /\ phase' = [phase EXCEPT ![p] = "unclaiming"]
  /\ UNCHANGED <<observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

\* Read of the break file. The holder wrote its only body, so the read matches.
DropClaimRead(p) ==
  /\ phase[p] = "unclaiming"
  /\ phase' = [phase EXCEPT ![p] = "clearing"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

\* unlink of the break file.
DropClaimUnlink(p) ==
  /\ phase[p] = "clearing"
  /\ lease' = IF lease = p THEN "none" ELSE lease
  /\ phase' = [phase EXCEPT ![p] = "idle"]
  /\ UNCHANGED <<lock, observed, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

Load(p) ==
  /\ phase[p] = "holding"
  /\ snapshot' = [snapshot EXCEPT ![p] = config]
  /\ phase' = [phase EXCEPT ![p] = "loaded"]
  /\ UNCHANGED <<lock, observed, lease, config, pidReused, intruder, intruderPhase, age, created>>

Save(p) ==
  /\ phase[p] = "loaded"
  /\ config' = snapshot[p] \cup {Field(p)}
  /\ phase' = [phase EXCEPT ![p] = "releasing"]
  /\ UNCHANGED <<lock, observed, lease, snapshot, pidReused, intruder, intruderPhase, age, created>>

\* Release reads. A different body is left in place.
ReleaseRead(p) ==
  /\ phase[p] = "releasing"
  /\ IF lock = p
       THEN phase' = [phase EXCEPT ![p] = "dropping"]
       ELSE phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

ReleaseUnlink(p) ==
  /\ phase[p] = "dropping"
  /\ lock' = "none"
  /\ created' = "none"
  /\ age' = "old"
  /\ phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

Crash(p) ==
  /\ phase[p] \in {"publishing", "holding", "loaded", "releasing", "dropping"}
  /\ phase' = [phase EXCEPT ![p] = "crashed"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase, age, created>>

KernelReissue ==
  /\ pidReused = FALSE
  /\ pidReused' = TRUE
  /\ UNCHANGED <<phase, lock, observed, lease, config, snapshot, intruder, intruderPhase, age, created>>

\* The new process writes a body the stale file did not have, unless FreshToken
\* is FALSE. Its pid is still the dead pid, so kill(pid, 0) succeeds.
IntruderAcquire ==
  /\ pidReused
  /\ intruderPhase = "out"
  /\ lock = "none"
  /\ lock' = IntruderBody
  /\ created' = "none"
  /\ age' = "old"
  /\ intruder' = TRUE
  /\ intruderPhase' = "holding"
  /\ UNCHANGED <<phase, observed, lease, config, snapshot, pidReused>>

IntruderRead ==
  /\ intruderPhase = "holding"
  /\ IF lock = IntruderBody
       THEN /\ intruderPhase' = "dropping"
            /\ UNCHANGED intruder
       ELSE /\ intruderPhase' = "out"
            /\ intruder' = FALSE
  /\ UNCHANGED <<phase, lock, observed, lease, config, snapshot, pidReused, age, created>>

IntruderUnlink ==
  /\ intruderPhase = "dropping"
  /\ lock' = "none"
  /\ created' = "none"
  /\ age' = "old"
  /\ intruder' = FALSE
  /\ intruderPhase' = "out"
  /\ UNCHANGED <<phase, observed, lease, config, snapshot, pidReused>>

Done ==
  /\ \A p \in Proc : phase[p] \in {"done", "crashed"}
  /\ intruderPhase = "out"
  /\ UNCHANGED vars

Next ==
  \/ \E p \in Proc :
       Open(p) \/ WriteToken(p) \/ FailWrite(p) \/ ReadLock(p) \/ Judge(p) \/ Claim(p)
         \/ Reread(p) \/ SecondStat(p) \/ Unlink(p)
         \/ DropClaimRead(p) \/ DropClaimUnlink(p)
         \/ Load(p) \/ Save(p) \/ ReleaseRead(p) \/ ReleaseUnlink(p) \/ Crash(p)
  \/ Age
  \/ KernelReissue
  \/ IntruderAcquire
  \/ IntruderRead
  \/ IntruderUnlink
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in [Proc -> Phases]
  /\ lock \in Bodies \cup {"none"}
  /\ observed \in [Proc -> Bodies \cup {"none"}]
  /\ lease \in Proc \cup {"none"}
  /\ config \subseteq {"profile", "agent"}
  /\ snapshot \in [Proc -> SUBSET {"profile", "agent"}]
  /\ pidReused \in BOOLEAN
  /\ intruder \in BOOLEAN
  /\ intruderPhase \in {"out", "holding", "dropping"}
  /\ intruder = (intruderPhase # "out")
  /\ age \in {"young", "old"}
  /\ created \in Proc \cup {"none"}
  /\ (lock = "empty") <=> (created \in Proc)
  /\ \A p \in Proc :
       (phase[p] = "publishing" /\ created = p) => (lock = "empty" /\ age = "young")
  /\ (lock = "empty" /\ age = "old") => (\A p \in Proc : phase[p] # "publishing")

\* While Recheck is on, a saver about to unlink still sees the body it judged.
UnlinkMatches ==
  Recheck => \A p \in Proc : phase[p] = "unlinking" => lock = observed[p]

\* A profile save and a user-agent save are never in the critical section together,
\* and neither is in it while the new process that reused the dead pid is.
\* Publishing the lock is not the critical section.
Exclusive ==
  Cardinality({p \in Proc : Critical(p)}) + (IF intruder THEN 1 ELSE 0) <= 1

\* Once both updates finish, config.json has the default profile and the user agent.
BothLanded ==
  (phase["a"] = "done" /\ phase["b"] = "done") => config = {"profile", "agent"}
=============================================================================
