function picture(v) {
  const following = v.phase === "between" || v.phase === "sleeping" || v.phase === "polling";
  if (v.unsubscribes > 1) return "Unsubscribed more than once";
  if (v.unsubscribes > 0 && following) return "Unsubscribed while still following";
  if (v.phase === "done" && v.unsubscribes === 0) return "Stopped without unsubscribing";
  if (v.phase === "done") return "Unsubscribed once";
  if (v.phase === "leaving") return "The follow loop has stopped";
  if (v.phase === "cleaning" && v.cleanupSignal) return "Ctrl+C while the subscription is being removed";
  if (v.phase === "cleaning") return "Removing the subscription";
  if (v.phase === "polling" && v.stopped) return "Ctrl+C during the notification poll";
  if (v.phase === "polling") return "Polling notifications";
  if (v.retryIndex === 0 && v.delay === 7) return "Waiting out the server's throttle";
  if (v.retryIndex === 0 && v.delay === 10) return "Waiting 10s for the next poll";
  if (v.delay === 30) return "Waiting 30s after a failed poll";
  return "Waiting out a failed poll";
}

export const title = "Following a market or observation subscription";

export const state = (v) => picture(v);

export const step = (action, from, to) => {
  const head = String(action).split("(")[0];
  const name = head.split("!").pop();
  if (name === "Done") return null;
  if (name === "BeginSleep") return "the wait starts";
  if (name === "SleepFailed") return "the wait fails";
  if (name === "SleepFinished") return "the wait ends";
  if (name === "SignalDuringSleep") return "you press Ctrl+C [during the wait]";
  if (name === "GetNotificationsOk") return "the notification poll succeeds";
  if (name === "GetNotificationsThrottled") return "the notification poll succeeds and the server asks for a wait";
  if (name === "GetNotificationsFails") {
    if (to.unsubscribes > from.unsubscribes) return "the notification poll fails and the subscription is removed";
    if (to.delay === 30) return "the notification poll fails [the next wait is 30s]";
    return "the notification poll fails";
  }
  if (name === "GetNotificationsError") return "the notification poll returns an error";
  if (name === "SignalDuringPoll") return "you press Ctrl+C [during the poll]";
  if (name === "GetNotificationsAfterStop") return "the notification poll finishes [after you press Ctrl+C]";
  if (name === "BestEffortUnsubscribe") return "the subscription is removed";
  if (name === "UnsubscribeFinished") return "cleanup finishes";
  if (name === "SignalDuringCleanup") return "you press Ctrl+C [while the subscription is being removed]";
  return null;
};

export const group = (v) => {
  const text = picture(v);
  if (text === "Unsubscribed once") return "done";
  if (
    text === "Unsubscribed more than once" ||
    text === "Unsubscribed while still following" ||
    text === "Stopped without unsubscribing"
  ) {
    return "broken";
  }
  if (
    text === "The follow loop has stopped" ||
    text === "Removing the subscription" ||
    text === "Ctrl+C while the subscription is being removed" ||
    text === "Ctrl+C during the notification poll"
  ) {
    return "stopping";
  }
  return "following";
};

export const colors = { following: "blue", stopping: "orange", done: "teal", broken: "pink" };
