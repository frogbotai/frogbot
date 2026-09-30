export interface User {
  id: number;
  email: string;
  role: 'admin' | 'editor';
}

export interface Page {
  id: number;
  title: string;
}

export interface Config {
  agents: {
    assistant: { slug: 'assistant' };
  };
  collections: {
    users: User;
    pages: Page;
  };
  jobs: {
    tasks: {
      'send-notification': {
        input: { recipient: string };
        output: { delivered: boolean };
      };
    };
    workflows: {
      'onboard-account': {
        input: { accountID: number };
      };
    };
  };
  roles: 'admin' | 'editor';
}

declare module 'frogbot' {
  export interface GeneratedTypes extends Config {
    collections: Config['collections'];
  }
}

declare module 'frogbot-copy' {
  export interface GeneratedTypes extends Config {
    collections: Config['collections'];
  }
}
