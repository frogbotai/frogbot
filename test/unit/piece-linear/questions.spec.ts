import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import type {
  ChannelQuestionCall,
  QuestionInput,
  QuestionInteraction,
  QuestionRecord,
  TurnActor,
} from '../../../packages/frogbot/src/exports/pieces.js';
import { SELECT_OPTIONS } from '../../../packages/pieces/piece-linear/src/questions/elicitation.js';
import { linearQuestions } from '../../../packages/pieces/piece-linear/src/questions/index.js';

const threadId = 'linear:issue-1:s:session-1';

const color: QuestionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color should the button be?',
      options: [
        { label: 'Red', description: 'Warm and loud' },
        { label: 'Blue' },
        { label: 'Green' },
      ],
      custom: true,
    },
  ],
};

function call(input: QuestionInput = color, toolCallId = 'call-1'): ChannelQuestionCall {
  return {
    toolCallId,
    toolName: 'question',
    input,
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

function single(overrides: Partial<QuestionInput['questions'][number]> = {}): QuestionInput {
  return { questions: [{ ...color.questions[0]!, ...overrides }] };
}

const postedAt = '2026-09-25T12:00:00.000Z';
const question: QuestionRecord = { messages: [{ id: 'activity-1', postedAt }], revision: 0 };

function reply(
  text: string,
  signal?: string,
  dateSent = new Date('2026-09-25T12:00:05.000Z'),
): QuestionInteraction {
  return {
    type: 'message',
    message: {
      text,
      raw: { kind: 'agent_session_comment', ...(signal ? { agentActivitySignal: signal } : {}) },
      author: { userId: 'user-2', userName: 'toad', fullName: 'Toad' },
      metadata: { dateSent, edited: false },
    },
  } as never;
}

function parse({
  input = color,
  settled = false,
  interaction,
}: {
  input?: QuestionInput;
  settled?: boolean;
  interaction: QuestionInteraction;
}) {
  return linearQuestions.parse({ call: call(input), interaction, question, settled });
}

function answer(input: QuestionInput, text: string) {
  return parse({ input, interaction: reply(text) });
}

const client = { createAgentActivity: vi.fn() };
const thread = { id: threadId } as never;
const req = {} as never;

function activities() {
  return client.createAgentActivity.mock.calls.map(([input]) => input);
}

function hookArgs(input: QuestionInput = color) {
  return {
    call: call(input),
    client: client as never,
    question,
    req,
    thread,
    interaction: reply('Purple'),
  };
}

beforeEach(() => {
  client.createAgentActivity
    .mockReset()
    .mockResolvedValue({ success: true, agentActivityId: 'activity-1' });
});

describe('Linear question availability', () => {
  it.each(['linear:issue:s:session', 'linear:issue:c:comment:s:session'])(
    'offers questions in the agent session thread %s',
    (id) => {
      expect(linearQuestions.supports!({ thread: { id } as never })).toBe(true);
    },
  );

  it.each(['linear:issue', 'linear:issue:c:comment', 'linear:issue:s:', 'slack:C1:1.0'])(
    'withholds questions outside agent sessions (%s)',
    (id) => {
      expect(linearQuestions.supports!({ thread: { id } as never })).toBe(false);
    },
  );

  it('defines no updated hook because a reply never produces a partial answer', () => {
    expect(linearQuestions.updated).toBeUndefined();
  });
});

describe('Linear question rendering', () => {
  it('posts one single-choice question as a native select elicitation', async () => {
    const rendered = await linearQuestions.render({
      calls: [call()],
      client: client as never,
      req,
      thread,
    });

    expect(rendered).toEqual([
      { calls: ['call-1'], messages: [{ id: 'activity-1', postedAt: '' }] },
    ]);
    expect(activities()).toEqual([
      {
        agentSessionId: 'session-1',
        content: {
          type: 'elicitation',
          body: [
            '**Color**\nWhich color should the button be?',
            '- **Red** — Warm and loud\n- **Blue**\n- **Green**',
            'Choose an option, or reply with your own answer.',
          ].join('\n\n'),
        },
        signal: 'select',
        signalMetadata: {
          options: [
            { label: 'Red', value: 'Red' },
            { label: 'Blue', value: 'Blue' },
            { label: 'Green', value: 'Green' },
          ],
        },
      },
    ]);
  });

  it('states when a typed answer is not accepted', async () => {
    await linearQuestions.render({
      calls: [call(single({ custom: false }))],
      client: client as never,
      req,
      thread,
    });

    expect(activities()[0].content.body).toMatch(/Choose one of the options\.$/);
  });

  it('renders only the first of several pending calls', async () => {
    const rendered = await linearQuestions.render({
      calls: [call(color, 'call-1'), call(single({ header: 'Size' }), 'call-2')],
      client: client as never,
      req,
      thread,
    });

    expect(rendered).toEqual([
      { calls: ['call-1'], messages: [{ id: 'activity-1', postedAt: '' }] },
    ]);
    expect(activities()).toHaveLength(1);
    expect(rendered[0]).not.toHaveProperty('state');
  });

  it('lists several questions as numbered options without a select signal', async () => {
    const input: QuestionInput = {
      questions: [
        {
          header: 'Colors',
          question: 'Which colors?',
          options: [{ label: 'Red' }, { label: 'Blue', description: 'Calm' }],
          multiple: true,
          custom: false,
        },
        {
          header: 'Size',
          question: 'Which size?',
          options: [{ label: 'Small' }, { label: 'Large' }],
          custom: true,
        },
      ],
    };

    await linearQuestions.render({ calls: [call(input)], client: client as never, req, thread });

    const [activity] = activities();

    expect(activity).not.toHaveProperty('signal');
    expect(activity.content).toEqual({
      type: 'elicitation',
      body: [
        '**Colors**\nWhich colors?\n\n1. Red\n2. Blue — Calm\n\n_Choose one or more: reply with option numbers or labels, separated by commas (`1, 3`)._',
        '**Size**\nWhich size?\n\n1. Small\n2. Large\n\n_Choose one: reply with an option number or label, or type your own answer._',
        'Reply with one line per question, in the order shown.',
      ].join('\n\n'),
    });
  });

  it('lists a single multi-select question without a select signal', async () => {
    await linearQuestions.render({
      calls: [call(single({ multiple: true }))],
      client: client as never,
      req,
      thread,
    });

    expect(activities()[0]).not.toHaveProperty('signal');
    expect(activities()[0].content.body).toContain('1. Red — Warm and loud\n2. Blue\n3. Green');
    expect(activities()[0].content.body).not.toContain('one line per question');
  });

  it(`keeps a native select up to ${SELECT_OPTIONS} options and lists every option beyond it`, async () => {
    const options = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ label: `Option ${index + 1}` }));

    await linearQuestions.render({
      calls: [call(single({ options: options(SELECT_OPTIONS) }))],
      client: client as never,
      req,
      thread,
    });
    await linearQuestions.render({
      calls: [call(single({ options: options(SELECT_OPTIONS + 35) }))],
      client: client as never,
      req,
      thread,
    });

    const [capped, listed] = activities();

    expect(capped.signalMetadata.options).toHaveLength(SELECT_OPTIONS);
    expect(listed).not.toHaveProperty('signal');
    expect(listed.content.body).toContain(
      options(SELECT_OPTIONS + 35)
        .map(({ label }, index) => `${index + 1}. ${label}`)
        .join('\n'),
    );
    expect(answer(single({ options: options(SELECT_OPTIONS + 35) }), '60')).toMatchObject({
      output: { answers: [{ selected: ['Option 60'] }] },
    });
  });

  it('keeps labels exact in the select and escapes them only in the Markdown body', async () => {
    const labels = ['2', 'snake_case', '*bold*', 'a|b', '[link](x)'];

    await linearQuestions.render({
      calls: [
        call(
          single({
            header: 'Pick_one',
            options: labels.map((label) => ({ label, description: 'Why' })),
          }),
        ),
      ],
      client: client as never,
      req,
      thread,
    });

    const [activity] = activities();

    expect(activity.signalMetadata.options).toEqual(
      labels.map((label) => ({ label, value: label })),
    );
    expect(activity.content.body).toContain('**Pick\\_one**');
    expect(activity.content.body).toContain('- **2** — Why');
    expect(activity.content.body).toContain('- **snake\\_case** — Why');
    expect(activity.content.body).toContain('- **\\*bold\\*** — Why');
    expect(activity.content.body).toContain('- **\\[link\\](x)** — Why');
  });

  it('escapes labels that look like list markers so the numbered list renders them verbatim', async () => {
    await linearQuestions.render({
      calls: [
        call(
          single({
            options: ['- none', '+ one', '1. first', '> quoted'].map((label) => ({ label })),
            multiple: true,
          }),
        ),
      ],
      client: client as never,
      req,
      thread,
    });

    expect(activities()[0].content.body).toContain(
      '1. \\- none\n2. \\+ one\n3. 1\\. first\n4. \\> quoted',
    );
  });

  it.each([{ result: { success: true, agentActivityId: undefined } }])(
    'fails the render when Linear does not create the activity ($result)',
    async ({ result }) => {
      client.createAgentActivity.mockResolvedValue(result);

      await expect(
        linearQuestions.render({ calls: [call()], client: client as never, req, thread }),
      ).rejects.toThrow("Linear did not create the agent activity in session 'session-1'.");
    },
  );

  it('fails the render outside an agent session thread', async () => {
    await expect(
      linearQuestions.render({
        calls: [call()],
        client: client as never,
        req,
        thread: { id: 'linear:issue-1' } as never,
      }),
    ).rejects.toThrow("Linear thread 'linear:issue-1' is not an agent session.");
    expect(client.createAgentActivity).not.toHaveBeenCalled();
  });
});

describe('Linear reply parsing', () => {
  it.each([
    ['Red', ['Red']],
    ['  blue  ', ['Blue']],
    ['GREEN', ['Green']],
  ])('maps the single-choice reply %j to the exact label', (text, selected) => {
    expect(answer(color, text)).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Color', selected }] },
    });
  });

  it('maps every listed option number back to its exact label', () => {
    const labels = Array.from({ length: SELECT_OPTIONS + 5 }, (_, index) => `Option ${index + 1}`);
    const input = single({ options: labels.map((label) => ({ label })), custom: false });

    labels.forEach((label, index) => {
      expect(answer(input, String(index + 1))).toEqual({
        kind: 'answer',
        output: { answers: [{ header: 'Color', selected: [label] }] },
      });
      expect(answer(input, `${index + 1}.`)).toMatchObject({
        output: { answers: [{ selected: [label] }] },
      });
    });
  });

  it('reads numbers only where options are numbered, not beside native buttons', async () => {
    const input = single({ options: [{ label: '10' }, { label: '20' }, { label: '30' }] });

    await linearQuestions.render({ calls: [call(input)], client: client as never, req, thread });

    expect(activities()[0].signal).toBe('select');
    expect(activities()[0].content.body).not.toMatch(/^\d+\. /m);
    expect(answer(input, '2')).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Color', selected: [], custom: '2' }] },
    });
    expect(answer(input, '20')).toMatchObject({ output: { answers: [{ selected: ['20'] }] } });
  });

  it('prefers an option labelled like a number over the option at that position', () => {
    const input = single({
      options: [{ label: '3' }, { label: '1' }, { label: 'Other' }],
      multiple: true,
    });

    expect(answer(input, '1')).toMatchObject({
      output: { answers: [{ selected: ['1'] }] },
    });
    expect(answer(input, '3')).toMatchObject({
      output: { answers: [{ selected: ['3'] }] },
    });
    expect(answer(input, '2')).toMatchObject({
      output: { answers: [{ selected: ['1'] }] },
    });
  });

  it('prefers an exact label when two labels differ only in case', () => {
    const input = single({ options: [{ label: 'Red' }, { label: 'red' }] });

    expect(answer(input, 'red')).toMatchObject({ output: { answers: [{ selected: ['red'] }] } });
    expect(answer(input, 'RED')).toMatchObject({
      output: { answers: [{ selected: [], custom: 'RED' }] },
    });
  });

  it.each(['\\\\fileserver\\builds', 'a\\_b', 'C:\\*.log', 'x\\\\y'])(
    'maps the clicked value %j back to its label even when it contains backslashes',
    (label) => {
      const input = single({ options: [{ label }, { label: 'Other' }], custom: false });

      expect(answer(input, label)).toEqual({
        kind: 'answer',
        output: { answers: [{ header: 'Color', selected: [label] }] },
      });
    },
  );

  it('maps every label in a broad punctuation set back to itself', () => {
    const labels = [
      '!important',
      '#1 priority',
      '`code`',
      '<none>',
      'a|b',
      '~strike~',
      '50% off',
      'R&D',
      '(parens)',
      'yes.',
      '*',
      '_',
      '[x]',
      'ÄÖÜ',
      '🐸 frog',
    ];
    const input = single({ options: labels.map((label) => ({ label })), custom: false });

    labels.forEach((label) => {
      expect(answer(input, label)).toMatchObject({ output: { answers: [{ selected: [label] }] } });
    });
  });

  it('matches a label that Linear sends with Markdown escapes', () => {
    const input = single({ options: [{ label: 'snake_case' }, { label: 'camelCase' }] });

    expect(answer(input, 'snake\\_case')).toMatchObject({
      output: { answers: [{ selected: ['snake_case'] }] },
    });
  });

  it('matches a whole label that contains a comma', () => {
    const input = single({ options: [{ label: 'Red, dark' }, { label: 'Blue' }] });

    expect(answer(input, 'red, dark')).toMatchObject({
      output: { answers: [{ selected: ['Red, dark'] }] },
    });
  });

  it.each([
    ['1, 3', ['Red', 'Green']],
    ['3 1', ['Red', 'Green']],
    ['3,1,3', ['Red', 'Green']],
    ['green, Red', ['Red', 'Green']],
    ['2, green', ['Blue', 'Green']],
    ['Blue', ['Blue']],
  ])('maps the multi-select reply %j to labels in option order', (text, selected) => {
    expect(answer(single({ multiple: true, custom: false }), text)).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Color', selected }] },
    });
  });

  it('keeps free text as a custom answer, including multiple lines', () => {
    expect(answer(color, 'Purple, please\nwith a gradient')).toEqual({
      kind: 'answer',
      output: {
        answers: [{ header: 'Color', selected: [], custom: 'Purple, please\nwith a gradient' }],
      },
    });
  });

  it.each(['1, 3', '4', '0', 'Purple'])(
    'keeps %j as a custom answer on a single choice that allows one',
    (text) => {
      expect(answer(color, text)).toMatchObject({
        output: { answers: [{ selected: [], custom: text }] },
      });
    },
  );

  it.each(['1, 3', '2', 'Purple'])(
    'rejects %j beside native buttons without typed answers, without mentioning numbers',
    (text) => {
      expect(answer(single({ custom: false }), text)).toEqual({
        kind: 'rejected',
        reason: 'Reply to “Color” with one of the options.',
      });
    },
  );

  it.each(['1, 3', '0', `${SELECT_OPTIONS + 2}`, 'Purple'])(
    'rejects %j on a numbered single choice without typed answers',
    (text) => {
      const options = Array.from({ length: SELECT_OPTIONS + 1 }, (_, index) => ({
        label: `Option ${index + 1}`,
      }));

      expect(answer(single({ options, custom: false }), text)).toEqual({
        kind: 'rejected',
        reason: 'Reply to “Color” with one option number or label.',
      });
    },
  );

  it('rejects an unmatched multi-select reply without typed answers', () => {
    expect(answer(single({ multiple: true, custom: false }), '1, 9')).toEqual({
      kind: 'rejected',
      reason: 'Reply to “Color” with option numbers or labels, such as `1, 3`.',
    });
  });

  it.each(['', '   ', '\n'])('rejects the empty reply %j', (text) => {
    expect(answer(color, text)).toEqual({
      kind: 'rejected',
      reason: 'Reply to “Color” with an option or your own answer.',
    });
  });

  const several: QuestionInput = {
    questions: [
      {
        header: 'Colors',
        question: 'Which colors?',
        options: [{ label: 'Red' }, { label: 'Blue' }, { label: 'Green' }],
        multiple: true,
        custom: false,
      },
      {
        header: 'Size',
        question: 'Which size?',
        options: [{ label: 'Small' }, { label: 'Large' }],
        custom: true,
      },
    ],
  };

  it.each(['1. 1, 3\n2. Extra large', '- Red, Green\n- Extra large', '* 1 3\n+ Extra large'])(
    'reads the list-formatted reply %j',
    (text) => {
      expect(answer(several, text)).toEqual({
        kind: 'answer',
        output: {
          answers: [
            { header: 'Colors', selected: ['Red', 'Green'] },
            { header: 'Size', selected: [], custom: 'Extra large' },
          ],
        },
      });
    },
  );

  it('reads a numbered-list line that names an option', () => {
    expect(answer(several, '1. Blue\n2. Small')).toMatchObject({
      output: {
        answers: [
          { header: 'Colors', selected: ['Blue'] },
          { header: 'Size', selected: ['Small'] },
        ],
      },
    });
  });

  it('reads several labels that contain commas on a multi-select', () => {
    const input = single({
      options: [{ label: 'Red, dark' }, { label: 'Blue, light' }, { label: 'Green' }],
      multiple: true,
      custom: false,
    });

    expect(answer(input, 'Red, dark, Blue, light')).toMatchObject({
      output: { answers: [{ selected: ['Red, dark', 'Blue, light'] }] },
    });
    expect(answer(input, 'green,red, dark')).toMatchObject({
      output: { answers: [{ selected: ['Red, dark', 'Green'] }] },
    });
  });

  it('parses a long comma list quickly', () => {
    const input = single({ multiple: true });
    const text = Array.from({ length: 5000 }, () => 'Red').join(', ');
    const started = performance.now();

    expect(answer(input, text)).toMatchObject({ output: { answers: [{ selected: ['Red'] }] } });
    expect(answer(input, `${text}, Purple`)).toMatchObject({
      output: { answers: [{ custom: `${text}, Purple` }] },
    });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('keeps digits in multi-line text on a single question as a custom answer', () => {
    expect(answer(color, 'Use 2 of them\nand 3 more')).toMatchObject({
      output: { answers: [{ selected: [], custom: 'Use 2 of them\nand 3 more' }] },
    });
  });

  it('answers several questions from one line each, skipping blank lines', () => {
    expect(answer(several, '1, 3\n\n  Extra large  ')).toEqual({
      kind: 'answer',
      output: {
        answers: [
          { header: 'Colors', selected: ['Red', 'Green'] },
          { header: 'Size', selected: [], custom: 'Extra large' },
        ],
      },
    });
  });

  it.each(['1, 3', '1\n2\n3'])('rejects %j when the line count does not match', (text) => {
    expect(answer(several, text)).toEqual({
      kind: 'rejected',
      reason: 'Answer each of the 2 questions on its own line, in the order shown.',
    });
  });

  it('rejects a typed line for a question that does not accept one', () => {
    expect(answer(several, 'Purple\nSmall')).toEqual({
      kind: 'rejected',
      reason: 'Reply to “Colors” with option numbers or labels, such as `1, 3`.',
    });
  });

  it('dismisses on a Linear stop request, whatever the body says', () => {
    expect(parse({ interaction: reply('', 'stop') })).toEqual({ kind: 'dismiss' });
    expect(parse({ interaction: reply('Red', 'stop') })).toEqual({ kind: 'dismiss' });
  });

  it('treats a typed "stop" without the signal as a custom answer', () => {
    expect(parse({ interaction: reply('stop') })).toMatchObject({
      output: { answers: [{ custom: 'stop' }] },
    });
  });

  it('ignores a prompt with a signal other than stop by its body', () => {
    expect(parse({ interaction: reply('Blue', 'continue') })).toMatchObject({
      output: { answers: [{ selected: ['Blue'] }] },
    });
  });

  it.each([
    { type: 'action', event: { actionId: 'x', user: {} } },
    { type: 'modalSubmit', event: { callbackId: 'x', user: {} } },
  ])('ignores $type interactions', (interaction) => {
    expect(parse({ interaction: interaction as never })).toEqual({ kind: 'ignore' });
  });

  it.each(['Purple', '', '9', '1, 3'])(
    'ignores the non-explicit reply %j after the question settled',
    (text) => {
      expect(parse({ interaction: reply(text), settled: true })).toEqual({ kind: 'ignore' });
    },
  );

  it.each(['Red', 'green'])(
    'sends the explicit reply %j after the question settled to stale',
    (text) => {
      expect(parse({ interaction: reply(text), settled: true })).toEqual({ kind: 'stale' });
    },
  );

  it('sends a listed option number after the question settled to stale', () => {
    expect(
      parse({ input: single({ multiple: true }), interaction: reply('2'), settled: true }),
    ).toEqual({ kind: 'stale' });
    expect(parse({ interaction: reply('2'), settled: true })).toEqual({ kind: 'ignore' });
  });

  it.each([
    ['one second before', '2026-09-25T11:59:59.000Z'],
    ['an hour before', '2026-09-25T11:00:00.000Z'],
  ])('sends an option sent %s the question was posted to stale', (_, sent) => {
    expect(parse({ interaction: reply('Red', undefined, new Date(sent)) })).toEqual({
      kind: 'stale',
    });
  });

  it('passes free text sent before the question was posted to the agent', () => {
    const early = new Date('2026-09-25T11:59:59.000Z');

    expect(parse({ interaction: reply('Also make it round', undefined, early) })).toEqual({
      kind: 'ignore',
    });
    expect(parse({ interaction: reply('', undefined, early) })).toEqual({ kind: 'ignore' });
  });

  it('dismisses on a stop request sent before the question was posted', () => {
    expect(parse({ interaction: reply('', 'stop', new Date('2026-09-25T11:59:59.000Z')) })).toEqual(
      { kind: 'dismiss' },
    );
  });

  it('answers a reply sent at the moment the question was posted', () => {
    expect(parse({ interaction: reply('Red', undefined, new Date(postedAt)) }).kind).toBe('answer');
  });

  it('recognizes a stop request after the question settled', () => {
    expect(parse({ interaction: reply('', 'stop'), settled: true })).toEqual({ kind: 'dismiss' });
  });

  it('ignores a partly typed several-question reply after the question settled', () => {
    expect(parse({ input: several, interaction: reply('1\nHuge'), settled: true })).toEqual({
      kind: 'ignore',
    });
    expect(parse({ input: several, interaction: reply('1\n2'), settled: true })).toEqual({
      kind: 'stale',
    });
  });

  it('never returns a partial result', () => {
    const texts = ['', 'Red', '1, 2', 'Purple', '9', 'a\nb', '1\n2\n3'];
    const inputs = [color, single({ custom: false }), single({ multiple: true }), several];

    const kinds = inputs.flatMap((input) =>
      texts.flatMap((text) =>
        [false, true].map((settled) => parse({ input, interaction: reply(text), settled }).kind),
      ),
    );

    expect(kinds).not.toContain('partial');
  });
});

describe('Linear question outcomes', () => {
  const actor: TurnActor = {
    user: { collection: 'users', id: 'user-2' },
    channel: { piece: 'linear', id: 'user-2', username: 'toad', name: 'Toad_Frog' },
  };

  it('posts and saves nothing when a question is answered', async () => {
    await expect(
      linearQuestions.settled({
        ...hookArgs(),
        actor,
        outcome: { output: { answers: [{ header: 'Color', selected: ['Red'] }] } },
      }),
    ).resolves.toBeUndefined();

    expect(client.createAgentActivity).not.toHaveBeenCalled();
  });

  it('confirms a stop request with a final response naming who stopped it', async () => {
    await expect(
      linearQuestions.settled({ ...hookArgs(), actor, outcome: { dismissed: true } }),
    ).resolves.toBeUndefined();

    expect(activities()).toEqual([
      {
        agentSessionId: 'session-1',
        content: { type: 'response', body: 'Stopped. Toad\\_Frog dismissed the question.' },
      },
    ]);
  });

  it('posts nothing when an interrupted close is finished without an actor', async () => {
    await linearQuestions.settled({ ...hookArgs(), actor: null, outcome: { dismissed: true } });

    expect(client.createAgentActivity).not.toHaveBeenCalled();
  });

  it('asks the same question again with the rejection reason', async () => {
    await linearQuestions.rejected!({ ...hookArgs(), reason: 'Reply with one option.' });

    const [activity] = activities();

    expect(activity.content.body).toMatch(/^> Reply with one option\.\n\n\*\*Color\*\*/);
    expect(activity.signal).toBe('select');
    expect(activity.signalMetadata.options.map(({ label }: { label: string }) => label)).toEqual([
      'Red',
      'Blue',
      'Green',
    ]);
  });

  it('asks the same question again with FrogBot’s still-posting notice', async () => {
    await linearQuestions.rejected!({
      ...hookArgs(),
      reason: 'The next question is still posting — try again in a moment.',
    });

    expect(activities()[0].content.body).toMatch(
      /^> The next question is still posting — try again in a moment\.\n\n\*\*Color\*\*/,
    );
  });

  it('asks the same question again naming the participant without access', async () => {
    await linearQuestions.denied!(hookArgs());

    expect(activities()[0].content.body).toMatch(
      /^> Toad can't answer this question without access to this agent\. It is still open\.\n\n\*\*Color\*\*/,
    );
  });

  it('tells a late stop request that only open questions can be dismissed', async () => {
    await linearQuestions.stale!({ ...hookArgs(), interaction: reply('', 'stop') });

    expect(activities()[0].content).toEqual({
      type: 'response',
      body: 'This question was already answered. A stop request only dismisses an open question.',
    });
  });

  it('tells a late reply that the question was already answered', async () => {
    await linearQuestions.stale!(hookArgs());

    expect(activities()).toEqual([
      {
        agentSessionId: 'session-1',
        content: { type: 'response', body: 'This question was already answered.' },
      },
    ]);
  });
});
