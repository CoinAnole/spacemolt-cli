function role(phase) {
  if (phase === "publishing") return "publishing the lock";
  if (phase === "holding" || phase === "loaded" || phase === "releasing" || phase === "dropping") {
    return "writing config.json";
  }
  if (
    phase === "claiming" ||
    phase === "rereading" ||
    phase === "restatting" ||
    phase === "unlinking" ||
    phase === "unclaiming" ||
    phase === "clearing"
  ) {
    return "about to delete the lock";
  }
  if (phase === "judging" || phase === "reading") return "looking at the lock";
  if (phase === "done") return "finished";
  if (phase === "crashed") return "exited";
  return "waiting";
}

function lockSentence(v) {
  if (v.intruder) {
    if (v.lock === "reused" || v.lock === "stale") return "A new process holds the old id";
    return "The new process is still writing after its lock was deleted";
  }
  if (v.lock === "none") return "The lock is free";
  if (v.lock === "empty") return "The lock file is empty";
  if (v.lock === "stale") return "A stale lock is waiting";
  if (v.lock === "a") return "The profile save holds the lock";
  if (v.lock === "b") return "The user-agent save holds the lock";
  return "A new process holds the old id";
}

function emptySentence(v) {
  const profile = v.phase.a;
  const agent = v.phase.b;
  if (profile === "publishing" && agent === "publishing") return "Both saves are publishing an empty lock";
  if (profile === "publishing") return "The lock file is empty. The profile save is still publishing it.";
  if (agent === "publishing") return "The lock file is empty. The user-agent save is still publishing it.";
  if (role(profile) === "writing config.json" || role(agent) === "writing config.json" || v.intruder) {
    return "A save is writing while the lock file is empty";
  }
  if (v.age === "old") return "The empty lock is old enough to remove";
  return "The lock file is empty";
}

function picture(v) {
  const profile = v.phase.a;
  const agent = v.phase.b;
  const overlap =
    (role(profile) === "writing config.json" ? 1 : 0) +
    (role(agent) === "writing config.json" ? 1 : 0) +
    (v.intruder ? 1 : 0);
  if (overlap > 1) return "Two saves overlap";
  const saved = new Set(v.config);
  if (profile === "done" && agent === "done") {
    return saved.has("profile") && saved.has("agent") ? "Both settings saved" : "One setting was lost";
  }
  if (v.lock === "empty") return emptySentence(v);
  const reused = v.pidReused ? "The old process id is in use again. " : "";
  return `${reused}${lockSentence(v)}. The profile save is ${role(profile)}. The user-agent save is ${role(agent)}.`;
}

export const title = "Two saves of CLI settings";

export const state = (v) => picture(v);

export const step = (action, from, to) => {
  const name = String(action).split("(")[0];
  if (name === "Age") return "The empty lock is now old enough to remove";
  const profileMoved = from.phase.a !== to.phase.a;
  const agentMoved = from.phase.b !== to.phase.b;
  const who = profileMoved ? "The profile save" : agentMoved ? "The user-agent save" : "A save";
  if (name === "Open") {
    return to.phase.a === "publishing" || to.phase.b === "publishing"
      ? `${who} creates an empty lock`
      : `${who} finds the lock already there`;
  }
  if (name === "WriteToken") {
    return to.lock === "a" || to.lock === "b"
      ? `${who} fills in the empty lock`
      : `${who} fills in a lock that was already removed`;
  }
  if (name === "FailWrite") return `${who} stops and leaves the lock empty`;
  if (name === "ReadLock") return `${who} reads the lock file`;
  if (name === "Judge") {
    const saw = profileMoved ? from.observed.a : from.observed.b;
    if (to.phase.a === "claiming" || to.phase.b === "claiming") {
      return saw === "empty" ? `${who} sees an old empty lock` : `${who} sees that the lock owner is gone`;
    }
    if (from.lock === "none") return `${who} sees that the lock is already gone`;
    if (from.lock === "empty" && saw === "empty") return `${who} leaves the new empty lock`;
    if (saw === "empty") return `${who} leaves the lock in place`;
    return `${who} sees that the lock owner is still running`;
  }
  if (name === "Claim") {
    return to.phase.a === "rereading" || to.phase.b === "rereading"
      ? `${who} takes the break file`
      : `${who} leaves the break file`;
  }
  if (name === "Reread") {
    if (to.phase.a === "unlinking" || to.phase.b === "unlinking") {
      return from.lock === "empty" ? `${who} still sees the empty lock` : `${who} still sees the stale lock`;
    }
    if (to.phase.a === "restatting" || to.phase.b === "restatting") return `${who} reads the empty lock again`;
    return `${who} leaves the lock in place`;
  }
  if (name === "SecondStat") {
    return to.phase.a === "unlinking" || to.phase.b === "unlinking"
      ? `${who} sees an old empty lock`
      : `${who} leaves the new empty lock`;
  }
  if (name === "Unlink") return `${who} deletes the lock`;
  if (name === "DropClaimRead") return `${who} reads the break file`;
  if (name === "DropClaimUnlink") return `${who} drops the break file`;
  if (name === "Load") return `${who} reads config.json`;
  if (name === "Save") return `${who} writes its setting`;
  if (name === "ReleaseRead") {
    return to.phase.a === "dropping" || to.phase.b === "dropping"
      ? `${who} still holds the lock`
      : `${who} leaves a replaced lock`;
  }
  if (name === "ReleaseUnlink") return `${who} drops the lock`;
  if (name === "Crash") {
    return from.lock === "empty"
      ? `${who} exits and leaves an empty lock`
      : `${who} exits and leaves the lock behind`;
  }
  if (name === "KernelReissue") return "The exited process id is given to a new spacemolt";
  if (name === "IntruderAcquire") return "That new spacemolt takes the lock";
  if (name === "IntruderRead") return "That new spacemolt reads its lock";
  if (name === "IntruderUnlink") return "That new spacemolt drops the lock";
  if (name === "Done") return "Both saves have stopped";
  return name;
};

export const group = (v) => {
  const text = picture(v);
  if (
    text === "Two saves overlap" ||
    text === "One setting was lost" ||
    text === "A save is writing while the lock file is empty" ||
    text === "Both saves are publishing an empty lock"
  ) {
    return "overlap";
  }
  if (text === "Both settings saved") return "saved";
  return "working";
};

export const colors = { overlap: "orange", saved: "teal", working: "blue" };
