import type { Noun } from '../command.js';
import { dojoJSON, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';
import { findApp } from './resolve.js';

type RepoLink = {
  provider: string;
  instanceURL: string;
  repoID: string;
  repoName: string;
  branch: string;
  folder: string;
  status: 'active' | 'needs-reconnect';
};

const adminNeeded = 'Admin access to the app';

function describe(slug: string, repo: RepoLink | null): string[] {
  if (!repo) return [`[frogbot] ${slug} isn't connected to a repo.`];

  return [
    `${repo.provider}  ${repo.repoName}  ${repo.branch}${repo.folder ? `  ${repo.folder}` : ''}`,
    repo.status === 'needs-reconnect'
      ? `[frogbot] Dojo lost access to ${repo.repoName}, so pushes deploy nothing until an Admin connects it again.`
      : `[frogbot] Each push to ${repo.branch} deploys ${slug}.`,
  ];
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined);

/** `git status | connect | disconnect`: the repo whose pushes deploy an app. */
export const git: Noun = {
  summary: 'Connect, check or disconnect the repo whose pushes deploy an app.',
  verbs: {
    status: {
      summary: "Show the app's repo, branch and folder, and whether pushes deploy.",
      args: '[app]',
      run: async ({ io, dojo, positionals: [ref = ''] }) => {
        const app = await findApp(dojo(), ref);
        const { repo } = await dojoJSON<{ repo: RepoLink | null }>(
          dojo(),
          `/api/apps/${segment(app.id)}/repo`,
          {
            what: `Couldn't read the repo of ${app.slug}`,
            needs: 'editor or owner access to the app',
          },
        );

        done(io, { app: app.slug, repo }, describe(app.slug, repo));
      },
    },
    connect: {
      summary:
        'Connect a repo. GitHub gives a link for a person to open; other providers read an access token from stdin.',
      args: '[app]',
      flags: {
        provider: {
          type: 'string',
          value: 'name',
          help: 'github (the default) or gitlab.',
        },
        repo: {
          type: 'string',
          value: 'id',
          help: "The repo's id on the provider. Not for GitHub.",
        },
        branch: {
          type: 'string',
          help: "The branch whose pushes deploy. Defaults to the repo's default branch.",
        },
        folder: {
          type: 'string',
          value: 'path',
          help: "The app's folder in the repo. Defaults to the root.",
        },
        instance: {
          type: 'string',
          value: 'url',
          help: 'A self-hosted GitLab address. Defaults to gitlab.com.',
        },
      },
      run: async ({ io, dojo, positionals: [ref = ''], values }) => {
        const provider = (text(values.provider) || 'github').toLowerCase();
        const repoID = text(values.repo);
        const choices = { branch: text(values.branch), folder: text(values.folder) };

        if (provider === 'github') {
          if (repoID || choices.branch || choices.folder || values.instance !== undefined) {
            throw new ShareError(
              'GitHub connects in the browser, where the person picks the repo, branch and folder; drop --repo, --branch, --folder and --instance.',
              2,
            );
          }

          const app = await findApp(dojo(), ref);
          const { url } = await dojoJSON<{ url: string }>(
            dojo(),
            `/api/apps/${segment(app.id)}/repo/github/link`,
            { what: `Couldn't connect ${app.slug} to GitHub`, needs: adminNeeded },
          );

          if (io.isTTY) io.openBrowser(url);

          done(io, { app: app.slug, provider, url }, [
            `[frogbot] Dojo connects GitHub only for a person signed in to GitHub. Open this link, sign in and pick the repo:`,
            url,
          ]);

          return;
        }

        if (!repoID) throw new ShareError(`--repo names the repo's id on ${provider}.`, 2);
        if (!io.readSecret) {
          throw new ShareError(`There's no stdin to read the ${provider} token from.`, 2);
        }

        const app = await findApp(dojo(), ref);
        const credential = (
          await io.readSecret(`${provider} access token for ${app.slug} (it isn't shown):`)
        ).trim();

        if (!credential) {
          throw new ShareError(
            `Pipe a ${provider} access token on stdin, or type it at the prompt; nothing was connected.`,
            2,
          );
        }

        const { repo } = await dojoJSON<{ repo: RepoLink }>(
          dojo(),
          `/api/apps/${segment(app.id)}/repo`,
          {
            method: 'PUT',
            body: {
              provider,
              repoID,
              credential,
              ...(choices.branch && { branch: choices.branch }),
              ...(choices.folder && { folder: choices.folder }),
              ...(values.instance !== undefined && { instanceURL: text(values.instance) }),
            },
            what: `Dojo couldn't connect ${app.slug} to ${provider}`,
            needs: adminNeeded,
          },
        );

        done(io, { app: app.slug, repo }, [
          `[frogbot] Connected ${app.slug}.`,
          ...describe(app.slug, repo),
        ]);
      },
    },
    disconnect: {
      summary: "Disconnect the app's repo. Pushes stop deploying; deployments already made stay.",
      args: '[app]',
      confirm: ({ positionals: [ref] }) =>
        `Disconnect ${ref}'s repo? Pushes stop deploying it; deployments already made stay.`,
      run: async ({ io, dojo, positionals: [ref = ''] }) => {
        const app = await findApp(dojo(), ref);

        await dojoJSON<{ repo: null }>(dojo(), `/api/apps/${segment(app.id)}/repo`, {
          method: 'DELETE',
          what: `Dojo couldn't disconnect the repo of ${app.slug}`,
          needs: adminNeeded,
        });

        done(io, { app: app.slug, repo: null }, [`[frogbot] Disconnected ${app.slug}'s repo.`]);
      },
    },
  },
};
