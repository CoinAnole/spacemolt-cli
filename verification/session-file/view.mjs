function newest(v) {
  return v.fileExpiry === v.clock;
}

function settled(v) {
  return v.login === "done" && (v.other === "done" || v.other === "skipped");
}

function routeHoldsNoPassword(v) {
  return v.other === "held" && v.routeSnapPassword === false;
}

export const title = "Two commands share one session file";

export const state = (v) => {
  if (settled(v)) {
    if (!v.filePassword && !newest(v)) return "The password is gone and the expiry is older";
    if (!v.filePassword) return "The password is gone";
    if (!newest(v)) return "The password is kept and the expiry is older";
    return "The password and the newest expiry are both kept";
  }
  if (v.login === "start" && v.other === "start") return "Both commands are waiting";
  if (v.login === "created" && v.other === "start" && !v.filePassword && newest(v))
    return "Login has written a new session with no password";
  if (routeHoldsNoPassword(v) && v.login === "created" && !v.filePassword && newest(v))
    return "The route command is holding a session with no password";
  if (routeHoldsNoPassword(v) && v.login === "sent" && !v.filePassword && newest(v))
    return "The route command is holding a session with no password, after the login response";
  if (routeHoldsNoPassword(v) && v.login === "loaded" && !v.filePassword && newest(v))
    return "The route command is holding a session with no password. Login has read the file";
  if (routeHoldsNoPassword(v) && v.login === "done" && v.filePassword && newest(v))
    return "Login has saved the password. The route command is still holding a session with no password";
  if (v.login === "loaded" && v.other === "done" && v.mode === "refresh" && !v.filePassword && newest(v))
    return "The route command wrote a newer expiry and no password. Login has not saved yet";
  if (!v.filePassword) return "The file has no password";
  if (!newest(v)) return "The file has an older expiry";
  return "The file has the password and the newest expiry";
};

export const step = (action, from, to) => {
  const name = String(action).split("(")[0];
  if (name === "Done") return null;
  if (name === "LoginCreate") return "Login writes a new session with no password";
  if (name === "LoginSend") return "Login writes the login response, still with no password";
  if (name === "PersistLoad") return "Login reads the session file";
  if (name === "PersistSave") {
    return to.filePassword
      ? "Login writes the password onto the session it read"
      : "Login writes the session it read, without the password";
  }
  if (name === "GetSession") {
    return to.routeSnapPassword
      ? "The route command reads the session file and sees the password"
      : "The route command reads the session file and sees no password";
  }
  if (name === "RouteSend") {
    return to.filePassword
      ? "The route command writes a new expiry and keeps the password"
      : "The route command writes a new expiry and no password";
  }
  if (name === "RecoverLoad") {
    return to.other === "skipped"
      ? "Recovery reads the session file, finds no password, and stops"
      : "Recovery reads the saved password";
  }
  if (name === "RecoverCreate") return "Recovery writes a new session with no password";
  if (name === "RecoverRestore") return "Recovery writes that session with the password put back";
  if (name === "RecoverLogin") return "Recovery writes the re-login expiry and the password";
  return null;
};

export const group = (v) => {
  const label = state(v);
  if (label === "The password is gone" || label === "The password is gone and the expiry is older") return "lost";
  if (label === "The password is kept and the expiry is older" || label === "The file has an older expiry")
    return "stale";
  if (label === "The password and the newest expiry are both kept") return "kept";
  if (!v.filePassword) return "gap";
  return "working";
};

export const colors = {
  lost: "orange",
  stale: "yellow",
  kept: "teal",
  gap: "pink",
  working: "blue",
};
