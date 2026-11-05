const HOLDING = new Set(["dir", "chmod_dir", "opening", "writing", "syncing", "closing", "renaming"]);

function has(file, key) {
  return Array.isArray(file) && file.includes(key);
}

function sameKeys(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  return a.length === b.length && a.every((key) => b.includes(key));
}

function role(phase) {
  if (phase === "locked") return "locked";
  if (phase === "start" || phase === "chmod_cache" || phase === "reading") return "waiting";
  if (HOLDING.has(phase)) return "holding";
  return "renamed";
}

function who(from, to) {
  if (from.phase.ship !== to.phase.ship) return "ship";
  if (from.phase.poi !== to.phase.poi) return "poi";
  return "";
}

function saveName(id) {
  if (id === "ship") return "The list_ships save";
  if (id === "poi") return "The get_system save";
  return "A save";
}

function cacheText(v) {
  const ship = has(v.file, "ship");
  const poi = has(v.file, "poi");
  if (!v.fileExists) return "The id cache is not there yet";
  if (ship && poi) return "The id cache has the ship and the poi";
  if (ship) return "The id cache has the ship";
  if (poi) return "The id cache has the poi";
  return "The id cache is empty";
}

function picture(v) {
  const shipDone = v.phase.ship === "done";
  const poiDone = v.phase.poi === "done";
  const ship = has(v.file, "ship");
  const poi = has(v.file, "poi");
  if (shipDone && poiDone) {
    return ship && poi
      ? "Both saves finished. The ship and the poi are in the cache"
      : "Both saves finished. A saved id is gone";
  }
  const shipRole = role(v.phase.ship);
  const poiRole = role(v.phase.poi);
  if (shipRole === "locked" && poiRole === "locked") return `${cacheText(v)}. Both saves hold the id-cache lock`;
  if (shipRole === "locked") {
    const other =
      poiRole === "waiting"
        ? "The get_system save is waiting"
        : poiRole === "holding"
          ? "The get_system save is holding its read"
          : "The get_system save has renamed";
    return `${cacheText(v)}. The list_ships save holds the id-cache lock and has not read yet. ${other}`;
  }
  if (poiRole === "locked") {
    const other =
      shipRole === "waiting"
        ? "The list_ships save is waiting"
        : shipRole === "holding"
          ? "The list_ships save is holding its read"
          : "The list_ships save has renamed";
    return `${cacheText(v)}. The get_system save holds the id-cache lock and has not read yet. ${other}`;
  }
  const shipStale = shipRole === "holding" && !sameKeys(v.snapshot.ship, v.file);
  const poiStale = poiRole === "holding" && !sameKeys(v.snapshot.poi, v.file);
  if (shipStale && poiStale) return `${cacheText(v)}. Both saves are holding a read that is missing an id`;
  if (shipStale) return `${cacheText(v)}. The list_ships save is holding a read that is missing an id`;
  if (poiStale) return `${cacheText(v)}. The get_system save is holding a read that is missing an id`;
  if (shipRole === "holding" && poiRole === "holding") return `${cacheText(v)}. Both saves are holding the read they just took`;
  if (shipRole === "holding" && poiRole === "waiting")
    return `${cacheText(v)}. The list_ships save is holding its read. The get_system save is waiting`;
  if (poiRole === "holding" && shipRole === "waiting")
    return `${cacheText(v)}. The get_system save is holding its read. The list_ships save is waiting`;
  if (shipRole === "renamed" && poiRole === "waiting") return `${cacheText(v)}. The get_system save has not read it yet`;
  if (poiRole === "renamed" && shipRole === "waiting") return `${cacheText(v)}. The list_ships save has not read it yet`;
  if (shipRole === "holding" && poiRole === "renamed")
    return `${cacheText(v)}. The list_ships save is holding its read. The get_system save has renamed`;
  if (poiRole === "holding" && shipRole === "renamed")
    return `${cacheText(v)}. The get_system save is holding its read. The list_ships save has renamed`;
  if (shipRole === "waiting" && poiRole === "waiting") return `${cacheText(v)}. Both saves are waiting`;
  return `${cacheText(v)}. The list_ships save has renamed. The get_system save has renamed`;
}

export const title = "Two saves of the id cache";

export const state = (v) => picture(v);

export const step = (action, from, to) => {
  const name = String(action).split("(")[0];
  const id = who(from, to);
  const label = saveName(id);
  if (name === "Done") return null;
  if (name === "Acquire") return `${label} takes the id-cache lock`;
  if (name === "Release") return `${label} releases the id-cache lock`;
  if (name === "Exists") {
    return to.phase[id] === "dir" ? `${label} sees that the id cache is not there yet` : `${label} sees that the id cache is already there`;
  }
  if (name === "SkipLoad") return `${label} does not read the id cache`;
  if (name === "ChmodCache") return `${label} sets the id cache's permissions before reading it`;
  if (name === "Read") return `${label} reads the id cache`;
  if (name === "DirExists") return `${label} sees that the cache directory is there`;
  if (name === "ChmodDir") return `${label} sets the cache directory's permissions`;
  if (name === "OpenTemp") return `${label} opens its private temp file`;
  if (name === "WriteTemp") return `${label} writes the merged ids into that temp file`;
  if (name === "SyncTemp") return `${label} syncs that temp file`;
  if (name === "CloseTemp") return `${label} closes that temp file`;
  if (name === "Rename") return `${label} renames its temp file onto the id cache`;
  if (name === "ChmodFinal") return `${label} sets the id cache's permissions after the rename`;
  return name;
};

export const group = (v) => {
  const text = picture(v);
  if (text === "Both saves finished. A saved id is gone") return "lost";
  if (text === "Both saves finished. The ship and the poi are in the cache") return "kept";
  return "working";
};

export const colors = { lost: "orange", kept: "teal", working: "blue" };
