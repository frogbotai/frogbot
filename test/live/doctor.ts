import './env.ts';

type Probe = {
  name: string;
  keys: string[];
  check?: (env: Record<string, string>) => Promise<Response | string>;
};

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const get = (url: string, headers: Record<string, string> = {}) => fetch(url, { headers });

const postJson = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const PROBES: Probe[] = [
  {
    name: 'openai',
    keys: ['OPENAI_API_KEY'],
    check: (env) => get('https://api.openai.com/v1/models', bearer(env.OPENAI_API_KEY)),
  },
  {
    name: 'anthropic',
    keys: ['ANTHROPIC_API_KEY'],
    check: (env) =>
      get('https://api.anthropic.com/v1/models', {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      }),
  },
  {
    name: 'google',
    keys: ['GOOGLE_GENERATIVE_AI_API_KEY'],
    check: (env) =>
      get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
      ),
  },
  {
    name: 'fireworks',
    keys: ['FIREWORKS_API_KEY'],
    check: (env) =>
      get('https://api.fireworks.ai/inference/v1/models', bearer(env.FIREWORKS_API_KEY)),
  },
  {
    name: 'groq',
    keys: ['GROQ_API_KEY'],
    check: (env) => get('https://api.groq.com/openai/v1/models', bearer(env.GROQ_API_KEY)),
  },
  {
    name: 'mistral',
    keys: ['MISTRAL_API_KEY'],
    check: (env) => get('https://api.mistral.ai/v1/models', bearer(env.MISTRAL_API_KEY)),
  },
  {
    name: 'xai',
    keys: ['XAI_API_KEY'],
    check: (env) => get('https://api.x.ai/v1/models', bearer(env.XAI_API_KEY)),
  },
  {
    name: 'deepseek',
    keys: ['DEEPSEEK_API_KEY'],
    check: (env) => get('https://api.deepseek.com/models', bearer(env.DEEPSEEK_API_KEY)),
  },
  {
    name: 'cohere',
    keys: ['COHERE_API_KEY'],
    check: (env) => get('https://api.cohere.com/v1/models', bearer(env.COHERE_API_KEY)),
  },
  {
    name: 'voyage',
    keys: ['VOYAGE_API_KEY'],
    check: (env) =>
      postJson(
        'https://api.voyageai.com/v1/embeddings',
        { input: ['ok'], model: 'voyage-3-lite' },
        bearer(env.VOYAGE_API_KEY),
      ),
  },
  {
    name: 'replicate',
    keys: ['REPLICATE_API_TOKEN'],
    check: (env) => get('https://api.replicate.com/v1/account', bearer(env.REPLICATE_API_TOKEN)),
  },
  { name: 'fal', keys: ['FAL_API_KEY'] },
  {
    name: 'elevenlabs',
    keys: ['ELEVENLABS_API_KEY'],
    check: (env) =>
      get('https://api.elevenlabs.io/v1/user', { 'xi-api-key': env.ELEVENLABS_API_KEY }),
  },
  {
    name: 'deepgram',
    keys: ['DEEPGRAM_API_KEY'],
    check: (env) =>
      get('https://api.deepgram.com/v1/projects', {
        authorization: `Token ${env.DEEPGRAM_API_KEY}`,
      }),
  },
  {
    name: 'bedrock',
    keys: ['AWS_BEARER_TOKEN_BEDROCK'],
    check: (env) =>
      postJson(
        `https://bedrock-runtime.${env.AWS_REGION ?? 'us-east-1'}.amazonaws.com/model/${encodeURIComponent('global.anthropic.claude-haiku-4-5-20251001-v1:0')}/converse`,
        {
          messages: [{ role: 'user', content: [{ text: 'hi' }] }],
          inferenceConfig: { maxTokens: 1 },
        },
        bearer(env.AWS_BEARER_TOKEN_BEDROCK),
      ),
  },
  { name: 'bedrock (profile)', keys: ['AWS_PROFILE'] },
  { name: 'vertex', keys: ['GOOGLE_VERTEX_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS'] },
  { name: 'azure', keys: ['AZURE_API_KEY', 'AZURE_RESOURCE_NAME'] },
  {
    name: 'opencode zen',
    keys: ['OPENCODE_API_KEY'],
    check: (env) => get('https://opencode.ai/zen/v1/models', bearer(env.OPENCODE_API_KEY)),
  },
  {
    name: 'openrouter',
    keys: ['OPENROUTER_API_KEY'],
    check: (env) => get('https://openrouter.ai/api/v1/key', bearer(env.OPENROUTER_API_KEY)),
  },
  {
    name: 'vercel ai gateway',
    keys: ['AI_GATEWAY_API_KEY'],
    check: (env) => get('https://ai-gateway.vercel.sh/v1/credits', bearer(env.AI_GATEWAY_API_KEY)),
  },
  {
    name: 'brave search',
    keys: ['BRAVE_API_KEY'],
    check: (env) =>
      get('https://api.search.brave.com/res/v1/web/search?q=frogbot&count=1', {
        'x-subscription-token': env.BRAVE_API_KEY,
      }),
  },
  {
    name: 'exa',
    keys: ['EXA_API_KEY'],
    check: (env) =>
      postJson(
        'https://api.exa.ai/search',
        { query: 'frogbot', numResults: 1 },
        { 'x-api-key': env.EXA_API_KEY },
      ),
  },
  {
    name: 'slack',
    keys: ['SLACK_BOT_TOKEN'],
    check: async (env) => {
      const response = await postJson(
        'https://slack.com/api/auth.test',
        {},
        bearer(env.SLACK_BOT_TOKEN),
      );

      const body = (await response.json()) as { ok?: boolean; error?: string; team?: string };

      return body.ok ? `team ${body.team}` : `error ${body.error}`;
    },
  },
  {
    name: 'github',
    keys: ['GITHUB_TOKEN', 'GITHUB_TEST_REPO'],
    check: (env) =>
      get(`https://api.github.com/repos/${env.GITHUB_TEST_REPO}`, bearer(env.GITHUB_TOKEN)),
  },
  {
    name: 'google oauth',
    keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
    check: (env) =>
      fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: env.GOOGLE_REFRESH_TOKEN,
          grant_type: 'refresh_token',
        }),
      }),
  },
  {
    name: 'notion',
    keys: ['NOTION_TOKEN'],
    check: (env) =>
      get('https://api.notion.com/v1/users/me', {
        ...bearer(env.NOTION_TOKEN),
        'notion-version': '2022-06-28',
      }),
  },
  {
    name: 'linear',
    keys: ['LINEAR_API_KEY'],
    check: (env) =>
      postJson(
        'https://api.linear.app/graphql',
        { query: '{ viewer { id } }' },
        { authorization: env.LINEAR_API_KEY },
      ),
  },
  {
    name: 'stripe',
    keys: ['STRIPE_TEST_SECRET_KEY'],
    check: async (env) => {
      if (!env.STRIPE_TEST_SECRET_KEY.startsWith('sk_test_')) return 'error not a test-mode key';

      return get('https://api.stripe.com/v1/balance', bearer(env.STRIPE_TEST_SECRET_KEY));
    },
  },
  {
    name: 'airtable',
    keys: ['AIRTABLE_TOKEN'],
    check: (env) => get('https://api.airtable.com/v0/meta/whoami', bearer(env.AIRTABLE_TOKEN)),
  },
  {
    name: 'resend',
    keys: ['RESEND_API_KEY'],
    check: (env) => get('https://api.resend.com/domains', bearer(env.RESEND_API_KEY)),
  },
  { name: 'neon', keys: ['NEON_DATABASE_URL'] },
  { name: 'atlas', keys: ['ATLAS_URI'] },
  {
    name: 'telegram',
    keys: ['TELEGRAM_BOT_TOKEN'],
    check: (env) => get(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`),
  },
  {
    name: 'discord',
    keys: ['DISCORD_BOT_TOKEN'],
    check: (env) =>
      get('https://discord.com/api/v10/users/@me', {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      }),
  },
];

async function runProbe(probe: Probe): Promise<string> {
  const missing = probe.keys.filter((key) => !process.env[key]);

  if (missing.includes(probe.keys[0])) return '–  not set';

  if (missing.length > 0) return `✗  missing ${missing.join(', ')}`;

  if (!probe.check) return '✓  set (not probed)';

  try {
    const result = await probe.check(process.env as Record<string, string>);

    if (typeof result === 'string') {
      return result.startsWith('error') ? `✗  ${result}` : `✓  ${result}`;
    }

    if (result.ok) return '✓  working';

    const detail = (await result.text()).replace(/\s+/g, ' ').slice(0, 120);

    return `✗  ${result.status} ${detail}`;
  } catch (error) {
    return `✗  ${(error as Error).message}`;
  }
}

const results = await Promise.all(PROBES.map(runProbe));
const width = Math.max(...PROBES.map((probe) => probe.name.length)) + 2;

PROBES.forEach((probe, index) => {
  process.stdout.write(`${probe.name.padEnd(width)}${results[index]}\n`);
});

if (results.some((result) => result.startsWith('✗'))) process.exitCode = 1;
