import { buildArgs, sourceTag, splitVariables } from '../app.js';
import { cloudIssues, readCloudFlags, stringFlag } from '../cloud.js';
import { DeployError } from '../error.js';
import { checkLogin, findTool } from '../preflight.js';
import type { DeployContext, DeployTarget, PreflightIssue } from '../types.js';

const options = {
  cluster: { type: 'string' },
  'execution-role': { type: 'string' },
  'infrastructure-role': { type: 'string' },
} as const;

const usage = '[--cluster <name>] [--execution-role <name>] [--infrastructure-role <name>]';

function flagsOf(context: DeployContext) {
  const flags = readCloudFlags(context, { target: 'aws', usage, options });

  if (flags.minInstances === 0) {
    throw new DeployError(
      "--min-instances 0 isn't available on AWS: ECS Express Mode keeps one task running. It works on gcp and azure.",
      2,
    );
  }

  return {
    ...flags,
    cluster: stringFlag(flags.values, 'cluster') ?? 'default',
    executionRole: stringFlag(flags.values, 'execution-role') ?? 'ecsTaskExecutionRole',
    infrastructureRole:
      stringFlag(flags.values, 'infrastructure-role') ?? 'ecsInfrastructureRoleForExpressServices',
  };
}

async function readRegion(context: DeployContext): Promise<string | undefined> {
  const flag =
    flagsOf(context).region ?? context.io.env.AWS_REGION ?? context.io.env.AWS_DEFAULT_REGION;

  if (flag) return flag;

  const { code, stdout } = await context.io.exec('aws', ['configure', 'get', 'region']);

  return code === 0 && stdout.trim() ? stdout.trim() : undefined;
}

async function readAccount(context: DeployContext): Promise<string> {
  const { stdout } = await context.io.exec('aws', [
    'sts',
    'get-caller-identity',
    '--query',
    'Account',
    '--output',
    'text',
  ]);

  return stdout.trim() || '<account-id>';
}

async function storeSecrets(
  context: DeployContext,
  {
    region,
    service,
    secrets,
  }: { region: string; service: string; secrets: Record<string, string> },
): Promise<{ name: string; valueFrom: string }[]> {
  const stored: { name: string; valueFrom: string }[] = [];

  for (const [name, value] of Object.entries(secrets)) {
    const id = `${service}/${name}`;
    const exists = await context.io.exec('aws', [
      'secretsmanager',
      'describe-secret',
      '--secret-id',
      id,
      '--region',
      region,
    ]);

    const args =
      exists.code === 0
        ? ['secretsmanager', 'put-secret-value', '--secret-id', id]
        : ['secretsmanager', 'create-secret', '--name', id];

    await context.run(
      'aws',
      [...args, '--secret-string', 'file:///dev/stdin', '--region', region],
      {
        input: value,
        quiet: true,
      },
    );

    stored.push({ name, valueFrom: id });
  }

  return stored;
}

/** `frogbot deploy aws`: built locally, pushed to ECR, keys in Secrets Manager, one ECS Express Mode task. */
export const awsTarget: DeployTarget = {
  describe: 'Deploy to your AWS (ECS Express Mode on Fargate) with your aws login',
  preflight: async (context) => {
    const { executionRole, infrastructureRole } = flagsOf(context);
    const issues: PreflightIssue[] = cloudIssues(context, '@frogbotai/storage-s3');

    const docker = await findTool(
      context.io,
      ['docker'],
      'Install Docker: https://docs.docker.com/get-docker/',
    );

    if (docker.issue) issues.unshift(docker.issue);

    const aws = await findTool(
      context.io,
      ['aws'],
      'Install the AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html',
    );

    if (aws.issue) return [aws.issue, ...issues];

    const login = await checkLogin(
      context.io,
      'aws',
      ['sts', 'get-caller-identity'],
      'aws configure sso',
    );

    if (login) return [login, ...issues];

    if (!(await readRegion(context))) {
      issues.unshift({
        code: 'NO_REGION',
        message: 'No AWS region.',
        fix: 'Pass --region <region>, or run `aws configure set region <region>`.',
      });
    }

    for (const role of [executionRole, infrastructureRole]) {
      const { code } = await context.io.exec('aws', ['iam', 'get-role', '--role-name', role]);

      if (code !== 0) {
        issues.push({
          code: 'AWS_ROLE_MISSING',
          message: `No IAM role named ${role}.`,
          fix: `Create it as the ECS Express Mode guide describes (https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html), or pass --${role === executionRole ? 'execution-role' : 'infrastructure-role'} <name>.`,
        });
      }
    }

    return issues;
  },
  run: async (context) => {
    const { service, cluster, executionRole, infrastructureRole } = flagsOf(context);
    const region = (await readRegion(context)) ?? '';
    const account = await readAccount(context);
    const registry = `${account}.dkr.ecr.${region}.amazonaws.com`;
    const image = `${registry}/${service}:${sourceTag(context.root)}`;
    const variables = splitVariables(context);
    const scoped = ['--region', region];

    const repo = await context.io.exec('aws', [
      'ecr',
      'describe-repositories',
      '--repository-names',
      service,
      ...scoped,
    ]);

    if (repo.code !== 0) {
      await context.run('aws', [
        'ecr',
        'create-repository',
        '--repository-name',
        service,
        ...scoped,
      ]);
    }

    await context.run('docker', [
      'build',
      '--platform',
      'linux/amd64',
      '-t',
      image,
      ...buildArgs(context, variables.build),
      '.',
    ]);

    const password = await context.run('aws', ['ecr', 'get-login-password', ...scoped], {
      quiet: true,
    });

    await context.run('docker', ['login', '--username', 'AWS', '--password-stdin', registry], {
      input: password.stdout.trim(),
    });

    await context.run('docker', ['push', image]);

    const secrets = await storeSecrets(context, { region, service, secrets: variables.secrets });
    const container = JSON.stringify({ image, containerPort: 3000, secrets });
    const scaling = JSON.stringify({ minTaskCount: 1, maxTaskCount: 1 });
    const serviceArn = `arn:aws:ecs:${region}:${account}:service/${cluster}/${service}`;

    const existing = await context.io.exec('aws', [
      'ecs',
      'describe-express-gateway-service',
      '--service-arn',
      serviceArn,
      '--query',
      'service.status.statusCode',
      '--output',
      'text',
      ...scoped,
    ]);

    const shared = [
      '--health-check-path',
      '/api/health',
      '--primary-container',
      container,
      '--scaling-target',
      scaling,
      ...scoped,
    ];

    await context.run(
      'aws',
      existing.code === 0 && existing.stdout.trim() === 'ACTIVE'
        ? ['ecs', 'update-express-gateway-service', '--service-arn', serviceArn, ...shared]
        : [
            'ecs',
            'create-express-gateway-service',
            '--service-name',
            service,
            '--cluster',
            cluster,
            '--execution-role-arn',
            `arn:aws:iam::${account}:role/${executionRole}`,
            '--infrastructure-role-arn',
            `arn:aws:iam::${account}:role/${infrastructureRole}`,
            ...shared,
          ],
      { quiet: true },
    );

    const endpoint = await context.io.exec('aws', [
      'ecs',
      'describe-express-gateway-service',
      '--service-arn',
      serviceArn,
      '--query',
      'service.activeConfigurations[0].ingressPaths[0].endpoint',
      '--output',
      'text',
      ...scoped,
    ]);

    const host = endpoint.stdout.trim();
    const url =
      host && host !== 'None' ? (host.startsWith('http') ? host : `https://${host}`) : undefined;

    if (!context.flags.dryRun) {
      context.log(`[frogbot] Deployed ${service} to ECS Express Mode${url ? `: ${url}` : '.'}`);
    }

    return { region, service, image, serviceArn, url };
  },
};
