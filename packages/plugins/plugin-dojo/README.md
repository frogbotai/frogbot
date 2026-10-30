# @frogbotai/plugin-dojo

Adds the `share`, `pull`, `logs` and `logout` commands, and runs a FrogBot app on Dojo with no setup: uploads go to the app's R2 bucket, and AI goes through Dojo's gateway. Docs: https://docs.frogbot.ai/plugins/dojo

Dojo adds this plugin when it builds an app, after the app's own plugins, by setting `FROGBOT_PLATFORM_PLUGIN=@frogbotai/plugin-dojo` for `next build` and `frogbot` commands. An app that lists `dojo()` itself gets it once: core skips the platform plugin when a listed plugin has the same slug.

## Commands

| Command  | Arguments                                                                                           | Does                                                       |
| -------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `share`  | `--data`, `--no-data`, `--workspace`, `--name`, `--no-keys`, `--skip-key`, `--yes`, `--update-keys` | uploads the app to Dojo, builds it and prints its URL      |
| `pull`   | `<app>`                                                                                             | downloads an app shared with you into a new folder         |
| `logs`   | `<app>`, `--follow`                                                                                 | prints an app's recent logs, or follows them               |
| `logout` | —                                                                                                   | revokes the CLI's Dojo key and removes it from `auth.json` |

`dojo()` adds them to `cli.commands`, so an app that lists it runs `frogbot share`. The package's `frogbot-dojo` bin runs the same four anywhere, with or without an app: `npx @frogbotai/plugin-dojo pull deals` works in an empty folder. Each usage line names the form that was run. With no command or an unknown one, the bin prints its usage and exits 2.

## What it changes

Apart from the commands and the import map entries for the badge and the sign-in buttons, the plugin does nothing unless `DOJO=1`. On Dojo it reads these variables, and boot fails naming any that is missing:

| Variable                    | Used for                         |
| --------------------------- | -------------------------------- |
| `DOJO_R2_ENDPOINT`          | R2's S3 API endpoint             |
| `DOJO_R2_BUCKET`            | the app's bucket                 |
| `DOJO_R2_ACCESS_KEY_ID`     | R2 credentials                   |
| `DOJO_R2_SECRET_ACCESS_KEY` | R2 credentials                   |
| `DOJO_AI_BASE_URL`          | Dojo's gateway, ending `/api/v1` |
| `DOJO_AI_API_KEY`           | the app's gateway key            |
| `DOJO_JOBS_SECRET`          | Dojo waking the app to run jobs  |

- **Storage.** When the app sets no `storage`, every upload collection is stored in R2 under its slug (`files/<id>/<filename>`). Files stay private and are served through the app, so its access rules apply.
- **AI.** When every provider in `ai.providers` is a built-in one with no key, they are replaced by one `dojo` provider that calls Dojo's gateway. Old model IDs such as `openai/gpt-5.4-mini` keep working. Chat, embeddings and images work through the gateway; transcription, speech and video need your own key. An app with no `ai` block, or with any provider key of its own, is left unchanged.
- **Jobs.** Dojo can run due jobs with `Authorization: Bearer <DOJO_JOBS_SECRET>`. Everyone else gets the app's own `jobs.access.run`.
- **Sign-in.** Adds "Continue with Dojo" (method `dojo`) after the user collection's own `auth.signIn` methods: OAuth with PKCE against Dojo, using `DOJO_OAUTH_CLIENT_ID`, `DOJO_OAUTH_CLIENT_SECRET` and `DOJO_URL`. New accounts follow the collection's `access.create`. When one of those variables is missing, or core would refuse the method, it adds nothing and logs `[plugin-dojo] Sign in with Dojo is off for '<slug>': <reason>.` at start. `dojo({ signIn: false })` turns it off. Even without `DOJO=1`, the plugin lists `@frogbotai/ui/admin/rsc#SignInButtons` in `admin.dependencies`, for the same reason as the badge.
- **Badge.** Every FrogBot page, login included, gets a small "Made with FrogBot · Share your own" pill in the bottom-left corner, linking to frogbot.ai with the app's slug as `utm_content`. It's added after the app's own `admin.components.providers`, renders only in the browser after the page has loaded, and makes no request. It stays hidden on collection lists, where it would cover the pagination, and beside the chat input when the window is too narrow. Visitors can close it for the rest of their browser session. Even without `DOJO=1`, the plugin lists the badge in `admin.dependencies`, because Dojo generates the import map at build time, when `DOJO=1` isn't set.
