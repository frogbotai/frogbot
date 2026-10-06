import { describe, expect, it } from 'vitest';

import {
  ALERT_QUIET_MS,
  backgroundCall,
  badTicketTag,
  capOutput,
  contextTokens,
  createAlerts,
  createResumeCap,
  createWatchdog,
  denial,
  failureAlert,
  LONG_SHELL_TIMEOUT_MS,
  MESSAGES,
  notification,
  OUTPUT_MAX,
  READ_LIMIT,
  readInput,
  searchesArchive,
  SHELL_TIMEOUT_MS,
  shellTimeout,
  simpleCommands,
  STALL_MS,
  stashes,
  worktreeCount,
} from '../../../.opencode/plugins/frogbot/supervision.js';

const MINUTE = 60_000;

describe('simpleCommands', () => {
  it('splits lists, pipes and loops into commands without keywords', () => {
    expect(simpleCommands('while kill -0 1; do sleep 5; done')).toEqual([
      ['kill', '-0', '1'],
      ['sleep', '5'],
      ['done'],
    ]);
    expect(simpleCommands('pnpm build && FOO=1 pnpm test 2>&1 | tail -40')).toEqual([
      ['pnpm', 'build'],
      ['pnpm', 'test'],
      ['tail', '-40'],
    ]);
  });

  it('keeps quoted text in one word', () => {
    expect(simpleCommands(`git commit -m "fix: x; sleep 5" -m 'b && c'`)).toEqual([
      ['git', 'commit', '-m', 'fix: x; sleep 5', '-m', 'b && c'],
    ]);
  });

  it('drops redirect targets and heredoc bodies', () => {
    expect(simpleCommands('pnpm test >out.log 2> err.log')).toEqual([['pnpm', 'test']]);
    expect(simpleCommands("cat <<'EOF' > notes.md\nsleep 5\nEOF\necho done")).toEqual([
      ['cat'],
      ['echo', 'done'],
    ]);
  });

  it('finds commands inside substitutions', () => {
    expect(simpleCommands('echo $(sleep 1) `kill -0 2`')).toEqual([
      ['echo'],
      ['sleep', '1'],
      ['kill', '-0', '2'],
    ]);
  });
});

describe('denial', () => {
  it.each([
    ['git push', 'push'],
    ['git push origin main', 'push'],
    ['git -C ../frogbot push', 'push'],
    ['git commit --no-verify -m "fix: x"', 'noVerify'],
    ['git commit -nm "fix: x"', 'noVerify'],
    ['git commit -anm "fix: x"', 'noVerify'],
    ['git -C ../frogbot-ticket1 commit -n -m "fix: x"', 'noVerify'],
    ['git merge feat/x', 'merge'],
    ['git merge', 'merge'],
    ['git -C ../frogbot merge --ff-only feat/x', 'merge'],
    ['git -c core.editor=true merge feat/x', 'merge'],
    ['sleep 30', 'poll'],
    ['/bin/sleep 1', 'poll'],
    ['while kill -0 1; do sleep 5; done', 'poll'],
    ['pnpm test', 'suite'],
    ['pnpm test 2>&1 | tail -40', 'suite'],
    ['pnpm test --reporter=dot', 'suite'],
    ['pnpm vitest run', 'suite'],
    ['pnpm exec vitest run', 'suite'],
    ['npx vitest run', 'suite'],
    ['vitest run', 'suite'],
    ['pnpm exec playwright test', 'suite'],
    ['playwright test --config test/browser/playwright.config.ts', 'suite'],
    ['pnpm test:browser', 'suite'],
    ['cd ../frogbot && pnpm test', 'suite'],
  ])('refuses %s', (command, kind) => {
    expect(denial(command)).toBe(kind);
  });

  it.each([
    'git commit -m "fix: x"',
    'git commit -m "fix: drop -n and merge, push later"',
    'git commit -mn',
    'git commit --amend --no-edit',
    'git -C ../frogbot-ticket219 status --short',
    'git log --oneline -n 5',
    'git merge-base --is-ancestor HEAD main',
    'git stash push -m wip',
    'pnpm check',
    'pnpm check --full',
    'pnpm ticket land 219 -m "chore: x"',
    'pnpm ticket new 219',
    'pnpm test:unit test/unit/scripts',
    'pnpm test:unit',
    'pnpm test:ui',
    'pnpm test:int:sqlite test/chat/persistence.int.spec.ts',
    'pnpm test:browser --project chromium',
    'pnpm test:browser --project=chromium --last-failed',
    'pnpm test test/unit/opencode',
    'vitest run test/unit/opencode/supervision.spec.ts',
    'playwright test test/browser/specs/login.spec.ts',
    'echo "sleep 5"',
    'rg "git push" docs',
  ])('allows %s', (command) => {
    expect(denial(command)).toBeUndefined();
  });

  it('names the alternative for every refusal', () => {
    expect(MESSAGES.push).toContain('ask the owner');
    expect(MESSAGES.noVerify).toContain('fix the hook failure, then commit');
    expect(MESSAGES.merge).toContain('`pnpm ticket land <n>`');
    expect(MESSAGES.poll).toContain(
      'run in the foreground with a timeout, or use a background shell and wait for its notification',
    );
    expect(MESSAGES.suite).toContain(
      'run the affected files or `--project`; the full suite runs in `pnpm ticket land`',
    );
    expect(MESSAGES.archive).toContain('such as `.idea/found.md`');
    expect(MESSAGES.stash).toContain('`git show HEAD:<file>`');
    expect(MESSAGES.stash).toContain('temp copy');
    expect(MESSAGES.background).toContain('run the call in the foreground');
  });
});

describe('git stash with other worktrees', () => {
  it.each([
    'git stash',
    'git stash push -m wip',
    'git stash -u',
    'git stash pop',
    'git stash apply stash@{0}',
    'git stash drop',
    'git -C ../frogbot stash',
    'pnpm build && git stash && git stash pop',
  ])('refuses %s', (command) => {
    expect(denial(command, { worktrees: 2 })).toBe('stash');
  });

  it.each(['git stash list', 'git stash show -p stash@{0}', 'git show HEAD:package.json'])(
    'allows the read-only %s',
    (command) => {
      expect(denial(command, { worktrees: 2 })).toBeUndefined();
    },
  );

  it('allows git stash with only the main checkout', () => {
    expect(denial('git stash push -m wip', { worktrees: 1 })).toBeUndefined();
  });

  it('asks for the worktree count only for a stash command', () => {
    expect(stashes('git -C ../frogbot stash pop')).toBe(true);
    expect(stashes('git status && echo "git stash"')).toBe(false);
  });

  it('counts worktrees from git worktree list --porcelain', () => {
    const porcelain = [
      'worktree /code/frogbot',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      'worktree /code/frogbot-ticket254',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/feat/ticket-254-process-followups-2',
      '',
    ].join('\n');

    expect(worktreeCount(porcelain)).toBe(2);
    expect(worktreeCount('worktree /code/frogbot\nHEAD 1\nbranch refs/heads/main\n')).toBe(1);
  });
});

describe('backgroundCall', () => {
  it.each([
    ['subagent', { prompt: 'x', background: true }],
    ['shell', { command: 'pnpm build', background: true }],
  ])('flags %s with background: true', (tool, input) => {
    expect(backgroundCall(tool, input)).toBe(true);
  });

  it.each([
    ['subagent', { prompt: 'x' }],
    ['subagent', { prompt: 'x', background: false }],
    ['shell', { command: 'pnpm build' }],
    ['read', { path: 'x', background: true }],
  ])('leaves %s %j alone', (tool, input) => {
    expect(backgroundCall(tool, input)).toBe(false);
  });
});

describe('searchesArchive', () => {
  it.each([
    ['grep', { pattern: 'DR-0', path: '.idea/archive' }],
    ['grep', { pattern: 'DR-0', path: '.idea/archive/tickets' }],
    ['grep', { pattern: 'DR-0', path: '.idea' }],
    ['grep', { pattern: 'DR-0', include: '.idea/archive/**/*.md' }],
    ['glob', { pattern: '.idea/archive/**' }],
    ['glob', { pattern: '.idea/**/*.md' }],
    ['glob', { pattern: '**/*.md', path: '.idea' }],
    ['shell', { command: 'cat .idea/archive/decisions.md' }],
    ['shell', { command: 'rg DR-0 /Users/me/code/frogbot/.idea' }],
    ['shell', { command: 'ls .idea/*/' }],
    ['shell', { command: 'grep -rn DR-0 .idea' }],
    ['shell', { command: 'grep -R --include=*.md DR-0 /Users/me/code/frogbot/.idea/' }],
    ['shell', { command: 'cd .idea && rg DR-0' }],
    ['shell', { command: 'cd /Users/me/code/frogbot/.idea && grep -r DR-0 .' }],
    ['shell', { command: 'cd .idea/archive && cat decisions.md' }],
    ['shell', { command: 'rg DR-0', workdir: '/Users/me/code/frogbot/.idea' }],
    ['shell', { command: 'cat decisions.md', workdir: '/Users/me/code/frogbot/.idea/archive' }],
    ['shell', { command: "find .idea -name '*.md'" }],
    ['shell', { command: 'ls -R .idea' }],
  ])('blocks %s %j', (tool, input) => {
    expect(searchesArchive(tool, input)).toBe(true);
  });

  it.each([
    ['grep', { pattern: '.idea/archive', path: 'scripts' }],
    ['grep', { pattern: 'Status:', path: '.idea/tickets' }],
    ['glob', { pattern: '.idea/tickets/ticket219*/*.md' }],
    ['shell', { command: 'cat /Users/me/code/frogbot/.idea/tickets/ticket219/step2_spec.md' }],
    ['shell', { command: 'cat .idea/decisions.md' }],
    ['read', { path: '.idea/archive/decisions.md' }],
    [
      'shell',
      { command: 'cd /Users/me/code/frogbot/.idea && grep -n F-019 found.md issue_triage.md' },
    ],
    ['shell', { command: 'grep -n F-0 .idea/found.md .idea/issue_triage.md | tail -5' }],
    ['shell', { command: 'grep -n F-0 found.md', workdir: '/Users/me/code/frogbot/.idea' }],
    ['shell', { command: 'rg -n "Status:" .idea/tickets' }],
    ['shell', { command: 'grep -rn ".idea/archive" scripts' }],
    ['shell', { command: 'ls .idea' }],
    ['shell', { command: 'ls -la /Users/me/code/frogbot/.idea/' }],
    ['shell', { command: 'cd .idea && grep -rn DR-0 tickets' }],
    ['shell', { command: 'cd .idea && cd .. && rg DR-0' }],
  ])('allows %s %j', (tool, input) => {
    expect(searchesArchive(tool, input)).toBe(false);
  });
});

describe('badTicketTag', () => {
  it.each(['211A stage 4: autonumber', '250 lint: pnpm check', '212b: bulk', '250'])(
    'accepts the key in %j',
    (description) => {
      expect(badTicketTag({ description })).toBe(false);
    },
  );

  it.each(['Review 214 research', 'Audit batch 27', 'fix the docs'])(
    'lets the untagged %j run',
    (description) => {
      expect(badTicketTag({ description })).toBe(false);
    },
  );

  it.each(['211-A stage 4', '211AB stage', '2l1 stage', '211.4 notes', '211A-stage'])(
    'refuses the unreadable tag in %j',
    (description) => {
      expect(badTicketTag({ description })).toBe(true);
    },
  );

  it('names the form it wants', () => {
    expect(MESSAGES.tag).toContain('`211A stage 4: …`');
  });
});

describe('failureAlert', () => {
  const auth = {
    type: 'provider.auth',
    message: 'AWS default credential chain failed: Token is expired\nstack',
  };

  it('alerts on a provider sign-in error in any session', () => {
    expect(failureAlert({ title: '211A stage 4', root: false, error: auth })).toEqual({
      title: 'FrogBot: provider sign-in failed',
      message:
        '"211A stage 4" stopped: AWS default credential chain failed: Token is expired. Sign in again (for Bedrock, aws sso login), then tell it to continue.',
    });
  });

  it('alerts on any failed top-level turn', () => {
    expect(
      failureAlert({
        title: 'Batch 30',
        root: true,
        error: { type: 'provider.overloaded', message: 'busy' },
      }),
    ).toEqual({
      title: 'FrogBot: turn failed',
      message: '"Batch 30" stopped (provider.overloaded): busy',
    });
  });

  it("leaves a subagent's other failures to its parent", () => {
    expect(
      failureAlert({ title: '250 lint', root: false, error: { type: 'tool', message: 'x' } }),
    ).toBeUndefined();
  });

  it('sends one alert of a kind per quiet period', () => {
    const alerts = createAlerts();
    const alert = failureAlert({ title: 'a', root: false, error: auth })!;

    expect(alerts(alert, 0)).toBe(true);
    expect(alerts({ ...alert, message: 'another session' }, 1_000)).toBe(false);
    expect(alerts(alert, ALERT_QUIET_MS)).toBe(true);
  });

  it('passes the text to osascript as arguments, not as script source', () => {
    const [command, args] = notification({ title: 'T "x"', message: 'say "hi"; do shell script' });

    expect(command).toBe('osascript');
    expect(args.slice(-2)).toEqual(['T "x"', 'say "hi"; do shell script']);
    expect(args.slice(0, -2).join(' ')).not.toContain('hi');
  });
});

describe('shellTimeout', () => {
  it.each([
    ['caps a 20 min foreground command at 10 min', 'pnpm test:ui', 20 * MINUTE, false, 10 * MINUTE],
    ['keeps a 1 min timeout', 'pnpm check', MINUTE, false, MINUTE],
    ['gives pnpm ticket land 30 min', 'pnpm ticket land 219', 2 * MINUTE, false, 30 * MINUTE],
    ['gives an unset timeout 30 min', 'pnpm dev', 0, true, 30 * MINUTE],
    ['caps a background command at 30 min', 'pnpm dev', 60 * MINUTE, true, 30 * MINUTE],
  ])('%s', (_name, command, timeout, background, expected) => {
    expect(shellTimeout({ command, timeout, background })).toBe(expected);
  });

  it('uses the documented limits', () => {
    expect(SHELL_TIMEOUT_MS).toBe(10 * MINUTE);
    expect(LONG_SHELL_TIMEOUT_MS).toBe(30 * MINUTE);
  });
});

describe('readInput', () => {
  it('gives a read with no limit 400 lines', () => {
    expect(readInput({ path: 'a.ts' })).toEqual({ path: 'a.ts', limit: READ_LIMIT });
    expect(READ_LIMIT).toBe(400);
  });

  it('keeps an explicit limit', () => {
    expect(readInput({ path: 'a.ts', offset: 10, limit: 50 })).toEqual({
      path: 'a.ts',
      offset: 10,
      limit: 50,
    });
  });
});

describe('capOutput', () => {
  it('keeps output up to 8,000 characters', () => {
    const text = 'x'.repeat(7_999);

    expect(capOutput(text, '/tmp/s.out')).toBe(text);
    expect(OUTPUT_MAX).toBe(8_000);
  });

  it('keeps the first 2,000 and last 6,000 characters around one marker line', () => {
    const text = 'h'.repeat(2_000) + 'm'.repeat(12_000) + 't'.repeat(6_000);
    const capped = capOutput(text, '/data/shell/p/sh_1.out');
    const [head, marker, tail] = capped.split('\n');

    expect(head).toBe('h'.repeat(2_000));
    expect(marker).toBe('[12,000 characters removed; full output: /data/shell/p/sh_1.out]');
    expect(tail).toBe('t'.repeat(6_000));
    expect(capped.length - marker.length - 2).toBe(8_000);
  });
});

describe('contextTokens', () => {
  it('reads the last step input and cache tokens', () => {
    expect(
      contextTokens([
        { type: 'assistant', tokens: { input: 10, cache: { read: 20, write: 30 } } },
        { type: 'user' },
        { type: 'assistant', tokens: { input: 2_000, cache: { read: 170_000, write: 10_000 } } },
        { type: 'idle' },
      ]),
    ).toBe(182_000);
    expect(contextTokens([{ type: 'user' }])).toBe(0);
  });
});

describe('createResumeCap', () => {
  const child = () => Promise.resolve({ title: 'Implement stage 3', tokens: 182_400, cost: 4.1 });

  const memory = () => {
    const values = new Map<string, unknown>();

    return {
      values,
      get: (key: string) => Promise.resolve(values.get(key)),
      set: (key: string, value: number) => {
        values.set(key, value);

        return Promise.resolve();
      },
    };
  };

  const resume = async (cap: ReturnType<typeof createResumeCap>, call: string) => {
    cap.record(call, { agent: 'general', prompt: 'go', sessionID: 'ses_child' });

    return cap.evaluate(call);
  };

  it('leaves a new subagent unchanged', async () => {
    const cap = createResumeCap(memory(), child);

    cap.record('call_1', { agent: 'general', prompt: 'go' });
    cap.record('call_2', { agent: 'general', prompt: 'go', sessionID: '' });

    expect(await cap.evaluate('call_1')).toBeUndefined();
    expect(await cap.evaluate('call_2')).toBeUndefined();
  });

  it('allows the first resume and asks from the second, with tokens and cost', async () => {
    const store = memory();
    const cap = createResumeCap(store, child);

    expect(await resume(cap, 'call_1')).toBeUndefined();
    await cap.settle('call_1', { status: 'completed' });

    expect(await resume(cap, 'call_2')).toEqual({
      effect: 'ask',
      message: 'Resume #2 of "Implement stage 3": 182k tokens in context, $4.10 so far.',
    });
    expect(store.values.get('resumes/ses_child')).toBe(1);
  });

  it('does not count a resume the owner rejects', async () => {
    const store = memory();
    const cap = createResumeCap(store, child);

    await resume(cap, 'call_1');
    await cap.settle('call_1', { status: 'completed' });

    await resume(cap, 'call_2');
    await cap.settle('call_2', { status: 'error', error: { message: 'Subagent denied: general' } });
    await resume(cap, 'call_3');

    expect((await resume(cap, 'call_4'))?.message).toMatch(/^Resume #2 /);
    expect(store.values.get('resumes/ses_child')).toBe(1);
  });

  it('counts a resume that ran and failed, and keeps counts across a restart', async () => {
    const store = memory();
    const first = createResumeCap(store, child);

    await resume(first, 'call_1');
    await first.settle('call_1', { status: 'completed' });
    await resume(first, 'call_2');
    await first.settle('call_2', {
      status: 'error',
      error: { message: 'Subagent failed (sessionID: ses_child): boom' },
    });

    const restarted = createResumeCap(store, child);

    expect((await resume(restarted, 'call_3'))?.message).toMatch(/^Resume #3 /);
  });
});

describe('createWatchdog', () => {
  const start = new Date(2026, 9, 4, 14, 5).getTime();

  const watching = () => {
    const watchdog = createWatchdog();

    watchdog.track('ses_child', 'ses_parent', 'Implement stage 3');
    watchdog.start('ses_child', start);
    watchdog.activity('ses_child', 'shell call', start);

    return watchdog;
  };

  it('sends one notice after 20 minutes without progress', () => {
    const watchdog = watching();

    expect(watchdog.due(start + STALL_MS - 1_000)).toEqual([]);
    expect(watchdog.due(start + STALL_MS)).toEqual([
      {
        parentID: 'ses_parent',
        text: 'Subagent "Implement stage 3" (ses_child) has made no progress for 20 min; last activity: shell call at 14:05.',
      },
    ]);
    expect(watchdog.due(start + 25 * MINUTE)).toEqual([]);
  });

  it('re-arms after fresh progress', () => {
    const watchdog = watching();

    watchdog.due(start + STALL_MS);
    watchdog.activity('ses_child', 'message', start + 26 * MINUTE);

    expect(watchdog.due(start + 26 * MINUTE + STALL_MS - 1_000)).toEqual([]);
    expect(watchdog.due(start + 26 * MINUTE + STALL_MS)).toHaveLength(1);
  });

  it('ignores stopped and untracked sessions', () => {
    const watchdog = watching();

    watchdog.stop('ses_child');
    watchdog.activity('ses_root', 'message', start);

    expect(watchdog.due(start + 60 * MINUTE)).toEqual([]);
    expect(watchdog.has('ses_root')).toBe(false);
  });
});
