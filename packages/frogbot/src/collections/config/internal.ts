type WithCustom = { custom?: Record<string, unknown> };

/**
 * Whether FrogBot or one of its plugins runs this collection for itself (chats, API keys, logs),
 * marked with `custom: { frogbot: { internal: true } }`. App-facing surfaces such as MCP leave it out.
 */
export function isInternalCollection({ custom }: WithCustom): boolean {
  const frogbot: unknown = custom?.frogbot;

  return typeof frogbot === 'object' && frogbot !== null && 'internal' in frogbot
    ? frogbot.internal === true
    : false;
}
