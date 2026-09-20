export interface WelcomeWidget {
  data?: {
    heading: string;
  };
  width: 'small' | 'medium';
}

export interface Config {
  widgets: {
    welcome: WelcomeWidget;
  };
}

declare module 'frogbot' {
  export interface GeneratedTypes extends Config {
    widgets: Config['widgets'];
  }
}
