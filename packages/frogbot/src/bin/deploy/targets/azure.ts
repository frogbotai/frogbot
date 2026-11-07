import { splitVariables } from '../app.js';
import { cloudIssues, readCloudFlags, stringFlag, warnIdleJobs } from '../cloud.js';
import { checkLogin, findTool } from '../preflight.js';
import type { DeployContext, DeployTarget, PreflightIssue } from '../types.js';

const options = { 'resource-group': { type: 'string' } } as const;

const probes = JSON.stringify([
  {
    type: 'Startup',
    httpGet: { path: '/api/health', port: 3000 },
    periodSeconds: 5,
    failureThreshold: 60,
  },
]);

function flagsOf(context: DeployContext) {
  const flags = readCloudFlags(context, {
    target: 'azure',
    usage: '[--resource-group <name>]',
    options,
  });

  return {
    ...flags,
    location: flags.region ?? 'eastus',
    group: stringFlag(flags.values, 'resource-group') ?? `${flags.service}-rg`,
  };
}

/**
 * The Container Apps secret name for one of the app's variables: lowercase, dashes for underscores,
 * starting and ending with a letter or digit as Azure requires.
 */
export function azureSecretName(name: string): string {
  return name
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

function checkSecretNames(context: DeployContext): PreflightIssue[] {
  const owners = new Map<string, string>();
  const issues: PreflightIssue[] = [];

  for (const name of Object.keys(splitVariables(context).secrets)) {
    const secret = azureSecretName(name);
    const owner = owners.get(secret);

    if (owner === undefined) owners.set(secret, name);
    else {
      issues.push({
        code: 'AZURE_SECRET_NAME_CLASH',
        message: `${owner} and ${name} would both be the Container Apps secret ${secret}.`,
        fix: 'Rename one of them, so they differ by more than case and leading or trailing underscores.',
      });
    }
  }

  return issues;
}

/** `frogbot deploy azure`: built in Azure by `az containerapp up --source .`, keys as Container Apps secrets, one replica. */
export const azureTarget: DeployTarget = {
  describe: 'Deploy to your Azure Container Apps with your az login (built in Azure)',
  preflight: async (context) => {
    flagsOf(context);

    const issues = [
      ...cloudIssues(context, '@frogbotai/storage-azure'),
      ...checkSecretNames(context),
    ];

    const { command, issue } = await findTool(
      context.io,
      ['az'],
      'Install the Azure CLI: https://learn.microsoft.com/cli/azure/install-azure-cli',
    );

    if (!command) return issue ? [issue, ...issues] : issues;

    const login = await checkLogin(context.io, 'az', ['account', 'show'], 'az login');

    return login ? [login, ...issues] : issues;
  },
  run: async (context) => {
    const { service, location, group, minInstances } = flagsOf(context);
    const { secrets, build } = splitVariables(context);
    const app = ['--name', service, '--resource-group', group];

    if (Object.keys(build).length > 0) {
      context.log(
        `[frogbot] ${Object.keys(build).join(', ')} can't reach the build on Azure (\`az containerapp up\` takes no build args); put them in a committed .env.production instead.`,
      );
    }

    await context.run('az', ['extension', 'add', '--name', 'containerapp', '--upgrade', '--yes']);
    await context.run('az', ['group', 'create', '--name', group, '--location', location]);

    await context.run('az', [
      'containerapp',
      'up',
      ...app,
      '--location',
      location,
      '--source',
      '.',
      '--ingress',
      'external',
      '--target-port',
      '3000',
    ]);

    const entries = Object.entries(secrets);

    if (entries.length > 0) {
      await context.run(
        'az',
        [
          'containerapp',
          'secret',
          'set',
          ...app,
          '--secrets',
          ...entries.map(([name, value]) => `${azureSecretName(name)}=${value}`),
        ],
        { mask: entries.map(([, value]) => value), quiet: true },
      );
    }

    warnIdleJobs(context, minInstances);

    await context.run('az', [
      'containerapp',
      'update',
      ...app,
      '--min-replicas',
      String(minInstances),
      '--max-replicas',
      '1',
      ...(entries.length > 0
        ? [
            '--set-env-vars',
            ...entries.map(([name]) => `${name}=secretref:${azureSecretName(name)}`),
          ]
        : []),
    ]);

    await context.run('az', [
      'resource',
      'update',
      ...app,
      '--resource-type',
      'Microsoft.App/containerApps',
      '--set',
      `properties.template.containers[0].probes=${probes}`,
    ]);

    const shown = await context.io.exec('az', [
      'containerapp',
      'show',
      ...app,
      '--query',
      'properties.configuration.ingress.fqdn',
      '--output',
      'tsv',
    ]);

    const host = shown.stdout.trim();
    const url = host ? `https://${host}` : undefined;

    if (!context.flags.dryRun) {
      context.log(`[frogbot] Deployed ${service} to Azure Container Apps${url ? `: ${url}` : '.'}`);
    }

    return { group, location, service, minInstances, url };
  },
};
