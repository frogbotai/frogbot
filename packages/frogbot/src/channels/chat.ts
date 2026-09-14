import { Chat } from 'chat';

export class ChannelChat extends Chat {
  override processMessage(...args: Parameters<Chat['processMessage']>): Promise<void> {
    const task = super.processMessage(...args);

    args[3]?.waitUntil?.(task);

    return task;
  }
}
