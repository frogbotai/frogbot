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
