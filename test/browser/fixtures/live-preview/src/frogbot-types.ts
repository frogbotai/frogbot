import 'frogbot';

declare module 'frogbot' {
  interface GeneratedTypes {
    collections: {
      pages: Page;
      users: User;
    };
  }
}

export interface Page {
  id: number | string;
  title: string;
  slug: string;
}

export interface User {
  id: number | string;
  email: string;
}
