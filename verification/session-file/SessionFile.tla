----------------------------- MODULE SessionFile -----------------------------
\* Session-file writers in src/session.ts and src/api.ts.
\* saveSession readFile, mergePublishedSession, and rename are one action
\* while SessionLock is TRUE. The next-state reads filePassword, fileExpiry,
\* and fileId (the locked re-read) and writes the merge. Readers do not take
\* the lock. Lock-file open and unlink are not session-file calls.
\* SessionLock FALSE writes the in-memory object and does not re-read.
\*
\* Two commands interleave. One is login. The other is either a route command
\* whose response carries data.session, or recoverSession. One route command
\* does not do both: sendRequest does not save when data.error is set, and
\* that is when executeRoute calls recoverSession.
\*
\* WritePassword is the assignment
\*   session.password = payload.password
\* in persistSuccessfulCredentials. FALSE is that line removed.

EXTENDS Integers

CONSTANT WritePassword, SessionLock

LoginPhase == {"start", "created", "sent", "loaded", "done"}
OtherPhase == {"start", "held", "loaded", "wiped", "restored", "done", "skipped"}
Mode == {"none", "refresh", "recover"}
Ids == {"initial", "login", "recover"}

VARIABLES
  login, other, mode,
  filePassword, fileExpiry, clock, fileId,
  loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
  routeSnapPassword, routeSnapId,
  recoverPassword, recoverExpiry

vars == <<login, other, mode, filePassword, fileExpiry, clock, fileId,
          loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
          routeSnapPassword, routeSnapId, recoverPassword, recoverExpiry>>

\* A response's expires_at is later than every expires_at already issued.
\* clock is that newest value. The file starts at the same number.
Tick == clock + 1

\* Same id keeps a password the incoming object omitted. A new id does not.
KeptPassword(incomingPassword, incomingId) ==
  IF incomingPassword THEN TRUE
  ELSE IF SessionLock /\ incomingId = fileId THEN filePassword
  ELSE FALSE

\* Later expiry, even when the ids differ. The model has only numbers.
KeptExpiry(incomingExpiry) ==
  IF SessionLock /\ fileExpiry > incomingExpiry THEN fileExpiry ELSE incomingExpiry

Init ==
  /\ login = "start"
  /\ other = "start"
  /\ mode = "none"
  /\ filePassword = TRUE
  /\ fileExpiry = 1
  /\ clock = 1
  /\ fileId = "initial"
  /\ loginLoadedExpiry = 0
  /\ loginLoadedPassword = FALSE
  /\ loginLoadedId = "initial"
  /\ routeSnapPassword = FALSE
  /\ routeSnapId = "initial"
  /\ recoverPassword = FALSE
  /\ recoverExpiry = 0

\* createSession() with no saved credentials, then saveSession
\* readFile, mergePublishedSession, and rename.
\* createTransientSession spreads savedCredentials only when login passed them.
\* Login does not. Incoming password FALSE, incoming id "login", incoming expiry Tick.
LoginCreate ==
  /\ login = "start"
  /\ filePassword' = KeptPassword(FALSE, "login")
  /\ fileExpiry' = KeptExpiry(Tick)
  /\ fileId' = "login"
  /\ clock' = Tick
  /\ login' = "created"
  /\ UNCHANGED <<other, mode,
                 loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
                 routeSnapPassword, routeSnapId,
                 recoverPassword, recoverExpiry>>

\* sendRequest, login command, when data.session is present.
\* saveSession readFile, mergePublishedSession, and rename.
\* The in-memory session is the object createSession returned. Still no password.
\* Incoming password FALSE, incoming id "login", incoming expiry Tick.
LoginSend ==
  /\ login = "created"
  /\ filePassword' = KeptPassword(FALSE, "login")
  /\ fileExpiry' = KeptExpiry(Tick)
  /\ fileId' = "login"
  /\ clock' = Tick
  /\ login' = "sent"
  /\ UNCHANGED <<other, mode,
                 loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
                 routeSnapPassword, routeSnapId,
                 recoverPassword, recoverExpiry>>

\* persistSuccessfulCredentials: loadSession, then the sync field writes.
\* No session-file call sits between the parse and those assignments.
\* Copies fileId to loginLoadedId. Does not assign fileId.
\* ensureDefaultProfile writes config.json, not this file.
PersistLoad ==
  /\ login = "sent"
  /\ loginLoadedExpiry' = fileExpiry
  /\ loginLoadedPassword' = filePassword
  /\ loginLoadedId' = fileId
  /\ login' = "loaded"
  /\ UNCHANGED <<other, mode, filePassword, fileExpiry, fileId, clock,
                 routeSnapPassword, routeSnapId,
                 recoverPassword, recoverExpiry>>

\* saveSession readFile, mergePublishedSession, and rename of that loaded object.
\* WritePassword sets password from the login payload.
\* Incoming expiry is the one loadSession returned, not a new tick.
PersistSave ==
  /\ login = "loaded"
  /\ LET incomingPassword == IF WritePassword THEN TRUE ELSE loginLoadedPassword
     IN /\ filePassword' = KeptPassword(incomingPassword, loginLoadedId)
        /\ fileExpiry' = KeptExpiry(loginLoadedExpiry)
        /\ fileId' = loginLoadedId
  /\ login' = "done"
  /\ UNCHANGED <<other, mode, clock,
                 loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
                 routeSnapPassword, routeSnapId,
                 recoverPassword, recoverExpiry>>

\* getSession: loadSession, session present, isSessionExpired false, so no
\* createSession. The route command holds this object until sendRequest.
\* Copies filePassword and fileId. Does not assign fileId.
GetSession ==
  /\ other = "start"
  /\ routeSnapPassword' = filePassword
  /\ routeSnapId' = fileId
  /\ mode' = "refresh"
  /\ other' = "held"
  /\ UNCHANGED <<login, filePassword, fileExpiry, fileId, clock,
                 loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
                 recoverPassword, recoverExpiry>>

\* sendRequest for that route command, when data.session is present.
\* saveSession readFile, mergePublishedSession, and rename.
\* Incoming password routeSnapPassword, incoming id routeSnapId, incoming expiry Tick.
RouteSend ==
  /\ other = "held"
  /\ filePassword' = KeptPassword(routeSnapPassword, routeSnapId)
  /\ fileExpiry' = KeptExpiry(Tick)
  /\ fileId' = routeSnapId
  /\ clock' = Tick
  /\ other' = "done"
  /\ UNCHANGED <<login, mode,
                 loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
                 routeSnapPassword, routeSnapId,
                 recoverPassword, recoverExpiry>>

\* recoverSession's loadSession. No username or password: return null.
\* Otherwise remember the password. The later save uses this object, not a re-read.
\* Does not assign an id.
RecoverLoad ==
  /\ other = "start"
  /\ mode' = "recover"
  /\ IF filePassword
       THEN /\ recoverPassword' = TRUE
            /\ other' = "loaded"
       ELSE /\ recoverPassword' = FALSE
            /\ other' = "skipped"
  /\ UNCHANGED <<login, filePassword, fileExpiry, fileId, clock,
                 loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
                 routeSnapPassword, routeSnapId, recoverExpiry>>

\* createSession() with no saved credentials.
\* saveSession readFile, mergePublishedSession, and rename.
\* Incoming password FALSE, incoming id "recover", incoming expiry Tick.
\* This is the passwordless window.
RecoverCreate ==
  /\ other = "loaded"
  /\ recoverExpiry' = Tick
  /\ filePassword' = KeptPassword(FALSE, "recover")
  /\ fileExpiry' = KeptExpiry(Tick)
  /\ fileId' = "recover"
  /\ clock' = Tick
  /\ other' = "wiped"
  /\ UNCHANGED <<login, mode,
                 loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
                 routeSnapPassword, routeSnapId,
                 recoverPassword>>

\* newSession.username / password copied from the load, then saveSession
\* readFile, mergePublishedSession, and rename.
\* Incoming password recoverPassword, incoming id "recover".
\* expires_at is still the value createTransientSession returned, not a new tick.
RecoverRestore ==
  /\ other = "wiped"
  /\ filePassword' = KeptPassword(recoverPassword, "recover")
  /\ fileExpiry' = KeptExpiry(recoverExpiry)
  /\ fileId' = "recover"
  /\ other' = "restored"
  /\ UNCHANGED <<login, mode, clock,
                 loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
                 routeSnapPassword, routeSnapId,
                 recoverPassword, recoverExpiry>>

\* loginWithSession -> sendRequest.
\* saveSession readFile, mergePublishedSession, and rename.
\* The same object still has the copied password.
\* Incoming password recoverPassword, incoming id "recover", incoming expiry Tick.
RecoverLogin ==
  /\ other = "restored"
  /\ filePassword' = KeptPassword(recoverPassword, "recover")
  /\ fileExpiry' = KeptExpiry(Tick)
  /\ fileId' = "recover"
  /\ clock' = Tick
  /\ other' = "done"
  /\ UNCHANGED <<login, mode,
                 loginLoadedExpiry, loginLoadedPassword, loginLoadedId,
                 routeSnapPassword, routeSnapId,
                 recoverPassword, recoverExpiry>>

Done ==
  /\ login = "done"
  /\ other \in {"done", "skipped"}
  /\ UNCHANGED vars

Next ==
  \/ LoginCreate \/ LoginSend \/ PersistLoad \/ PersistSave
  \/ GetSession \/ RouteSend
  \/ RecoverLoad \/ RecoverCreate \/ RecoverRestore \/ RecoverLogin
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ login \in LoginPhase
  /\ other \in OtherPhase
  /\ mode \in Mode
  /\ filePassword \in BOOLEAN
  /\ fileExpiry \in 1..5
  /\ clock \in 1..5
  /\ fileId \in Ids
  /\ loginLoadedExpiry \in 0..5
  /\ loginLoadedPassword \in BOOLEAN
  /\ loginLoadedId \in Ids
  /\ routeSnapPassword \in BOOLEAN
  /\ routeSnapId \in Ids
  /\ recoverPassword \in BOOLEAN
  /\ recoverExpiry \in 0..5

Settled ==
  login = "done" /\ other \in {"done", "skipped"}

\* The session file still has the password.
PasswordKept ==
  Settled => filePassword

\* The session file still has the newest expires_at.
NewestExpiry ==
  Settled => fileExpiry = clock

\* After login and recoverSession have both finished, the file has the password
\* and the newest expires_at. The passwordless createSession write is earlier
\* than RecoverRestore and RecoverLogin.
RecoveryKeeps ==
  (Settled /\ mode = "recover") => (filePassword /\ fileExpiry = clock)

=============================================================================
