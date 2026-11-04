function role(phase) {
  if (phase === "holding" || phase === "loaded" || phase === "releasing") return "writing config.json";
  if (phase === "rereading") return "about to delete the lock";
  if (phase === "judging" || phase === "reading") return "looking at the lock";
  if (phase === "done") return "finished";
  if (phase === "crashed") return "exited";
  return "waiting";
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
  const lock = v.intruder
    ? v.lock === "dead"
      ? "A new process holds the old id"
      : "The new process is still writing after its lock was deleted"
    : v.lock === "none"
      ? "The lock is free"
      : v.lock === "dead"
        ? "A stale lock is waiting"
        : v.lock === "a"
          ? "The profile save holds the lock"
          : "The user-agent save holds the lock";
  return `${reused}${lock}. The profile save is ${role(profile)}. The user-agent save is ${role(agent)}.`;
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
    return to.phase.a === "rereading" || to.phase.b === "rereading"
      ? `${who} sees that the lock owner is gone`
      : `${who} sees that the lock owner is still running`;
  }
  if (name === "Reread") {
    return from.lock !== "none" && to.lock === "none" ? `${who} deletes the lock` : `${who} leaves the lock in place`;
  }
  if (name === "Load") return `${who} reads config.json`;
  if (name === "Save") return `${who} writes its setting`;
  if (name === "Release") return `${who} drops the lock`;
  if (name === "Crash") return `${who} exits and leaves the lock behind`;
  if (name === "KernelReissue") return "The exited process id is given to a new spacemolt";
  if (name === "IntruderAcquire") return "That new spacemolt takes the lock";
  if (name === "IntruderRelease") return "That new spacemolt drops the lock";
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
