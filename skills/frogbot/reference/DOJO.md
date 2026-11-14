# Dojo

Docs: https://docs.frogbot.ai/plugins/dojo

Shipping an app, the first time and every time after, is `npx frogbot deploy`. Everything else happens through `frogbot dojo`: keys, a custom domain, the people on an app, workspaces, deployments, logs, Dojo API keys and billing. Deploying is in "Sharing The App" in [SKILL.md](../SKILL.md#sharing-the-app).

The commands come from `dojo()` (`@frogbotai/plugin-dojo`). In an app that lists it, run `npx frogbot dojo <command>`. Anywhere else, run the same command as `npx @frogbotai/plugin-dojo <command>`, for example `npx @frogbotai/plugin-dojo apps list`. `<app>` is the app's slug, such as `deals` for `deals.frogbot.app`, or its id. `npx frogbot dojo <command> --help` prints a command's flags.

## Rules

- **Being asked is enough** for every command here, except the ones below. Run it, then report what it printed.
- **Invites.** Before `sharing invite` or `members add`, read back the addresses and the level or role, and wait for a yes: "I'll invite sam@acme.com with use access (they can open the app, not edit it). Send it?" An invite emails each person and can't be unsent, and an address added to a workspace joins it when someone signs in with it.
- **Destructive commands** need `--yes`, because your shell has no terminal to confirm in; without it they exit `2` and change nothing. Ask the user the question the CLI would ask, from the table below, and pass `--yes` only after a yes in this conversation. Never pass `--yes` because a command failed without it.
- **`--replace-data`.** Never try `frogbot deploy --replace-data`: only an owner typing the app's name at a terminal can confirm it. Tell the user the command to run themselves.
- **Key values.** Never repeat a key's value in a reply, even one the user just gave you. `env list` shows keys masked; keep it that way.
- **Refusals.** When a command stops because the user lacks access (`It needs owner access to the app.`), or because a step needs a person (terms, payment, a plan upgrade), pass on the reason and any link it prints, and don't retry. Never open a link yourself: links are for the user.

| Command                    | Ask first                                                                    |
| -------------------------- | ---------------------------------------------------------------------------- |
| `apps delete <app>`        | Delete `<app>` and everything in it? This can't be undone.                   |
| `env unset <app> <KEY>...` | Remove `<KEY>` from `<app>`? It restarts once.                               |
| `domains set <app> <host>` | Only when `domains get` shows another domain: Replace `<old>` with `<host>`? |
| `domains clear <app>`      | Remove the custom domain of `<app>`? It stops reaching the app.              |
| `sharing leave <app>`      | Leave `<app>`? You'll need a new invite to get back.                         |
| `members remove <email>`   | Remove `<email>` from the workspace?                                         |
| `keys revoke <id>`         | Revoke key `<id>` and the keys it made? (with `--no-cascade`: only that key) |

## Output And Exit Codes

Add `--json` whenever you read a result to act on it: stdout then holds one JSON value and nothing else, and a failed command prints nothing on stdout, except `deployments logs --follow`, which prints the failed build's JSON and then exits `1`. Run without `--json` when you only report the result: the plain lines are written for the user. Sign-in links, progress and build lines go to stderr either way. `apps logs --follow` never ends, so it refuses `--json`.

| Exit | Meaning                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------- |
| `0`  | Done.                                                                                                 |
| `1`  | Stopped. The last `[frogbot]` line on stderr says why: Dojo's reason, the access it needs, or a link. |
| `2`  | Bad usage: a missing argument, an unknown flag or level, or a destructive command without `--yes`.    |

## Signing In

- `npx frogbot dojo login` signs in with a code the user confirms in the browser, and the first sign-in makes their Dojo account. It prints the link and `Code: <code>` on their own lines and waits, as `deploy` does: run it where you can read its output while it waits, and pass both on. Any command that needs a sign-in starts the same flow.
- `npx frogbot dojo whoami` prints `[frogbot] Signed in to <url> as <email>.`, then one `<slug>  <name>` line per workspace. It exits `1` when nobody is signed in.
- `npx frogbot dojo logout` revokes the stored sign-in and forgets it.
- `FROGBOT_DOJO_TOKEN`, a Dojo API key, signs every command in ahead of the stored sign-in. When Dojo refuses it, the command exits `1` instead of opening a browser sign-in. In CI with no token and no sign-in, commands exit `1` at once.

## Apps

- `npx frogbot dojo apps list [--workspace <slug>]` prints `<slug>  <url>` for every app the user can see.
- `npx frogbot dojo apps get <app>` prints the address, `Started: yes` or `Started: not yet`, and `Your access: use|editor|owner`.
- `npx frogbot dojo apps create <name> [--workspace <slug>]` makes an empty app to deploy to later. When the name is taken, ask for another. When the workspace's plan doesn't cover another app, it prints the upgrade link and waits for the payment; pass the link on.
- `npx frogbot dojo apps rename <app> <name>` changes the name; the slug and address stay. Owners only.
- `npx frogbot dojo apps delete <app> --yes` deletes the app, its versions and its data. Owners only, and only after the user says yes to the question above.
- `npx frogbot dojo apps pull <app>`, run from the folder that should hold it, downloads an app the user owns or edits into a new `./<app>` folder with an empty database. An owner can add `--data` to bring the live database, files and the app's secret. Then run `pnpm install` and `pnpm dev` there; `npx frogbot deploy` from that folder ships a new version of the same app. An editor's deploy brings no keys and has no `Share it:` line, since only owners manage keys.
- `npx frogbot dojo apps logs <app>` prints the app's recent runtime logs, with key values shown as `••••`. When an app misbehaves on Dojo, read them first. Add `--follow`, in a background shell, to watch new lines while the user reproduces the problem.

## Deployments

For an app the user owns or edits:

- `npx frogbot dojo deployments list <app>` prints `<id>  <created>  <status>` per deployment, newest first.
- `npx frogbot dojo deployments logs <id>` prints the end of that build's log, then `[frogbot] <status>` with the error when the build failed. Add `--follow` to stream it until the build ends; a failed build then exits `1` with `Build failed:` and the reason. Fix the cause and deploy again.

## Keys

An app's environment keys on Dojo. Owners only.

- `npx frogbot dojo env list <app>` prints `<KEY> ••••<last 4>` per key.
- `npx frogbot dojo env set <app> KEY=value...` sets one or more keys. Values go only as `KEY=value` arguments; there is no file or stdin option. Tell the user first that the live app restarts once. It prints `[frogbot] Set 1 key on <app>. It restarts once.`
- `npx frogbot dojo env unset <app> KEY... --yes` removes keys, after the question above; the app restarts once.

Keys in the local `.env` reach Dojo on the first `deploy`; on later deploys, pass `--update-keys` to send local values that differ from live, or use `env set`.

## Custom Domain

One custom domain per app, on a domain the user owns. Owners only. The `<app>.frogbot.app` address keeps working.

- `npx frogbot dojo domains get <app>` prints `<host>  <status>`: `waiting for DNS`, `getting a certificate` or `live`. While waiting, it also prints `Add a CNAME record: <name> → <target>`.
- `npx frogbot dojo domains set <app> <host>` points the domain at the app and prints the CNAME record. Tell the user they must add that record at their own registrar or DNS host; you can't. Run `domains get` first: when the app already has another domain, setting a new one replaces it, so ask first and pass `--yes`. Run `domains get` again later to see when it's `live`.
- `npx frogbot dojo domains clear <app> --yes` removes the custom domain, after the question above.

## People On An App

Each person has one of three levels:

- **`use`**: opens and uses the deployed app. The default.
- **`editor`**: also pulls the source, changes it and deploys new versions.
- **`owner`**: also manages the app's keys, custom domain and people, and can delete it.

Commands:

- `npx frogbot dojo sharing list <app>` prints `<email>  <level>` per person, marked `(invited)` until they accept and `(you)` for the user. Owners only.
- `npx frogbot dojo sharing invite <app> <email>... [--level use|editor|owner]` shares the app, and Dojo emails each person. Owners only. Use `use` unless the user asks for `editor` or `owner`; before `owner`, say it hands over keys, the domain and invites. Read back the addresses and level and wait for a yes first. It prints `[frogbot] Shared <app> with 2 people at use.`, then `Already shared:` and `Couldn't email:` lines when they apply: pass those on.
- `npx frogbot dojo sharing leave <app> --yes` removes the user from an app shared with them, after the question above.

## Workspaces And Members

A workspace holds apps and a plan. Its members are an `owner` or a `member`. When the user is in more than one workspace, commands that take `--workspace <slug>` need it; `whoami` and `workspaces list` print the slugs.

- `npx frogbot dojo workspaces list` prints `<slug>  <name>` per workspace.
- `npx frogbot dojo workspaces create <name>` creates a workspace the user owns. Dojo picks the slug.
- `npx frogbot dojo workspaces rename <slug> <name>` renames one the user owns; the slug stays. Dojo has no workspace delete.
- `npx frogbot dojo members list [--workspace <slug>]` prints `<email>  <role>` per member.
- `npx frogbot dojo members add <email> [--role owner|member] [--workspace <slug>]` adds someone, who joins when they sign in with that email. The role defaults to `member`. Workspace owners only, and only after you read back the address and role and the user says yes.
- `npx frogbot dojo members role <email> <owner|member> [--workspace <slug>]` changes a role. Workspace owners only.
- `npx frogbot dojo members remove <email> [--workspace <slug>] --yes` removes a member, or the user themself, after the question above.

## Dojo API Keys

Keys for scripts, CI and other agents to act as the user through `FROGBOT_DOJO_TOKEN`. These are not app keys: for those, see [Keys](#keys).

- `npx frogbot dojo keys list` prints `<id>  <prefix>…  <name>` per key that still works, with `(made by key <id>)` for keys another key made.
- `npx frogbot dojo keys create <name> [--can-mint]` creates a key no broader than the current sign-in, and prints it once after `Copy it now; Dojo won't show it again:`. Give it to the user, or put it straight where they asked (such as a CI secret), and don't repeat it afterwards. `--can-mint` lets the new key create keys too; add it only when asked. When the sign-in can't create keys, it exits `1` with a link to create one in the browser: pass that on.
- `npx frogbot dojo keys revoke <id> --yes` revokes a key and the keys it made, after the question above; `--no-cascade` keeps the keys it made working. It reaches only the CLI's own key and the keys it made.

## Billing

- `npx frogbot dojo billing status [--workspace <slug>]` prints the workspace's plan, its status and how many paid apps it has, and the link to choose a plan when it has none.
- `npx frogbot dojo billing manage [--workspace <slug>]` prints the link to change the card, see invoices or cancel. Workspace owners only. Give the link to the user: paying happens in the browser, never through you.
