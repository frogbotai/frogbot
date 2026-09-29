# create-frogbot-app

Create a new [FrogBot](https://docs.frogbot.ai) app: a Next.js project with an AI agent, chat, an admin panel, and a database, ready to run.

```bash
npx create-frogbot-app@latest my-frogbot
```

The command asks a few questions, installs dependencies, and then sets up Git, so the first commit includes the lockfile. Then start the app:

```bash
cd my-frogbot
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create your admin account. The dashboard lists your collections; open **Chats** in the sidebar and select **Create New** to talk to your agent.

New to this? The [step-by-step setup](https://docs.frogbot.ai/getting-started/setup) explains each step, and [Start with a coding agent](https://docs.frogbot.ai/getting-started/coding-agent) has a prompt that lets Codex, Claude Code, or another coding agent do it for you.

## Usage

```bash
npx create-frogbot-app@latest [project-name] [options]
```

| Option                      | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `-n, --name <name>`         | Project name                                                     |
| `-t, --template <template>` | Template (default: blank)                                        |
| `-d, --db <database>`       | sqlite, postgres, or mongodb                                     |
| `--ai <provider>`           | openai, anthropic, google, bedrock, zen, or none                 |
| `--api-key <key>`           | API key for the chosen provider (written to .env)                |
| `--agents <targets>`        | Comma-separated claude, codex, cursor, opencode, copilot, gemini |
| `--no-agents`               | Do not install coding-agent skills                               |
| `--use-npm`                 | Use npm                                                          |
| `--use-pnpm`                | Use pnpm                                                         |
| `--use-yarn`                | Use yarn                                                         |
| `--use-bun`                 | Use bun                                                          |
| `--no-git`                  | Do not initialize git                                            |
| `--no-install`              | Do not install dependencies                                      |
| `--no-deps`                 | Alias for --no-install                                           |
| `-y, --yes`                 | Accept defaults without prompts                                  |
| `-h, --help`                | Show help                                                        |

Pass the project name once, either as the first argument or with `--name`.

## Defaults

| Setting         | Default                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Template        | `blank`                                                                                                                        |
| Database        | SQLite                                                                                                                         |
| AI provider     | OpenAI (`openai/gpt-5.4-mini`), which needs `OPENAI_API_KEY`                                                                   |
| Package manager | The one that ran the command (npm when you use `npx`)                                                                          |
| Git             | A new repository whose initial commit includes the lockfile, unless the folder is already inside a Git or Mercurial repository |
| Dependencies    | Installed                                                                                                                      |
| Coding agents   | None                                                                                                                           |

## Run without prompts

The questions appear only in an interactive terminal. With `--yes`, or when no terminal is attached (for example in CI or when a coding agent runs the command), every unset choice uses its default and the project name is required:

```bash
npx create-frogbot-app@latest my-frogbot --yes --agents codex
```

Pass the provider key with `--api-key` to write it to `.env`. Without prompts, a key already set in your environment (such as `OPENAI_API_KEY`) is not copied into the app; the scaffolder says so and reminds you to add the key to `.env`. In an interactive terminal, it asks whether to use that key for the app instead.

Project names use lowercase letters, numbers, dots, dashes, and underscores, and start with a letter or number. The name is also the folder the project is created in, inside the current directory.

## What gets created

- The app, with `src/frogbot.config.ts` configuring the database, the AI provider, and two agents (`general` and `assistant`).
- `.env` with a generated `FROGBOT_SECRET`, the database URL, and the provider key line (filled in if you gave a key). Git ignores this file.
- `.env.example` with the same variable names and no secrets.
- For each coding agent you choose, the FrogBot skill and an instruction file that points to it:

| `--agents` value              | Skill directory           | Instruction file                  |
| ----------------------------- | ------------------------- | --------------------------------- |
| `claude`                      | `.claude/skills/frogbot/` | `CLAUDE.md`                       |
| `codex`, `cursor`, `opencode` | `.agents/skills/frogbot/` | `AGENTS.md`                       |
| `copilot`                     | `.agents/skills/frogbot/` | `.github/copilot-instructions.md` |
| `gemini`                      | `.agents/skills/frogbot/` | `GEMINI.md`                       |

See [Coding agents](https://docs.frogbot.ai/skills/coding-agents) for other ways to install the skill.

## Troubleshooting

| Message                                                                             | What to do                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Directory "<name>" already exists.`                                                | Choose another project name, or remove the existing folder.                                                                                    |
| `A project name is required. Pass --name <name>.`                                   | Pass a name as the first argument or with `--name`. This happens with `--yes` or without a terminal.                                           |
| `Provide the project name once, either positionally or with --name.`                | Pass one name without spaces, either as the first argument or with `--name`, not both.                                                         |
| `Invalid project name "<name>". Use lowercase letters, numbers, …`                  | Use lowercase letters, numbers, dots, dashes, or underscores, starting with a letter or number.                                                |
| `Set <KEY_NAME> in <name>/.env. The app won't start without it.`                    | OpenAI, Anthropic, or Google: add your key to `.env` before you run the app.                                                                   |
| `Set <KEY_NAME> in <name>/.env before chatting.`                                    | Bedrock or Zen: add your key to `.env` before you chat. The Bedrock message also offers `AWS_PROFILE`.                                         |
| `Found <KEY_NAME> in your environment but did not copy it to <name>/.env. …`        | The key works only in terminals where it is set. Add it to `.env` so the app always has it.                                                    |
| `<package-manager> install failed. Git was not initialized. …`                      | Fix the error shown above it and run the install command in the project folder. Git runs after the install, so set up the repository yourself. |
| `FrogBot skill is not bundled in this build; run npx skills add frogbotai/frogbot.` | Run `npx skills add frogbotai/frogbot` inside the project folder.                                                                              |

Errors print one line that starts with `[create-frogbot-app] error:`, and the command exits with status 1. A longer report with a stack trace means an unexpected problem; please [open an issue](https://github.com/frogbotai/frogbot/issues).

FrogBot needs Node.js 22 or newer. Once the app runs, a key set in your shell takes priority over the one in `.env`.

## Links

- [Documentation](https://docs.frogbot.ai)
- [Installation options](https://docs.frogbot.ai/getting-started/installation)
- [GitHub](https://github.com/frogbotai/frogbot)
