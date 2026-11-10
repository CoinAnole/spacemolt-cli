---
kind: contradiction
gameserver: 0.678.0
---

# Changelog says a cargo scan ends field jobs

`spacemolt-docs/changelog.json`, release 0.678.0:

> Escrowed inputs count as cargo: a destroyed ship drops them to the wreck, a capture takes them with the ship, a boarding plunder can take them, customs can seize contraband among them, and cargo scans show them as ordinary cargo. Each of these ends the jobs involved and writes `crafting.lost` to `get_action_log`.

`spacemolt-docs/openapi.json` `paths["/api/v2/spacemolt/craft"].post.description` (`info.x-gameserver-version` `v0.679.1`):

> If the ship is destroyed, its escrowed inputs drop to the wreck like cargo and the jobs are lost; if it is captured, the inputs return to its hold and go with it. Escrowed inputs count as cargo: a boarding plunder ends all of the ship's field jobs and returns their inputs to the hold before the boarders take cargo, a customs seizure ends the jobs holding contraband the same way, and a cargo scan of the ship shows them as ordinary cargo. Each job ended this way writes a crafting.lost action-log entry per input.

The changelog says a cargo scan ends the jobs and writes `crafting.lost`. The operation description says a cargo scan shows the inputs as ordinary cargo. It does not say the scan ends the job. It also does not say a capture ends the jobs. Plunder and a customs seizure are the endings that sentence names before `crafting.lost`.

Make the changelog list match the operation description: a cargo scan does not end the jobs, and a capture is not described as ending them, unless the operation description is wrong and should say those two end the jobs and write `crafting.lost`. Do not invent an error code.
