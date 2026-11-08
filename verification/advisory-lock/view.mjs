function critical(phase) {
  return phase === "holding" || phase === "loaded" || phase === "releasing" || phase === "dropping";
}

function criticalCount(v) {
  return (critical(v.phase.a) ? 1 : 0) + (critical(v.phase.b) ? 1 : 0) + (v.intruder ? 1 : 0);
}

function mismatch(v) {
  const bad = (p) => v.phase[p] === "unlinking" && v.lock !== v.observed[p];
  return bad("a") || bad("b");
}

function bothDone(v) {
  return v.phase.a === "done" && v.phase.b === "done";
}

function has(set, item) {
  return Array.isArray(set) && set.includes(item);
}

function sessionOk(v) {
  return v.session.password === true && v.session.expiry === 2;
}

function cacheOk(v) {
  const shared = v.cache.shared;
  return (
    v.cache.ship === true &&
    v.cache.poi === true &&
    shared.present === true &&
    shared.name === "alpha" &&
    has(shared.ctx, "a") &&
    has(shared.ctx, "b") &&
    shared.ctx.length === 2
  );
}

function crashedLeftEmpty(v) {
  return v.lock === "empty" && (v.phase.a === "crashed" || v.phase.b === "crashed");
}

function publishing(v) {
  return v.phase.a === "publishing" || v.phase.b === "publishing" || v.intruderPhase === "publishing";
}

function pastEntry(phase) {
  return phase === "loaded" || phase === "releasing" || phase === "dropping";
}

function picture(v) {
  const overlap = criticalCount(v) > 1;
  const changed = mismatch(v);
  if (overlap && changed) return "Two saves overlap while a delete is still pending";
  if (overlap && (pastEntry(v.phase.a) || pastEntry(v.phase.b))) {
    return "Two saves are in the critical section after one has read";
  }
  if (overlap) return "Two saves are in the critical section";
  if (changed && criticalCount(v) === 1) {
    return "One save is in the critical section while the other is about to delete its lock";
  }
  if (changed && !publishing(v) && v.lock === "none") return "A save is about to delete a lock that is already gone";
  if (changed) return "A save is about to delete a lock that changed";
  if (bothDone(v)) {
    const session = sessionOk(v);
    const cache = cacheOk(v);
    if (session && cache) return "Both saves kept the password, the newer expiry, and the cache";
    if (!session && !cache) return "Both saves finished and both files lost an update";
    if (!session) return "Both saves finished and the session file lost an update";
    return "Both saves finished and the id cache lost an update";
  }
  if (v.intruder) return "A new process holds the old id";
  if (criticalCount(v) === 1) return "One save is in the critical section";
  if (v.phase.a === "unlinking" || v.phase.b === "unlinking") return "A save is about to delete the lock it saw";
  if (v.lock === "empty" && v.age === "old" && crashedLeftEmpty(v)) return "A crashed save left an old empty lock";
  if (v.lock === "empty" && v.age === "old") return "The empty lock is old";
  if (crashedLeftEmpty(v)) return "A crashed save left an empty lock";
  if (v.lock === "empty") return "The lock file is empty";
  if (v.lease === "a" || v.lease === "b") return "A save holds the break file";
  if (v.phase.a === "crashed" || v.phase.b === "crashed") return "A save exited and left the lock";
  if (v.phase.a === "done" || v.phase.b === "done") return "One save has finished";
  if (
    v.phase.a === "reading" ||
    v.phase.a === "judging" ||
    v.phase.a === "claiming" ||
    v.phase.a === "rereading" ||
    v.phase.a === "restatting" ||
    v.phase.a === "unclaiming" ||
    v.phase.a === "clearing" ||
    v.phase.b === "reading" ||
    v.phase.b === "judging" ||
    v.phase.b === "claiming" ||
    v.phase.b === "rereading" ||
    v.phase.b === "restatting" ||
    v.phase.b === "unclaiming" ||
    v.phase.b === "clearing"
  ) {
    return "A save is looking at the lock";
  }
  if (v.lock === "none") return "The lock is free";
  if (v.pidReused) return "The stale lock belongs to a reused id";
  return "A stale lock is waiting";
}

export const title = "Two saves sharing an advisory lock";

export const state = (v) => picture(v);

export const step = (action, from, to) => {
  const name = String(action).split("(")[0].split(" ")[0];
  const loginMoved = from.phase.a !== to.phase.a;
  const refreshMoved = from.phase.b !== to.phase.b;
  const who = loginMoved ? "The login save" : refreshMoved ? "The session refresh" : "A save";
  if (name === "OpenWx") {
    const created =
      (from.phase.a !== "publishing" && to.phase.a === "publishing") ||
      (from.phase.b !== "publishing" && to.phase.b === "publishing");
    return created ? `${who} creates an empty lock file` : `${who} finds the lock already there`;
  }
  if (name === "WriteToken") {
    const linked = to.lock === "a" || to.lock === "b";
    if (!linked) return `${who} writes its token into a file that is already gone`;
    const other = loginMoved ? from.phase.b : from.phase.a;
    if (other === "loaded" || other === "releasing" || other === "dropping") {
      return `${who} writes its token while the other save has already read`;
    }
    return `${who} writes its token`;
  }
  if (name === "ReadLock") return `${who} reads the lock file`;
  if (name === "Judge") {
    const claiming = (loginMoved && to.phase.a === "claiming") || (refreshMoved && to.phase.b === "claiming");
    const seen = loginMoved ? from.observed.a : from.observed.b;
    if (claiming) {
      return seen === "empty" ? `${who} sees an old empty lock` : `${who} decides to remove the lock`;
    }
    if (from.lock === "none") return `${who} sees that the lock is already gone`;
    if (seen === "empty") return `${who} leaves the empty lock`;
    return `${who} sees that the lock owner is still running`;
  }
  if (name === "Claim") return `${who} takes the break file`;
  if (name === "Reread") {
    const unlinking = (loginMoved && to.phase.a === "unlinking") || (refreshMoved && to.phase.b === "unlinking");
    const restatting = (loginMoved && to.phase.a === "restatting") || (refreshMoved && to.phase.b === "restatting");
    if (unlinking) return `${who} still sees the lock it means to delete`;
    if (restatting) return `${who} reads the empty lock again`;
    if (from.lock === "none") return `${who} sees that the lock is already gone`;
    const seen = loginMoved ? from.observed.a : from.observed.b;
    if (from.lock !== seen) return `${who} sees that the lock changed`;
    return `${who} leaves the lock in place`;
  }
  if (name === "SecondStat") {
    const unlinking = (loginMoved && to.phase.a === "unlinking") || (refreshMoved && to.phase.b === "unlinking");
    return unlinking ? `${who} sees an old empty lock` : `${who} leaves the new empty lock`;
  }
  if (name === "Unlink") return `${who} deletes the lock`;
  if (name === "DropClaimRead") return `${who} reads the break file`;
  if (name === "DropClaimUnlink") return `${who} drops the break file`;
  if (name === "Load") return `${who} reads the session and the id cache`;
  if (name === "Save") return `${who} writes its session and its cache entries`;
  if (name === "ReleaseRead") {
    const dropping = (loginMoved && to.phase.a === "dropping") || (refreshMoved && to.phase.b === "dropping");
    if (dropping) return `${who} still holds the lock`;
    if (from.lock === "none") return `${who} finds the lock already gone`;
    return `${who} leaves a replaced lock`;
  }
  if (name === "ReleaseUnlink") return `${who} drops the lock`;
  if (name === "Crash") {
    return from.phase.a === "publishing" || from.phase.b === "publishing"
      ? `${who} exits and leaves an empty lock`
      : `${who} exits and leaves the lock behind`;
  }
  if (name === "KernelReissue") return "The exited process id is given to a new process";
  if (name === "IntruderOpen") return "That new process creates an empty lock";
  if (name === "IntruderWrite") {
    return to.lock === "reused"
      ? "That new process writes its token"
      : "That new process writes its token into a file that is already gone";
  }
  if (name === "IntruderRead") {
    return to.intruderPhase === "dropping"
      ? "That new process still holds the lock"
      : "That new process leaves a replaced lock";
  }
  if (name === "IntruderUnlink") {
    return to.lock === "none" && from.lock !== "none"
      ? "That new process drops the lock"
      : "That new process leaves a replaced lock";
  }
  if (name === "AgeEmpty") return "The empty lock becomes old";
  if (name === "Done") return "Both saves have stopped";
  return name;
};

export const group = (v) => {
  const text = picture(v);
  if (
    text === "Two saves are in the critical section" ||
    text === "Two saves are in the critical section after one has read" ||
    text === "Two saves overlap while a delete is still pending"
  ) {
    return "overlap";
  }
  if (
    text === "A save is about to delete a lock that changed" ||
    text === "A save is about to delete a lock that is already gone" ||
    text === "One save is in the critical section while the other is about to delete its lock"
  ) {
    return "race";
  }
  if (text.startsWith("Both saves finished and")) return "lost";
  if (text.startsWith("Both saves kept")) return "saved";
  return "working";
};

export const colors = {
  overlap: "orange",
  race: "yellow",
  lost: "pink",
  saved: "teal",
  working: "blue",
};
