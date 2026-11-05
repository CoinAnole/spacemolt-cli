----------------------------- MODULE SessionFile -----------------------------
\* Session-file writers in src/session.ts and src/api.ts.
\* saveSession publishes one JSON object by renaming a temp file onto the
\* session path. Readers of that path see the previous object or the new one.
\* The open, write, and sync of the temp file are not a second session-file
\* state. There is no lock around the session file.
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

CONSTANT WritePassword

LoginPhase == {"start", "created", "sent", "loaded", "done"}
OtherPhase == {"start", "held", "loaded", "wiped", "restored", "done", "skipped"}
Mode == {"none", "refresh", "recover"}

VARIABLES
  login, other, mode,
  filePassword, fileExpiry, clock,
  loginLoadedExpiry, loginLoadedPassword,
  routeSnapPassword,
  recoverPassword, recoverExpiry

vars == <<login, other, mode, filePassword, fileExpiry, clock,
          loginLoadedExpiry, loginLoadedPassword, routeSnapPassword,
          recoverPassword, recoverExpiry>>

\* A response's expires_at is later than every expires_at already issued.
\* clock is that newest value. The file starts at the same number.
Tick == clock + 1

Init ==
  /\ login = "start"
  /\ other = "start"
  /\ mode = "none"
  /\ filePassword = TRUE
  /\ fileExpiry = 1
  /\ clock = 1
  /\ loginLoadedExpiry = 0
  /\ loginLoadedPassword = FALSE
  /\ routeSnapPassword = FALSE
  /\ recoverPassword = FALSE
  /\ recoverExpiry = 0

\* createSession() with no saved credentials, then saveSession.
\* createTransientSession spreads savedCredentials only when login passed them.
\* Login does not. The object has no password.
LoginCreate ==
  /\ login = "start"
  /\ filePassword' = FALSE
  /\ fileExpiry' = Tick
  /\ clock' = Tick
  /\ login' = "created"
  /\ UNCHANGED <<other, mode, loginLoadedExpiry, loginLoadedPassword,
                 routeSnapPassword, recoverPassword, recoverExpiry>>

\* sendRequest, login command, when data.session is present.
\* The in-memory session is the object createSession returned. Still no password.
\* expires_at is replaced. saveSession writes the whole object.
LoginSend ==
  /\ login = "created"
  /\ filePassword' = FALSE
  /\ fileExpiry' = Tick
  /\ clock' = Tick
  /\ login' = "sent"
  /\ UNCHANGED <<other, mode, loginLoadedExpiry, loginLoadedPassword,
                 routeSnapPassword, recoverPassword, recoverExpiry>>

\* persistSuccessfulCredentials: loadSession, then the sync field writes.
\* No session-file call sits between the parse and those assignments.
\* ensureDefaultProfile writes config.json, not this file.
PersistLoad ==
  /\ login = "sent"
  /\ loginLoadedExpiry' = fileExpiry
  /\ loginLoadedPassword' = filePassword
  /\ login' = "loaded"
  /\ UNCHANGED <<other, mode, filePassword, fileExpiry, clock,
                 routeSnapPassword, recoverPassword, recoverExpiry>>

\* saveSession of that loaded object. WritePassword sets password from the
\* login payload. The expiry stays the one loadSession returned.
PersistSave ==
  /\ login = "loaded"
  /\ filePassword' = IF WritePassword THEN TRUE ELSE loginLoadedPassword
  /\ fileExpiry' = loginLoadedExpiry
  /\ login' = "done"
  /\ UNCHANGED <<other, mode, clock, loginLoadedExpiry, loginLoadedPassword,
                 routeSnapPassword, recoverPassword, recoverExpiry>>

\* getSession: loadSession, session present, isSessionExpired false, so no
\* createSession. The route command holds this object until sendRequest.
GetSession ==
  /\ other = "start"
  /\ routeSnapPassword' = filePassword
  /\ mode' = "refresh"
  /\ other' = "held"
  /\ UNCHANGED <<login, filePassword, fileExpiry, clock,
                 loginLoadedExpiry, loginLoadedPassword,
                 recoverPassword, recoverExpiry>>

\* sendRequest for that route command, when data.session is present.
\* expires_at is copied onto the held object. saveSession writes the whole object.
RouteSend ==
  /\ other = "held"
  /\ filePassword' = routeSnapPassword
  /\ fileExpiry' = Tick
  /\ clock' = Tick
  /\ other' = "done"
  /\ UNCHANGED <<login, mode, loginLoadedExpiry, loginLoadedPassword,
                 routeSnapPassword, recoverPassword, recoverExpiry>>

\* recoverSession's loadSession. No username or password: return null.
\* Otherwise remember the password. The later save uses this object, not a re-read.
RecoverLoad ==
  /\ other = "start"
  /\ mode' = "recover"
  /\ IF filePassword
       THEN /\ recoverPassword' = TRUE
            /\ other' = "loaded"
       ELSE /\ recoverPassword' = FALSE
            /\ other' = "skipped"
  /\ UNCHANGED <<login, filePassword, fileExpiry, clock,
                 loginLoadedExpiry, loginLoadedPassword,
                 routeSnapPassword, recoverExpiry>>

\* createSession() with no saved credentials. saveSession writes no password.
\* This is the passwordless window.
RecoverCreate ==
  /\ other = "loaded"
  /\ recoverExpiry' = Tick
  /\ filePassword' = FALSE
  /\ fileExpiry' = Tick
  /\ clock' = Tick
  /\ other' = "wiped"
  /\ UNCHANGED <<login, mode, loginLoadedExpiry, loginLoadedPassword,
                 routeSnapPassword, recoverPassword>>

\* newSession.username / password copied from the load, then saveSession.
\* expires_at is still the value createTransientSession returned.
RecoverRestore ==
  /\ other = "wiped"
  /\ filePassword' = recoverPassword
  /\ fileExpiry' = recoverExpiry
  /\ other' = "restored"
  /\ UNCHANGED <<login, mode, clock, loginLoadedExpiry, loginLoadedPassword,
                 routeSnapPassword, recoverPassword, recoverExpiry>>

\* loginWithSession -> sendRequest. The same object still has the copied password.
\* data.session.expires_at replaces expires_at. saveSession writes the whole object.
RecoverLogin ==
  /\ other = "restored"
  /\ filePassword' = recoverPassword
  /\ fileExpiry' = Tick
  /\ clock' = Tick
  /\ other' = "done"
  /\ UNCHANGED <<login, mode, loginLoadedExpiry, loginLoadedPassword,
                 routeSnapPassword, recoverPassword, recoverExpiry>>

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
  /\ loginLoadedExpiry \in 0..5
  /\ loginLoadedPassword \in BOOLEAN
  /\ routeSnapPassword \in BOOLEAN
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
