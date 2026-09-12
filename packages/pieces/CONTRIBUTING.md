# Writing pieces

Each piece is a small package with its public definition in `src/index.ts`. Keep the definition declarative and assemble it from focused internal modules.

```text
src/
  index.ts
  config.ts
  client.ts
  piece-types.ts
  actions/
    send.ts
    listMessages.ts
    types.ts
  triggers/
    messageCreated.ts
  email.ts
  channel.ts
```

## Modules

| Module                  | Owns                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `index.ts`              | The `definePiece` call, action/trigger assembly, and public exports.   |
| `config.ts`             | Authentication and factory-option schemas.                             |
| `client.ts`             | The vendor client, request transport, and client type.                 |
| `actions/<action>.ts`   | One action's schema, metadata, and `run` implementation.               |
| `triggers/<trigger>.ts` | One trigger's schema, metadata, and lifecycle implementation.          |
| Capability modules      | A single capability implementation such as `email.ts` or `channel.ts`. |
| `piece-types.ts`        | Generated schema-derived types. Never edit this file.                  |

Create an action or trigger directory only when the piece has more than one of that kind. Small pieces may keep their sole action in `index.ts`.

## Rules

- Define an action's input and output schemas beside that action. A reader should understand its entire vendor operation from one file.
- Use `satisfies` with generated types. Keep authoring declarative; do not add builder callbacks.
- Extract only genuinely shared, specifically named concerns such as `format.ts` or `pagination.ts`. Do not create catch-all `shared.ts`, `utils.ts`, or `schemas.ts` modules.
- Keep vendor transport in `client.ts`; actions call the client rather than `fetch` directly.
- Internal modules import each other directly. Do not import internal code through `index.ts`.
- Add a capability module only when the piece implements that capability. Do not create empty placeholders.
- Run `frogbot generate:piece-types` after schema changes and ship the resulting `piece-types.ts` file.
