function role(phase) {
  if (phase === "holding" || phase === "loaded" || phase === "releasing" || phase === "dropping") {
    return "writing config.json";
  }
  if (phase === "claiming" || phase === "rereading" || phase === "unlinking" || phase === "unclaiming" || phase === "clearing") {
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
  if (v.lock === "stale") return "A stale lock is waiting";
  if (v.lock === "a") return "The profile save holds the lock";
  if (v.lock === "b") return "The user-agent save holds the lock";
  return "A new process holds the old id";
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
  const reused = v.pidReused ? "The old process id is in use again. " : "";
  return `${reused}${lockSentence(v)}. The profile save is ${role(profile)}. The user-agent save is ${role(agent)}.`;
}

export const title = "Two saves of CLI settings";

export const state = (v) => picture(v);

export const step = (action, from, to) => {
  const name = String(action).split("(")[0];
  const profileMoved = from.phase.a !== to.phase.a;
  const agentMoved = from.phase.b !== to.phase.b;
  const who = profileMoved ? "The profile save" : agentMoved ? "The user-agent save" : "A save";
  if (name === "TryOpen") {
    return to.phase.a === "holding" || to.phase.b === "holding"
      ? `${who} takes the lock`
      : `${who} finds the lock already there`;
  }
  if (name === "ReadLock") return `${who} reads the lock file`;
  if (name === "Judge") {
    if (to.phase.a === "claiming" || to.phase.b === "claiming") return `${who} sees that the lock owner is gone`;
    if (from.lock === "none") return `${who} sees that the lock is already gone`;
    return `${who} sees that the lock owner is still running`;
  }
  if (name === "Claim") {
    return to.phase.a === "rereading" || to.phase.b === "rereading"
      ? `${who} takes the break file`
      : `${who} leaves the break file`;
  }
  if (name === "Reread") {
    return to.phase.a === "unlinking" || to.phase.b === "unlinking"
      ? `${who} still sees the stale lock`
      : `${who} leaves the lock in place`;
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
  if (name === "Crash") return `${who} exits and leaves the lock behind`;
  if (name === "KernelReissue") return "The exited process id is given to a new spacemolt";
  if (name === "IntruderAcquire") return "That new spacemolt takes the lock";
  if (name === "IntruderRead") return "That new spacemolt reads its lock";
  if (name === "IntruderUnlink") return "That new spacemolt drops the lock";
  if (name === "Done") return "Both saves have stopped";
  return name;
};

export const group = (v) => {
  const text = picture(v);
  if (text === "Two saves overlap" || text === "One setting was lost") return "overlap";
  if (text === "Both settings saved") return "saved";
  return "working";
};

export const colors = { overlap: "orange", saved: "teal", working: "blue" };
