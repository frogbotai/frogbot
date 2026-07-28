import { defineModelCatalog, presetFor, type ModelCatalog } from './catalog.js';

const model = presetFor<string>();

export const DEFAULT_MODEL_CATALOG: ModelCatalog = defineModelCatalog(
  model("amazon-bedrock/amazon.nova-2-lite-v1:0", {
    "name": "Nova 2 Lite",
    "created": "2024-12-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/amazon.nova-lite-v1:0", {
    "name": "Nova Lite",
    "created": "2024-12-03",
    "knowledge": "2024-10",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 300000,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/amazon.nova-micro-v1:0", {
    "name": "Nova Micro",
    "created": "2024-12-03",
    "knowledge": "2024-10",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/amazon.nova-pro-v1:0", {
    "name": "Nova Pro",
    "created": "2024-12-03",
    "knowledge": "2024-10",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 300000,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-fable-5", {
    "name": "Claude Fable 5",
    "created": "2026-06-09",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0", {
    "name": "Claude Haiku 4.5",
    "created": "2025-10-15",
    "knowledge": "2025-02-28",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0", {
    "name": "Claude Opus 4.5",
    "created": "2025-11-24",
    "knowledge": "2025-03-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-opus-4-6-v1", {
    "name": "Claude Opus 4.6",
    "created": "2026-02-05",
    "knowledge": "2025-05-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-opus-4-7", {
    "name": "Claude Opus 4.7",
    "created": "2026-04-16",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-opus-4-8", {
    "name": "Claude Opus 4.8",
    "created": "2026-05-28",
    "knowledge": "2026-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-opus-5", {
    "name": "Claude Opus 5",
    "created": "2026-07-24",
    "knowledge": "2026-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0", {
    "name": "Claude Sonnet 4.5",
    "created": "2025-09-29",
    "knowledge": "2025-07-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-sonnet-4-6", {
    "name": "Claude Sonnet 4.6",
    "created": "2026-02-17",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/anthropic.claude-sonnet-5", {
    "name": "Claude Sonnet 5",
    "created": "2026-06-30",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/au.anthropic.claude-haiku-4-5-20251001-v1:0", {
    "name": "Claude Haiku 4.5 (AU)",
    "created": "2025-10-15",
    "knowledge": "2025-02-28",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/au.anthropic.claude-opus-4-6-v1", {
    "name": "AU Anthropic Claude Opus 4.6",
    "created": "2026-02-05",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/au.anthropic.claude-opus-4-8", {
    "name": "Claude Opus 4.8 (AU)",
    "created": "2026-05-28",
    "knowledge": "2026-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/au.anthropic.claude-opus-5", {
    "name": "Claude Opus 5 (AU)",
    "created": "2026-07-24",
    "knowledge": "2026-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/au.anthropic.claude-sonnet-4-5-20250929-v1:0", {
    "name": "Claude Sonnet 4.5 (AU)",
    "created": "2025-09-29",
    "knowledge": "2025-07-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/au.anthropic.claude-sonnet-4-6", {
    "name": "AU Anthropic Claude Sonnet 4.6",
    "created": "2026-02-17",
    "knowledge": "2025-08",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/au.anthropic.claude-sonnet-5", {
    "name": "Claude Sonnet 5 (AU)",
    "created": "2026-06-30",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/deepseek.r1-v1:0", {
    "name": "DeepSeek-R1",
    "created": "2025-01-20",
    "knowledge": "2024-07",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 32768
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/deepseek.v3-v1:0", {
    "name": "DeepSeek-V3.1",
    "created": "2025-09-18",
    "knowledge": "2024-07",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 163840,
      "output": 81920
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/deepseek.v3.2", {
    "name": "DeepSeek-V3.2",
    "created": "2026-02-06",
    "knowledge": "2024-07",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 163840,
      "output": 81920
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-fable-5", {
    "name": "Claude Fable 5 (EU)",
    "created": "2026-06-09",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0", {
    "name": "Claude Haiku 4.5 (EU)",
    "created": "2025-10-15",
    "knowledge": "2025-02-28",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-opus-4-5-20251101-v1:0", {
    "name": "Claude Opus 4.5 (EU)",
    "created": "2025-11-24",
    "knowledge": "2025-03-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-opus-4-6-v1", {
    "name": "Claude Opus 4.6 (EU)",
    "created": "2026-02-05",
    "knowledge": "2025-05-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-opus-4-7", {
    "name": "Claude Opus 4.7 (EU)",
    "created": "2026-04-16",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-opus-4-8", {
    "name": "Claude Opus 4.8 (EU)",
    "created": "2026-05-28",
    "knowledge": "2026-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-opus-5", {
    "name": "Claude Opus 5 (EU)",
    "created": "2026-07-24",
    "knowledge": "2026-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-sonnet-4-5-20250929-v1:0", {
    "name": "Claude Sonnet 4.5 (EU)",
    "created": "2025-09-29",
    "knowledge": "2025-07-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-sonnet-4-6", {
    "name": "Claude Sonnet 4.6 (EU)",
    "created": "2026-02-17",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/eu.anthropic.claude-sonnet-5", {
    "name": "Claude Sonnet 5 (EU)",
    "created": "2026-06-30",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-fable-5", {
    "name": "Claude Fable 5 (Global)",
    "created": "2026-06-09",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0", {
    "name": "Claude Haiku 4.5 (Global)",
    "created": "2025-10-15",
    "knowledge": "2025-02-28",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-opus-4-5-20251101-v1:0", {
    "name": "Claude Opus 4.5 (Global)",
    "created": "2025-11-24",
    "knowledge": "2025-03-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-opus-4-6-v1", {
    "name": "Claude Opus 4.6 (Global)",
    "created": "2026-02-05",
    "knowledge": "2025-05-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-opus-4-7", {
    "name": "Claude Opus 4.7 (Global)",
    "created": "2026-04-16",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-opus-4-8", {
    "name": "Claude Opus 4.8 (Global)",
    "created": "2026-05-28",
    "knowledge": "2026-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-opus-5", {
    "name": "Claude Opus 5 (Global)",
    "created": "2026-07-24",
    "knowledge": "2026-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-sonnet-4-5-20250929-v1:0", {
    "name": "Claude Sonnet 4.5 (Global)",
    "created": "2025-09-29",
    "knowledge": "2025-07-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-sonnet-4-6", {
    "name": "Claude Sonnet 4.6 (Global)",
    "created": "2026-02-17",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/global.anthropic.claude-sonnet-5", {
    "name": "Claude Sonnet 5 (Global)",
    "created": "2026-06-30",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/google.gemma-3-12b-it", {
    "name": "Google Gemma 3 12B",
    "created": "2024-12-01",
    "knowledge": "2024-12",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "structuredOutput": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/google.gemma-3-27b-it", {
    "name": "Google Gemma 3 27B Instruct",
    "created": "2025-07-27",
    "knowledge": "2025-07",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 202752,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/google.gemma-3-4b-it", {
    "name": "Gemma 3 4B IT",
    "created": "2024-12-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/jp.anthropic.claude-haiku-4-5-20251001-v1:0", {
    "name": "Claude Haiku 4.5 (JP)",
    "created": "2025-10-15",
    "knowledge": "2025-02-28",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/jp.anthropic.claude-opus-4-7", {
    "name": "Claude Opus 4.7 (JP)",
    "created": "2026-04-16",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/jp.anthropic.claude-opus-4-8", {
    "name": "Claude Opus 4.8 (JP)",
    "created": "2026-05-28",
    "knowledge": "2026-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/jp.anthropic.claude-opus-5", {
    "name": "Claude Opus 5 (JP)",
    "created": "2026-07-24",
    "knowledge": "2026-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/jp.anthropic.claude-sonnet-4-5-20250929-v1:0", {
    "name": "Claude Sonnet 4.5 (JP)",
    "created": "2025-09-29",
    "knowledge": "2025-07-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/jp.anthropic.claude-sonnet-4-6", {
    "name": "Claude Sonnet 4.6 (JP)",
    "created": "2026-02-17",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/jp.anthropic.claude-sonnet-5", {
    "name": "Claude Sonnet 5 (JP)",
    "created": "2026-06-30",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/meta.llama3-1-70b-instruct-v1:0", {
    "name": "Llama 3.1 70B Instruct",
    "created": "2024-07-23",
    "knowledge": "2023-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/meta.llama3-1-8b-instruct-v1:0", {
    "name": "Llama 3.1 8B Instruct",
    "created": "2024-07-23",
    "knowledge": "2023-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/meta.llama3-3-70b-instruct-v1:0", {
    "name": "Llama 3.3 70B Instruct",
    "created": "2024-12-06",
    "knowledge": "2023-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/meta.llama4-maverick-17b-instruct-v1:0", {
    "name": "Llama 4 Maverick 17B Instruct",
    "created": "2025-04-05",
    "knowledge": "2024-08",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/meta.llama4-scout-17b-instruct-v1:0", {
    "name": "Llama 4 Scout 17B Instruct",
    "created": "2025-04-05",
    "knowledge": "2024-08",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 3500000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/minimax.minimax-m2", {
    "name": "MiniMax M2",
    "created": "2025-10-27",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 204608,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/minimax.minimax-m2.1", {
    "name": "MiniMax M2.1",
    "created": "2025-12-23",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 204800,
      "output": 131072
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/minimax.minimax-m2.5", {
    "name": "MiniMax M2.5",
    "created": "2026-03-18",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 196608,
      "output": 98304
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/mistral.devstral-2-123b", {
    "name": "Devstral 2 123B",
    "created": "2026-02-17",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/mistral.magistral-small-2509", {
    "name": "Magistral Small 1.2",
    "created": "2025-12-02",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 40000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/mistral.ministral-3-14b-instruct", {
    "name": "Ministral 14B 3.0",
    "created": "2024-12-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/mistral.ministral-3-3b-instruct", {
    "name": "Ministral 3 3B",
    "created": "2025-12-02",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/mistral.ministral-3-8b-instruct", {
    "name": "Ministral 3 8B",
    "created": "2024-12-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/mistral.mistral-large-3-675b-instruct", {
    "name": "Mistral Large 3",
    "created": "2025-12-02",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/mistral.pixtral-large-2502-v1:0", {
    "name": "Pixtral Large (25.02)",
    "created": "2025-04-08",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/mistral.voxtral-mini-3b-2507", {
    "name": "Voxtral Mini 3B 2507",
    "created": "2024-12-01",
    "modalities": {
      "input": [
        "audio",
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/mistral.voxtral-small-24b-2507", {
    "name": "Voxtral Small 24B 2507",
    "created": "2025-07-01",
    "modalities": {
      "input": [
        "text",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 32000,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/moonshot.kimi-k2-thinking", {
    "name": "Kimi K2 Thinking",
    "created": "2025-12-02",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 262143,
      "output": 16000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/moonshotai.kimi-k2.5", {
    "name": "Kimi K2.5",
    "created": "2026-02-06",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262143,
      "output": 16000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/nvidia.nemotron-nano-12b-v2", {
    "name": "NVIDIA Nemotron Nano 12B v2 VL BF16",
    "created": "2024-12-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/nvidia.nemotron-nano-3-30b", {
    "name": "NVIDIA Nemotron Nano 3 30B",
    "created": "2025-12-23",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/nvidia.nemotron-nano-9b-v2", {
    "name": "NVIDIA Nemotron Nano 9B v2",
    "created": "2024-12-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/nvidia.nemotron-super-3-120b", {
    "name": "NVIDIA Nemotron 3 Super 120B A12B",
    "created": "2026-03-11",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 131072
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-5.4", {
    "name": "GPT-5.4",
    "created": "2026-03-05",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 272000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-5.5", {
    "name": "GPT-5.5",
    "created": "2026-04-23",
    "knowledge": "2025-12-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 272000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-5.6-luna", {
    "name": "GPT-5.6 Luna",
    "created": "2026-07-09",
    "knowledge": "2026-02-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 272000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-5.6-sol", {
    "name": "GPT-5.6 Sol",
    "created": "2026-07-09",
    "knowledge": "2026-02-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 272000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-5.6-terra", {
    "name": "GPT-5.6 Terra",
    "created": "2026-07-09",
    "knowledge": "2026-02-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 272000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-oss-120b", {
    "name": "gpt-oss-120b",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-oss-120b-1:0", {
    "name": "gpt-oss-120b",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-oss-20b", {
    "name": "gpt-oss-20b",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-oss-20b-1:0", {
    "name": "gpt-oss-20b",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-oss-safeguard-120b", {
    "name": "GPT OSS Safeguard 120B",
    "created": "2025-10-29",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/openai.gpt-oss-safeguard-20b", {
    "name": "GPT OSS Safeguard 20B",
    "created": "2025-10-29",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/qwen.qwen3-235b-a22b-2507-v1:0", {
    "name": "Qwen3 235B A22B 2507",
    "created": "2025-09-18",
    "knowledge": "2024-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 131072
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/qwen.qwen3-32b-v1:0", {
    "name": "Qwen3 32B (dense)",
    "created": "2025-09-18",
    "knowledge": "2024-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 16384,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/qwen.qwen3-coder-30b-a3b-v1:0", {
    "name": "Qwen3 Coder 30B A3B Instruct",
    "created": "2025-09-18",
    "knowledge": "2024-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 131072
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/qwen.qwen3-coder-480b-a35b-v1:0", {
    "name": "Qwen3 Coder 480B A35B Instruct",
    "created": "2025-09-18",
    "knowledge": "2024-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/qwen.qwen3-coder-next", {
    "name": "Qwen3 Coder Next",
    "created": "2026-02-06",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/qwen.qwen3-next-80b-a3b", {
    "name": "Qwen/Qwen3-Next-80B-A3B-Instruct",
    "created": "2025-09-18",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 262000,
      "output": 262000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/qwen.qwen3-vl-235b-a22b", {
    "name": "Qwen/Qwen3-VL-235B-A22B-Instruct",
    "created": "2025-10-04",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262000,
      "output": 262000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-fable-5", {
    "name": "Claude Fable 5 (US)",
    "created": "2026-06-09",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0", {
    "name": "Claude Haiku 4.5 (US)",
    "created": "2025-10-15",
    "knowledge": "2025-02-28",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-opus-4-5-20251101-v1:0", {
    "name": "Claude Opus 4.5 (US)",
    "created": "2025-11-24",
    "knowledge": "2025-03-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-opus-4-6-v1", {
    "name": "Claude Opus 4.6 (US)",
    "created": "2026-02-05",
    "knowledge": "2025-05-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-opus-4-7", {
    "name": "Claude Opus 4.7 (US)",
    "created": "2026-04-16",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-opus-4-8", {
    "name": "Claude Opus 4.8 (US)",
    "created": "2026-05-28",
    "knowledge": "2026-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-opus-5", {
    "name": "Claude Opus 5 (US)",
    "created": "2026-07-24",
    "knowledge": "2026-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0", {
    "name": "Claude Sonnet 4.5 (US)",
    "created": "2025-09-29",
    "knowledge": "2025-07-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-sonnet-4-6", {
    "name": "Claude Sonnet 4.6 (US)",
    "created": "2026-02-17",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 64000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.anthropic.claude-sonnet-5", {
    "name": "Claude Sonnet 5 (US)",
    "created": "2026-06-30",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.deepseek.r1-v1:0", {
    "name": "DeepSeek-R1 (US)",
    "created": "2025-01-20",
    "knowledge": "2024-07",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 32768
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.meta.llama4-maverick-17b-instruct-v1:0", {
    "name": "Llama 4 Maverick 17B Instruct (US)",
    "created": "2025-04-05",
    "knowledge": "2024-08",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/us.meta.llama4-scout-17b-instruct-v1:0", {
    "name": "Llama 4 Scout 17B Instruct (US)",
    "created": "2025-04-05",
    "knowledge": "2024-08",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 3500000,
      "output": 16384
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/writer.palmyra-x4-v1:0", {
    "name": "Palmyra X4",
    "created": "2025-04-28",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 122880,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/writer.palmyra-x5-v1:0", {
    "name": "Palmyra X5",
    "created": "2025-04-28",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 1040000,
      "output": 8192
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/xai.grok-4.3", {
    "name": "Grok 4.3",
    "created": "2026-04-17",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 131072
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/zai.glm-4.7", {
    "name": "GLM-4.7",
    "created": "2025-12-22",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 204800,
      "output": 131072
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/zai.glm-4.7-flash", {
    "name": "GLM-4.7-Flash",
    "created": "2026-01-19",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 131072
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("amazon-bedrock/zai.glm-5", {
    "name": "GLM-5",
    "created": "2026-03-18",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 202752,
      "output": 101376
    },
    "providers": [
      "amazon-bedrock"
    ]
  }),
  model("anthropic/claude-fable-5", {
    "name": "Claude Fable 5",
    "created": "2026-06-07",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-haiku-4-5", {
    "name": "Claude Haiku 4.5 (latest)",
    "created": "2025-10-15",
    "knowledge": "2025-02-28",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-haiku-4-5-20251001", {
    "name": "Claude Haiku 4.5",
    "created": "2025-10-15",
    "knowledge": "2025-02-28",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-opus-4-5", {
    "name": "Claude Opus 4.5 (latest)",
    "created": "2025-11-24",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-opus-4-5-20251101", {
    "name": "Claude Opus 4.5",
    "created": "2025-11-24",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 64000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-opus-4-6", {
    "name": "Claude Opus 4.6",
    "created": "2026-02-04",
    "knowledge": "2025-05-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-opus-4-7", {
    "name": "Claude Opus 4.7",
    "created": "2026-04-14",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-opus-4-8", {
    "name": "Claude Opus 4.8",
    "created": "2026-05-28",
    "knowledge": "2026-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-opus-5", {
    "name": "Claude Opus 5",
    "created": "2026-07-24",
    "knowledge": "2026-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-sonnet-4-5", {
    "name": "Claude Sonnet 4.5 (latest)",
    "created": "2025-09-29",
    "knowledge": "2025-07-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 64000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-sonnet-4-5-20250929", {
    "name": "Claude Sonnet 4.5",
    "created": "2025-09-29",
    "knowledge": "2025-07-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 64000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-sonnet-4-6", {
    "name": "Claude Sonnet 4.6",
    "created": "2026-02-17",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("anthropic/claude-sonnet-5", {
    "name": "Claude Sonnet 5",
    "created": "2026-06-29",
    "knowledge": "2026-01-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 128000
    },
    "providers": [
      "anthropic"
    ]
  }),
  model("cerebras/gemma-4-31b", {
    "name": "Gemma 4 31B IT",
    "created": "2026-04-02",
    "status": "beta",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 40960
    },
    "providers": [
      "cerebras"
    ]
  }),
  model("cerebras/gpt-oss-120b", {
    "name": "GPT OSS 120B",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 40960
    },
    "providers": [
      "cerebras"
    ]
  }),
  model("cerebras/zai-glm-4.7", {
    "name": "Z.AI GLM-4.7",
    "created": "2026-01-07",
    "status": "beta",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 40960
    },
    "providers": [
      "cerebras"
    ]
  }),
  model("cohere/c4ai-aya-expanse-32b", {
    "name": "Aya Expanse 32B",
    "created": "2024-10-24",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/c4ai-aya-expanse-8b", {
    "name": "Aya Expanse 8B",
    "created": "2024-10-24",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 8000,
      "output": 4000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/c4ai-aya-vision-32b", {
    "name": "Aya Vision 32B",
    "created": "2025-03-04",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 16000,
      "output": 4000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/c4ai-aya-vision-8b", {
    "name": "Aya Vision 8B",
    "created": "2025-03-04",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 16000,
      "output": 4000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/command-a-03-2025", {
    "name": "Command A",
    "created": "2025-03-13",
    "knowledge": "2024-06-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 8000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/command-a-plus-05-2026", {
    "name": "Command A Plus",
    "created": "2026-05-20",
    "knowledge": "2025-04-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 64000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/command-a-reasoning-08-2025", {
    "name": "Command A Reasoning",
    "created": "2025-08-21",
    "knowledge": "2024-06-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 32000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/command-a-translate-08-2025", {
    "name": "Command A Translate",
    "created": "2025-08-28",
    "knowledge": "2024-06-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 8000,
      "output": 8000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/command-a-vision-07-2025", {
    "name": "Command A Vision",
    "created": "2025-07-31",
    "knowledge": "2024-06-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 8000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/command-r-08-2024", {
    "name": "Command R",
    "created": "2024-08-30",
    "knowledge": "2024-06-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/command-r-plus-08-2024", {
    "name": "Command R+",
    "created": "2024-08-30",
    "knowledge": "2024-06-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/command-r7b-12-2024", {
    "name": "Command R7B",
    "created": "2024-12-02",
    "knowledge": "2024-06-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/command-r7b-arabic-02-2025", {
    "name": "Command R7B Arabic",
    "created": "2025-02-27",
    "knowledge": "2024-06-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("cohere/north-mini-code-1-0", {
    "name": "North Mini Code",
    "created": "2026-06-09",
    "knowledge": "2025-09-23",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 64000
    },
    "providers": [
      "cohere"
    ]
  }),
  model("deepinfra/deepseek-ai/DeepSeek-R1-0528", {
    "name": "DeepSeek-R1-0528",
    "created": "2025-05-28",
    "knowledge": "2024-07",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 163840,
      "output": 64000
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/deepseek-ai/DeepSeek-V3.2", {
    "name": "DeepSeek-V3.2",
    "created": "2025-12-02",
    "knowledge": "2024-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 163840,
      "output": 64000
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/deepseek-ai/DeepSeek-V4-Flash", {
    "name": "DeepSeek V4 Flash",
    "created": "2026-04-24",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/deepseek-ai/DeepSeek-V4-Pro", {
    "name": "DeepSeek V4 Pro",
    "created": "2026-04-24",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/google/gemma-4-26B-A4B-it", {
    "name": "Gemma 4 26B A4B IT",
    "created": "2026-04-02",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 32768
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/google/gemma-4-31B-it", {
    "name": "Gemma 4 31B IT",
    "created": "2026-04-02",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 32768
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/meta-llama/Llama-3.3-70B-Instruct-Turbo", {
    "name": "Llama 3.3 70B Turbo",
    "created": "2024-12-06",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", {
    "name": "Llama 4 Maverick 17B FP8",
    "created": "2025-04-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "structuredOutput": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/meta-llama/Llama-4-Scout-17B-16E-Instruct", {
    "name": "Llama 4 Scout 17B",
    "created": "2025-04-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 327680,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/MiniMaxAI/MiniMax-M2.7", {
    "name": "MiniMax-M2.7",
    "created": "2026-03-18",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 196608,
      "output": 131072
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/MiniMaxAI/MiniMax-M3", {
    "name": "MiniMax-M3",
    "created": "2026-06-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 524288,
      "output": 128000
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/moonshotai/Kimi-K2.5", {
    "name": "Kimi K2.5",
    "created": "2026-01-27",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 32768
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/moonshotai/Kimi-K2.6", {
    "name": "Kimi K2.6",
    "created": "2026-04-21",
    "knowledge": "2024-04",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/moonshotai/Kimi-K2.7-Code", {
    "name": "Kimi K2.7 Code",
    "created": "2026-06-12",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 262144
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/moonshotai/Kimi-K3", {
    "name": "Kimi K3",
    "created": "2026-07-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 131072
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/nvidia/Nemotron-3-Nano-30B-A3B", {
    "name": "Nemotron 3 Nano 30B A3B",
    "created": "2025-12-15",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 262144
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/openai/gpt-oss-120b", {
    "name": "GPT OSS 120B",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/openai/gpt-oss-20b", {
    "name": "GPT OSS 20B",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3-32B", {
    "name": "Qwen3 32B",
    "created": "2025-04",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 40960,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo", {
    "name": "Qwen3 Coder 480B A35B Instruct Turbo",
    "created": "2025-07-23",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 66536
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3-Max", {
    "name": "Qwen3 Max",
    "created": "2025-09-23",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 65536
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3-Next-80B-A3B-Instruct", {
    "name": "Qwen3-Next 80B-A3B Instruct",
    "created": "2025-09",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 32768
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3.5-122B-A10B", {
    "name": "Qwen3.5 122B-A10B",
    "created": "2026-02-23",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 65536
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3.5-27B", {
    "name": "Qwen3.5 27B",
    "created": "2026-02-23",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 65536
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3.5-35B-A3B", {
    "name": "Qwen 3.5 35B A3B",
    "created": "2026-02-01",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 81920
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3.5-397B-A17B", {
    "name": "Qwen 3.5 397B A17B",
    "created": "2026-02-01",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 81920
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3.5-9B", {
    "name": "Qwen3.5 9B",
    "created": "2026-02-23",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 65536
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3.6-27B", {
    "name": "Qwen3.6 27B",
    "created": "2026-04-22",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 65536
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3.6-35B-A3B", {
    "name": "Qwen3.6 35B A3B",
    "created": "2026-04-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 81920
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/Qwen/Qwen3.7-Max", {
    "name": "Qwen3.7 Max",
    "created": "2026-05-21",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 65536
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/XiaomiMiMo/MiMo-V2.5", {
    "name": "MiMo-V2.5",
    "created": "2026-04-22",
    "knowledge": "2024-12",
    "modalities": {
      "input": [
        "text",
        "image",
        "audio",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/XiaomiMiMo/MiMo-V2.5-Pro", {
    "name": "MiMo-V2.5-Pro",
    "created": "2026-04-22",
    "knowledge": "2024-12",
    "modalities": {
      "input": [
        "text",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/zai-org/GLM-4.6", {
    "name": "GLM-4.6",
    "created": "2025-09-30",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 202752,
      "output": 131072
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/zai-org/GLM-4.7", {
    "name": "GLM-4.7",
    "created": "2025-12-22",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 202752,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/zai-org/GLM-4.7-Flash", {
    "name": "GLM-4.7-Flash",
    "created": "2026-01-19",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 202752,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/zai-org/GLM-5", {
    "name": "GLM-5",
    "created": "2026-02-12",
    "knowledge": "2025-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 202752,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/zai-org/GLM-5.1", {
    "name": "GLM-5.1",
    "created": "2026-04-07",
    "knowledge": "2025-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 202752,
      "output": 16384
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("deepinfra/zai-org/GLM-5.2", {
    "name": "GLM-5.2",
    "created": "2026-06-13",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 32768
    },
    "providers": [
      "deepinfra"
    ]
  }),
  model("fireworks/accounts/fireworks/models/deepseek-v4-flash", {
    "name": "DeepSeek V4 Flash",
    "created": "2026-04-24",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 384000
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/deepseek-v4-pro", {
    "name": "DeepSeek V4 Pro",
    "created": "2026-04-24",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 384000
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/glm-5p2", {
    "name": "GLM 5.2",
    "created": "2026-06-16",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048575,
      "output": 131072
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/gpt-oss-120b", {
    "name": "GPT OSS 120B",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 32768
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/gpt-oss-20b", {
    "name": "GPT OSS 20B",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 32768
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/kimi-k2p6", {
    "name": "Kimi K2.6",
    "created": "2026-04-17",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262000,
      "output": 262000
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/kimi-k2p7-code", {
    "name": "Kimi K2.7 Code",
    "created": "2026-06-12",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262000,
      "output": 262000
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/kimi-k3", {
    "name": "Kimi K3",
    "created": "2026-07-27",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 131072
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/minimax-m2p7", {
    "name": "MiniMax-M2.7",
    "created": "2026-04-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 196608,
      "output": 196608
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/minimax-m3", {
    "name": "MiniMax-M3",
    "created": "2026-06-12",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 512000,
      "output": 512000
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/models/qwen3p7-plus", {
    "name": "Qwen 3.7 Plus",
    "created": "2026-06-12",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 65536
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/routers/glm-5p2-fast", {
    "name": "GLM 5.2 Fast",
    "created": "2026-06-26",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048575,
      "output": 131072
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/routers/kimi-k2p6-fast", {
    "name": "Kimi K2.6 Fast",
    "created": "2026-04-17",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262000,
      "output": 262000
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/routers/kimi-k2p6-turbo", {
    "name": "Kimi K2.6 Turbo",
    "created": "2026-04-17",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262000,
      "output": 262000
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/routers/kimi-k2p7-code-fast", {
    "name": "Kimi K2.7 Code Fast",
    "created": "2026-06-12",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262000,
      "output": 262000
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("fireworks/accounts/fireworks/routers/kimi-k3-fast", {
    "name": "Kimi K3 Fast",
    "created": "2026-07-27",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 131072
    },
    "providers": [
      "fireworks"
    ]
  }),
  model("google/deep-research-max-preview-04-2026", {
    "name": "Deep Research Max Preview (Apr-21-2026)",
    "created": "2026-04-21",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/deep-research-preview-04-2026", {
    "name": "Deep Research Preview (Apr-21-2026)",
    "created": "2026-04-21",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-2.5-computer-use-preview-10-2025", {
    "name": "Gemini 2.5 Computer Use Preview 10-2025",
    "created": "2025-10-07",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-2.5-flash", {
    "name": "Gemini 2.5 Flash",
    "created": "2025-06-17",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "audio",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-2.5-flash-image", {
    "name": "Nano Banana",
    "created": "2025-08-26",
    "knowledge": "2024-06",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations"
    ],
    "capabilities": {
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 32768,
      "output": 32768
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-2.5-flash-lite", {
    "name": "Gemini 2.5 Flash-Lite",
    "created": "2025-06-17",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "audio",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-2.5-flash-preview-tts", {
    "name": "Gemini 2.5 Flash Preview TTS",
    "created": "2025-05-01",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "audio"
      ]
    },
    "operations": [
      "audio.speech"
    ],
    "capabilities": {},
    "context": {
      "input": 8192,
      "output": 16384
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-2.5-pro", {
    "name": "Gemini 2.5 Pro",
    "created": "2025-06-17",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "audio",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-2.5-pro-preview-tts", {
    "name": "Gemini 2.5 Pro Preview TTS",
    "created": "2025-05-01",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "audio"
      ]
    },
    "operations": [
      "audio.speech"
    ],
    "capabilities": {},
    "context": {
      "input": 8192,
      "output": 16384
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3-flash-preview", {
    "name": "Gemini 3 Flash Preview",
    "created": "2025-12-17",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3-pro-image", {
    "name": "Nano Banana Pro",
    "created": "2026-05-28",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations"
    ],
    "capabilities": {
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 32768
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3-pro-image-preview", {
    "name": "Nano Banana Pro",
    "created": "2025-11-20",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations"
    ],
    "capabilities": {
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 32768
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.1-flash-image", {
    "name": "Nano Banana 2",
    "created": "2026-05-28",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations"
    ],
    "capabilities": {
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 65536,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.1-flash-image-preview", {
    "name": "Nano Banana 2",
    "created": "2026-02-26",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations"
    ],
    "capabilities": {
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 65536,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.1-flash-lite", {
    "name": "Gemini 3.1 Flash Lite",
    "created": "2026-05-07",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.1-flash-lite-image", {
    "name": "Nano Banana 2 Lite",
    "created": "2026-06-30",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 65536,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.1-flash-live-preview", {
    "name": "Gemini 3.1 Flash Live Preview",
    "created": "2026-03-26",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text",
        "audio"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.speech",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.1-flash-tts-preview", {
    "name": "Gemini 3.1 Flash TTS Preview",
    "created": "2026-04-15",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "audio"
      ]
    },
    "operations": [
      "audio.speech"
    ],
    "capabilities": {
      "reasoning": true
    },
    "context": {
      "input": 8192,
      "output": 16384
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.1-pro-preview", {
    "name": "Gemini 3.1 Pro Preview",
    "created": "2026-02-19",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.1-pro-preview-customtools", {
    "name": "Gemini 3.1 Pro Preview Custom Tools",
    "created": "2026-02-19",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.5-flash", {
    "name": "Gemini 3.5 Flash",
    "created": "2026-05-19",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.5-flash-lite", {
    "name": "Gemini 3.5 Flash Lite",
    "created": "2026-07-21",
    "knowledge": "2026-03",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.5-live-translate-preview", {
    "name": "Gemini 3.5 Live Translate Preview",
    "created": "2026-06-09",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "audio"
      ],
      "output": [
        "audio",
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.speech",
      "audio.transcriptions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 16384,
      "output": 32768
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-3.6-flash", {
    "name": "Gemini 3.6 Flash",
    "created": "2026-07-21",
    "knowledge": "2026-03",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-embedding-001", {
    "name": "Gemini Embedding 001",
    "created": "2025-05-20",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 2048,
      "output": 1
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-embedding-2", {
    "name": "Gemini Embedding 2",
    "created": "2026-04-22",
    "knowledge": "2025-11",
    "modalities": {
      "input": [
        "text",
        "image",
        "audio",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 8192,
      "output": 1
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-flash-latest", {
    "name": "Gemini Flash Latest",
    "created": "2026-05-19",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-flash-lite-latest", {
    "name": "Gemini Flash-Lite Latest",
    "created": "2026-05-07",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-omni-flash-preview", {
    "name": "Gemini Omni Flash Preview",
    "created": "2026-06-30",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "video"
      ]
    },
    "operations": [
      "video.generations"
    ],
    "capabilities": {
      "reasoning": true,
      "vision": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemini-robotics-er-1.6-preview", {
    "name": "Gemini Robotics-ER 1.6 Preview",
    "created": "2026-04-14",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemma-4-26b-a4b-it", {
    "name": "Gemma 4 26B A4B IT",
    "created": "2026-04-02",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 32768
    },
    "providers": [
      "google"
    ]
  }),
  model("google/gemma-4-31b-it", {
    "name": "Gemma 4 31B IT",
    "created": "2026-04-02",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 32768
    },
    "providers": [
      "google"
    ]
  }),
  model("google/lyria-3-clip-preview", {
    "name": "Lyria 3 Clip Preview",
    "created": "2026-03-25",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "audio"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.speech"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/lyria-3-pro-preview", {
    "name": "Lyria 3 Pro Preview",
    "created": "2026-03-25",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "audio"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.speech"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 65536
    },
    "providers": [
      "google"
    ]
  }),
  model("google/veo-3.1-fast-generate-preview", {
    "name": "Veo 3.1 fast",
    "created": "2025-10-15",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "video"
      ]
    },
    "operations": [
      "video.generations"
    ],
    "capabilities": {
      "vision": true
    },
    "context": {
      "input": 480,
      "output": 8192
    },
    "providers": [
      "google"
    ]
  }),
  model("google/veo-3.1-generate-preview", {
    "name": "Veo 3.1",
    "created": "2025-10-15",
    "status": "beta",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "video"
      ]
    },
    "operations": [
      "video.generations"
    ],
    "capabilities": {
      "vision": true
    },
    "context": {
      "input": 480,
      "output": 8192
    },
    "providers": [
      "google"
    ]
  }),
  model("google/veo-3.1-lite-generate-preview", {
    "name": "Veo 3.1 lite",
    "created": "2026-03-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "video"
      ]
    },
    "operations": [
      "video.generations"
    ],
    "capabilities": {
      "vision": true
    },
    "context": {
      "input": 480,
      "output": 8192
    },
    "providers": [
      "google"
    ]
  }),
  model("groq/canopylabs/orpheus-arabic-saudi", {
    "name": "Canopy Labs Orpheus Arabic Saudi",
    "created": "2025-12-16",
    "status": "beta",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "audio"
      ]
    },
    "operations": [
      "audio.speech"
    ],
    "capabilities": {},
    "context": {
      "input": 4000,
      "output": 50000
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/canopylabs/orpheus-v1-english", {
    "name": "Canopy Labs Orpheus V1 English",
    "created": "2025-12-19",
    "status": "beta",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "audio"
      ]
    },
    "operations": [
      "audio.speech"
    ],
    "capabilities": {},
    "context": {
      "input": 4000,
      "output": 50000
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/groq/compound", {
    "name": "Compound",
    "created": "2025-09-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 8192
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/groq/compound-mini", {
    "name": "Compound Mini",
    "created": "2025-09-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 8192
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/llama-3.1-8b-instant", {
    "name": "Llama 3.1 8B",
    "created": "2024-07-23",
    "knowledge": "2023-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 131072
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/llama-3.3-70b-versatile", {
    "name": "Llama 3.3 70B",
    "created": "2024-12-06",
    "knowledge": "2023-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 32768
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/meta-llama/llama-4-scout-17b-16e-instruct", {
    "name": "Llama 4 Scout 17B 16E",
    "created": "2025-04-05",
    "knowledge": "2024-08",
    "status": "beta",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 8192
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/meta-llama/llama-prompt-guard-2-22m", {
    "name": "Llama Prompt Guard 2 22M",
    "created": "2025-05-29",
    "status": "beta",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 512,
      "output": 512
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/meta-llama/llama-prompt-guard-2-86m", {
    "name": "Prompt Guard 2 86M",
    "created": "2025-05-29",
    "status": "beta",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 512,
      "output": 512
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/openai/gpt-oss-120b", {
    "name": "GPT OSS 120B",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/openai/gpt-oss-20b", {
    "name": "GPT OSS 20B",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/openai/gpt-oss-safeguard-20b", {
    "name": "Safety GPT OSS 20B",
    "created": "2025-10-29",
    "status": "beta",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 65536
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/qwen/qwen3-32b", {
    "name": "Qwen3-32B",
    "created": "2025-06-11",
    "status": "beta",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 40960
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/whisper-large-v3", {
    "name": "Whisper",
    "created": "2023-09-01",
    "modalities": {
      "input": [
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 0,
      "output": 0
    },
    "providers": [
      "groq"
    ]
  }),
  model("groq/whisper-large-v3-turbo", {
    "name": "Whisper Large V3 Turbo",
    "created": "2024-10-01",
    "modalities": {
      "input": [
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 0,
      "output": 0
    },
    "providers": [
      "groq"
    ]
  }),
  model("mistral/codestral-latest", {
    "name": "Codestral (latest)",
    "created": "2024-05-29",
    "knowledge": "2024-10",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 4096
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/magistral-medium-latest", {
    "name": "Magistral Medium (latest)",
    "created": "2025-03-17",
    "knowledge": "2025-06",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/magistral-small", {
    "name": "Magistral Small",
    "created": "2025-03-17",
    "knowledge": "2025-06",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 128000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/ministral-3b-latest", {
    "name": "Ministral 3B (latest)",
    "created": "2024-10-01",
    "knowledge": "2024-10",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 128000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/ministral-8b-latest", {
    "name": "Ministral 8B (latest)",
    "created": "2024-10-01",
    "knowledge": "2024-10",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 128000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-embed", {
    "name": "Mistral Embed",
    "created": "2023-12-11",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 8000,
      "output": 3072
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-large-2411", {
    "name": "Mistral Large 2.1",
    "created": "2024-11-18",
    "knowledge": "2024-11",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 16384
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-large-2512", {
    "name": "Mistral Large 3",
    "created": "2024-11-01",
    "knowledge": "2024-11",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 262144
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-large-latest", {
    "name": "Mistral Large (latest)",
    "created": "2024-11-01",
    "knowledge": "2024-11",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 262144
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-medium-2505", {
    "name": "Mistral Medium 3",
    "created": "2025-05-07",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 131072
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-medium-2508", {
    "name": "Mistral Medium 3.1",
    "created": "2025-08-12",
    "knowledge": "2025-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 262144
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-medium-2604", {
    "name": "Mistral Medium 3.5",
    "created": "2026-04-29",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 262144
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-medium-latest", {
    "name": "Mistral Medium (latest)",
    "created": "2026-04-29",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 262144
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-nemo", {
    "name": "Mistral Nemo",
    "created": "2024-07-01",
    "knowledge": "2024-07",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 128000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-small-2506", {
    "name": "Mistral Small 3.2",
    "created": "2025-06-20",
    "knowledge": "2025-03",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-small-2603", {
    "name": "Mistral Small 4",
    "created": "2026-03-16",
    "knowledge": "2025-06",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 256000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/mistral-small-latest", {
    "name": "Mistral Small (latest)",
    "created": "2026-03-16",
    "knowledge": "2025-06",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 256000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/open-mistral-7b", {
    "name": "Mistral 7B",
    "created": "2023-09-27",
    "knowledge": "2023-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 8000,
      "output": 8000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/open-mixtral-8x22b", {
    "name": "Mixtral 8x22B",
    "created": "2024-04-17",
    "knowledge": "2024-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 64000,
      "output": 64000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/open-mixtral-8x7b", {
    "name": "Mixtral 8x7B",
    "created": "2023-12-11",
    "knowledge": "2024-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 32000,
      "output": 32000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/pixtral-12b", {
    "name": "Pixtral 12B",
    "created": "2024-09-01",
    "knowledge": "2024-09",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 128000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("mistral/pixtral-large-latest", {
    "name": "Pixtral Large (latest)",
    "created": "2024-11-01",
    "knowledge": "2024-11",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 128000
    },
    "providers": [
      "mistral"
    ]
  }),
  model("openai/chatgpt-image-latest", {
    "name": "chatgpt-image-latest",
    "created": "2025-12-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 0,
      "output": 0
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-4.1", {
    "name": "GPT-4.1",
    "created": "2025-04-14",
    "knowledge": "2024-04",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1047576,
      "output": 32768
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-4.1-mini", {
    "name": "GPT-4.1 mini",
    "created": "2025-04-14",
    "knowledge": "2024-04",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1047576,
      "output": 32768
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-4o", {
    "name": "GPT-4o",
    "created": "2024-05-13",
    "knowledge": "2023-09",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-4o-2024-08-06", {
    "name": "GPT-4o (2024-08-06)",
    "created": "2024-08-06",
    "knowledge": "2023-09",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-4o-2024-11-20", {
    "name": "GPT-4o (2024-11-20)",
    "created": "2024-11-20",
    "knowledge": "2023-09",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-4o-mini", {
    "name": "GPT-4o mini",
    "created": "2024-07-18",
    "knowledge": "2023-09",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5", {
    "name": "GPT-5",
    "created": "2025-08-07",
    "knowledge": "2024-09-30",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5-mini", {
    "name": "GPT-5 Mini",
    "created": "2025-08-07",
    "knowledge": "2024-05-30",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5-nano", {
    "name": "GPT-5 Nano",
    "created": "2025-08-07",
    "knowledge": "2024-05-30",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5-pro", {
    "name": "GPT-5 Pro",
    "created": "2025-10-06",
    "knowledge": "2024-09-30",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 272000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.1", {
    "name": "GPT-5.1",
    "created": "2025-11-13",
    "knowledge": "2024-09-30",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.2", {
    "name": "GPT-5.2",
    "created": "2025-12-11",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.2-chat-latest", {
    "name": "GPT-5.2 Chat",
    "created": "2025-12-11",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.2-pro", {
    "name": "GPT-5.2 Pro",
    "created": "2025-12-11",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.3-chat-latest", {
    "name": "GPT-5.3 Chat (latest)",
    "created": "2026-03-03",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 16384
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.3-codex", {
    "name": "GPT-5.3 Codex",
    "created": "2026-02-05",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.3-codex-spark", {
    "name": "GPT-5.3 Codex Spark",
    "created": "2026-02-05",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 32000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.4", {
    "name": "GPT-5.4",
    "created": "2026-03-05",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1050000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.4-mini", {
    "name": "GPT-5.4 mini",
    "created": "2026-03-17",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.4-nano", {
    "name": "GPT-5.4 nano",
    "created": "2026-03-17",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 400000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.4-pro", {
    "name": "GPT-5.4 Pro",
    "created": "2026-03-05",
    "knowledge": "2025-08-31",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 1050000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.5", {
    "name": "GPT-5.5",
    "created": "2026-04-23",
    "knowledge": "2025-12-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1050000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.5-pro", {
    "name": "GPT-5.5 Pro",
    "created": "2026-04-23",
    "knowledge": "2025-12-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 1050000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.6", {
    "name": "GPT-5.6",
    "created": "2026-07-09",
    "knowledge": "2026-02-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1050000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.6-luna", {
    "name": "GPT-5.6 Luna",
    "created": "2026-07-09",
    "knowledge": "2026-02-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1050000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.6-sol", {
    "name": "GPT-5.6 Sol",
    "created": "2026-07-09",
    "knowledge": "2026-02-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1050000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-5.6-terra", {
    "name": "GPT-5.6 Terra",
    "created": "2026-07-09",
    "knowledge": "2026-02-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1050000,
      "output": 128000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-image-1-mini", {
    "name": "gpt-image-1-mini",
    "created": "2025-09-26",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 0,
      "output": 0
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-image-1.5", {
    "name": "gpt-image-1.5",
    "created": "2025-11-25",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text",
        "image"
      ]
    },
    "operations": [
      "chat.completions",
      "images.generations"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 0,
      "output": 0
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-image-2", {
    "name": "gpt-image-2",
    "created": "2026-04-21",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "image"
      ]
    },
    "operations": [
      "images.generations"
    ],
    "capabilities": {
      "vision": true,
      "promptCaching": true
    },
    "context": {
      "input": 0,
      "output": 0
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/gpt-realtime-2.1", {
    "name": "GPT-Realtime-2.1",
    "created": "2026-07-06",
    "knowledge": "2024-09-30",
    "modalities": {
      "input": [
        "text",
        "audio",
        "image"
      ],
      "output": [
        "text",
        "audio"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.speech",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 32000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/o3", {
    "name": "o3",
    "created": "2025-04-16",
    "knowledge": "2024-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 100000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/o3-pro", {
    "name": "o3-pro",
    "created": "2025-06-10",
    "knowledge": "2024-05",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 100000
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/text-embedding-3-large", {
    "name": "text-embedding-3-large",
    "created": "2024-01-25",
    "knowledge": "2024-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 8191,
      "output": 3072
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/text-embedding-3-small", {
    "name": "text-embedding-3-small",
    "created": "2024-01-25",
    "knowledge": "2024-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 8191,
      "output": 1536
    },
    "providers": [
      "openai"
    ]
  }),
  model("openai/text-embedding-ada-002", {
    "name": "text-embedding-ada-002",
    "created": "2022-12-15",
    "knowledge": "2022-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 8192,
      "output": 1536
    },
    "providers": [
      "openai"
    ]
  }),
  model("perplexity/sonar", {
    "name": "Sonar",
    "created": "2024-01-01",
    "knowledge": "2025-09-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "perplexity"
    ]
  }),
  model("perplexity/sonar-deep-research", {
    "name": "Perplexity Sonar Deep Research",
    "created": "2025-02-01",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 32768
    },
    "providers": [
      "perplexity"
    ]
  }),
  model("perplexity/sonar-pro", {
    "name": "Sonar Pro",
    "created": "2024-01-01",
    "knowledge": "2025-09-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 200000,
      "output": 8192
    },
    "providers": [
      "perplexity"
    ]
  }),
  model("perplexity/sonar-reasoning-pro", {
    "name": "Sonar Reasoning Pro",
    "created": "2024-01-01",
    "knowledge": "2025-09-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 128000,
      "output": 4096
    },
    "providers": [
      "perplexity"
    ]
  }),
  model("togetherai/deepcogito/cogito-v2-1-671b", {
    "name": "Cogito v2.1 671B",
    "created": "2025-11-13",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 163840,
      "output": 163840
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/deepseek-ai/DeepSeek-V4-Pro", {
    "name": "DeepSeek V4 Pro",
    "created": "2026-04-24",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 512000,
      "output": 384000
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/google/gemma-3n-E4B-it", {
    "name": "Gemma 3N E4B Instruct",
    "created": "2025-05-20",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 32768,
      "output": 32768
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/google/gemma-4-31B-it", {
    "name": "Gemma 4 31B Instruct",
    "created": "2026-04-07",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 131072
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/LiquidAI/LFM2-24B-A2B", {
    "name": "LFM2-24B-A2B",
    "created": "2026-02-25",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 32768,
      "output": 32768
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/meta-llama/Llama-3.3-70B-Instruct-Turbo", {
    "name": "Llama 3.3 70B",
    "created": "2024-12-06",
    "knowledge": "2023-12",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 131072
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/meta-llama/Meta-Llama-3-8B-Instruct-Lite", {
    "name": "Meta Llama 3 8B Instruct Lite",
    "created": "2024-04-18",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "streaming": true
    },
    "context": {
      "input": 8192,
      "output": 8192
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/MiniMaxAI/MiniMax-M2.7", {
    "name": "MiniMax-M2.7",
    "created": "2026-03-18",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 202752,
      "output": 131072
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/MiniMaxAI/MiniMax-M3", {
    "name": "MiniMax-M3",
    "created": "2026-06-12",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 524288,
      "output": 250000
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/moonshotai/Kimi-K2.6", {
    "name": "Kimi K2.6",
    "created": "2026-04-21",
    "knowledge": "2025-01",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 131000
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/moonshotai/Kimi-K2.7-Code", {
    "name": "Kimi K2.7 Code",
    "created": "2026-06-14",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 131072
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/moonshotai/Kimi-K3", {
    "name": "Kimi K3",
    "created": "2026-07-16",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1048576,
      "output": 131072
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/nvidia/nemotron-3-ultra-550b-a55b", {
    "name": "Nemotron 3 Ultra 550B A55B",
    "created": "2026-06-04",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 512300,
      "output": 512300
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/openai/gpt-oss-120b", {
    "name": "GPT OSS 120B",
    "created": "2025-08-05",
    "knowledge": "2025-08",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 131072
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/openai/gpt-oss-20b", {
    "name": "GPT OSS 20B",
    "created": "2025-08-05",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 131072,
      "output": 131072
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/pearl-ai/gemma-4-31b-it", {
    "name": "Pearl AI Gemma 4 31B Instruct",
    "created": "2026-04-07",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 32000,
      "output": 32000
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/Qwen/Qwen2.5-7B-Instruct-Turbo", {
    "name": "Qwen 2.5 7B Instruct Turbo",
    "created": "2024-09-19",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "streaming": true
    },
    "context": {
      "input": 32768,
      "output": 32768
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/Qwen/Qwen3.5-9B", {
    "name": "Qwen3.5 9B",
    "created": "2026-03-03",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 65536
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/Qwen/Qwen3.6-Plus", {
    "name": "Qwen3.6 Plus",
    "created": "2026-04-30",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "reasoning": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 500000
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/Qwen/Qwen3.7-Max", {
    "name": "Qwen3.7 Max",
    "created": "2026-05-21",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 500000
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/thinkingmachines/Inkling", {
    "name": "Inkling",
    "created": "2026-07-15",
    "modalities": {
      "input": [
        "text",
        "image",
        "audio"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions",
      "audio.transcriptions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 524288,
      "output": 131072
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("togetherai/zai-org/GLM-5.2", {
    "name": "GLM-5.2",
    "created": "2026-06-16",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 262144,
      "output": 164000
    },
    "providers": [
      "togetherai"
    ]
  }),
  model("voyage/voyage-3", {
    "name": "Voyage 3",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "embedding"
      ]
    },
    "operations": [
      "embeddings"
    ],
    "capabilities": {},
    "context": {
      "input": 32000,
      "output": 1024
    },
    "providers": [
      "voyage"
    ]
  }),
  model("voyage/voyage-3-lite", {
    "name": "Voyage 3 Lite",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "embedding"
      ]
    },
    "operations": [
      "embeddings"
    ],
    "capabilities": {},
    "context": {
      "input": 32000,
      "output": 1024
    },
    "providers": [
      "voyage"
    ]
  }),
  model("voyage/voyage-code-3", {
    "name": "Voyage Code 3",
    "modalities": {
      "input": [
        "text"
      ],
      "output": [
        "embedding"
      ]
    },
    "operations": [
      "embeddings"
    ],
    "capabilities": {},
    "context": {
      "input": 32000,
      "output": 1024
    },
    "providers": [
      "voyage"
    ]
  }),
  model("xai/grok-4.20-0309-non-reasoning", {
    "name": "Grok 4.20 (Non-Reasoning)",
    "created": "2026-03-09",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 30000
    },
    "providers": [
      "xai"
    ]
  }),
  model("xai/grok-4.20-0309-reasoning", {
    "name": "Grok 4.20 (Reasoning)",
    "created": "2026-03-09",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 30000
    },
    "providers": [
      "xai"
    ]
  }),
  model("xai/grok-4.20-multi-agent-0309", {
    "name": "Grok 4.20 Multi-Agent",
    "created": "2026-03-09",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 30000
    },
    "providers": [
      "xai"
    ]
  }),
  model("xai/grok-4.3", {
    "name": "Grok 4.3",
    "created": "2026-04-17",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 1000000,
      "output": 30000
    },
    "providers": [
      "xai"
    ]
  }),
  model("xai/grok-4.5", {
    "name": "Grok 4.5",
    "created": "2026-07-08",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 500000,
      "output": 500000
    },
    "providers": [
      "xai"
    ]
  }),
  model("xai/grok-build-0.1", {
    "name": "Grok Build 0.1",
    "created": "2026-04-16",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "text"
      ]
    },
    "operations": [
      "chat.completions"
    ],
    "capabilities": {
      "toolCalling": true,
      "structuredOutput": true,
      "reasoning": true,
      "vision": true,
      "promptCaching": true,
      "streaming": true
    },
    "context": {
      "input": 256000,
      "output": 256000
    },
    "providers": [
      "xai"
    ]
  }),
  model("xai/grok-imagine-image", {
    "name": "Grok Imagine Image",
    "created": "2026-01-28",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "image"
      ]
    },
    "operations": [
      "images.generations"
    ],
    "capabilities": {
      "vision": true
    },
    "context": {
      "input": 8000,
      "output": 0
    },
    "providers": [
      "xai"
    ]
  }),
  model("xai/grok-imagine-image-quality", {
    "name": "Grok Imagine Image Quality",
    "created": "2026-04-03",
    "modalities": {
      "input": [
        "text",
        "image"
      ],
      "output": [
        "image"
      ]
    },
    "operations": [
      "images.generations"
    ],
    "capabilities": {
      "vision": true
    },
    "context": {
      "input": 8000,
      "output": 0
    },
    "providers": [
      "xai"
    ]
  }),
  model("xai/grok-imagine-video", {
    "name": "Grok Imagine Video",
    "created": "2026-01-28",
    "modalities": {
      "input": [
        "text",
        "image",
        "video"
      ],
      "output": [
        "video"
      ]
    },
    "operations": [
      "video.generations"
    ],
    "capabilities": {
      "vision": true
    },
    "context": {
      "input": 1024,
      "output": 0
    },
    "providers": [
      "xai"
    ]
  }),
  model("xai/grok-imagine-video-1.5", {
    "name": "Grok Imagine Video 1.5",
    "created": "2026-05-30",
    "modalities": {
      "input": [
        "image"
      ],
      "output": [
        "video"
      ]
    },
    "operations": [
      "video.generations"
    ],
    "capabilities": {
      "vision": true
    },
    "context": {
      "input": 1024,
      "output": 0
    },
    "providers": [
      "xai"
    ]
  }),
);
