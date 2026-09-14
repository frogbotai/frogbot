export type ChannelContext = {
  piece: string;
  threadId: string;
  author: {
    id: string;
    username?: string;
    name?: string;
  };
};

export type ChannelConversationIdentity = {
  agent: string;
  piece: string;
  account: string;
  kind: string;
  peer: string;
  parent?: string;
  thread?: string;
};
