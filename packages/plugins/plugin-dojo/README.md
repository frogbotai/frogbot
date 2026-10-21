# @frogbotai/plugin-dojo

Runs a FrogBot app on Dojo with no setup: uploads go to the app's R2 bucket, and AI goes through Dojo's gateway.

Dojo adds this plugin when it builds an app, after the app's own plugins, by setting `FROGBOT_PLATFORM_PLUGIN=@frogbotai/plugin-dojo` for `next build` and `frogbot` commands. No app file changes. Outside Dojo it does nothing.

## What it changes

The plugin does nothing unless `DOJO=1`. On Dojo it reads these variables, and boot fails naming any that is missing:

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
- **Badge.** Every FrogBot page, login included, gets a small "Made with FrogBot · Share your own" pill in the bottom-left corner, linking to frogbot.ai with the app's slug as `utm_content`. It's added after the app's own `admin.components.providers`, renders only in the browser after the page has loaded, and makes no request. It stays hidden on collection lists, where it would cover the pagination, and beside the chat input when the window is too narrow. Visitors can close it for the rest of their browser session. Even without `DOJO=1`, the plugin lists the badge in `admin.dependencies`, because Dojo generates the import map at build time, when `DOJO=1` isn't set.
