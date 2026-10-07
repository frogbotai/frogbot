# Step 1: Research

A fresh research agent writes `step1_research.md` from `issue.md`. Later agents read only the Summary, so it carries every answer, every decision for the spec, and the citations they rest on.

- Answer each question in `issue.md`, and say what Payload does for each one. For chat and agent work, look at opencode-v2 or Firmware instead.
- Cite `path:line`. Write reference paths as `~/code/<repo>/path:line`; a bare path is FrogBot.
- Read the implementation, its types and its tests, not only search hits. A claim that something doesn't exist needs several searches and a read of the closest module.
- List choices only the owner can make under "Decisions for the spec", one line each. The spec turns them into cards.
- Read `.idea/_process/decisions.md` and copy every ruling that applies into the Summary, each row whole. If none applies, write `- **Rulings:** none (read: <topic>, <topic>)` with the headings you read.
- Run `pnpm check ticket-docs <n>` before returning.

## Template

```markdown
# Research: Ticket <n> — <title>

Status: Draft | Done (<date>)

## Summary

<40 lines or fewer.>

- **Rulings:**
  - DR-<nnn> "<quote>" → <rule>. [source](link)
- **Q1 <question>:** <answer> (`path:line`).
  - What Payload does: <behaviour> (`~/code/payload/path:line`), or no equivalent (searched <terms>).
- **Decisions for the spec:** <one line each>, or none.
- **Risks:** <one line each>, or none.

## Details

<The evidence behind the summary, by question.>
```

## Reference repos

| Question                                  | Where to look                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Current FrogBot behaviour                 | This repo: public API, implementation, types, callers, tests, fixtures                                 |
| Collections, fields, access, hooks, admin | `~/code/payload`; `~/code/payload-ai` for AI integration patterns                                      |
| AI SDK options, providers, wire format    | The installed `ai` and `@ai-sdk/*` source first, then `~/code/ai`; note any version skew               |
| Admin and chat UI                         | `~/code/firmware` (`apps/web`, `apps/desktop`, `packages/app`, `packages/ui`) is the UI spec           |
| Gateway translation, schemas, streaming   | Both `~/code/hebo-gateway` and `~/code/portkey-gateway-embed`                                          |
| Client requests, SSE, retries, errors     | `~/code/hermes-agent` and the matching opencode line                                                   |
| Agent, tool and config runtime            | `~/code/opencode` (1.x) or `~/code/opencode-v2` (2.x); label the line, check both when they may differ |
| Other CMS designs                         | `~/code/strapi`, `~/code/directus`: ideas only, never authority                                        |
| Not available locally                     | Official specs or docs, cited with URL and date                                                        |
