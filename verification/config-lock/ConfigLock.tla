------------------------------ MODULE ConfigLock ------------------------------
\* withConfigLock in src/config-lock.ts, called by updateCliConfig and saveCliConfig.
\* Each action is one filesystem call or the kill(pid, 0) check another process
\* can pass between. open(wx) plus the token write is one step. A reader of the
\* empty file between them sees a non-numeric body and a fresh mtime, and the
\* second age check leaves that file alone. This model has only numeric bodies,
\* so that stat is not an action.
\*
\* config.json.lock.break is the only right to unlink the lock. The nested
\* config.json.lock.break.break file is the same rule one level down. A crash
\* while holding the deepest break file is outside this model, as a crash of
\* rename is.

EXTENDS FiniteSets, Integers, TLC

CONSTANTS Recheck, FreshToken, ReapClaim

Proc == {"a", "b"}
Bodies == {"stale", "a", "b", "reused"}
Phases == {
  "idle", "reading", "judging", "claiming", "rereading", "unlinking", "unclaiming", "clearing",
  "holding", "loaded", "releasing", "dropping", "done", "crashed"
}

VARIABLES phase, lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase
vars == <<phase, lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

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

\* wx on config.json.lock, plus the token write.
TryOpen(p) ==
  /\ phase[p] = "idle"
  /\ IF lock = "none"
       THEN /\ lock' = p
            /\ phase' = [phase EXCEPT ![p] = "holding"]
       ELSE /\ phase' = [phase EXCEPT ![p] = "reading"]
            /\ UNCHANGED lock
  /\ UNCHANGED <<observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

\* First read of the lock file. ENOENT sends the saver back to try again.
ReadLock(p) ==
  /\ phase[p] = "reading"
  /\ IF lock = "none"
       THEN /\ phase' = [phase EXCEPT ![p] = "idle"]
            /\ UNCHANGED observed
       ELSE /\ observed' = [observed EXCEPT ![p] = lock]
            /\ phase' = [phase EXCEPT ![p] = "judging"]
  /\ UNCHANGED <<lock, lease, config, snapshot, pidReused, intruder, intruderPhase>>

\* kill(pid, 0), then stat. ENOENT on that stat means the file is already gone.
\* A later re-read does not ask kill again.
Judge(p) ==
  /\ phase[p] = "judging"
  /\ IF lock = "none"
       THEN phase' = [phase EXCEPT ![p] = "idle"]
       ELSE IF Alive(PidOf(observed[p]))
            THEN phase' = [phase EXCEPT ![p] = "idle"]
            ELSE phase' = [phase EXCEPT ![p] = "claiming"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

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
  /\ UNCHANGED <<lock, observed, config, snapshot, pidReused, intruder, intruderPhase>>

\* Second read. Recheck is `still !== observed`. This action does not unlink.
Reread(p) ==
  /\ phase[p] = "rereading"
  /\ \/ lease = p
     \/ ~ReapClaim
  /\ IF lock = "none"
       THEN phase' = [phase EXCEPT ![p] = "unclaiming"]
       ELSE IF Recheck /\ lock # observed[p]
            THEN phase' = [phase EXCEPT ![p] = "unclaiming"]
            ELSE phase' = [phase EXCEPT ![p] = "unlinking"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

\* unlink of the lock. It does not read. UnlinkMatches says the body is still
\* the one Reread accepted whenever Recheck is on.
Unlink(p) ==
  /\ phase[p] = "unlinking"
  /\ \/ lease = p
     \/ ~ReapClaim
  /\ lock' = "none"
  /\ phase' = [phase EXCEPT ![p] = "unclaiming"]
  /\ UNCHANGED <<observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

\* Read of the break file. The holder wrote its only body, so the read matches.
DropClaimRead(p) ==
  /\ phase[p] = "unclaiming"
  /\ phase' = [phase EXCEPT ![p] = "clearing"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

\* unlink of the break file.
DropClaimUnlink(p) ==
  /\ phase[p] = "clearing"
  /\ lease' = IF lease = p THEN "none" ELSE lease
  /\ phase' = [phase EXCEPT ![p] = "idle"]
  /\ UNCHANGED <<lock, observed, config, snapshot, pidReused, intruder, intruderPhase>>

Load(p) ==
  /\ phase[p] = "holding"
  /\ snapshot' = [snapshot EXCEPT ![p] = config]
  /\ phase' = [phase EXCEPT ![p] = "loaded"]
  /\ UNCHANGED <<lock, observed, lease, config, pidReused, intruder, intruderPhase>>

Save(p) ==
  /\ phase[p] = "loaded"
  /\ config' = snapshot[p] \cup {Field(p)}
  /\ phase' = [phase EXCEPT ![p] = "releasing"]
  /\ UNCHANGED <<lock, observed, lease, snapshot, pidReused, intruder, intruderPhase>>

\* Release reads. A different body is left in place.
ReleaseRead(p) ==
  /\ phase[p] = "releasing"
  /\ IF lock = p
       THEN phase' = [phase EXCEPT ![p] = "dropping"]
       ELSE phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

ReleaseUnlink(p) ==
  /\ phase[p] = "dropping"
  /\ lock' = "none"
  /\ phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

Crash(p) ==
  /\ phase[p] \in {"holding", "loaded", "releasing", "dropping"}
  /\ phase' = [phase EXCEPT ![p] = "crashed"]
  /\ UNCHANGED <<lock, observed, lease, config, snapshot, pidReused, intruder, intruderPhase>>

KernelReissue ==
  /\ pidReused = FALSE
  /\ pidReused' = TRUE
  /\ UNCHANGED <<phase, lock, observed, lease, config, snapshot, intruder, intruderPhase>>

\* The new process writes a body the stale file did not have, unless FreshToken
\* is FALSE. Its pid is still the dead pid, so kill(pid, 0) succeeds.
IntruderAcquire ==
  /\ pidReused
  /\ intruderPhase = "out"
  /\ lock = "none"
  /\ lock' = IntruderBody
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
  /\ UNCHANGED <<phase, lock, observed, lease, config, snapshot, pidReused>>

IntruderUnlink ==
  /\ intruderPhase = "dropping"
  /\ lock' = "none"
  /\ intruder' = FALSE
  /\ intruderPhase' = "out"
  /\ UNCHANGED <<phase, observed, lease, config, snapshot, pidReused>>

Done ==
  /\ \A p \in Proc : phase[p] \in {"done", "crashed"}
  /\ intruderPhase = "out"
  /\ UNCHANGED vars

Next ==
  \/ \E p \in Proc :
       TryOpen(p) \/ ReadLock(p) \/ Judge(p) \/ Claim(p) \/ Reread(p) \/ Unlink(p)
         \/ DropClaimRead(p) \/ DropClaimUnlink(p)
         \/ Load(p) \/ Save(p) \/ ReleaseRead(p) \/ ReleaseUnlink(p) \/ Crash(p)
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

\* While Recheck is on, a saver about to unlink still sees the body it judged.
UnlinkMatches ==
  Recheck => \A p \in Proc : phase[p] = "unlinking" => lock = observed[p]

\* A profile save and a user-agent save are never in the critical section together,
\* and neither is in it while the new process that reused the dead pid is.
Exclusive ==
  Cardinality({p \in Proc : Critical(p)}) + (IF intruder THEN 1 ELSE 0) <= 1

\* Once both updates finish, config.json has the default profile and the user agent.
BothLanded ==
  (phase["a"] = "done" /\ phase["b"] = "done") => config = {"profile", "agent"}
=============================================================================
