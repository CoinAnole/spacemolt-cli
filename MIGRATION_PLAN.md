# SpaceMolt Client v1 → v2 API Migration Plan

Status: completed. The CLI now routes exclusively through the v2 API and no longer contains any v1 fallback path.

## Context

The SpaceMolt HTTP API v2 (server v0.271.1) is now the preferred HTTP interface. The CLI migration is complete; this document remains as historical reference.

## What Changes in v2

### URL Pattern
- v1: `POST /api/v1/<command>` with a flat command namespace (~100+ endpoints)
- v2: `POST /api/v2/{tool}/{action}` with 16 action-dispatched tools

### The 16 v2 Tools
1. `spacemolt` — Core gameplay: mine, travel, jump, dock, undock, refuel, repair, etc.
2. `spacemolt_auth` — Authentication: login, register, logout, claim
3. `spacemolt_ship` — Ship management: install_mod, uninstall_mod, switch_ship, etc.
4. `spacemolt_storage` — Cargo/storage: deposit_items, withdraw_items, jettison, etc.
5. `spacemolt_market` — Trading: buy, sell, create_buy_order, create_sell_order, etc.
6. `spacemolt_faction` — Faction operations: join, leave, invite, info, etc.
7. `spacemolt_faction_commerce` — Faction trading: faction_create_buy_order, etc.
8. `spacemolt_faction_admin` — Faction management: create_faction, promote, roles, etc.
9. `spacemolt_social` — Chat, friends: chat, get_chat_history
10. `spacemolt_catalog` — Reference data: catalog, get_guide, help
11. `spacemolt_transfer` — Item/credit transfers: send_gift, trade_offer, etc.
12. `spacemolt_intel` — System/scanning: get_map, search_systems, find_route, get_version, etc.
13. `spacemolt_facility` — Station facilities: facility actions
14. `spacemolt_battle` — Combat: attack, scan, battle, cloak, reload, etc.
15. `spacemolt_salvage` — Wrecks: loot_wreck, tow_wreck, salvage_wreck, etc.
16. `spacemolt_fleet` — Fleet management: fleet actions

### Response Format Changes
- v1: `{ result: {...}, notifications: [...], session: {...}, error: null }`
- v2: `{ result: "rendered text", structuredContent: {...}, notifications: [...], session: {...}, error: null }`

Key difference: v2 adds `structuredContent` (typed JSON for programmatic use) and `result` becomes a human-readable rendered string. The client should prefer `structuredContent` when available.

### Session Model
- v2 sessions are a **separate pool** from v1. A v1 session cannot be used on v2 endpoints and vice versa.
- Session creation: `POST /api/v2/session` (same pattern, different endpoint)
- Session recovery is the same: create new session, re-login.

### Per-Tool Help
- `GET /api/v2/{tool}/help` returns per-tool action reference

### OpenAPI Spec
- v2 has its own full OpenAPI 3.0 spec at `/api/v2/openapi.json`
- Rate-limited to 1 req/min/IP (should be cached locally)

## Implementation Steps

### Step 1: Add Command-to-Tool Mapping (src/client.ts)

Create a mapping from the existing flat command names to v2 `{tool}/{action}` pairs. Most commands will map directly. The mapping should cover all ~100 commands in the existing `COMMANDS` object.

Example mapping:
```typescript
const V2_TOOL_MAP: Record<string, { tool: string; action: string }> = {
  // Auth
  login:        { tool: 'spacemolt_auth', action: 'login' },
  register:     { tool: 'spacemolt_auth', action: 'register' },
  logout:       { tool: 'spacemolt_auth', action: 'logout' },
  claim:        { tool: 'spacemolt_auth', action: 'claim' },

  // Core gameplay
  mine:         { tool: 'spacemolt', action: 'mine' },
  travel:       { tool: 'spacemolt', action: 'travel' },
  jump:         { tool: 'spacemolt', action: 'jump' },
  dock:         { tool: 'spacemolt', action: 'dock' },
  undock:       { tool: 'spacemolt', action: 'undock' },
  refuel:       { tool: 'spacemolt', action: 'refuel' },
  repair:       { tool: 'spacemolt', action: 'repair' },
  repair_module:{ tool: 'spacemolt', action: 'repair_module' },
  use_item:     { tool: 'spacemolt', action: 'use_item' },

  // Ship management
  install_mod:  { tool: 'spacemolt_ship', action: 'install_mod' },
  uninstall_mod:{ tool: 'spacemolt_ship', action: 'uninstall_mod' },
  switch_ship:  { tool: 'spacemolt_ship', action: 'switch_ship' },
  list_ships:   { tool: 'spacemolt_ship', action: 'list_ships' },
  name_ship:    { tool: 'spacemolt_ship', action: 'name_ship' },
  refit_ship:   { tool: 'spacemolt_ship', action: 'refit_ship' },
  sell_ship:    { tool: 'spacemolt_ship', action: 'sell_ship' },

  // ... continue for all commands
};
```

Implementation note: the final client does not retain a v1 fallback branch. Commands without a verified v2 route were either mapped to v2, kept as v2 aliases, or removed from the CLI.

### Step 2: Update the API Base URL Default

Change `API_BASE` from v1 to v2:
```typescript
const API_BASE = process.env.SPACEMOLT_URL || 'https://game.spacemolt.com/api/v2';
```

`SPACEMOLT_URL` can still override the base URL, but the client no longer rewrites or falls back to v1 routes.

### Step 3: Update the `execute()` Function

Modify `execute()` to route through v2's `POST /api/v2/{tool}/{action}` pattern:

```typescript
async function execute(command: string, payload?: Record<string, unknown>): Promise<APIResponse> {
  const session = await getSession();
  
  // Look up v2 tool/action mapping
  const mapping = V2_TOOL_MAP[command];
  
  if (!mapping) throw new Error(`Command "${command}" has no v2 route mapping.`);

  const routePath = mapping.tool === mapping.action ? mapping.tool : `${mapping.tool}/${mapping.action}`;
  const url = `${API_BASE}/${routePath}`;

  // ... rest of fetch logic remains the same
}
```

### Step 4: Update Session Creation

Change `createSession()` to POST to the v2 session endpoint:
```typescript
async function createSession(): Promise<Session> {
  const sessionUrl = `${API_BASE}/session`;  // now uses v2 base
  // ... same fetch logic
}
```

### Step 5: Handle v2 Response Format

Update `APIResponse` type and result display logic:

```typescript
interface APIResponseV2 {
  result?: string;  // rendered text
  structuredContent?: Record<string, unknown>;  // typed JSON data
  notifications?: Array<{ type: string; msg_type?: string; data: unknown; timestamp: string }>;
  session?: { id: string; player_id?: string; created_at: string; expires_at: string };
  error?: { code: string; message: string; wait_seconds?: number };
}
```

In the result display logic (`displayResult`), prefer `structuredContent` over `result`:
- If `structuredContent` exists and is an object, use it for the existing formatters
- If only `result` (rendered string) exists, print it directly as text
- This preserves all existing custom formatting while gaining access to typed data

### Step 6: Update the API Sync Test

Modify `src/api-sync.test.ts`:
1. Change `OPENAPI_URL` to point to the v2 spec: `https://game.spacemolt.com/api/v2/openapi.json`
2. Update the test to verify commands against v2 tool/action pairs instead of v1 flat endpoints
3. The test should verify that every entry in `V2_TOOL_MAP` exists in the v2 spec
4. Add a check that no commands in the v2 spec are missing from `V2_TOOL_MAP` (or UNDOCUMENTED_IN_SPEC)

### Step 7: Update Documentation

1. Update `AGENTS.md`:
   - Change session file path reference (it uses `.spacemolt-session.json` in CWD already)
   - Update the API URL references

2. Update the help text in `showHelp()`:
   - Change the `SPACEMOLT_URL` default in the environment variables section to v2
   - State that the client is v2-only

3. Update `package.json` version to `0.9.0`

### Step 8: Handle Edge Cases

1. **Login response format**: v2 login response structure may differ. The `session_id` and `player_id` extraction in `main()` needs to work with both v1 `result.player.id` and v2 `structuredContent.player.id`.

2. **Notification format**: v2 notifications should follow the same format, but verify with the spec.

3. **Session recovery**: When creating a new session after expiry, ensure the new session is created on the same API version. The re-login call should also use the same version.

4. **Error handling**: v2 error codes should be compatible. The existing `session_invalid`, `session_expired` codes should work the same.

5. **Commands without v2 mapping**: do not keep them in the CLI. Either map them to a verified v2 endpoint or remove the command surface.

## Complete Command-to-Tool Mapping

Here is the FULL mapping based on the 16 v2 tools and the existing command set in client.ts:

### spacemolt_auth
- login → spacemolt_auth/login
- register → spacemolt_auth/register
- logout → spacemolt_auth/logout
- claim → spacemolt_auth/claim

### spacemolt (core gameplay)
- mine → spacemolt/mine
- travel → spacemolt/travel
- jump → spacemolt/jump
- dock → spacemolt/dock
- undock → spacemolt/undock
- refuel → spacemolt/refuel
- repair → spacemolt/repair
- use_item → spacemolt/use_item
- survey_system → spacemolt/survey_system
- get_status → spacemolt/get_status
- get_system → spacemolt/get_system
- get_poi → spacemolt/get_poi
- get_base → spacemolt/get_base
- get_cargo → spacemolt/get_cargo
- get_nearby → spacemolt/get_nearby
- get_notifications → spacemolt/get_notifications
- get_active_missions → spacemolt/get_active_missions
- get_missions → spacemolt/get_missions
- get_skills → spacemolt/get_skills
- get_version → spacemolt/get_version
- get_commands → spacemolt/get_commands
- get_action_log → spacemolt/get_action_log
- get_location → spacemolt/get_location
- session → spacemolt/session (no-op, just session refresh)

### spacemolt_ship
- get_ship → spacemolt_ship/get_ship
- install_mod → spacemolt_ship/install_mod
- uninstall_mod → spacemolt_ship/uninstall_mod
- switch_ship → spacemolt_ship/switch_ship
- list_ships → spacemolt_ship/list_ships
- name_ship → spacemolt_ship/name_ship
- refit_ship → spacemolt_ship/refit_ship
- sell_ship → spacemolt_ship/sell_ship
- repair_module → spacemolt_ship/repair_module
- commission_ship → spacemolt_ship/commission_ship
- commission_quote → spacemolt_ship/commission_quote
- commission_status → spacemolt_ship/commission_status
- claim_commission → spacemolt_ship/claim_commission
- cancel_commission → spacemolt_ship/cancel_commission
- supply_commission → spacemolt_ship/supply_commission
- list_ship_for_sale → spacemolt_ship/list_ship_for_sale
- browse_ships → spacemolt_ship/browse_ships
- buy_listed_ship → spacemolt_ship/buy_listed_ship
- cancel_ship_listing → spacemolt_ship/cancel_ship_listing

### spacemolt_storage
- deposit_items → spacemolt_storage/deposit_items
- withdraw_items → spacemolt_storage/withdraw_items
- view_storage → spacemolt_storage/view_storage
- jettison → spacemolt_storage/jettison

### spacemolt_market
- buy → spacemolt_market/buy
- sell → spacemolt_market/sell
- create_buy_order → spacemolt_market/create_buy_order
- create_sell_order → spacemolt_market/create_sell_order
- cancel_order → spacemolt_market/cancel_order
- modify_order → spacemolt_market/modify_order
- view_market → spacemolt_market/view_market
- view_orders → spacemolt_market/view_orders
- estimate_purchase → spacemolt_market/estimate_purchase
- analyze_market → spacemolt_market/analyze_market

### spacemolt_faction
- faction_info → spacemolt_faction/info
- faction_list → spacemolt_faction/list
- join_faction → spacemolt_faction/join
- leave_faction → spacemolt_faction/leave
- faction_get_invites → spacemolt_faction/get_invites
- faction_decline_invite → spacemolt_faction/decline_invite
- faction_invite → spacemolt_faction/invite
- faction_kick → spacemolt_faction/kick
- faction_promote → spacemolt_faction/promote
- faction_edit → spacemolt_faction/edit
- faction_set_ally → spacemolt_faction/set_ally
- faction_set_enemy → spacemolt_faction/set_enemy
- faction_declare_war → spacemolt_faction/declare_war
- faction_propose_peace → spacemolt_faction/propose_peace
- faction_accept_peace → spacemolt_faction/accept_peace
- faction_rooms → spacemolt_faction/rooms
- faction_visit_room → spacemolt_faction/visit_room
- faction_write_room → spacemolt_faction/write_room
- faction_delete_room → spacemolt_faction/delete_room
- faction_intel_status → spacemolt_faction/intel_status
- faction_query_intel → spacemolt_faction/query_intel
- faction_submit_intel → spacemolt_faction/submit_intel
- faction_trade_intel_status → spacemolt_faction/trade_intel_status
- faction_query_trade_intel → spacemolt_faction/query_trade_intel
- faction_submit_trade_intel → spacemolt_faction/submit_trade_intel
- view_faction_storage → spacemolt_faction/view_storage
- faction_deposit_items → spacemolt_faction/deposit_items
- faction_withdraw_items → spacemolt_faction/withdraw_items
- faction_deposit_credits → spacemolt_faction/deposit_credits
- faction_withdraw_credits → spacemolt_faction/withdraw_credits
- faction_post_mission → spacemolt_faction/post_mission
- faction_cancel_mission → spacemolt_faction/cancel_mission
- faction_list_missions → spacemolt_faction/list_missions

### spacemolt_faction_commerce
- faction_create_buy_order → spacemolt_faction_commerce/create_buy_order
- faction_create_sell_order → spacemolt_faction_commerce/create_sell_order

### spacemolt_faction_admin
- create_faction → spacemolt_faction_admin/create_faction
- faction_create_role → spacemolt_faction_admin/create_role
- faction_edit_role → spacemolt_faction_admin/edit_role
- faction_delete_role → spacemolt_faction_admin/delete_role

### spacemolt_social
- chat → spacemolt_social/chat
- get_chat_history → spacemolt_social/get_chat_history
- get_trades → spacemolt_social/get_trades
- trade_offer → spacemolt_social/trade_offer
- trade_accept → spacemolt_social/trade_accept
- trade_decline → spacemolt_social/trade_decline
- trade_cancel → spacemolt_social/trade_cancel

### spacemolt_catalog
- catalog → spacemolt_catalog/catalog
- get_guide → spacemolt_catalog/get_guide
- help → spacemolt_catalog/help

### spacemolt_transfer
- send_gift → spacemolt_transfer/send_gift

### spacemolt_intel
- get_map → spacemolt_intel/get_map
- search_systems → spacemolt_intel/search_systems
- find_route → spacemolt_intel/find_route
- get_system_agents → spacemolt_intel/get_system_agents

### spacemolt_facility
- facility → spacemolt_facility/manage

### spacemolt_battle
- attack → spacemolt_battle/attack
- scan → spacemolt_battle/scan
- cloak → spacemolt_battle/cloak
- battle → spacemolt_battle/manage
- get_battle_status → spacemolt_battle/status
- reload → spacemolt_battle/reload
- self_destruct → spacemolt_battle/self_destruct

### spacemolt_salvage
- get_wrecks → spacemolt_salvage/get_wrecks
- loot_wreck → spacemolt_salvage/loot_wreck
- tow_wreck → spacemolt_salvage/tow_wreck
- release_tow → spacemolt_salvage/release_tow
- salvage_wreck → spacemolt_salvage/salvage_wreck
- scrap_wreck → spacemolt_salvage/scrap_wreck
- sell_wreck → spacemolt_salvage/sell_wreck

### spacemolt_fleet
- fleet → spacemolt_fleet/manage

### Final State
- `session`, `agentlogs`, and `send_gift` are routed through verified v2 endpoints.
- Redundant aliases were removed instead of being preserved as special cases: `deposit_credits`, `withdraw_credits`, `view_faction_storage`, `faction_deposit_items`, `faction_withdraw_items`, `faction_deposit_credits`, `faction_withdraw_credits`, and `storage`.
- Commands with no v2 endpoint were removed from the CLI surface: `deploy_drone`, `recall_drone`, and `order_drone`.
- Compatibility aliases `v2_get_player`, `v2_get_ship`, `v2_get_cargo`, `v2_get_missions`, `v2_get_queue`, and `v2_get_skills` resolve to the same v2 routes as their canonical `get_*` commands.

## Testing Strategy

1. Build and run: `bun run build && ./spacemolt get_status`
2. Run existing tests: `bun test`
3. Run the API sync test against v2: `bun test src/api-sync.test.ts`
4. Manual smoke tests for each command category
5. Verify notifications still display correctly
6. Verify session recovery still works after expiry

## Constraints

- All existing CLI arguments and key=value syntax must continue to work unchanged
- The COMMANDS object structure must remain the same (it drives arg parsing)
- Result formatters must continue to work (prefer structuredContent, fall back to result)
- Notification handlers must continue to work
- Must not break any existing scripts that invoke the CLI
- The session file format is backwards compatible (same fields)
