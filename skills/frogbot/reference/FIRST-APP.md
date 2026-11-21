# First App

Use this when the person asks to set up FrogBot or build their first app and the folder has no `frogbot.config.ts`. The goal: one question, then a running app with their data, a login and sample records, before they open a browser.

Don't run `npx skills add` first: `create-frogbot-app` installs this skill into the new app.

## Steps

| #   | Do                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------- |
| 1   | Check `node --version` is 24.22.3 or newer. If not, give <https://nodejs.org/en/download> and wait. |
| 2   | Ask what the app is for, unless the prompt already says. One question, then build.                  |
| 3   | Create the app with every flag set, so nothing prompts.                                             |
| 4   | Build the first version, with sample records.                                                       |
| 5   | Start it with `frogbot up` and make their login.                                                    |
| 6   | Show it, then offer next steps.                                                                     |

Pick every other default yourself and say what you picked in one line. Don't ask about the database, package manager, folder or AI provider.

## 1. Ask one question

Ask: "What should the app keep track of, and who uses it?" If your client has a multiple-choice question tool, use it: three example answers as options, and free text for their own. Fit the examples to anything the prompt said; otherwise:

- My customers and jobs, and who has paid
- A sales pipeline: companies, contacts and deals
- Projects and tasks for my team

When the prompt already names the app ("rebuild our HubSpot", "import my Airtable CSVs"), skip the question. Ask for the CSV files when it mentions them.

## 2. Create the app

```bash
npx create-frogbot-app@latest <name> --yes --template <template> --ai <ai> --agents <agent>
cd <name>
```

| Choice       | Pick                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<name>`     | Short and from their answer, such as `lawn-jobs` or `sales`: lowercase letters, numbers and `-`. It's the folder and, later, the `https://<name>.frogbot.app` address.                                                   |
| `--template` | `crm` for customers, contacts, deals or a sales pipeline; `projects` for projects, tasks or sprints; `blank` for anything else. A close template beats `blank`: rename and trim its collections rather than start empty. |
| `--ai`       | The provider whose key is already in the environment: `anthropic` (`ANTHROPIC_API_KEY`), `openai` (`OPENAI_API_KEY`), `google` (`GOOGLE_GENERATIVE_AI_API_KEY`). No key: `none`. Never ask for a key to get started.     |
| `--agents`   | Your own client: `claude`, `codex`, `cursor`, `opencode`, `copilot` or `gemini`.                                                                                                                                         |

The app comes with this skill. Read its `SKILL.md` before you edit, and follow it from here on.

## 3. Build the first version

- Collections for the things they named, each with an `admin.icon` and `useAsTitle`. Read [COLLECTIONS.md](COLLECTIONS.md), [FIELDS.md](FIELDS.md) and [ADMIN-DESIGN.md](ADMIN-DESIGN.md).
- A list view, plus one board or calendar where the data has a status or a date.
- 5 to 10 sample records that look like their work, from a run-once script that only adds to empty collections. `crm` and `projects` have their own: the dashboard's sample data button, or `POST /api/seed` signed in.
- Their CSV files, when they gave any.
- Then run the steps in "Before You Finish" in `SKILL.md`.

Keep the first version small. One screen they recognise beats ten they don't.

## 4. Start it and make their login

Run `frogbot up` and read the URL it prints. Then create the first login with a run-once script, and delete the script after:

```ts
// scripts/first-login.ts: run with `npx frogbot run scripts/first-login.ts you@example.com`
import { randomBytes } from 'node:crypto';

import { getFrogBot } from 'frogbot';

import config from '../src/frogbot.config';

const email = process.argv[2];
if (!email) throw new Error('Pass an email.');

const frogbot = await getFrogBot({ config });
const { totalDocs } = await frogbot.count({ collection: 'users', overrideAccess: true });
if (totalDocs > 0) throw new Error('This app already has users.');

const password = randomBytes(12).toString('base64url');
await frogbot.create({
  collection: 'users',
  data: { email, name: email.split('@')[0], password },
  overrideAccess: true,
});
console.log(`Login: ${email} / ${password}`);
```

- Use the person's email if you know it, else `you@example.com`. Match `data` to the auth collection's required fields; the templates' users have a `name`.
- A new random password for each app, never a fixed one, so no two FrogBot apps share a login someone could guess.
- The login lives in the local database. `frogbot deploy` sends it only with `--data`, and the skill's deploy rules make that the person's choice. On Dojo they sign in with **Continue with Dojo**, so a first deploy doesn't need `--data` for their login.

## 5. Show it

Send one short message:

- The link and the login.
- What you built, in one line per screen.
- Three things to try, such as "drag a job to Paid".
- What you picked for them in step 2, in one line.

Then offer the next steps, one line each, and do none until they choose:

| Next step           | How                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Put it online       | `npx frogbot deploy`; see "Sharing The App" in `SKILL.md`. Sign-in is a link they approve. |
| Add an AI assistant | Needs a provider key in `.env`; see [AGENTS.md](AGENTS.md).                                |
| Automate a step     | "Remind me when a job is unpaid for a week"; see [AUTOMATIONS.md](AUTOMATIONS.md).         |
