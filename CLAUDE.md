# Claude Instructions

## Git Commits

- Use Conventional Commits format: `type(scope): message`
  - Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `build`, `ci`, `style`
  - Scope: the package or area (e.g. `gateway`, `frogbot`, `payload-plugin`)
  - Examples: `refactor(gateway): move tool helpers into translators/`, `feat(gateway): add retry-after header support`
- Do NOT use freeform prefixes like `gateway: ...` — always include the type
- Do NOT add the opencode attribution footer to commit messages
- Keep commit messages clean and focused on the actual changes
- Only include the commit message content, no additional attribution or co-authored-by lines

## Communication Style

- **Be concise**: Keep responses under 4 lines unless detail is requested
- **No preamble/postamble**: Skip "Here's what I'll do" or "Based on the analysis"
- **Direct answers**: One word answers are best when possible
- **No unnecessary explanations**: Don't explain code unless asked

## Code Quality Preferences

- **Crisp, clean code**: Favor simplicity over complexity
- **Remove dead code**: Don't keep unused logic (like the "dumb AI" media ID code)
- **Consistent naming**: Use clear, consistent patterns (e.g., `createTextDoc`/`updateTextDoc`)
- **Object parameters**: Prefer object params over multiple individual params for better maintainability

## Specific Patterns I Like

- **Type naming**: Prefix with context (e.g., `ArtifactCreateProps`, `ArtifactDBUpdateProps`)
- **Function naming**: Match types to functions (`dbCreate` → `ArtifactDBCreateProps`)
- **Shorter names**: `createTextDoc` vs `saveTextDocumentToDatabase`
- **Two-case simplification**: Handle exactly what's needed, no over-engineering

## FrogBot Type Naming (`packages/frogbot`)

- **Only use `Frogbot*` prefix when wrapping a Payload type that uses `Payload*` prefix** (e.g., `FrogbotConfig` wraps `PayloadConfig`, `FrogbotRequest` wraps `PayloadRequest`)
- **New domain types should NOT get the `Frogbot` prefix** — the package context is sufficient (e.g., `CollectionConfig`, `Field`, `Endpoint`, `Plugin`)
- **If there's a name collision** with a Payload type, import the Payload type with a `Payload*` alias rather than prefixing our type
- Current valid prefixed types: `FrogbotConfig`, `FrogbotRequest`, `FrogbotInstance`, `FrogbotTypes`, `UntypedFrogbotTypes`

## What NOT to do

- Don't add comments unless requested
- Don't assume libraries are available - check first
- Don't over-engineer solutions
- Don't keep buggy legacy code "just in case"
- **NEVER run git commands** - no checkout, stash, reset, rebase, merge, or any command that modifies git state. Only `git status`, `git log`, `git diff`, and `git show` are allowed for reading.

## Workflow

- Use TodoWrite tool for complex tasks
- Read existing code to understand patterns before changing
- Make changes incrementally and test as you go

## File Organization

- **Internal structure is for contributors, exports are for consumers** — define types/code wherever makes sense for devs working inside the package. Control public API surface separately via the exports layer. Don't conflate "where to define" with "what to export".

## Reference Repos

- **Payload source:** `/Users/colbygilbert/Documents/Code/payload` — ALWAYS check this repo for Payload internals, types, test patterns, and API surface before assuming something doesn't exist or guessing behavior. This is the actual source of truth for what Payload supports.

- **AI SDK by Vercel source:** `/Users/colbygilbert/Documents/Code/ai` — ALWAYS check this repo for AI SDK by Vercel internals, types, test patterns, and API surface before assuming something doesn't exist or guessing behavior. This is the actual source of truth for what AI SDK by Vercel supports.

- **`opencode` source:** `/Users/colbygilbert/Documents/Code/opencode` — ALWAYS check this repo for `opencode` internals, types, test patterns, and API surface before assuming something doesn't exist or guessing behavior. This is the actual source of truth for what `opencode` supports.


