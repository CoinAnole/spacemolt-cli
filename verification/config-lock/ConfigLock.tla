------------------------------ MODULE ConfigLock ------------------------------
\* acquireConfigLock, removeStaleConfigLock, and updateCliConfig in src/session.ts.
\* Each action is one filesystem call or the kill(pid, 0) check another process
\* can pass between. open(wx) plus the pid write is one step: a reader of the
\* empty file in between sees a non-numeric pid and a fresh mtime, and
\* removeStaleConfigLock leaves that file alone.

EXTENDS FiniteSets, Integers, TLC

CONSTANTS Recheck

Proc == {"a", "b"}
Pids == {"a", "b", "dead"}
Phases == {"idle", "reading", "judging", "rereading", "holding", "loaded", "releasing", "done", "crashed"}

VARIABLES phase, lock, observed, config, snapshot, pidReused, intruder
vars == <<phase, lock, observed, config, snapshot, pidReused, intruder>>

Field(p) == IF p = "a" THEN "profile" ELSE "agent"

Alive(pid) ==
  \/ /\ pid \in Proc
     /\ phase[pid] # "crashed"
  \/ /\ pid = "dead"
     /\ pidReused

Critical(p) == phase[p] \in {"holding", "loaded", "releasing"}

Init ==
  /\ phase = [p \in Proc |-> "idle"]
  /\ lock = "dead"
  /\ observed = [p \in Proc |-> "none"]
  /\ config = {}
  /\ snapshot = [p \in Proc |-> {}]
  /\ pidReused = FALSE
  /\ intruder = FALSE

\* The acquire loop. wx succeeds only when the lock file is absent.
TryOpen(p) ==
  /\ phase[p] = "idle"
  /\ IF lock = "none"
       THEN /\ lock' = p
            /\ phase' = [phase EXCEPT ![p] = "holding"]
       ELSE /\ phase' = [phase EXCEPT ![p] = "reading"]
            /\ UNCHANGED lock
  /\ UNCHANGED <<observed, config, snapshot, pidReused, intruder>>

\* First read of the lock file. ENOENT means another process already removed it.
ReadLock(p) ==
  /\ phase[p] = "reading"
  /\ IF lock = "none"
       THEN /\ phase' = [phase EXCEPT ![p] = "idle"]
            /\ UNCHANGED observed
       ELSE /\ observed' = [observed EXCEPT ![p] = lock]
            /\ phase' = [phase EXCEPT ![p] = "judging"]
  /\ UNCHANGED <<lock, config, snapshot, pidReused, intruder>>

\* kill(pid, 0). The result is kept. A later re-read does not ask again.
Judge(p) ==
  /\ phase[p] = "judging"
  /\ IF Alive(observed[p])
       THEN phase' = [phase EXCEPT ![p] = "idle"]
       ELSE phase' = [phase EXCEPT ![p] = "rereading"]
  /\ UNCHANGED <<lock, observed, config, snapshot, pidReused, intruder>>

\* Second read, then unlink. Recheck is the `still !== observed` test.
Reread(p) ==
  /\ phase[p] = "rereading"
  /\ IF lock = "none"
       THEN /\ phase' = [phase EXCEPT ![p] = "idle"]
            /\ UNCHANGED lock
       ELSE IF Recheck /\ lock # observed[p]
            THEN /\ phase' = [phase EXCEPT ![p] = "idle"]
                 /\ UNCHANGED lock
            ELSE /\ lock' = "none"
                 /\ phase' = [phase EXCEPT ![p] = "idle"]
  /\ UNCHANGED <<observed, config, snapshot, pidReused, intruder>>

\* loadCliConfig under the lock.
Load(p) ==
  /\ phase[p] = "holding"
  /\ snapshot' = [snapshot EXCEPT ![p] = config]
  /\ phase' = [phase EXCEPT ![p] = "loaded"]
  /\ UNCHANGED <<lock, observed, config, pidReused, intruder>>

\* writeCliConfigAtomic of the snapshot plus this process's field.
Save(p) ==
  /\ phase[p] = "loaded"
  /\ config' = snapshot[p] \cup {Field(p)}
  /\ phase' = [phase EXCEPT ![p] = "releasing"]
  /\ UNCHANGED <<lock, observed, snapshot, pidReused, intruder>>

\* The returned release closes over no owner check. It unlinks the path.
Release(p) ==
  /\ phase[p] = "releasing"
  /\ lock' = "none"
  /\ phase' = [phase EXCEPT ![p] = "done"]
  /\ UNCHANGED <<observed, config, snapshot, pidReused, intruder>>

\* The process exits inside the critical section and leaves the lock file.
Crash(p) ==
  /\ phase[p] \in {"holding", "loaded", "releasing"}
  /\ phase' = [phase EXCEPT ![p] = "crashed"]
  /\ UNCHANGED <<lock, observed, config, snapshot, pidReused, intruder>>

\* The kernel gives the dead owner's pid to a new process. kill(pid, 0) then succeeds.
KernelReissue ==
  /\ pidReused = FALSE
  /\ pidReused' = TRUE
  /\ UNCHANGED <<phase, lock, observed, config, snapshot, intruder>>

\* That new process does open(wx) and writes the same pid bytes.
IntruderAcquire ==
  /\ pidReused
  /\ intruder = FALSE
  /\ lock = "none"
  /\ lock' = "dead"
  /\ intruder' = TRUE
  /\ UNCHANGED <<phase, observed, config, snapshot, pidReused>>

IntruderRelease ==
  /\ intruder
  /\ intruder' = FALSE
  /\ lock' = "none"
  /\ UNCHANGED <<phase, observed, config, snapshot, pidReused>>

Done ==
  /\ \A p \in Proc : phase[p] \in {"done", "crashed"}
  /\ UNCHANGED vars

Next ==
  \/ \E p \in Proc :
       TryOpen(p) \/ ReadLock(p) \/ Judge(p) \/ Reread(p)
         \/ Load(p) \/ Save(p) \/ Release(p) \/ Crash(p)
  \/ KernelReissue
  \/ IntruderAcquire
  \/ IntruderRelease
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in [Proc -> Phases]
  /\ lock \in Pids \cup {"none"}
  /\ observed \in [Proc -> Pids \cup {"none"}]
  /\ config \subseteq {"profile", "agent"}
  /\ snapshot \in [Proc -> SUBSET {"profile", "agent"}]
  /\ pidReused \in BOOLEAN
  /\ intruder \in BOOLEAN

\* A profile save and a user-agent save are never in the critical section together,
\* and neither is in it while the new process that reused the dead pid is.
Exclusive ==
  Cardinality({p \in Proc : Critical(p)}) + (IF intruder THEN 1 ELSE 0) <= 1

\* Once both updates finish, config.json has the default profile and the user agent.
BothLanded ==
  (phase["a"] = "done" /\ phase["b"] = "done") => config = {"profile", "agent"}
=============================================================================
