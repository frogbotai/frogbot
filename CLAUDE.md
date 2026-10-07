# Agent rules

Build the best version, not the usual one. Subtract what doesn't earn its place, finish what you start, and push back briefly, with a better alternative, when a request would make the result worse.

## Read first

| Work                                     | Read in [CONTRIBUTING.md](CONTRIBUTING.md)                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Any design                               | [Design principles](CONTRIBUTING.md#design-principles)                                 |
| Code                                     | [Code style](CONTRIBUTING.md#code-style), [Domain rules](CONTRIBUTING.md#domain-rules) |
| Admin or UI                              | [UI](CONTRIBUTING.md#ui), then [UI conventions](packages/ui/CONTRIBUTING.md)           |
| Tests, checks, or a test found a problem | [Verification](CONTRIBUTING.md#verification)                                           |
| Commits                                  | [Commits](CONTRIBUTING.md#commits)                                                     |
| A ticket stage                           | [the feature process](.github/feature-process/README.md) and the ticket folder         |

## Commands

```
pnpm check [name] [--full]           static only: format, lint, typecheck, scripts/check-*.mjs; never tests or servers
pnpm ticket next | new <n> [--type fix] | status [--batch <n>] | decisions
pnpm ticket verify [--list]          run the checks and tests the diff needs; list changed files nothing covers
pnpm ticket verify --ui <path>       production fixture, sign-in, screenshots, console errors, failed requests
pnpm ticket land <n> [-m "..."]      rebase, full gate, one commit, fast-forward local main; never pushes
pnpm test:unit|ui|int:sqlite|e2e <file>   pnpm test:browser --project <p>
```

## Rules

- Run `pnpm check` through the `lint` subagent, with the worktree as its workdir.
- A ticket's code lives in its worktree, `../frogbot-ticket<n>` on `feat/ticket-<n>-<slug>`. Its documents live only in the main checkout's `.idea/_process/tickets/`.
- Precedent: agent-harness work (chat turns, agents, tools, sessions, streaming, their SQLite storage) follows OpenCode v2 at `~/code/opencode-v2`; everything else follows Payload at `~/code/payload`. Never read `node_modules/payload`.
- Never push, merge or open a PR. Never stage `.idea/`. Never `git stash`: the stash is shared across worktrees.
- Record findings outside the work with `pnpm ticket found` and carry on.

## Communication

Keep replies short and plain; explain unfamiliar terms with an example. A question for the owner is a [decision card](.github/feature-process/step2_spec.md#decision-card).
