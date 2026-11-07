# @frogbotai/plugin-ai-policy

Limits each user's AI models and monthly spend, and tracks what they spend.

With `@frogbotai/plugin-api-keys` on the same auth collection, each API key also gets a model list and monthly cap that narrow its owner's, checked on every request made with the key. Its spend counts toward both the key and the owner. A key minted by another key stays inside that key's model list and cap too.

See the [AI policy documentation](https://docs.frogbot.ai/plugins/ai-policy).
