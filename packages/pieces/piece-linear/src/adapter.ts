import { LinearAdapter, type LinearRawMessage } from '@chat-adapter/linear';
import type { AgentSessionEventWebhookPayload } from '@linear/sdk/webhooks';

export type LinearChannelRawMessage = LinearRawMessage & { agentActivitySignal?: string };

export class LinearChannelAdapter extends LinearAdapter {
  protected override parseMessageFromAgentSessionEvent(payload: AgentSessionEventWebhookPayload) {
    const message = super.parseMessageFromAgentSessionEvent(payload);
    const signal = payload.action === 'prompted' ? payload.agentActivity?.signal : undefined;

    if (!message || !signal) return message;

    const raw: LinearChannelRawMessage = { ...message.raw, agentActivitySignal: signal };

    return this.parseMessage(raw);
  }
}
