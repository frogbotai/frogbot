import type { FrogBotRequest } from 'frogbot';
import type { PieceChannelQuestions, QuestionInteraction, QuestionMessage } from 'frogbot/pieces';

type Thread = Parameters<PieceChannelQuestions['render']>[0]['thread'];

type ChatMessage = Extract<QuestionInteraction, { type: 'message' }>['message'];

type GithubRawComment = { comment?: { body?: unknown; created_at?: unknown } };

export async function postComments({
  bodies,
  q,
  thread,
}: {
  bodies: string[];
  q: number;
  thread: Thread;
}): Promise<QuestionMessage[]> {
  const messages: QuestionMessage[] = [];

  try {
    for (const body of bodies) {
      const sent = await thread.adapter.postMessage(thread.id, { raw: body });

      messages.push({ id: sent.id, postedAt: postedAt(sent.raw), question: q });
    }
  } catch (error) {
    await Promise.allSettled(messages.map(({ id }) => thread.adapter.deleteMessage(thread.id, id)));

    throw error;
  }

  return messages;
}

export async function editComments({
  edits,
  req,
  thread,
  toolCallId,
}: {
  edits: Array<{ body: string; id: string }>;
  req: FrogBotRequest;
  thread: Thread;
  toolCallId: string;
}): Promise<void> {
  const results = await Promise.allSettled(
    edits.map(({ body, id }) => thread.adapter.editMessage(thread.id, id, { raw: body })),
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return;

    req.frogbot.logger.error(
      { err: result.reason, piece: 'github', toolCallId, commentId: edits[index]!.id },
      '[piece-github] Could not close a question comment.',
    );
  });
}

export async function postNotice({
  interaction,
  text,
  thread,
}: {
  interaction: QuestionInteraction;
  text: string;
  thread: Thread;
}): Promise<void> {
  const login = interaction.type === 'message' ? commenter(interaction.message) : '';

  await thread.adapter.postMessage(thread.id, { raw: login ? `\`@${login}\` ${text}` : text });
}

export function commentBody(message: ChatMessage): string {
  const body = (message.raw as GithubRawComment | undefined)?.comment?.body;

  return typeof body === 'string' ? body : message.text;
}

export function commenter(message: ChatMessage): string {
  return message.author.userName || message.author.userId;
}

function postedAt(raw: unknown): string {
  const created = (raw as GithubRawComment | undefined)?.comment?.created_at;
  const at = typeof created === 'string' ? Date.parse(created) : Number.NaN;

  return Number.isFinite(at) ? new Date(at).toISOString() : '';
}
