import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildArgs, sourceTag, splitVariables } from '../app.js';
import { cloudIssues, readCloudFlags, stringFlag, warnIdleJobs } from '../cloud.js';
import { checkLogin, findTool } from '../preflight.js';
import type { DeployContext, DeployTarget, PreflightIssue } from '../types.js';

const options = { project: { type: 'string' } } as const;

const flagsOf = (context: DeployContext) =>
  readCloudFlags(context, { target: 'gcp', usage: '[--project <id>]', options });

const repository = 'frogbot';

const apis = [
  'run.googleapis.com',
  'cloudbuild.googleapis.com',
  'artifactregistry.googleapis.com',
  'secretmanager.googleapis.com',
];

async function configValue(context: DeployContext, key: string): Promise<string | undefined> {
  const { code, stdout } = await context.io.exec('gcloud', ['config', 'get-value', key]);
  const value = stdout.trim();

  return code === 0 && value && value !== '(unset)' ? value : undefined;
}

async function readProject(context: DeployContext): Promise<string | undefined> {
  return stringFlag(flagsOf(context).values, 'project') ?? (await configValue(context, 'project'));
}

/** The Secret Manager id for one of the app's variables: `<service>-<name>`, lowercase. */
export function gcpSecretId(service: string, name: string): string {
  return `${service}-${name.toLowerCase().replace(/_/g, '-')}`;
}

async function build(
  context: DeployContext,
  { image, project, args }: { image: string; project: string; args: string[] },
): Promise<void> {
  if (args.length === 0) {
    await context.run('gcloud', [
      'builds',
      'submit',
      '--tag',
      image,
      '--project',
      project,
      '--quiet',
    ]);

    return;
  }

  const dir = await mkdtemp(join(tmpdir(), 'frogbot-cloudbuild-'));
  const config = join(dir, 'cloudbuild.json');

  try {
    await writeFile(
      config,
      JSON.stringify({
        steps: [
          { name: 'gcr.io/cloud-builders/docker', args: ['build', '-t', image, ...args, '.'] },
        ],
        images: [image],
      }),
    );

    await context.run('gcloud', [
      'builds',
      'submit',
      '--config',
      config,
      '--project',
      project,
      '--quiet',
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function storeSecrets(
  context: DeployContext,
  {
    project,
    service,
    secrets,
  }: { project: string; service: string; secrets: Record<string, string> },
): Promise<string[]> {
  const number = await context.io.exec('gcloud', [
    'projects',
    'describe',
    project,
    '--format=value(projectNumber)',
  ]);

  const account = `serviceAccount:${number.stdout.trim() || '<project-number>'}-compute@developer.gserviceaccount.com`;
  const bindings: string[] = [];

  for (const [name, value] of Object.entries(secrets)) {
    const id = gcpSecretId(service, name);
    const scoped = ['--project', project, '--quiet'];
    const exists = await context.io.exec('gcloud', [
      'secrets',
      'describe',
      id,
      '--project',
      project,
    ]);

    if (exists.code !== 0) {
      await context.run('gcloud', [
        'secrets',
        'create',
        id,
        '--replication-policy=automatic',
        ...scoped,
      ]);
    }

    await context.run('gcloud', ['secrets', 'versions', 'add', id, '--data-file=-', ...scoped], {
      input: value,
    });

    await context.run('gcloud', [
      'secrets',
      'add-iam-policy-binding',
      id,
      `--member=${account}`,
      '--role=roles/secretmanager.secretAccessor',
      ...scoped,
    ]);

    bindings.push(`${name}=${id}:latest`);
  }

  return bindings;
}

/** `frogbot deploy gcp`: Cloud Build into Artifact Registry, keys in Secret Manager, one Cloud Run instance. */
export const gcpTarget: DeployTarget = {
  describe: 'Deploy to your Google Cloud Run with your gcloud login (built by Cloud Build)',
  preflight: async (context) => {
    flagsOf(context);

    const issues: PreflightIssue[] = cloudIssues(context, '@frogbotai/storage-gcs');
    const { command, issue } = await findTool(
      context.io,
      ['gcloud'],
      'Install the Google Cloud CLI: https://cloud.google.com/sdk/docs/install',
    );

    if (!command) return issue ? [issue, ...issues] : issues;

    const login = await checkLogin(
      context.io,
      'gcloud',
      ['auth', 'print-access-token'],
      'gcloud auth login',
    );

    if (login) return [login, ...issues];

    if (!(await readProject(context))) {
      issues.unshift({
        code: 'NO_PROJECT',
        message: 'No Google Cloud project.',
        fix: 'Pass --project <id>, or run `gcloud config set project <id>`.',
      });
    }

    return issues;
  },
  run: async (context) => {
    const { region: flagRegion, service, minInstances } = flagsOf(context);
    const project = (await readProject(context)) ?? '';
    const region = flagRegion ?? (await configValue(context, 'run/region')) ?? 'us-central1';
    const scoped = ['--project', project, '--quiet'];

    await context.run('gcloud', ['services', 'enable', ...apis, ...scoped]);

    const repo = await context.io.exec('gcloud', [
      'artifacts',
      'repositories',
      'describe',
      repository,
      `--location=${region}`,
      '--project',
      project,
    ]);

    if (repo.code !== 0) {
      await context.run('gcloud', [
        'artifacts',
        'repositories',
        'create',
        repository,
        '--repository-format=docker',
        `--location=${region}`,
        ...scoped,
      ]);
    }

    const image = `${region}-docker.pkg.dev/${project}/${repository}/${service}:${sourceTag(context.root)}`;
    const variables = splitVariables(context);

    await build(context, { image, project, args: buildArgs(context, variables.build) });

    const bindings = await storeSecrets(context, { project, service, secrets: variables.secrets });

    warnIdleJobs(context, minInstances);

    await context.run('gcloud', [
      'run',
      'deploy',
      service,
      `--image=${image}`,
      `--region=${region}`,
      '--port=3000',
      `--min-instances=${minInstances}`,
      '--max-instances=1',
      '--allow-unauthenticated',
      '--startup-probe=httpGet.path=/api/health,httpGet.port=3000,periodSeconds=5,failureThreshold=60',
      ...(bindings.length > 0 ? [`--set-secrets=${bindings.join(',')}`] : []),
      ...scoped,
    ]);

    const described = await context.io.exec('gcloud', [
      'run',
      'services',
      'describe',
      service,
      `--region=${region}`,
      '--format=value(status.url)',
      '--project',
      project,
    ]);

    const url = described.stdout.trim() || undefined;

    if (!context.flags.dryRun) {
      context.log(`[frogbot] Deployed ${service} to Cloud Run${url ? `: ${url}` : '.'}`);
    }

    return { project, region, service, image, minInstances, url };
  },
};
