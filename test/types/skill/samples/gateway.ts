import { createGateway, defineConfig } from '@frogbotai/gateway';
import { generateText } from 'ai';

export const config = defineConfig({
  providers: {
    openai: {},
    anthropic: {},
    ollama: {
      baseURL: 'http://localhost:11434/v1',
    },
  },
});

const gateway = createGateway({
  providers: {
    openai: {},
  },
});

export const GET = gateway.handler;
export const POST = gateway.handler;

export async function summarize() {
  const gateway = createGateway({
    providers: {
      openai: {},
    },
  });

  const result = await generateText({
    model: gateway.chatModel('openai/gpt-5'),
    prompt: 'Summarize the release notes.',
  });

  return result;
}

export function authenticatedRequest(request: Request, user: { id: string }) {
  return gateway.handler(request, {
    context: {
      user,
    },
  });
}
