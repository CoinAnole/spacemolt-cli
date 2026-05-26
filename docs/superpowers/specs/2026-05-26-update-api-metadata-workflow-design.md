# Update API Metadata Workflow Design

## Goal

Automate the existing manual task for updating the `spacemolt-docs` submodule pointer and regenerating bundled API metadata.

The workflow should commit directly to the default branch when, and only when, the docs submodule or generated API metadata changes.

## Triggers

The workflow will support two entry points:

- `workflow_dispatch`, so maintainers can run it on demand.
- A conservative scheduled run, so metadata can stay current without manual intervention.

## Workflow

The workflow will:

1. Check out the repository with the `spacemolt-docs` submodule.
2. Set up Bun.
3. Install dependencies with the lockfile.
4. Update the `spacemolt-docs` submodule to its remote default branch.
5. Run `bun run generate:api`.
6. Extract `GENERATED_API_GAMESERVER_VERSION` from `src/generated/api-commands.ts`.
7. Run `bun test src/api-sync.test.ts`.
8. Commit only `spacemolt-docs` and `src/generated/api-commands.ts` if either changed.
9. Use the gameserver version, for example `v0.327.2`, as the entire commit message.

If there are no changes after the submodule update and metadata generation, the workflow exits successfully without committing.

## Guardrails

The workflow will request `contents: write` permission because it commits to the default branch.

The commit step will stage only the submodule pointer and generated metadata file. It will not stage unrelated files that might be produced by future tooling changes.

The focused API sync test will run before committing, using the cached `spacemolt-docs/openapi.json` rather than the live API.

## Files

- `.github/workflows/update-api-metadata.yml`: new GitHub Actions workflow.
- `src/generated/api-commands.ts`: generated output, changed only by the workflow when the API metadata changes.
- `spacemolt-docs`: submodule pointer, updated by the workflow.
