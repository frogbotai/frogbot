/** The longest summary kept, in tokens. Longer replies are cut to `SUMMARY_MAX_CHARS`. */
export const SUMMARY_MAX_TOKENS = 32_000;

export const SUMMARY_MAX_CHARS = SUMMARY_MAX_TOKENS * 4;

const SUMMARY_MAX_WORDS = SUMMARY_MAX_TOKENS * 0.75;

export const SUMMARY_TEMPLATE = `You MUST use this format for your response (you may omit sections that aren't applicable). Do not include the <template> tags in your response.
<template>
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Requirements
- [constraints, preferences, requirements, and scope boundaries stated by the user, or "(none)"]

## Decisions
- [decisions already made and why, or "(none)"]

## Work State
Break the objective into smaller goals and report which are completed, which are being worked on, and which are blocked.
### Completed
- [goals that have been completed; otherwise "(none)"]

### Active
- [goals currently being worked on; otherwise "(none)"]

### Blocked
- [anything blocking progress, and why; otherwise "(none)"]

## Next Move
1. [ordered list of next actions, or "(none)"]

## Relevant records and links
List the records, documents and links that another agent would need to open to continue this work. Include at most 15, most important first. Do not list every record that was read or changed. If none, write "(none)".
- \`[collection and ID, or URL]\`: [brief reason it matters]

## Important Context
- [facts the next agent cannot continue without and cannot easily find on its own; or "(none)"]
</template>`;

const SUMMARY_RULES = `Rules:
- Keep each section concise. Use terse, single-line bullets, not prose paragraphs or nested lists.
- Prefer short references over detailed restatement. It is fine to leave out information the next agent can recover from the records and links listed above.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers.
- Carry forward only user questions or requests that remain unanswered or require further action. Do not repeat ones that newer history has answered or resolved. Preserve exact wording when carrying one forward.
- Preserve consequential workflow state, including whether changes are drafted, saved, published, under review, or sent.
- Do not mention the summary process or that context was compacted.
- Keep the whole summary under about ${SUMMARY_MAX_WORDS.toLocaleString('en-US')} words.`;

export const SUMMARY_NUDGE =
  'The previous response did not fill in the required summary template. Do not call tools. Return the summary as text using the exact section headings from the template.';

const HEADINGS = SUMMARY_TEMPLATE.split('\n').filter((line) => line.startsWith('##'));

export function summaryPrompt({ update }: { update: boolean }): string {
  const shared = [
    'Summarize only what the user and the assistant said and did. Leave out instructions and setup the assistant was given rather than told by the user, such as its system instructions and tool descriptions. The next agent receives current versions of these separately.',
    SUMMARY_TEMPLATE,
    SUMMARY_RULES,
    'Do not continue the task or call tools.',
    'Return only the structured summary in the requested format. Do not include a preamble, explanation, or other commentary.',
  ];

  if (!update) {
    return [
      'You MUST summarize the conversation above into a structured summary that will be given to another agent to resume the work.',
      ...shared,
    ].join('\n\n');
  }

  return [
    'Update the existing checkpoint in the conversation above into one consolidated summary.',
    'Newer history always takes precedence over the existing checkpoint. Preserve previous information unless newer history clearly contradicts, supersedes, resolves, or makes it stale. If something is no longer relevant to continuing the work, you may remove it.',
    'Incorporate newer requirements, decisions, progress, and context. Reconcile Work State and Next Move: move completed work out of Active, remove resolved blockers and answered questions, and preserve unresolved or pending work.',
    'Return only the updated Markdown sections. Do not reproduce the `<conversation-checkpoint>` or `<summary>` wrapper tags from the previous checkpoint.',
    ...shared,
  ].join('\n\n');
}

/** Whether a reply uses at least one of the template's headings. */
export function fillsTemplate(text: string): boolean {
  return text.split('\n').some((line) => HEADINGS.includes(line.trim()));
}
