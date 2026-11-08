import { describe, expect, it } from 'vitest';

import { runDeploy } from '../../../../../packages/frogbot/src/bin/deploy/run.js';
import { awsTarget } from '../../../../../packages/frogbot/src/bin/deploy/targets/aws.js';
import { azureTarget } from '../../../../../packages/frogbot/src/bin/deploy/targets/azure.js';
import { gcpTarget } from '../../../../../packages/frogbot/src/bin/deploy/targets/gcp.js';
import type {
  DeployConfig,
  DeployTarget,
} from '../../../../../packages/frogbot/src/bin/deploy/types.js';
import { deployConfig, type FakeProgram, tempDir, testIO, writeApp } from './helpers.js';

async function deployWith(
  target: DeployTarget,
  name: string,
  args: string[],
  {
    programs,
    files,
    config,
  }: {
    programs: Record<string, FakeProgram>;
    files?: Record<string, string>;
    config?: DeployConfig;
  },
) {
  const root = await tempDir();
  const io = testIO({ cwd: root, programs, config });

  await writeApp(root, files);

  const code = await runDeploy(target, args, io.io, { name, image: true });

  return { root, code, ...io };
}

const flagValue = (commands: string[], prefix: string, flag: string) =>
  commands
    .find((command) => command.startsWith(prefix))
    ?.split(' ')
    .find((arg) => arg.startsWith(flag));

const gcloud =
  ({
    exists = false,
    project = 'acme',
  }: { exists?: boolean; project?: string } = {}): FakeProgram =>
  (args) => {
    const command = args.join(' ');

    if (command === 'config get-value project') return { stdout: `${project}\n` };
    if (command === 'config get-value run/region') return { stdout: '(unset)\n' };
    if (command.startsWith('projects describe')) return { stdout: '123456\n' };
    if (command.startsWith('run services describe')) {
      return { stdout: 'https://deals-app-x.a.run.app\n' };
    }

    if (
      !exists &&
      (command.startsWith('artifacts repositories describe') ||
        command.startsWith('secrets describe'))
    ) {
      return { code: 1 };
    }

    return undefined;
  };

describe('deploy gcp', () => {
  it('builds with Cloud Build, keeps keys in Secret Manager and deploys one always-on Cloud Run instance', async () => {
    const { code, calls, commands, stdout } = await deployWith(gcpTarget, 'gcp', [], {
      programs: { gcloud: gcloud() },
    });

    const run = commands().filter(
      (command) => !/ (describe|get-value|print-access-token)( |$)/.test(command),
    );

    expect(code).toBe(0);
    expect(run[0]).toBe(
      'gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project acme --quiet',
    );
    expect(run[1]).toBe(
      'gcloud artifacts repositories create frogbot --repository-format=docker --location=us-central1 --project acme --quiet',
    );
    expect(run[2]).toMatch(
      /^gcloud builds submit --config \S+cloudbuild\.json --project acme --quiet$/,
    );
    expect(run).toContain(
      'gcloud secrets create deals-app-frogbot-secret --replication-policy=automatic --project acme --quiet',
    );
    expect(
      calls.find((call) =>
        call.args.join(' ').startsWith('secrets versions add deals-app-openai-api-key'),
      )?.input,
    ).toBe('sk-test-abcdef');
    expect(run.some((command) => command.includes('next-public-site'))).toBe(false);

    const deploy = run.at(-1) ?? '';

    expect(deploy).toMatch(
      /^gcloud run deploy deals-app --image=us-central1-docker\.pkg\.dev\/acme\/frogbot\/deals-app:[0-9a-f]{12} /,
    );
    expect(deploy).toContain('--min-instances=1 --max-instances=1');
    expect(deploy).toContain('httpGet.path=/api/health');
    expect(deploy).toContain(
      '--set-secrets=FROGBOT_SECRET=deals-app-frogbot-secret:latest,DATABASE_URL=deals-app-database-url:latest,OPENAI_API_KEY=deals-app-openai-api-key:latest',
    );
    expect(stdout().at(-1)).toBe(
      '[frogbot] Deployed deals-app to Cloud Run: https://deals-app-x.a.run.app',
    );
  });

  it('re-runs onto the same service, repository and secrets without creating them', async () => {
    const { commands } = await deployWith(gcpTarget, 'gcp', ['--region', 'europe-west1'], {
      programs: { gcloud: gcloud({ exists: true }) },
    });

    expect(commands().some((command) => / create /.test(command))).toBe(false);
    expect(flagValue(commands(), 'gcloud run deploy deals-app', '--region=')).toBe(
      '--region=europe-west1',
    );
  });

  it('scales to zero with --min-instances 0 and warns about scheduled jobs', async () => {
    const { commands, stdout } = await deployWith(gcpTarget, 'gcp', ['--min-instances', '0'], {
      programs: { gcloud: gcloud() },
      config: deployConfig({ scheduled: true }),
    });

    expect(flagValue(commands(), 'gcloud run deploy', '--min-instances=')).toBe(
      '--min-instances=0',
    );
    expect(stdout()).toContain(
      '[frogbot] --min-instances 0: the app stops when idle, so its scheduled jobs wait until a request wakes it.',
    );
  });

  it.each([['2'], ['many']])('exits 2 on --min-instances %s', async (value) => {
    const { code } = await deployWith(gcpTarget, 'gcp', ['--min-instances', value], {
      programs: { gcloud: gcloud() },
    });

    expect(code).toBe(2);
  });

  it('refuses a SQLite file, local uploads and no project, all at once', async () => {
    const { code, commands, stderr } = await deployWith(gcpTarget, 'gcp', [], {
      programs: { gcloud: gcloud({ project: '(unset)' }) },
      files: { '.env': 'FROGBOT_SECRET=x\nDATABASE_URL=file:./frogbot.db\n' },
      config: deployConfig({
        uploads: [{ slug: 'files' }, { slug: 'media', disableLocalStorage: true }],
      }),
    });

    const codes = stderr().flatMap((line) => /^\[frogbot\] ([A-Z_]+) /.exec(line)?.[1] ?? []);

    expect(code).toBe(1);
    expect(codes).toEqual(['NO_PROJECT', 'LOCAL_DATABASE', 'LOCAL_UPLOADS']);
    expect(stderr().join('\n')).toContain('Uploads to files are saved');
    expect(stderr().join('\n')).toContain('@frogbotai/storage-gcs');
    expect(commands().every((command) => /get-value|print-access-token/.test(command))).toBe(true);
  });

  it('dry-runs: prints every command and runs only read-only queries', async () => {
    const { code, commands, stdout } = await deployWith(
      gcpTarget,
      'gcp',
      ['--project', 'p', '--dry-run'],
      {
        programs: { gcloud: gcloud() },
      },
    );

    expect(code).toBe(0);
    expect(
      commands().every((command) => /describe|get-value|print-access-token/.test(command)),
    ).toBe(true);
    expect(
      stdout().filter((line) => line.startsWith('[dry-run] $ gcloud run deploy')),
    ).toHaveLength(1);
    expect(stdout().some((line) => line.startsWith('[frogbot] Deployed'))).toBe(false);
  });
});

const aws =
  ({ exists = false }: { exists?: boolean } = {}): FakeProgram =>
  (args) => {
    const command = args.join(' ');

    if (command === 'configure get region') return { stdout: 'us-east-1\n' };
    if (command.startsWith('sts get-caller-identity --query')) return { stdout: '111122223333\n' };
    if (command.startsWith('ecr get-login-password')) return { stdout: 'ecr-password\n' };
    if (command.includes('service.status.statusCode')) {
      return exists ? { stdout: 'ACTIVE\n' } : { code: 254 };
    }

    if (command.includes('ingressPaths[0].endpoint')) {
      return { stdout: 'de-123.ecs.us-east-1.on.aws\n' };
    }

    if (
      !exists &&
      (command.startsWith('ecr describe-repositories') ||
        command.startsWith('secretsmanager describe-secret'))
    ) {
      return { code: 254 };
    }

    return undefined;
  };

describe('deploy aws', () => {
  it('builds locally, pushes to ECR, stores keys and creates one ECS Express Mode task', async () => {
    const { code, calls, commands, stdout } = await deployWith(awsTarget, 'aws', [], {
      programs: { aws: aws(), docker: () => undefined },
    });

    const steps = commands().filter(
      (command) => !/describe|get-caller-identity|get-role|configure get/.test(command),
    );

    expect(code).toBe(0);
    expect(steps[0]).toBe(
      'aws ecr create-repository --repository-name deals-app --region us-east-1',
    );
    expect(steps[1]).toMatch(
      /^docker build --platform linux\/amd64 -t 111122223333\.dkr\.ecr\.us-east-1\.amazonaws\.com\/deals-app:[0-9a-f]{12} --build-arg NEXT_PUBLIC_SITE=https:\/\/deals\.example\.com \.$/,
    );
    expect(steps[2]).toBe('aws ecr get-login-password --region us-east-1');
    expect(steps[3]).toBe(
      'docker login --username AWS --password-stdin 111122223333.dkr.ecr.us-east-1.amazonaws.com',
    );
    expect(steps[4]).toMatch(
      /^docker push 111122223333\.dkr\.ecr\.us-east-1\.amazonaws\.com\/deals-app:[0-9a-f]{12}$/,
    );
    expect(calls.find((call) => call.args[0] === 'login')?.input).toBe('ecr-password');
    expect(steps).toContain(
      'aws secretsmanager create-secret --name deals-app/FROGBOT_SECRET --secret-string file:///dev/stdin --region us-east-1',
    );

    const create = calls.find((call) => call.args[1] === 'create-express-gateway-service');

    expect(create?.args).toEqual(
      expect.arrayContaining([
        '--execution-role-arn',
        'arn:aws:iam::111122223333:role/ecsTaskExecutionRole',
        '--infrastructure-role-arn',
        'arn:aws:iam::111122223333:role/ecsInfrastructureRoleForExpressServices',
        '--health-check-path',
        '/api/health',
        '--scaling-target',
        '{"minTaskCount":1,"maxTaskCount":1}',
      ]),
    );

    const container = JSON.parse(
      create?.args[create.args.indexOf('--primary-container') + 1] ?? '{}',
    ) as {
      containerPort: number;
      secrets: { name: string; valueFrom: string }[];
    };

    expect(container.containerPort).toBe(3000);
    expect(container.secrets.map((secret) => secret.name)).toEqual([
      'FROGBOT_SECRET',
      'DATABASE_URL',
      'OPENAI_API_KEY',
    ]);
    expect(stdout().at(-1)).toBe(
      '[frogbot] Deployed deals-app to ECS Express Mode: https://de-123.ecs.us-east-1.on.aws',
    );
  });

  it('updates the existing service on a re-run', async () => {
    const { calls } = await deployWith(awsTarget, 'aws', [], {
      programs: { aws: aws({ exists: true }), docker: () => undefined },
    });

    expect(calls.some((call) => call.args[1] === 'create-express-gateway-service')).toBe(false);
    expect(
      calls.find((call) => call.args[1] === 'update-express-gateway-service')?.args.slice(2, 4),
    ).toEqual(['--service-arn', 'arn:aws:ecs:us-east-1:111122223333:service/default/deals-app']);
    expect(calls.some((call) => call.args[1] === 'put-secret-value')).toBe(true);
  });

  it('exits 2 on --min-instances 0', async () => {
    const { code, stderr } = await deployWith(awsTarget, 'aws', ['--min-instances', '0'], {
      programs: { aws: aws(), docker: () => undefined },
    });

    expect(code).toBe(2);
    expect(stderr()[0]).toContain("isn't available on AWS");
  });

  it('reports a missing role, and needs docker', async () => {
    const { code, stderr } = await deployWith(awsTarget, 'aws', [], {
      programs: { aws: (args) => (args[0] === 'iam' ? { code: 254 } : aws()(args)) },
    });

    const codes = stderr().flatMap((line) => /^\[frogbot\] ([A-Z_]+) /.exec(line)?.[1] ?? []);

    expect(code).toBe(1);
    expect(codes).toEqual(['TOOL_MISSING', 'AWS_ROLE_MISSING', 'AWS_ROLE_MISSING']);
  });

  it('lists what it would create on a dry run', async () => {
    const { code, stdout, calls } = await deployWith(awsTarget, 'aws', ['--dry-run'], {
      programs: { aws: aws(), docker: () => undefined },
    });

    expect(code).toBe(0);
    expect(calls.some((call) => call.command === 'docker')).toBe(false);
    expect(
      stdout().filter((line) =>
        line.startsWith('[dry-run] $ aws ecs create-express-gateway-service'),
      ),
    ).toHaveLength(1);
  });
});

const az: FakeProgram = (args) =>
  args[1] === 'show' ? { stdout: 'deals-app.happyhill.eastus.azurecontainerapps.io\n' } : undefined;

describe('deploy azure', () => {
  it('builds in Azure with containerapp up, sets secrets, one always-on replica and the health probe', async () => {
    const { code, commands, stdout } = await deployWith(azureTarget, 'azure', [], {
      programs: { az },
    });

    const steps = commands().filter((command) => command !== 'az account show');

    expect(code).toBe(0);
    expect(steps[0]).toBe('az extension add --name containerapp --upgrade --yes');
    expect(steps[1]).toBe('az group create --name deals-app-rg --location eastus');
    expect(steps[2]).toBe(
      'az containerapp up --name deals-app --resource-group deals-app-rg --location eastus --source . --ingress external --target-port 3000',
    );
    expect(steps[3]).toBe(
      'az containerapp secret set --name deals-app --resource-group deals-app-rg --secrets frogbot-secret=s3cret-value-123 database-url=postgres://u:p@db.example.com/app openai-api-key=sk-test-abcdef',
    );
    expect(steps[4]).toBe(
      'az containerapp update --name deals-app --resource-group deals-app-rg --min-replicas 1 --max-replicas 1 --set-env-vars FROGBOT_SECRET=secretref:frogbot-secret DATABASE_URL=secretref:database-url OPENAI_API_KEY=secretref:openai-api-key',
    );
    expect(steps[5]).toContain('properties.template.containers[0].probes=');
    expect(steps[5]).toContain('/api/health');
    expect(stdout()).toContain(
      "[frogbot] NEXT_PUBLIC_SITE can't reach the build on Azure (`az containerapp up` takes no build args); put them in a committed .env.production instead.",
    );
    expect(stdout().at(-1)).toBe(
      '[frogbot] Deployed deals-app to Azure Container Apps: https://deals-app.happyhill.eastus.azurecontainerapps.io',
    );
  });

  it('masks secret values on a dry run', async () => {
    const { stdout, commands } = await deployWith(
      azureTarget,
      'azure',
      ['--dry-run', '--resource-group', 'acme'],
      {
        programs: { az },
      },
    );

    expect(commands()).toEqual([
      'az account show',
      'az containerapp show --name deals-app --resource-group acme --query properties.configuration.ingress.fqdn --output tsv',
    ]);
    expect(stdout().join('\n')).not.toContain('sk-test-abcdef');
    expect(stdout()).toContain(
      '[dry-run] $ az containerapp secret set --name deals-app --resource-group acme --secrets frogbot-secret=•••• database-url=•••• openai-api-key=••••',
    );
  });

  it('scales to zero with --min-instances 0', async () => {
    const { commands } = await deployWith(azureTarget, 'azure', ['--min-instances', '0'], {
      programs: { az },
    });

    expect(commands().find((command) => command.startsWith('az containerapp update'))).toContain(
      '--min-replicas 0 --max-replicas 1',
    );
  });

  it('names each secret in the pattern Container Apps accepts', async () => {
    const { code, commands } = await deployWith(azureTarget, 'azure', [], {
      programs: { az },
      files: { '.env': 'FROGBOT_SECRET=x\nDATABASE_URL=postgres://u:p@db/app\n_INTERNAL=three\n' },
    });

    expect(code).toBe(0);
    expect(commands()).toContain(
      'az containerapp secret set --name deals-app --resource-group deals-app-rg --secrets frogbot-secret=x database-url=postgres://u:p@db/app internal=three',
    );
  });

  it('refuses two variables that would share one secret name, before changing anything', async () => {
    const { code, commands, stderr } = await deployWith(azureTarget, 'azure', [], {
      programs: { az },
      files: {
        '.env': 'FROGBOT_SECRET=x\nDATABASE_URL=postgres://u:p@db/app\nApi_Key=one\nAPI_KEY=two\n',
      },
    });

    expect(code).toBe(1);
    expect(stderr()[0]).toBe(
      '[frogbot] AZURE_SECRET_NAME_CLASH Api_Key and API_KEY would both be the Container Apps secret api-key.',
    );
    expect(commands()).toEqual(['az account show']);
  });

  it('reports LOCAL_UPLOADS with Azure storage and NOT_LOGGED_IN', async () => {
    const { code, stderr } = await deployWith(azureTarget, 'azure', [], {
      programs: { az: () => ({ code: 1 }) },
      config: deployConfig({ uploads: [{ slug: 'files' }] }),
    });

    expect(code).toBe(1);
    expect(stderr().join('\n')).toContain('NOT_LOGGED_IN');
    expect(stderr().join('\n')).toContain('@frogbotai/storage-azure');
  });
});
