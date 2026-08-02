import { describe, expect, it, vi } from "vitest";

import type { Frogbot } from "../frogbot.js";
import { getCachedFrogbot, resetFrogbotCache } from "../getFrogbot.js";
import {
  getFrogbotInstance,
  registerFrogbotInstance,
} from "../instanceRegistry.js";
import type { CollectionConfig } from "../types/collection.js";
import type { FrogbotConfig } from "../types/config.js";

vi.mock("payload", () => ({
  buildConfig: vi.fn((config: unknown) => Promise.resolve(config)),
  handleEndpoints: vi.fn(),
}));

const { sanitize } = await import("./sanitize.js");

function makeConfig(overrides?: Partial<FrogbotConfig>): FrogbotConfig {
  return {
    secret: "test-secret",
    db: {} as FrogbotConfig["db"],
    collections: [
      { slug: "users", auth: true, fields: [{ name: "name", type: "text" }] },
    ],
    ...overrides,
  };
}

function makePayload(config: unknown) {
  return {
    config,
    secret: "test-secret",
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
    db: {},
    kv: {},
    email: {},
  };
}

function emailWarnings(warn: ReturnType<typeof vi.fn>) {
  return warn.mock.calls.filter(([message]) =>
    String(message).includes("No email adapter provided"),
  );
}

describe("frogbot sanitize", () => {
  it("throws `[frogbot] `globals` is not a FrogBot concept` when `globals` is present", () => {
    const config = makeConfig() as unknown as Record<string, unknown>;
    config.globals = [{ slug: "site", fields: [] }];
    expect(() => sanitize(config as unknown as FrogbotConfig)).toThrowError(
      "[frogbot] `globals` is not a FrogBot concept",
    );
  });

  it("returns a FrogbotSanitizedConfig with collections metadata", () => {
    const config = makeConfig({
      collections: [
        { slug: "users", auth: true, fields: [] },
        { slug: "projects", fields: [] },
      ],
    });
    const result = sanitize(config);
    expect(result.collections).toEqual([
      { slug: "users", auth: true },
      { slug: "projects", auth: false },
      { slug: "files", auth: false },
    ]);
  });

  it("preserves the secret in the sanitized config", () => {
    const config = makeConfig();
    const result = sanitize(config);
    expect(result.secret).toBe("test-secret");
  });

  it("injects and configures the default files collection", () => {
    const result = sanitize(makeConfig());
    expect(result.collections.map((collection) => collection.slug)).toContain(
      "files",
    );
    expect(result.files).toEqual({ slug: "files" });
  });

  it("propagates an adopted files collection slug", () => {
    const result = sanitize(
      makeConfig({
        collections: [
          { slug: "users", auth: true, fields: [] },
          { slug: "documents", file: true, fields: [] },
        ],
      }),
    );
    expect(result.files).toEqual({ slug: "documents" });
    expect(
      result.collections.map((collection) => collection.slug),
    ).not.toContain("files");
  });

  it("stores a payloadConfig promise in _internal", () => {
    const config = makeConfig();
    const result = sanitize(config);
    expect(result._internal.payloadConfig).toBeInstanceOf(Promise);
  });

  it("keeps repeated sanitization and codegen quiet when email is omitted", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      sanitize(makeConfig());
      sanitize(makeConfig());
      sanitize(makeConfig(), { mode: "codegen" });

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("installs the FrogBot noop email adapter when email is omitted", async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);
    const email = payloadConfig.email as unknown as (args: unknown) => {
      name: string;
    };

    expect(email({ payload }).name).toBe("frogbot-noop");
  });

  it("captures auth boolean state into custom.frogbot.auth in the payload config", async () => {
    const config = makeConfig({
      collections: [
        { slug: "users", auth: true, fields: [] },
        { slug: "posts", fields: [] },
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const users = (payloadConfig as any).collections.find(
      (c: any) => c.slug === "users",
    );  
    const posts = (payloadConfig as any).collections.find(
      (c: any) => c.slug === "posts",
    );  
    expect(users.custom.frogbot.auth).toBe(true);
    expect(posts.custom.frogbot.auth).toBe(false);
  });

  it("preserves pre-existing custom fields on collections in the payload config", async () => {
    const config = makeConfig({
      collections: [
        {
          slug: "projects",
          custom: { myKey: "hello" },
          fields: [],
        },
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const projects = (payloadConfig as any).collections.find(
      (c: any) => c.slug === "projects",
    );  
    expect(projects.custom.myKey).toBe("hello");
    expect(projects.custom.frogbot).toBeDefined();
  });

  it("prepends the bootstrap beforeOperation hook in the payload config", async () => {
    const existingHook = () => {};
    const config = makeConfig({
      collections: [
        {
          slug: "users",
          auth: true,
          fields: [],
          hooks: { beforeOperation: [existingHook] },
        } as unknown as CollectionConfig,
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const users = (payloadConfig as any).collections.find(
      (c: any) => c.slug === "users",
    );  
    const hooks = users.hooks?.beforeOperation ?? [];
    expect(hooks.length).toBe(2);
    expect(hooks[1]).toBe(existingHook);
  });

  it("wraps per-collection custom endpoint handlers in the payload config", async () => {
    const handler = () => new Response("ok");
    const config = makeConfig({
      collections: [
        {
          slug: "users",
          auth: true,
          fields: [],
          endpoints: [{ path: "/test", method: "get", handler }],
        },
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const users = (payloadConfig as any).collections.find(
      (c: any) => c.slug === "users",
    );  
    const endpoints = users.endpoints as any[];  
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].handler).not.toBe(handler);
  });

  it("wraps root-level custom endpoint handlers in the payload config", async () => {
    const handler = () => new Response("ok");
    const config = makeConfig({
      endpoints: [{ path: "/health", method: "get", handler }],
    } as any);  
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const endpoints = (payloadConfig as any).endpoints as any[];  
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].handler).not.toBe(handler);
  });

  it("binds endpoint requests to the Frogbot instance for their Payload instance", async () => {
    const handler = vi.fn(() => new Response("ok"));
    const result = sanitize(
      makeConfig({
        endpoints: [{ path: "/health", method: "get", handler }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (
      payloadConfig as unknown as {
        endpoints: { handler: (req: unknown) => Promise<Response> }[];
      }
    ).endpoints[0];
    const payload = {};
    const frogbot = { agents: {} };
    registerFrogbotInstance(payload, frogbot as any);  

    await endpoint.handler({ payload });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ frogbot }));
    expect(payload).not.toHaveProperty("frogbot");
  });

  it("registers and caches Frogbot during Payload initialization", async () => {
    resetFrogbotCache();
    const onInit = vi.fn();
    const result = sanitize(makeConfig({ onInit }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);

    const frogbot = getFrogbotInstance(payload);
    expect(frogbot).toBeDefined();
    expect(getCachedFrogbot()).toBe(frogbot);
    expect(onInit).toHaveBeenCalledOnce();
  });

  it("initializes a Payload instance idempotently", async () => {
    resetFrogbotCache();
    const onInit = vi.fn();
    const result = sanitize(makeConfig({ onInit }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);
    const first = getFrogbotInstance(payload);
    await payloadConfig.onInit?.(payload as never);

    expect(first).toBeDefined();
    expect(getFrogbotInstance(payload)).toBe(first);
    expect(onInit).toHaveBeenCalledOnce();
  });

  it("warns once through the initialized logger when Payload initialization omits email", async () => {
    resetFrogbotCache();
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);
    await payloadConfig.onInit?.(payload as never);

    expect(emailWarnings(payload.logger.warn)).toHaveLength(1);
  });

  it("does not warn during Payload initialization when email is configured", async () => {
    resetFrogbotCache();
    const result = sanitize(
      makeConfig({ email: (() => ({})) as FrogbotConfig["email"] }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);

    expect(emailWarnings(payload.logger.warn)).toHaveLength(0);
  });

  it("does not warn during production-build Payload initialization", async () => {
    resetFrogbotCache();
    const previousPhase = process.env.NEXT_PHASE;
    process.env.NEXT_PHASE = "phase-production-build";
    try {
      const result = sanitize(makeConfig());
      const payloadConfig = await result._internal.payloadConfig;
      const payload = makePayload(payloadConfig);

      await payloadConfig.onInit?.(payload as never);

      expect(emailWarnings(payload.logger.warn)).toHaveLength(0);
    } finally {
      process.env.NEXT_PHASE = previousPhase;
    }
  });

  it("recovers endpoint requests when lifecycle registration is missing", async () => {
    resetFrogbotCache();
    const handler = vi.fn((req) => Response.json({ attached: Boolean(req.frogbot) }));
    const result = sanitize(
      makeConfig({ endpoints: [{ path: "/health", method: "get", handler }] }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (payloadConfig as any).endpoints[0];  
    const payload = makePayload(payloadConfig);

    const response = await endpoint.handler({ payload });

    await expect(response.json()).resolves.toEqual({ attached: true });
    expect(getFrogbotInstance(payload)).toBeDefined();
    expect(getCachedFrogbot()).toBe(getFrogbotInstance(payload));
  });

  it("recovers operations when lifecycle registration is missing", async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const collection = payloadConfig.collections[0];
    const bootstrap = collection.hooks.beforeOperation[0];
    const payload = makePayload(payloadConfig);
    const req = { payload };

    await bootstrap({ req });

    expect(req).toHaveProperty("frogbot", getFrogbotInstance(payload));
  });

  it("deduplicates concurrent lazy registration", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onInit = vi.fn(() => pending);
    const handler = vi.fn(() => new Response("ok"));
    const result = sanitize(
      makeConfig({
        onInit,
        endpoints: [{ path: "/health", method: "get", handler }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (payloadConfig as any).endpoints[0];  
    const payload = makePayload(payloadConfig);

    const first = endpoint.handler({ payload });
    const second = endpoint.handler({ payload });
    await vi.waitFor(() => expect(onInit).toHaveBeenCalledOnce());
    release();
    await Promise.all([first, second]);

    expect(onInit).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("propagates the real lazy initialization error", async () => {
    const error = new Error("real initialization failure");
    const handler = vi.fn(() => new Response("ok"));
    const result = sanitize(
      makeConfig({
        onInit: () => {
          throw error;
        },
        endpoints: [{ path: "/health", method: "get", handler }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (payloadConfig as any).endpoints[0];  
    const payload = makePayload(payloadConfig);

    await expect(endpoint.handler({ payload })).rejects.toBe(error);
    expect(handler).not.toHaveBeenCalled();
  });

  it("binds root afterError requests without nesting Frogbot on Payload", async () => {
    const hookResult = { status: 418 };
    const afterError = vi.fn(() => hookResult);
    const result = sanitize(
      makeConfig({ hooks: { afterError: [afterError] } }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);
    const frogbot = { agents: {} };
    registerFrogbotInstance(payload, frogbot as unknown as Frogbot);
    const req = { payload };

    const args = {
      req,
      context: {},
      error: new Error("test"),
      result: { errors: [] },
    };
    const hookResponse = await payloadConfig.hooks.afterError[0](args);

    expect(afterError).toHaveBeenCalledWith({
      ...args,
      req: expect.objectContaining({ frogbot }),
    });
    expect(hookResponse).toBe(hookResult);
    expect(payload).not.toHaveProperty("frogbot");
  });

  it("drops the FrogBot plugins key from the payload config", async () => {
    const plugin = (c: FrogbotConfig) => c;
    const config = makeConfig({ plugins: [plugin] });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).plugins).toBeUndefined();  
  });

  it("rewrites @payloadcms component paths in the sanitized payload config", async () => {
    const config = makeConfig({
      admin: {
        dashboard: {
          widgets: [
            {
              slug: "collections",
              Component: "@payloadcms/next/rsc#CollectionCards",
              minWidth: "full",
            },
          ],
        },
      },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).admin.dashboard.widgets[0].Component)  
      .toBe("@frogbotai/next/rsc#CollectionCards");
  });

  it("forces admin.importMap.autoGenerate false while preserving other admin keys", async () => {
    const config = makeConfig({
      admin: { theme: "dark", importMap: { baseDir: "/tmp/base" } },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).admin.importMap).toEqual({
      baseDir: "/tmp/base",
      autoGenerate: false,
    });  
    expect((payloadConfig as any).admin.theme).toBe("dark");  
  });

  it("defaults FrogBot import-map generation to enabled", () => {
    const result = sanitize(makeConfig());

    expect(result.admin?.importMap?.autoGenerate).toBe(true);
  });

  it("preserves an explicit FrogBot import-map generation opt-out", async () => {
    const result = sanitize(makeConfig({
      admin: { importMap: { autoGenerate: false } },
    }));
    const payloadConfig = await result._internal.payloadConfig;

    expect(result.admin?.importMap?.autoGenerate).toBe(false);
    expect(payloadConfig.admin.importMap.autoGenerate).toBe(false);
  });

  it("injects FrogBot branding defaults into the payload config", async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = (await result._internal.payloadConfig) as any;  
    expect(payloadConfig.admin.components.graphics).toEqual({
      Icon: "@frogbotai/next/rsc#FrogbotIcon",
      Logo: "@frogbotai/next/rsc#FrogbotLogo",
    });
    expect(payloadConfig.admin.meta.titleSuffix).toBe("- FrogBot");
    expect(payloadConfig.admin.meta.defaultOGImageType).toBe("static");
    expect(payloadConfig.admin.meta.openGraph.siteName).toBe("FrogBot");
    expect(payloadConfig.i18n.translations.en.general.payloadSettings).toBe(
      "FrogBot Settings",
    );
  });

  it("defaults the cookie prefix to FrogBot", async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.cookiePrefix).toBe("frogbot");
  });

  it("lets a user cookie prefix override the FrogBot default", async () => {
    const result = sanitize(makeConfig({ cookiePrefix: "acme" }));
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.cookiePrefix).toBe("acme");
  });

  it("lets user branding config win over FrogBot defaults", async () => {
    const config = makeConfig({
      admin: {
        components: { graphics: { Logo: "/components/Logo#MyLogo" } },
        meta: {
          titleSuffix: "- Acme",
          defaultOGImageType: "dynamic",
          openGraph: { siteName: "Acme", images: [{ url: "/og.png" }] },
        },
      },
      i18n: {
        translations: { en: { general: { payloadSettings: "Acme Settings" } } },
      },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = (await result._internal.payloadConfig) as any;  
    expect(payloadConfig.admin.components.graphics).toEqual({
      Icon: "@frogbotai/next/rsc#FrogbotIcon",
      Logo: "/components/Logo#MyLogo",
    });
    expect(payloadConfig.admin.meta.titleSuffix).toBe("- Acme");
    expect(payloadConfig.admin.meta.defaultOGImageType).toBe("dynamic");
    expect(payloadConfig.admin.meta.openGraph).toEqual({
      description: expect.stringContaining("FrogBot"),
      siteName: "Acme",
      images: [{ url: "/og.png" }],
    });
    expect(payloadConfig.i18n.translations.en.general.payloadSettings).toBe(
      "Acme Settings",
    );
  });

  it("preserves unrelated user i18n translations when injecting branding", async () => {
    const config = makeConfig({
      i18n: {
        fallbackLanguage: "en",
        translations: {
          en: { general: { dashboard: "Home" } },
          es: { general: { dashboard: "Inicio" } },
        },
      },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = (await result._internal.payloadConfig) as any;  
    expect(payloadConfig.i18n.fallbackLanguage).toBe("en");
    expect(payloadConfig.i18n.translations.en.general).toEqual({
      dashboard: "Home",
      payloadSettings: "FrogBot Settings",
    });
    expect(payloadConfig.i18n.translations.es).toEqual({
      general: { dashboard: "Inicio" },
    });
  });

  it("does not mutate the caller\u2019s input config or collection objects", () => {
    const collections: CollectionConfig[] = [
      {
        slug: "projects",
        fields: [{ name: "title", type: "text" }],
      },
    ];
    const config = makeConfig({ collections });
    const originalStr = JSON.stringify(config);
    sanitize(config);
    expect(JSON.stringify(config)).toBe(originalStr);
  });

  it("injects bootstrap hook on collections with no existing hooks in the payload config", async () => {
    const config = makeConfig({
      collections: [{ slug: "bare", fields: [] }],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const bare = (payloadConfig as any).collections.find(
      (c: any) => c.slug === "bare",
    );  
    expect(bare.hooks?.beforeOperation).toHaveLength(1);
  });

  it("handles `endpoints: false` without crashing", () => {
    const config = makeConfig({
      collections: [
        {
          slug: "users",
          auth: true,
          fields: [],
          endpoints: false,
        } as unknown as CollectionConfig,
      ],
    });
    expect(() => sanitize(config)).not.toThrow();
  });

  it("returns collections metadata in the same order as input", () => {
    const config = makeConfig({
      collections: [
        { slug: "alpha", fields: [] },
        { slug: "beta", fields: [] },
        { slug: "gamma", fields: [] },
      ],
    });
    const result = sanitize(config);
    const slugs = result.collections.map((c) => c.slug);
    expect(slugs).toEqual(["alpha", "beta", "gamma", "files"]);
  });

  describe("ai.providers", () => {
    it("throws when ai is configured with no providers", () => {
      const config = makeConfig({ ai: { providers: {} } });
      expect(() => sanitize(config)).toThrow(
        "[frogbot] At least one AI provider must be configured under `ai.providers`.",
      );
    });

    it("throws when every provider entry is undefined", () => {
      const config = makeConfig({ ai: { providers: { openai: undefined } } });
      expect(() => sanitize(config)).toThrow(
        "[frogbot] At least one AI provider must be configured under `ai.providers`.",
      );
    });

    it("rejects an undefined explicit apiKey", () => {
      const config = makeConfig({
        ai: { providers: { openai: { apiKey: undefined } } },
      });
      expect(() => sanitize(config)).toThrow(
        "[frogbot] Provider 'openai' requires a non-empty apiKey when configured with an object.",
      );
    });

    it("accepts true for SDK environment fallback", () => {
      const result = sanitize(
        makeConfig({ ai: { providers: { openai: true } } }),
      );
      expect(result.ai?.providers.openai).toBe(true);
    });

    it("rejects false provider entries", () => {
      const config = makeConfig({
        ai: { providers: { openai: false } },
      } as never);
      expect(() => sanitize(config)).toThrow(
        "Provider 'openai' must be true or an object",
      );
    });

    it("rejects true for custom providers", () => {
      const config = makeConfig({
        ai: { providers: { internal: true } },
      } as never);
      expect(() => sanitize(config)).toThrow(
        "Custom provider 'internal' must have type: 'openai-compatible'",
      );
    });

    it("rejects an empty explicit apiKey", () => {
      const config = makeConfig({
        ai: { providers: { openai: { apiKey: "" } } },
      });
      expect(() => sanitize(config)).toThrow(
        "Provider 'openai' requires a non-empty apiKey",
      );
    });

    it("rejects a whitespace explicit apiKey", () => {
      const config = makeConfig({
        ai: { providers: { anthropic: { apiKey: "   " } } },
      });
      expect(() => sanitize(config)).toThrow(
        "Provider 'anthropic' requires a non-empty apiKey",
      );
    });

    it("accepts Bedrock ambient credentials without static keys", () => {
      const config = makeConfig({ ai: { providers: { bedrock: true } } });
      expect(() => sanitize(config)).not.toThrow();
    });

    it("accepts a Bedrock credential provider without static keys", () => {
      const config = makeConfig({
        ai: {
          providers: {
            bedrock: {
              credentialProvider: () => Promise.resolve({
                accessKeyId: "ak",
                secretAccessKey: "sk",
              }),
            },
          },
        },
      });
      expect(() => sanitize(config)).not.toThrow();
    });

    it("accepts catalogued built-in model allowlists", () => {
      const config = makeConfig({
        ai: {
          providers: {
            bedrock: {
              region: "us-east-1",
              models: ["zai.glm-4.7-flash"],
            },
          },
        },
      });
      expect(() => sanitize(config)).not.toThrow();
    });

    it("rejects unknown built-in model allowlist entries", () => {
      const config = makeConfig({
        ai: {
          providers: {
            bedrock: {
              region: "us-east-1",
              models: ["not-a-real-model"],
            },
          },
        },
      } as never);
      expect(() => sanitize(config)).toThrow(
        "Provider 'bedrock' models contains unknown model: not-a-real-model",
      );
    });

    it("rejects incomplete explicit Bedrock credentials", () => {
      const config = makeConfig({
        ai: { providers: { bedrock: { accessKeyId: "ak" } } },
      } as never);
      expect(() => sanitize(config)).toThrow(
        "Provider 'bedrock' requires both accessKeyId and secretAccessKey",
      );
    });

    it("throws when a custom provider has an empty models array", () => {
      const config = makeConfig({
        ai: {
          providers: {
            internal: {
              type: "openai-compatible",
              baseUrl: "https://models.test",
              models: [],
            },
          },
        },
      });
      expect(() => sanitize(config)).toThrow(
        "[frogbot] Custom provider 'internal' requires a non-empty models array.",
      );
    });
  });

  describe("agents", () => {
    const ai = { providers: { openai: { apiKey: "sk-test" } } };
    const agent = {
      slug: "support",
      model: "openai/test",
      instructions: "Help the user",
    };
    const makeTool = (slug: string, overrides: Record<string, unknown> = {}) => ({
      slug,
      description: `Run ${slug}`,
      inputSchema: {},
      execute: vi.fn(),
      ...overrides,
    });

    it("accepts an agent profile", () => {
      const profile = { name: "Ada", avatar: "/ada.png", description: "Support" };
      const result = sanitize(makeConfig({ ai, agents: [{ ...agent, profile }] } as never));
      expect(result.agents?.[0].profile).toEqual(profile);
    });

    it("accepts an omitted agent profile", () => {
      const result = sanitize(makeConfig({ ai, agents: [agent] } as never));
      expect((result.agents?.[0] as typeof agent & { profile?: unknown }).profile).toBeUndefined();
    });

    it("rejects a non-object agent profile", () => {
      expect(() => sanitize(makeConfig({ ai, agents: [{ ...agent, profile: "Ada" }] } as never))).toThrow(
        "[frogbot] Agent 'support' profile must be an object.",
      );
    });

    it("rejects blank agent profile fields", () => {
      expect(() => sanitize(makeConfig({ ai, agents: [{ ...agent, profile: { name: "   " } }] } as never))).toThrow(
        "[frogbot] Agent 'support' profile name must be a non-empty string.",
      );
    });

    it("adds root tools to every agent", () => {
      const shared = makeTool("shared");
      const result = sanitize(makeConfig({
        ai,
        agents: [agent, { ...agent, slug: "sales" }],
        tools: [shared],
      } as never));

      expect(result.agents?.map(({ tools }) => tools?.map(({ slug }) => slug))).toEqual([
        ["shared"],
        ["shared"],
      ]);
    });

    it("lets agent tools override root tools without warning during sanitize", () => {
      const rootExecute = vi.fn();
      const agentExecute = vi.fn();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const result = sanitize(makeConfig({
        ai,
        agents: [{ ...agent, tools: [makeTool("shared", { execute: agentExecute })] }],
        tools: [makeTool("shared", { execute: rootExecute })],
      } as never));

      expect(result.agents?.[0].tools).toHaveLength(1);
      expect(result.agents?.[0].tools?.[0].execute).toBe(agentExecute);
      expect((result._internal as any).toolCollisions).toEqual([
        { agent: "support", slug: "shared" },
      ]);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("allows agents to opt out of root tools", () => {
      const result = sanitize(makeConfig({
        ai,
        agents: [{ ...agent, inheritTools: false }, { ...agent, slug: "sales" }],
        tools: [makeTool("shared")],
      } as never));

      expect(result.agents?.[0].tools).toBeUndefined();
      expect(result.agents?.[1].tools?.map(({ slug }) => slug)).toEqual(["shared"]);
    });

    it("rejects an unregistered root piece tool", () => {
      expect(() => sanitize(makeConfig({
        ai,
        agents: [agent],
        tools: [makeTool("search", { pieceService: "search" })],
      } as never))).toThrow(
        "[frogbot] Root uses tool 'search' but no 'search' piece is registered in `pieces`.",
      );
    });

    it.each([undefined, []])(
      "adds root tools when agent tools are %s",
      (tools) => {
        const result = sanitize(makeConfig({
          ai,
          agents: [{ ...agent, ...(tools === undefined ? {} : { tools }) }],
          tools: [makeTool("shared")],
        } as never));

        expect(result.agents?.[0].tools?.map(({ slug }) => slug)).toEqual(["shared"]);
      },
    );

    it("rejects duplicate tool slugs within root and agent arrays", () => {
      expect(() => sanitize(makeConfig({
        ai,
        agents: [agent],
        tools: [makeTool("same"), makeTool("same")],
      } as never))).toThrow("[frogbot] Duplicate tool slug 'same' in root.");
      expect(() => sanitize(makeConfig({
        ai,
        agents: [{ ...agent, tools: [makeTool("same"), makeTool("same")] }],
      } as never))).toThrow("[frogbot] Duplicate tool slug 'same' in agent 'support'.");
    });

    it("sanitizes agents, defaults access, registers endpoints, and removes agents from Payload", async () => {
      const result = sanitize(makeConfig({ ai, agents: [agent] }));
      const payloadConfig = await result._internal.payloadConfig;

      expect(result.agents).toHaveLength(1);
      expect(result.agents?.[0].access).toBeTypeOf("function");
      expect((payloadConfig as any).agents).toBeUndefined();  
      expect(
        (payloadConfig as any).endpoints.map((endpoint: any) => endpoint.path),
      )  
        .toEqual([
          "/frogbot",
          "/agents/:slug",
          "/agents/:slug/authorizations",
          "/agents",
        ]);
    });

    it("normalizes an empty agents array without AI to the omitted state", () => {
      const omitted = sanitize(makeConfig());
      const empty = sanitize(makeConfig({ agents: [] }));

      expect(empty.agents).toBeUndefined();
      expect(empty.chat).toEqual(omitted.chat);
    });

    it("normalizes an empty agents array with AI without enabling chat or agent endpoints", async () => {
      const result = sanitize(makeConfig({ ai, agents: [] }));
      const payloadConfig = await result._internal.payloadConfig;

      expect(result.agents).toBeUndefined();
      expect(result.chat.enabled).toBe(false);
      expect(
        (payloadConfig as { endpoints?: { path: string }[] }).endpoints?.map(
          ({ path }) => path,
        ),
      ).toEqual(["/frogbot"]);
    });

    it.each([
      { endpoints: false as const, expected: ["/frogbot"] },
      {
        endpoints: [
          { path: "/health", method: "get" as const, handler: vi.fn() },
        ],
        expected: ["/health", "/frogbot"],
      },
    ])(
      "preserves user endpoint configuration for empty agents",
      async ({ endpoints, expected }) => {
        const result = sanitize(makeConfig({ agents: [], endpoints }));
        const payloadConfig = await result._internal.payloadConfig;
        const payloadEndpoints = (
          payloadConfig as { endpoints?: false | { path: string }[] }
        ).endpoints;

        expect(
          Array.isArray(payloadEndpoints)
            ? payloadEndpoints.map(({ path }) => path)
            : payloadEndpoints,
        ).toEqual(expected);
      },
    );

    it("rejects non-array agents before requiring AI", () => {
      expect(() => sanitize(makeConfig({ agents: null as never }))).toThrow(
        "[frogbot] `agents` must be an array.",
      );
    });

    it("requires AI for a non-empty agents array", () => {
      expect(() => sanitize(makeConfig({ agents: [agent] }))).toThrow(
        "[frogbot] `agents` requires an `ai` configuration block.",
      );
    });

    it.each([
      [{ prompt: "Run", handler: vi.fn() }, "exactly one of prompt or handler"],
      [{}, "exactly one of prompt or handler"],
      [{ prompt: "Run", schedule: { every: "1h", cron: "0 * * * *" } }, "exactly one of every or cron"],
      [{ prompt: "Run", schedule: { cron: "invalid" } }, "invalid cron expression"],
      [{ prompt: "Run", schedule: { cron: "0 * * * *", timezone: "UTC" } }, "timezone is not yet supported"],
    ])("rejects invalid trigger configuration", (trigger, message) => {
      expect(() => sanitize(makeConfig({
        ai,
        agents: [{ ...agent, triggers: [{ type: "schedule", slug: "run", schedule: { every: "1h" }, ...trigger }] }],
      } as never))).toThrow(message);
    });

    it("rejects duplicate and unsafe trigger slugs within an agent", () => {
      expect(() => sanitize(makeConfig({
        ai,
        agents: [{ ...agent, triggers: [
          { type: "schedule", slug: "same", schedule: { every: "1h" }, prompt: "Run" },
          { type: "schedule", slug: "same", schedule: { every: "1h" }, prompt: "Run" },
        ] }],
      }))).toThrow("Duplicate trigger slug 'same'");
      expect(() => sanitize(makeConfig({
        ai,
        agents: [{ ...agent, triggers: [{ type: "schedule", slug: "not safe", schedule: { every: "1h" }, prompt: "Run" }] }],
      }))).toThrow("is not URL-safe");
    });

    it("allows the same trigger slug on different agents", () => {
      expect(() => sanitize(makeConfig({
        ai,
        agents: ["one", "two"].map((slug) => ({ ...agent, slug, triggers: [{ type: "schedule" as const, slug: "run", schedule: { every: "1h" as const }, prompt: "Run" }] })),
      }))).not.toThrow();
    });

    it("reserves the schedule task slug and merges user jobs", async () => {
      const scheduled = { ...agent, triggers: [{ type: "schedule" as const, slug: "run", schedule: { every: "1h" as const }, prompt: "Run" }] };
      const handler = vi.fn();
      const result = sanitize(makeConfig({
        ai,
        agents: [scheduled],
        jobs: { tasks: [{ slug: "user-task", handler }], autoRun: [{ queue: "user" }] },
      }));
      const payloadConfig = await result._internal.payloadConfig;
      expect(payloadConfig.jobs.tasks.map(({ slug }) => slug)).toEqual(["user-task", "frogbot-run-agent-schedule"]);
      expect(payloadConfig.jobs.autoRun).toEqual([{ queue: "user" }, { allQueues: true, cron: "* * * * *" }]);
      expect(() => sanitize(makeConfig({
        ai,
        agents: [scheduled],
        jobs: { tasks: [{ slug: "frogbot-run-agent-schedule", handler }] },
      }))).toThrow("is reserved for agent schedule triggers");
    });

    it.each(["runtime", "codegen"] as const)(
      "accepts an empty tools array during %s validation",
      (mode) => {
        const result = sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, tools: [] }],
          }),
          { mode },
        );

        expect(result.agents?.[0].tools).toEqual([]);
        expect(result.agents?.[0].access).toBeTypeOf("function");
      },
    );

    it("rejects non-array tools", () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, tools: null as never }],
          }),
        ),
      ).toThrow(
        "[frogbot] Agent 'support' tools must be an array when configured.",
      );
    });

    it("rejects an empty stopWhen array", () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, stopWhen: [] }],
          }),
        ),
      ).toThrow(
        "[frogbot] Agent 'support' stopWhen must contain at least one condition.",
      );
    });

    it("does not resolve models through disabled provider entries", () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai: {
              providers: {
                anthropic: { apiKey: "test" },
                openai: undefined,
              },
            },
            agents: [agent],
          }),
        ),
      ).toThrow(
        "[frogbot] Agent 'support' model 'openai/test' does not resolve to a configured provider.",
      );
    });

    it("rejects model mismatches at runtime", () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai: { providers: { anthropic: true } },
            agents: [agent],
          }),
        ),
      ).toThrow(
        "[frogbot] Agent 'support' model 'openai/test' does not resolve to a configured provider. Configured providers: anthropic. Update the agent model or configure its provider under `ai.providers`.",
      );
    });

    it("warns with model mismatch details during codegen", () => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      expect(() =>
        sanitize(
          makeConfig({
            ai: { providers: { anthropic: true } },
            agents: [agent],
          }),
          { mode: "codegen" },
        ),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        "[frogbot] Agent 'support' model 'openai/test' does not resolve to a configured provider. Configured providers: anthropic. Update the agent model or configure its provider under `ai.providers`.",
      );

      warn.mockRestore();
    });

    it("reserves the agent collection slug even when no agents are configured", () => {
      expect(() =>
        sanitize(
          makeConfig({
            collections: [{ slug: "agents", fields: [] }],
          }),
        ),
      ).toThrow(
        "[frogbot] Collection slug 'agents' is reserved for the agent API.",
      );
    });

    it("reserves agent endpoint paths even when no agents are configured", () => {
      expect(() =>
        sanitize(
          makeConfig({
            endpoints: [
              {
                path: "/agents/custom",
                method: "post",
                handler: () => new Response(),
              },
            ],
          }),
        ),
      ).toThrow(
        "[frogbot] Endpoint path '/agents/custom' is reserved for the agent API.",
      );
    });

    it("reserves the manifest collection slug", () => {
      expect(() =>
        sanitize(
          makeConfig({
            collections: [{ slug: "frogbot", fields: [] }],
          }),
        ),
      ).toThrow(
        "[frogbot] Collection slug 'frogbot' is reserved for the manifest API.",
      );
    });

    it.each(["/frogbot", "/frogbot/custom"])(
      "reserves manifest endpoint path %s",
      (path) => {
        expect(() =>
          sanitize(
            makeConfig({
              endpoints: [
                { path, method: "get", handler: () => new Response() },
              ],
            }),
          ),
        ).toThrow(
          `[frogbot] Endpoint path '${path}' is reserved for the manifest API.`,
        );
      },
    );

    it("rejects non-URL-safe agent slugs", () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, slug: "support/admin" }],
          }),
        ),
      ).toThrow("[frogbot] Agent slug 'support/admin' is not URL-safe.");
    });
  });

  describe("chat", () => {
    const ai = { providers: { openai: { apiKey: "sk-test" } } };
    const agents = [
      { slug: "support", model: "openai/test", instructions: "Help the user" },
    ];

    it("is disabled when neither markers nor agents are configured", () => {
      const result = sanitize(makeConfig());
      expect(result.chat).toEqual({ enabled: false });
    });

    it("is enabled with default slugs when agents are configured", () => {
      const result = sanitize(makeConfig({ ai, agents }));
      expect(result.chat).toEqual({
        enabled: true,
        threadsSlug: "threads",
        messagesSlug: "messages",
      });
    });

    it("resolves slugs from thread/message markers", () => {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: "users", auth: true, fields: [] },
            { slug: "conversations", thread: true, fields: [] },
            { slug: "turns", message: true, fields: [] },
          ],
        }),
      );
      expect(result.chat).toEqual({
        enabled: true,
        threadsSlug: "conversations",
        messagesSlug: "turns",
      });
    });

    it("merges todos into a marked thread collection", async () => {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: "users", auth: true, fields: [] },
            { slug: "conversations", thread: true, fields: [] },
          ],
        }),
      );
      const payloadConfig = await result._internal.payloadConfig;
      const conversations = (payloadConfig as any).collections.find(
        (collection: any) => collection.slug === "conversations",
      );
      expect(conversations.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "todos", type: "json" }),
        ]),
      );
    });

    it("strips markers from adopted collections in the payload config", async () => {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: "users", auth: true, fields: [] },
            { slug: "conversations", thread: true, fields: [] },
          ],
        }),
      );
      const payloadConfig = await result._internal.payloadConfig;
      const conversations = (payloadConfig as any).collections.find(
        (c: any) => c.slug === "conversations",
      );
      expect(conversations.thread).toBeUndefined();
    });

    it("injects chat collections into the payload config and collections metadata", async () => {
      const result = sanitize(makeConfig({ ai, agents }));
      expect(result.collections.map((c) => c.slug)).toEqual([
        "users",
        "threads",
        "messages",
        "usage-logs",
        "files",
      ]);
      const payloadConfig = await result._internal.payloadConfig;
      const payloadSlugs = (payloadConfig as any).collections.map(
        (c: any) => c.slug,
      );
      expect(payloadSlugs).toEqual([
        "users",
        "threads",
        "messages",
        "usage-logs",
        "files",
      ]);
    });

    it("injected chat collections get the bootstrap beforeOperation hook", async () => {
      const result = sanitize(makeConfig({ ai, agents }));
      const payloadConfig = await result._internal.payloadConfig;
      const threads = (payloadConfig as any).collections.find(
        (c: any) => c.slug === "threads",
      );
      expect(threads.hooks?.beforeOperation?.length).toBeGreaterThan(0);
    });

    it("throws when an unmarked collection occupies a default chat slug", () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents,
            collections: [
              { slug: "users", auth: true, fields: [] },
              { slug: "threads", fields: [] },
            ],
          }),
        ),
      ).toThrow(
        "[frogbot] Collection slug 'threads' conflicts with the default chat thread collection.",
      );
    });
  });

  describe("ai.telemetry", () => {
    function aiConfig(overrides?: Partial<FrogbotConfig["ai"]>) {
      return makeConfig({
        ai: {
          providers: { openai: { apiKey: "sk-test" } },
          deploymentId: "unit-test-deployment",
          ...overrides,
        },
      });
    }

    it("defaults telemetry.enabled to true when not configured", () => {
      const result = sanitize(aiConfig());
      expect(result.ai?.telemetry.enabled).toBe(true);
      expect(result.ai?.telemetry.enrichSpan).toBeUndefined();
    });

    it("respects telemetry.enabled: false", () => {
      const result = sanitize(aiConfig({ telemetry: { enabled: false } }));
      expect(result.ai?.telemetry.enabled).toBe(false);
    });

    it("preserves a user-provided enrichSpan callback", () => {
      const enrichSpan = vi.fn(() => ({ "app.tenant": "acme" }));
      const result = sanitize(aiConfig({ telemetry: { enrichSpan } }));
      expect(result.ai?.telemetry.enrichSpan).toBe(enrichSpan);
      expect(result.ai?.telemetry.enabled).toBe(true);
    });
  });
});
