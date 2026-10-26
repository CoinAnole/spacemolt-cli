---
kind: contradiction
gameserver: 0.648.3
---

# Station facility copy limit disagrees with the one-type cap

`spacemolt-docs/docs/stations.md`, heading "Facility Categories":

> A faction can hold at most one facility of each type per station (Storage Extensions are the exception, up to 10).

`spacemolt-docs/changelog.json`, release 0.648.3:

> Station infrastructure with a flat on/off effect, such as The Long Watch and the Damage Control Station, is now limited to one per station, like dining and leisure facilities. A second copy only added upkeep.

> Power plants, life support, capacitor banks, and fuel tank expansions still stack.

The stations sentence says Storage Extensions are the only exception to one facility of each type. The changelog says those four infrastructure classes still stack, so a second copy is still allowed. Change the stations sentence so it does not call Storage Extensions the only exception.

`spacemolt-docs/guides/factions.md`, heading "Who pays, and what it costs to keep", limits the rule to one facility of each service type and already names Storage Extensions and faction shipyard slots. That sentence is not the conflicting one.
