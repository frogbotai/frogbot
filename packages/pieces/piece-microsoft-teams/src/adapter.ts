import { TeamsAdapter } from '@chat-adapter/teams';

import {
  type AdaptiveCard,
  cardActivity,
  QUESTION_ACTION_PREFIX,
  type SettledView,
} from './questions/card.js';

type MessageContext = Parameters<TeamsAdapter['handleMessageActivity']>[0];
type MessageActivity = MessageContext['activity'];
type ChatInstance = NonNullable<TeamsAdapter['chat']>;
type QuestionActionEvent = Parameters<ChatInstance['processAction']>[0];
type Responder = QuestionActionEvent['user'];

type QuestionAction = { actionId: string; value: string };

type QuestionReference = { threadId: string; toolCallId: string };

type ResponderProfile = { email?: string; fullName?: string };

export type QuestionRecord = {
  messageId: string;
  settled?: SettledView;
};

const QUESTION_RECORD_TTL = 30 * 24 * 60 * 60_000;

export class FrogBotTeamsAdapter extends TeamsAdapter {
  async sendAdaptiveCard({
    card,
    threadId,
  }: {
    card: AdaptiveCard;
    threadId: string;
  }): Promise<string> {
    const { conversationId } = this.decodeThreadId(threadId);

    const sent = await this.app.send(conversationId, cardActivity(card));

    if (!sent.id) throw new Error('Microsoft Teams did not return an id for the question card.');

    return sent.id;
  }

  async updateAdaptiveCard({
    card,
    messageId,
    threadId,
  }: {
    card: AdaptiveCard;
    messageId: string;
    threadId: string;
  }): Promise<void> {
    const { conversationId } = this.decodeThreadId(threadId);

    await this.app.api.conversations
      .activities(conversationId)
      .update(messageId, cardActivity(card));
  }

  async findQuestionRecord(reference: QuestionReference): Promise<QuestionRecord | null> {
    if (!this.chat) return null;

    try {
      return await this.chat.getState().get<QuestionRecord>(this.questionRecordKey(reference));
    } catch (error) {
      this.logger.warn('Reading a Teams question record failed', { ...reference, error });

      return null;
    }
  }

  async saveQuestionRecord({
    record,
    ...reference
  }: QuestionReference & { record: QuestionRecord }): Promise<void> {
    try {
      await this.chat
        ?.getState()
        .set(this.questionRecordKey(reference), record, QUESTION_RECORD_TTL);
    } catch (error) {
      this.logger.warn('Saving a Teams question record failed', { ...reference, error });
    }
  }

  logQuestionWarning(message: string, context: Record<string, unknown>): void {
    this.logger.warn(message, context);
  }

  protected override async handleMessageActivity(ctx: MessageContext): Promise<void> {
    const action = questionAction(ctx.activity.value);

    if (!action || !this.chat) return super.handleMessageActivity(ctx);

    const activity = ctx.activity;
    const threadId = this.parseMessage(activity).threadId;

    const [user, messageId] = await Promise.all([
      this.responder(ctx),
      this.questionMessageId({ activity, threadId, toolCallId: action.value }),
    ]);

    this.chat.processAction(
      { ...action, user, messageId, threadId, adapter: this, raw: activity },
      this.bridgeAdapter.getWebhookOptions(activity.id),
    );
  }

  private questionRecordKey({ threadId, toolCallId }: QuestionReference): string {
    return `frogbot:question:${this.channelIdFromThreadId(threadId)}:${toolCallId}`;
  }

  private async responder(ctx: MessageContext): Promise<Responder> {
    const { from } = ctx.activity;

    const profile = (await this.rosterProfile(ctx)) ?? (await this.getUser(from.id));
    const name = from.name || profile?.fullName || from.id;

    return {
      userId: from.id,
      userName: name,
      fullName: name,
      ...(profile?.email ? { email: profile.email } : {}),
      isBot: false,
      isMe: false,
    };
  }

  private async rosterProfile(ctx: MessageContext): Promise<ResponderProfile | null> {
    const { conversation, from } = ctx.activity;

    try {
      const member = await ctx.api.conversations.getMemberById(conversation.id, from.id);
      const email = member.email ?? member.userPrincipalName;

      return {
        ...(email ? { email } : {}),
        ...(member.name ? { fullName: member.name } : {}),
      };
    } catch (error) {
      this.logger.warn('Teams roster lookup for a question responder failed', {
        userId: from.id,
        error,
      });

      return null;
    }
  }

  private async questionMessageId({
    activity,
    threadId,
    toolCallId,
  }: {
    activity: MessageActivity;
    threadId: string;
    toolCallId: string;
  }): Promise<string> {
    if (activity.replyToId) return activity.replyToId;

    const record = await this.findQuestionRecord({ threadId, toolCallId });

    this.logger.debug('Teams question action arrived without replyToId', {
      activityId: activity.id,
      located: Boolean(record),
    });

    return record?.messageId ?? activity.id;
  }
}

function questionAction(value: unknown): QuestionAction | null {
  if (!value || typeof value !== 'object') return null;

  const { actionId, value: toolCallId } = value as Record<string, unknown>;

  if (typeof actionId !== 'string' || !actionId.startsWith(QUESTION_ACTION_PREFIX)) return null;

  if (typeof toolCallId !== 'string' || !toolCallId) return null;

  return { actionId, value: toolCallId };
}
