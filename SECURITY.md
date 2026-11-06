# Security policy

## Supported versions

FrogBot is pre-1.0. Only the [latest release](https://github.com/frogbotai/frogbot/releases/latest) gets security fixes, and every published package shares its version. Fixes ship in a new release rather than as patches to older ones, so upgrade to get them.

## Reporting a vulnerability

Report it privately through GitHub: open the repo's **Security** tab and choose **Report a vulnerability**, or go straight to [the report form](https://github.com/frogbotai/frogbot/security/advisories/new). Don't open a public issue, discussion or pull request for it.

Include what you can:

- the affected package and version
- the steps or a proof of concept that shows the problem
- what an attacker gains, for example reading another user's records or running code on the server

## What happens next

1. We reply in the report within 5 business days to confirm we have it.
2. We work out whether it's a vulnerability and how severe it is, and keep you updated in the report.
3. We fix it in a new release and publish a GitHub Security Advisory, crediting you unless you ask us not to.

Please keep the details private until the advisory is published. We don't offer monetary rewards.

## Development servers

`frogbot dev` and other development builds expose debugging output, such as stack traces and source, that can include sensitive values, and FrogBot's authentication doesn't cover it. Deploy production builds and keep development servers reachable only by trusted developers. Reports limited to expected development diagnostics, with no production impact, are informational.
