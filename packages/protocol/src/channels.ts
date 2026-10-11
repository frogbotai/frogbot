/** The channel conversation a chat mirrors. `TThread` is the channel's serialized thread. */
export type ChannelThreadReference<TThread = unknown> = {
  account: string;
  thread: TThread;
};
