# Dojo

Docs: https://docs.frogbot.ai/plugins/dojo

Shipping an app, the first time and every time after, is `npx frogbot deploy`. Everything else happens through `frogbot dojo`: keys, a custom domain, the people on an app, workspaces, deployments and rollbacks, logs, starting and stopping an app, Trash, data exports, templates, activity, Dojo API keys and billing. Deploying is in "Sharing The App" in [SKILL.md](../SKILL.md#sharing-the-app).

The commands come from `dojo()` (`@frogbotai/plugin-dojo`). `npx frogbot dojo <command>` needs an app that lists it; `npx @frogbotai/plugin-dojo <command>` runs the same command in any folder, including `login` on a fresh machine. `<app>` is the app's slug, such as `deals` for `deals.frogbot.app`, or its id. In a folder you deployed, which has `.frogbot/app.json`, leave `<app>` out and the command acts on that app. `npx frogbot dojo <command> --help` prints a command's flags, and `npx frogbot dojo --help --json` lists every command, verb and flag as one JSON value.

## Daily

Run these in the app's folder:

| Command                                 | Does                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npx frogbot deploy`                    | Ships this folder, the first time and every time after.                                                 |
| `npx frogbot dojo status`               | The address, the status (`live`, `paused`, `deploying`, `failed`, `not_deployed`), and the last deploy. |
| `npx frogbot dojo logs [--follow]`      | The runtime log; when the last deploy failed, its build or start log instead, with the error.           |
| `npx frogbot dojo open`                 | Prints the live address. It opens a browser only at a terminal, so it never opens one for you.          |
| `npx frogbot dojo rollback [id]`        | Puts back the newest version that went live before the current one, or the deployment you name.         |
| `npx frogbot dojo env set KEY=value...` | Sets keys; the app restarts once. The first argument is an app only when it has no `=`.                 |

Each also takes an app's slug to act on another app: `status deals`, `logs deals`, `open deals`. `rollback` acts on the folder's app only; `deployments rollback <app> <id>` names another.

## Rules

- **Being asked is enough** for every command here, except the ones below. Run it, then report what it printed.
- **Invites.** Before `sharing invite` or `members add`, read back the addresses and the level or role, and wait for a yes: "I'll invite sam@acme.com with use access (they can open the app, not edit it). Send it?" An invite emails each person and can't be unsent, and an address added to a workspace joins it when someone signs in with it.
- **Destructive commands** need `--yes`, because your shell has no terminal to confirm in; without it they exit `2` and change nothing. Ask the user the question the CLI would ask, from the table below, and pass `--yes` only after a yes in this conversation. Never pass `--yes` because a command failed without it.
- **`--replace-data`.** `npx frogbot deploy --replace-data --confirm <app-slug>` replaces all of a live app's data with this computer's, and anything written live since is lost. Run it only when the user asks, after asking "This replaces all of `<app>`'s live data with this computer's; anything written live since is lost. Type `<app>` to confirm." and getting the slug back in this conversation. Never fill in `--confirm` yourself.
- **Key values.** Never repeat a key's value in a reply, even one the user just gave you. `env list` shows keys masked; keep it that way.
- **Refusals.** When a command stops because the user lacks access (`It needs owner access to the app.`), or because a step needs a person (terms, payment, a plan upgrade), pass on the reason and any link it prints, and don't retry. Never open a link yourself: links are for the user.

| Command                                              | Ask first                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps delete <app>`                                  | Move `<app>` to Trash? It stops now and is deleted for good in 30 days.                                         |
| `apps stop <app>`                                    | Stop `<app>`? Visitors see a paused page until you start it again.                                              |
| `env unset <app> <KEY>...`                           | Remove `<KEY>` from `<app>`? It restarts once.                                                                  |
| `domains set <app> <host>`                           | Only when `domains get` shows another domain: Replace `<old>` with `<host>`?                                    |
| `domains clear <app>`                                | Remove the custom domain of `<app>`? It stops reaching the app.                                                 |
| `sharing leave <app>`                                | Leave `<app>`? You'll need a new invite to get back.                                                            |
| `members remove <email>`                             | Remove `<email>` from the workspace?                                                                            |
| `projects delete <project>`                          | Delete the project `<project>` for good?                                                                        |
| `workspaces delete <slug>`                           | Delete `<workspace>` for good? Its projects, members, API keys and plan go with it.                             |
| `workspaces owner <slug> <email>`                    | Make `<email>` the Owner of `<slug>`? You become an Admin.                                                      |
| `apps move <app>`                                    | Move `<app>` to `<workspace>` now? That workspace pays for it from then on. (or: into the project `<project>`?) |
| `projects move <project>`                            | Move `<project>` and its apps to `<workspace>` now? That workspace pays for them.                               |
| `apps handover <app>`, `projects handover <project>` | Hand `<app>` to `<email>`? Once they accept, their workspace pays for it.                                       |
| `handovers accept <handover>`                        | Accept `<name>` from `<sender>` into `<workspace>`? You become its Admin, and it pays.                          |
| `handovers remove-access <handover>`                 | Remove `<n>` people outside `<workspace>` from `<name>`?                                                        |
| `git disconnect <app>`                               | Disconnect `<app>`'s repo? Pushes stop deploying it; deployments already made stay.                             |
| `keys revoke <id>`                                   | Revoke key `<id>` and the keys it made? (with `--no-cascade`: only that key)                                    |

## Output And Exit Codes

Add `--json` whenever you read a result to act on it: stdout then holds one JSON value and nothing else, and a failed command prints nothing on stdout, except `deployments logs --follow`, which prints the failed build's JSON and then exits `1`. Run without `--json` when you only report the result: the plain lines are written for the user. Sign-in links, progress and build lines go to stderr either way. `apps logs --follow` never ends, so it refuses `--json`.

| Exit | Meaning                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| `0`  | Done.                                                                                                      |
| `1`  | Stopped. The last `[frogbot]` line on stderr says why: Dojo's reason, the access it needs, or a link.      |
| `2`  | Bad usage: a missing argument, an unknown flag or level, or a destructive command without `--yes`.         |
| `3`  | Needs a sign-in nobody is here to give. Pass on the link and code it printed, or use `FROGBOT_DOJO_TOKEN`. |
| `4`  | Needs a payment. Pass on the link it printed; the user pays in the browser.                                |

## Signing In

- `npx frogbot dojo login` signs in with a code the user confirms in the browser, and the first sign-in makes their Dojo account. It prints the link and `Code: <code>` on their own lines and waits, as `deploy` does: run it where you can read its output while it waits, and pass both on. Any command that needs a sign-in starts the same flow.
- `npx frogbot dojo whoami` prints `[frogbot] Signed in to <url> as <email>.`, then one `<slug>  <name>` line per workspace. It exits `1` when nobody is signed in.
- `npx frogbot dojo logout` revokes the stored sign-in and forgets it.
- `FROGBOT_DOJO_TOKEN`, a Dojo API key, signs every command in ahead of the stored sign-in. When Dojo refuses it, the command exits `3` instead of opening a browser sign-in. In CI with no token and no sign-in, commands exit `3` at once.

## Apps

- `npx frogbot dojo apps list [--workspace <slug>]` prints `<slug>  <url>` for every app the user can see.
- `npx frogbot dojo apps get <app>` prints the address, `Started: yes` or `Started: not yet`, and `Your access: use|editor|owner`.
- `npx frogbot dojo apps create <name> [--workspace <slug>]` makes an empty app to deploy to later. When the name is taken, ask for another. When the workspace's plan doesn't cover another app, it prints the upgrade link and waits for the payment; pass the link on.
- `npx frogbot dojo apps rename <app> <name>` changes the name; the slug and address stay. Owners only.
- `npx frogbot dojo apps create <name> --template <template>` builds the new app from a template, named by id or name, and prints its first deployment's id; a template saved in a workspace makes the app in that workspace. Follow it with `deployments logs <id> --follow`. `npx frogbot dojo templates list` prints `<id>  <name>  <summary>` for FrogBot's templates and the ones saved in the user's workspaces.
- `npx frogbot dojo apps delete <app> --yes` moves the app to Trash: it stops at once and Dojo deletes it, its versions and its data for good after 30 days. Owners only, and only after the user says yes to the question above.
- `npx frogbot dojo apps move <app> --workspace <slug> --yes` moves the app at once into another workspace the user admins, after the question above: it keeps its address, everyone keeps access (Admins from outside that workspace become Editors), and that workspace pays for it from then on. Dojo refuses during a build, for a free preview, and when that workspace has no paid app free; then it prints the link that pays for one: pass it on. `--project <project>` instead moves it into another project of its own workspace.
- `npx frogbot dojo apps handover <app> --to <email> --yes` hands the app to someone, after the question above. Dojo emails them a link to accept it into a workspace they admin, which then pays for it; it waits 7 days. It prints the handover's id, and `handovers cancel <id>` takes it back.
- `npx frogbot dojo apps trash` prints `<slug>  deleted for good <date>` for each app in Trash the user is an owner of. `npx frogbot dojo apps restore <app>` takes one out; an app that had gone live needs a paid app free in its workspace, so it may print the upgrade link (exit `4` without a terminal): pass it on.
- `npx frogbot dojo apps restart <app>` restarts the live app on its current version and keys. `npx frogbot dojo apps stop <app> --yes` stops it, after the question above: visitors get a paused page, and it keeps its address, data and paid app. `npx frogbot dojo apps start <app>` starts it again. Owners only.
- `npx frogbot dojo apps keep <app>` keeps a free preview as a paid app. When the workspace has no paid app free, it prints the link that pays for one (exit `4` without a terminal); pass it on, and the preview becomes paid once it's paid. For an app editor it says to ask a workspace owner, since only an owner can pay.
- `npx frogbot dojo apps usage <app>` prints the app's AI spend this month, by model, and the workspace's AI balance. Owners and editors.
- `npx frogbot dojo apps export-data <app> [--out <file>]` saves the live database and uploaded files as a `.zip`, by default `./<app>-data.zip`. It never overwrites a file. Owners only.
- `npx frogbot dojo apps pull <app>`, run from the folder that should hold it, downloads an app the user owns or edits into a new `./<app>` folder with an empty database. An owner can add `--data` to bring the live database, files and the app's secret. Then run `pnpm install` and `pnpm dev` there; `npx frogbot deploy` from that folder ships a new version of the same app. An editor's deploy brings no keys and has no `Share it:` line, since only owners manage keys.
- `npx frogbot dojo apps logs <app>` prints the app's recent runtime logs, with key values shown as `••••`. When an app misbehaves on Dojo, read them first. Add `--follow`, in a background shell, to watch new lines while the user reproduces the problem.

## Deployments

For an app the user owns or edits:

- `npx frogbot dojo deployments list <app> [--page <n>]` prints `<id>  <created>  <status>` per deployment, newest first, 20 a page, then `Page 1 of 3. Add --page 2 for older ones.` when there are more. Under `--json`, a page past the last is an empty list.
- `npx frogbot dojo deployments get <id>` prints a deployment's status, its times, the commit it came from, and the error when there is one. It exits `1` when the build failed or the version didn't start, so it can gate a script; `--json` carries `failed`.
- `npx frogbot dojo deployments logs <id>` prints the end of that build's log, then `[frogbot] <status>` with the error when the build failed. Add `--follow` to stream it until the build ends; a failed build then exits `1` with `Build failed:` and the reason. Fix the cause and deploy again.
- `npx frogbot dojo deployments rollback <app> <id>` puts an earlier live version back as a new deployment, without a build, keeping today's data and keys. If it can't start, the current version keeps running. Run `deployments list` to see when it's live.
- `npx frogbot dojo deployments cancel <id>` cancels a queued or building deployment; the app stays as it was. Owners only.

## Repos

A connected repo deploys the app on every push to its branch.

- `npx frogbot dojo git status <app>` prints the provider, repo, branch and folder, and whether pushes deploy. `needs-reconnect` means Dojo lost access: an Admin connects it again.
- `npx frogbot dojo git connect <app>` connects GitHub. Dojo connects GitHub only for a person signed in to it, so this prints a link: give it to the user to open and pick the repo there. Don't open it yourself.
- `npx frogbot dojo git connect <app> --provider gitlab --repo <project-id> [--branch <branch>] [--folder <path>] [--instance <url>]` connects GitLab with an access token read from stdin. Ask the user to run it themselves, or to pipe the token from where they keep it; never put a token in an argument or repeat it. Admins only.
- `npx frogbot dojo git disconnect <app> --yes` removes the link, after the question above; deployments already made stay. Admins only.

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
- `npx frogbot dojo workspaces rename <slug> <name>` renames one the user owns; the slug stays.
- `npx frogbot dojo workspaces delete <slug> --yes` deletes an empty workspace for good, with its projects, members, API keys and plan, after the question above. Dojo refuses while it holds apps, Trash included, and lets only the Owner do it. The CLI sends the workspace's name as the typed confirmation.
- `npx frogbot dojo workspaces owner <slug> <email> --yes` makes a member who has signed in the Owner at once, after the question above; the user becomes an Admin. Only the Owner pays, changes the plan and deletes the workspace.
- `npx frogbot dojo projects list [--workspace <slug>]` prints `<id>  <name>` per project, `(default)` after the workspace's default one. Projects are folders of apps inside a workspace.
- `npx frogbot dojo projects create <name> [--workspace <slug>]` adds a project. Dojo allows it only on workspaces with Business features, for their Admins.
- `npx frogbot dojo projects rename <project> <name>` renames a project. `<project>` is its id or name in every `projects` verb, and `--workspace <slug>` narrows the name lookup (except in `move`, where it is where the project goes); a name two projects share fails and lists their ids.
- `npx frogbot dojo projects delete <project> --yes` deletes an empty project for good, after the question above. Dojo refuses while it holds apps, Trash included, and never deletes the default project.
- `npx frogbot dojo projects danger <project>` shows whether the user may move, hand over, leave or delete it, the workspaces it can move to, and a pending handover.
- `npx frogbot dojo projects move <project> --workspace <slug> --yes` moves a project and its apps at once into another workspace the user admins, after the question above; that workspace pays for them from then on. `npx frogbot dojo projects handover <project> --to <email> --yes` hands it to someone, like `apps handover`.
- `npx frogbot dojo members list [--workspace <slug>]` prints `<email>  <role>` per member.
- `npx frogbot dojo members add <email> [--role owner|member] [--workspace <slug>]` adds someone, who joins when they sign in with that email. The role defaults to `member`. Workspace owners only, and only after you read back the address and role and the user says yes.
- `npx frogbot dojo members role <email> <owner|member> [--workspace <slug>]` changes a role. Workspace owners only.
- `npx frogbot dojo members remove <email> [--workspace <slug>] --yes` removes a member, or the user themself, after the question above.

## Handovers

A handover moves an app or project to someone else's workspace once they accept it. `<handover>` is its id or the link Dojo emailed; ask the user to paste either, since Dojo has no list of pending handovers.

- `npx frogbot dojo handovers details <handover>` prints what it moves, who sent it, its state, and who keeps access.
- `npx frogbot dojo handovers accept <handover> [--workspace <slug>] --yes` accepts one sent to the user, after the question above: it moves into a workspace they admin, which pays for it from then on, and they become its Admin. Without `--workspace` it takes the only workspace that can, asks with a terminal, or fails naming the choices: ask the user which.
- `npx frogbot dojo handovers cancel <handover>` takes back a handover the user sent, or declines one sent to them, while it waits.
- `npx frogbot dojo handovers remove-access <handover> --yes`, after an accepted handover, removes everyone outside the new workspace from what it moved, after the question above. Admins of that workspace only.

## Dojo API Keys

Keys for scripts, CI and other agents to act as the user through `FROGBOT_DOJO_TOKEN`. These are not app keys: for those, see [Keys](#keys).

- `npx frogbot dojo keys list` prints `<id>  <prefix>…  <name>` per key that still works, with `(made by key <id>)` for keys another key made.
- `npx frogbot dojo keys create <name> [--can-mint]` creates a key no broader than the current sign-in, and prints it once after `Copy it now; Dojo won't show it again:`. Give it to the user, or put it straight where they asked (such as a CI secret), and don't repeat it afterwards. `--can-mint` lets the new key create keys too; add it only when asked. When the sign-in can't create keys, it exits `1` with a link to create one in the browser: pass that on.
- `npx frogbot dojo keys revoke <id> --yes` revokes a key and the keys it made, after the question above; `--no-cascade` keeps the keys it made working. It reaches only the CLI's own key and the keys it made.

## Billing

- `npx frogbot dojo billing status [--workspace <slug>]` prints the workspace's plan, its status and how many paid apps it has, and the link to choose a plan when it has none.
- `npx frogbot dojo billing manage [--workspace <slug>]` prints the link to change the card, see invoices or cancel. Workspace owners only. Give the link to the user: paying happens in the browser, never through you.
- `npx frogbot dojo billing ai [--workspace <slug>]` prints the workspace's AI balance and whether auto-recharge is on. It says "not reported" when Dojo sends no balance. Only a person changes auto-recharge, in Dojo.
- `npx frogbot dojo billing add-funds [--amount <dollars>] [--workspace <slug>]` prints the link that adds AI funds, $10 to $1000 (default $20) plus a processing fee. Workspace owners only. Give the link to the user.

## Activity

- `npx frogbot dojo activity [--workspace <slug>] [--app <app>] [--limit <n>]` prints who deployed, changed or invited what, newest first, as `<time>  <who>  <event>  <app>`. With `--app` it reads that app's workspace. Workspace admins only, on the Business plan.
