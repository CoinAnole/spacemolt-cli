-------------------------- MODULE SubscriptionFollow ---------------------------
\* runSubscriptionFollow after subscribe succeeds, in src/subscription-follow.ts.
\* Each action is one await or the loop decision that follows it with no await
\* in between. handler.run / handler.render are already done: a non-zero exit
\* or a throw there returns before this try/finally and does not call
\* bestEffortUnsubscribe. That return is not a state.

EXTENDS Integers

CONSTANTS CleanupGuard, UnsubscribeOnPollThrow

\* FOLLOW_POLL_INTERVAL_SECONDS. The first sleep, and a successful poll with no
\* usable throttledRetryAfter, both use this.
PollInterval == 10

\* One positive finite retry_after. It is not 2, 4, 8, 16, 30, or 10, so a
\* throttle wait cannot be mistaken for the backoff ladder. The code returns
\* the first throttled === true envelope whose retry_after is a finite number
\* greater than 0. Which envelope that is is not a state.
ThrottleWait == 7

\* RETRY_DELAYS_SECONDS. Index 4 and above are the 30 second cap.
RetrySlot(i) ==
  CASE i = 0 -> 2
    [] i = 1 -> 4
    [] i = 2 -> 8
    [] i = 3 -> 16
    [] OTHER -> 30

\* The code increments retryIndex without bound. After the step that selects
\* the 30 second cap, further throws keep that delay. The model lumps those
\* later indexes at 5.

VARIABLES phase, stopped, cleanupAttempted, unsubscribes, retryIndex, delay, stopReason, cleanupSignal
vars == <<phase, stopped, cleanupAttempted, unsubscribes, retryIndex, delay, stopReason, cleanupSignal>>

Following == phase \in {"between", "sleeping", "polling"}

Init ==
  /\ phase = "between"
  /\ stopped = FALSE
  /\ cleanupAttempted = FALSE
  /\ unsubscribes = 0
  /\ retryIndex = 0
  /\ delay = PollInterval
  /\ stopReason = "running"
  /\ cleanupSignal = FALSE

\* while (running) then interruptibleSleep. Listeners are already registered.
\* stop() is not enabled until an await.
BeginSleep ==
  /\ phase = "between"
  /\ stopped = FALSE
  /\ phase' = "sleeping"
  /\ UNCHANGED <<stopped, cleanupAttempted, unsubscribes, retryIndex, delay, stopReason, cleanupSignal>>

\* context.sleep resolved and the abort flag is clear. The next await is
\* client.execute("get_notifications").
SleepFinished ==
  /\ phase = "sleeping"
  /\ stopped = FALSE
  /\ phase' = "polling"
  /\ UNCHANGED <<stopped, cleanupAttempted, unsubscribes, retryIndex, delay, stopReason, cleanupSignal>>

\* context.sleep rejected and stop() did not abort it. The outer catch calls
\* renderConnectionError, which is synchronous, then finally runs.
SleepFailed ==
  /\ phase = "sleeping"
  /\ stopped = FALSE
  /\ phase' = "leaving"
  /\ stopReason' = "sleep_failed"
  /\ UNCHANGED <<stopped, cleanupAttempted, unsubscribes, retryIndex, delay, cleanupSignal>>

\* SIGINT or SIGTERM during context.sleep. stop() sets running = false and
\* wake() aborts the sleep. interruptibleSleep returns false and the loop breaks.
SignalDuringSleep ==
  /\ phase = "sleeping"
  /\ stopped = FALSE
  /\ stopped' = TRUE
  /\ phase' = "leaving"
  /\ stopReason' = "signal"
  /\ UNCHANGED <<cleanupAttempted, unsubscribes, retryIndex, delay, cleanupSignal>>

\* get_notifications returned, running is still true, and response.error is
\* absent. retryIndex is cleared. throttledRetryAfter returned undefined.
GetNotificationsOk ==
  /\ phase = "polling"
  /\ stopped = FALSE
  /\ phase' = "between"
  /\ retryIndex' = 0
  /\ delay' = PollInterval
  /\ UNCHANGED <<stopped, cleanupAttempted, unsubscribes, stopReason, cleanupSignal>>

\* Same return, and throttledRetryAfter returned a wait.
GetNotificationsThrottled ==
  /\ phase = "polling"
  /\ stopped = FALSE
  /\ phase' = "between"
  /\ retryIndex' = 0
  /\ delay' = ThrottleWait
  /\ UNCHANGED <<stopped, cleanupAttempted, unsubscribes, stopReason, cleanupSignal>>

\* get_notifications threw, and running is still true. The catch changes only
\* the delay, then continues. UnsubscribeOnPollThrow is that catch also calling
\* bestEffortUnsubscribe. The code does not.
GetNotificationsFails ==
  /\ phase = "polling"
  /\ stopped = FALSE
  /\ phase' = "between"
  /\ delay' = IF retryIndex >= 4 THEN 30 ELSE RetrySlot(retryIndex)
  /\ retryIndex' = IF retryIndex >= 5 THEN 5 ELSE retryIndex + 1
  /\ IF UnsubscribeOnPollThrow
       THEN unsubscribes' = IF unsubscribes >= 2 THEN 2 ELSE unsubscribes + 1
       ELSE UNCHANGED unsubscribes
  /\ UNCHANGED <<stopped, cleanupAttempted, stopReason, cleanupSignal>>

\* get_notifications returned response.error while running. retryIndex is
\* cleared first. renderResponse for this follow path returns without another
\* await, then the loop breaks. The delay is left as it was.
GetNotificationsError ==
  /\ phase = "polling"
  /\ stopped = FALSE
  /\ phase' = "leaving"
  /\ stopReason' = "api_error"
  /\ retryIndex' = 0
  /\ UNCHANGED <<stopped, cleanupAttempted, unsubscribes, delay, cleanupSignal>>

\* SIGINT or SIGTERM while get_notifications is in flight. stop() sets
\* running = false. wake is already cleared, so the poll is not aborted.
\* The unsubscribe is not sent until the poll settles.
SignalDuringPoll ==
  /\ phase = "polling"
  /\ stopped = FALSE
  /\ stopped' = TRUE
  /\ UNCHANGED <<phase, cleanupAttempted, unsubscribes, retryIndex, delay, stopReason, cleanupSignal>>

\* The poll then throws or returns. if (!running) break comes before the
\* delay update and before the response.error check.
GetNotificationsAfterStop ==
  /\ phase = "polling"
  /\ stopped = TRUE
  /\ phase' = "leaving"
  /\ stopReason' = "signal"
  /\ UNCHANGED <<stopped, cleanupAttempted, unsubscribes, retryIndex, delay, cleanupSignal>>

\* finally. CleanupGuard is `if (!cleanupAttempted)`. The flag is set, then
\* bestEffortUnsubscribe calls client.execute(unsubscribe_market) or
\* client.execute(unsubscribe_observation). One site. The command name was
\* chosen before the loop.
BestEffortUnsubscribe ==
  /\ phase = "leaving"
  /\ IF CleanupGuard /\ cleanupAttempted
       THEN /\ phase' = "done"
            /\ UNCHANGED <<stopped, cleanupAttempted, unsubscribes, retryIndex, delay, stopReason, cleanupSignal>>
       ELSE /\ phase' = "cleaning"
            /\ cleanupAttempted' = TRUE
            /\ unsubscribes' = IF unsubscribes >= 2 THEN 2 ELSE unsubscribes + 1
            /\ UNCHANGED <<stopped, retryIndex, delay, stopReason, cleanupSignal>>

\* bestEffortUnsubscribe catches a throw and an error response. It does not
\* call execute again. Listeners are removed after the await.
UnsubscribeFinished ==
  /\ phase = "cleaning"
  /\ phase' = "done"
  /\ UNCHANGED <<stopped, cleanupAttempted, unsubscribes, retryIndex, delay, stopReason, cleanupSignal>>

\* SIGINT or SIGTERM during that execute. stop() is a no-op once running is
\* already false, so this is enabled only when the loop ended for another reason.
SignalDuringCleanup ==
  /\ phase = "cleaning"
  /\ stopped = FALSE
  /\ stopped' = TRUE
  /\ cleanupSignal' = TRUE
  /\ UNCHANGED <<phase, cleanupAttempted, unsubscribes, retryIndex, delay, stopReason>>

Done ==
  /\ phase = "done"
  /\ UNCHANGED vars

Next ==
  \/ BeginSleep
  \/ SleepFinished
  \/ SleepFailed
  \/ SignalDuringSleep
  \/ GetNotificationsOk
  \/ GetNotificationsThrottled
  \/ GetNotificationsFails
  \/ GetNotificationsError
  \/ SignalDuringPoll
  \/ GetNotificationsAfterStop
  \/ BestEffortUnsubscribe
  \/ UnsubscribeFinished
  \/ SignalDuringCleanup
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in {"between", "sleeping", "polling", "leaving", "cleaning", "done"}
  /\ stopped \in BOOLEAN
  /\ cleanupAttempted \in BOOLEAN
  /\ unsubscribes \in 0..2
  /\ retryIndex \in 0..5
  /\ delay \in {2, 4, 8, 16, 30, PollInterval, ThrottleWait}
  /\ stopReason \in {"running", "signal", "api_error", "sleep_failed"}
  /\ cleanupSignal \in BOOLEAN

\* A thrown get_notifications does not call bestEffortUnsubscribe. The loop
\* is still following, so the unsubscribe count is still 0.
NoUnsubscribeWhileFollowing ==
  (Following /\ stopReason = "running") => unsubscribes = 0

\* Leaving the loop for Ctrl+C, response.error, or a sleep rejection produces
\* one unsubscribe, and finally is the only call. The count is still 0 until
\* bestEffortUnsubscribe runs, then 1.
ExactlyOneUnsubscribe ==
  /\ (phase = "leaving") => unsubscribes = 0 /\ stopReason \in {"signal", "api_error", "sleep_failed"}
  /\ (phase = "cleaning") => unsubscribes = 1 /\ stopReason \in {"signal", "api_error", "sleep_failed"}
  /\ (phase = "done") => unsubscribes = 1 /\ stopReason \in {"signal", "api_error", "sleep_failed"}

\* While the loop will sleep again, the delay is the poll interval, the
\* throttle wait, or RETRY_DELAYS_SECONDS at this retryIndex.
DelayMatches ==
  \/ ~Following
  \/ /\ retryIndex = 0
     /\ delay \in {PollInterval, ThrottleWait}
  \/ /\ retryIndex \in 1..5
     /\ delay = RetrySlot(retryIndex - 1)

=============================================================================
