import { expect, type Locator, type Page, test } from '@playwright/test';

import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel';
import { signIn } from './__helpers/signIn';
import {
  agentSlug,
  chatPicksPreference,
  chatsSlug,
  deliberatorLevels,
  modelPort,
  reasoningModels,
  sliderPath,
  verboseEffort,
  verboseLevel,
} from './fixtures/question/shared';

const questionCall = {
  id: 'call-1',
  name: 'question',
  input: {
    questions: [
      {
        header: 'Target',
        question: 'Where should this deploy?',
        options: [{ label: 'Staging' }, { label: 'Production' }],
        custom: false,
      },
    ],
  },
};

let model: StubChatModel;

test.setTimeout(120_000);

test.beforeAll(async () => {
  model = await startStubChatModel(modelPort);
});

test.afterAll(async () => {
  await model.close();
});

test.beforeEach(async ({ page }) => {
  model.reset();

  await signIn(page);

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  await page.goto(`/collections/${chatsSlug}/create`);
  await expect(page.locator('.fb-composer textarea')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

function trigger(page: Page) {
  return page.locator('.fb-model-selector__trigger');
}

function slider(page: Page) {
  return page.getByRole('slider', { name: 'Reasoning' });
}

async function send(page: Page, text: string) {
  await page.locator('.fb-composer textarea').fill(text);
  await page.locator('.fb-composer textarea').press('Enter');
}

function card(page: Page) {
  return page.locator('.fb-model-selector__content');
}

async function chooseModel(page: Page, name: string) {
  await trigger(page).click();

  await expect(trigger(page)).toHaveText('Select model');

  await page.getByRole('button', { name, exact: true }).click();

  await expect(trigger(page)).toHaveText('Select effort');

  await page.keyboard.press('Escape');

  await expect(card(page)).toBeHidden();
}

async function chooseQuestioner(page: Page) {
  await trigger(page).click();

  await expect(trigger(page)).toHaveText('Select effort');

  await page.locator('.fb-model-selector__model').click();

  await expect(trigger(page)).toHaveText('Select model');

  await page.getByRole('button', { name: 'questioner', exact: true }).click();

  await expect(card(page)).toBeHidden();
}

async function chooseLevel(page: Page, key: 'Home' | 'End') {
  await trigger(page).click();
  await slider(page).press(key);
  await page.keyboard.press('Escape');
}

async function savedPicks(page: Page) {
  const response = await page.request.get(`/api/payload-preferences/${chatPicksPreference}`);

  return response.ok() ? (await response.json()).value : undefined;
}

function choices() {
  return model.requests.map((request) => [request.model, request.reasoning_effort]);
}

test('the slider steps through the model levels with the keyboard', async ({ page }) => {
  await chooseModel(page, 'thinker');

  await expect(trigger(page)).toHaveText('thinker · Default');

  await trigger(page).click();

  const reasoning = slider(page);

  await reasoning.press('End');
  await expect(reasoning).toHaveAttribute('aria-valuetext', 'High');
  await expect(trigger(page)).toHaveText('Select effort');

  await reasoning.press('ArrowLeft');
  await expect(reasoning).toHaveAttribute('aria-valuetext', 'Low');

  await reasoning.press('Home');
  await expect(reasoning).toHaveAttribute('aria-valuetext', 'Default');

  await reasoning.press('ArrowRight');
  await expect(reasoning).toHaveAttribute('aria-valuetext', 'Low');
  await expect(trigger(page)).toHaveText('Select effort');

  await page.keyboard.press('Escape');

  await expect(trigger(page)).toHaveText('thinker · Low');
});

test('the chosen level reaches the model on every message', async ({ page }) => {
  await chooseModel(page, 'thinker');
  await chooseLevel(page, 'End');

  await expect(trigger(page)).toHaveText('thinker · High');

  model.respond({ text: 'Thought hard.' });

  await send(page, 'Think about it');

  await expect(page.getByText('Thought hard.', { exact: true })).toBeVisible();

  expect(choices()).toEqual([['thinker', 'high']]);
});

test('a model without levels hides the slider and sends none, and switching back restores its level', async ({
  page,
}) => {
  await chooseModel(page, 'thinker');
  await chooseLevel(page, 'End');
  await chooseQuestioner(page);

  await expect(trigger(page)).toHaveText('questioner');

  await trigger(page).click();

  await expect(trigger(page)).toHaveText('Select model');
  await expect(page.locator('.fb-model-selector__list')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  await expect(slider(page)).toHaveCount(0);

  await page.keyboard.press('Escape');

  model.respond({ text: 'Plain reply.' });

  await send(page, 'Answer plainly');

  await expect(page.getByText('Plain reply.', { exact: true })).toBeVisible();

  await chooseModel(page, 'thinker');

  await expect(trigger(page)).toHaveText('thinker · High');

  model.respond({ text: 'Deep reply.' });

  await send(page, 'Now think');

  await expect(page.getByText('Deep reply.', { exact: true })).toBeVisible();

  expect(choices()).toEqual([
    ['questioner', undefined],
    ['thinker', 'high'],
  ]);
  expect(model.requests[0]).not.toHaveProperty('reasoning_effort');
});

test('reloading a chat shows the choice of its latest message, and a new chat the saved one', async ({
  page,
}) => {
  await chooseModel(page, 'thinker');
  await chooseLevel(page, 'Home');
  await trigger(page).click();
  await slider(page).press('ArrowRight');
  await page.keyboard.press('Escape');

  model.respond({ text: 'Light reply.' });

  await send(page, 'Think a little');

  await expect(page.getByText('Light reply.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));

  await chooseLevel(page, 'End');

  await expect(trigger(page)).toHaveText('thinker · High');
  await expect
    .poll(() => savedPicks(page))
    .toMatchObject({ model: 'browser/thinker', reasoning: { 'browser/thinker': 'high' } });

  await page.reload();

  await expect(trigger(page)).toHaveText('thinker · Low');

  await page.goto(`/collections/${chatsSlug}/create`);

  await expect(trigger(page)).toHaveText('thinker · High');
  expect(choices()).toEqual([['thinker', 'low']]);
});

test('a saved level the model no longer offers shows Default and is not sent', async ({ page }) => {
  const saved = await page.request.post(`/api/payload-preferences/${chatPicksPreference}`, {
    data: {
      value: {
        agent: 'questioner',
        model: 'browser/thinker',
        reasoning: { 'browser/thinker': 'max' },
      },
    },
  });

  expect(saved.ok()).toBe(true);

  await page.reload();

  await expect(trigger(page)).toHaveText('thinker · Default');

  model.respond({ text: 'Default reply.' });

  await send(page, 'Go');

  await expect(page.getByText('Default reply.', { exact: true })).toBeVisible();

  expect(choices()).toEqual([['thinker', undefined]]);
  expect(model.requests[0]).not.toHaveProperty('reasoning_effort');
});

test('a message queued behind a question runs with the choice it was sent with', async ({
  page,
}) => {
  const posts: Array<{ model?: string; reasoning?: string }> = [];

  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === `/api/agents/${agentSlug}` &&
      request.method() === 'POST'
    ) {
      posts.push(request.postDataJSON());
    }
  });

  model.respond(
    { toolCalls: [questionCall] },
    { text: 'Deploying to staging.' },
    { text: 'The logs are clean.' },
  );

  await chooseModel(page, 'thinker');
  await chooseLevel(page, 'End');
  await send(page, 'Deploy it');

  const staging = page.getByRole('button', { name: /Staging/ });

  await expect(staging).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`/collections/${chatsSlug}/\\d+$`));

  await chooseQuestioner(page);
  await send(page, 'Also check the logs');

  await expect(page.locator('.fb-chat__queued')).toContainText('Also check the logs');

  await staging.click();

  await expect(page.getByText('The logs are clean.', { exact: true })).toBeVisible();

  expect(choices()).toEqual([
    ['thinker', 'high'],
    ['thinker', 'high'],
    ['questioner', undefined],
  ]);
  expect(posts.map(({ model, reasoning }) => [model, reasoning])).toEqual([
    ['browser/thinker', 'high'],
    ['browser/questioner', undefined],
    ['browser/questioner', undefined],
  ]);
});

async function openControls(page: Page, name: string) {
  await chooseModel(page, name);
  await trigger(page).click();

  await expect(slider(page)).toBeVisible();
}

async function openSliderPage(page: Page, count: number) {
  await page.goto(`${sliderPath}?count=${count}`);

  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="range"]');

    return !!input && Object.keys(input).some((key) => key.startsWith('__reactProps$'));
  });

  return {
    frame: page.getByTestId('slider-frame'),
    control: page.getByRole('slider', { name: 'Level' }),
  };
}

async function eachLevel<T>({
  control,
  levels,
  measure,
}: {
  control: Locator;
  levels: readonly string[];
  measure: (index: number) => Promise<T>;
}) {
  const results: T[] = [];

  await control.press('Home');

  for (const [index, level] of levels.entries()) {
    await expect(control).toHaveAttribute('aria-valuetext', level);

    results.push(await measure(index));

    await control.press('ArrowRight');
  }

  return results;
}

async function sliderLayout(container: Locator) {
  return container.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const dots = Array.from(element.querySelectorAll('.fb-slider__dot'));

    const parts = [
      { name: 'title', node: element.querySelector('.fb-slider__value') },
      { name: 'slider', node: element.querySelector('.fb-slider') },
      ...dots.map((node, index) => ({ name: `dot ${index}`, node })),
    ];

    const overflow = (box: DOMRect, outer: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>) =>
      Math.round(
        Math.max(
          outer.left - box.left,
          box.right - outer.right,
          outer.top - box.top,
          box.bottom - outer.bottom,
          0,
        ),
      );

    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

    const outside = [
      { name: 'container', px: overflow(bounds, viewport) },
      ...parts.flatMap(({ name, node }) =>
        node ? [{ name, px: overflow(node.getBoundingClientRect(), bounds) }] : [],
      ),
    ]
      .filter(({ px }) => px > 0)
      .map(({ name, px }) => `${name} ${px}px`);

    return {
      missing: parts.filter(({ node }) => !node).map(({ name }) => name),
      dots: dots.length,
      outside,
    };
  });
}

async function sliderTitle(container: Locator) {
  return container.evaluate(
    (element) => element.querySelector('.fb-slider__value')?.textContent ?? null,
  );
}

async function stopLabels(container: Locator) {
  return container.evaluate((element) => {
    const root = element.querySelector('.fb-slider')?.cloneNode(true) as HTMLElement | undefined;

    root?.querySelector('.fb-slider__value')?.remove();

    return root?.textContent?.trim() ?? null;
  });
}

async function thumbOffset({ container, index }: { container: Locator; index: number }) {
  return container.evaluate((element, index) => {
    const input = element.querySelector<HTMLInputElement>('input[type="range"]')!;
    const dot = element.querySelectorAll('.fb-slider__dot')[index];
    const box = input.getBoundingClientRect();

    const thumb =
      box.left + box.height / 2 + ((box.width - box.height) * index) / Number(input.max);

    const offset = (dotBox: DOMRect) =>
      Math.round(Math.abs(dotBox.left + dotBox.width / 2 - thumb) * 10) / 10;

    return { index, offset: dot ? offset(dot.getBoundingClientRect()) : 'missing' };
  }, index);
}

function misaligned(offsets: Array<{ index: number; offset: number | string }>) {
  return offsets.filter(({ offset }) => typeof offset !== 'number' || offset > 3);
}

test('the 7-stop slider stays inside the popover card at every level', async ({ page }) => {
  await openControls(page, reasoningModels.deliberator);

  const layouts = await eachLevel({
    control: slider(page),
    levels: deliberatorLevels,
    measure: () => sliderLayout(card(page)),
  });

  expect(layouts).toEqual(deliberatorLevels.map(() => ({ missing: [], dots: 7, outside: [] })));
});

test("the thumb sits on each stop's dot", async ({ page }) => {
  await openControls(page, reasoningModels.deliberator);

  const offsets = await eachLevel({
    control: slider(page),
    levels: deliberatorLevels,
    measure: (index) => thumbOffset({ container: card(page), index }),
  });

  expect(misaligned(offsets)).toEqual([]);
});

test("clicking a stop's dot selects that level", async ({ page }) => {
  await openControls(page, reasoningModels.deliberator);

  const dots = card(page).locator('.fb-slider__dot');

  await expect(dots).toHaveCount(deliberatorLevels.length);

  for (const index of [...deliberatorLevels.keys()].reverse()) {
    const box = (await dots.nth(index).boundingBox())!;

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(slider(page)).toHaveAttribute('aria-valuetext', deliberatorLevels[index]);
  }
});

for (const [name, count] of [
  [reasoningModels.sprinter, 2],
  ['thinker', 3],
  [reasoningModels.deliberator, 7],
] as const) {
  test(`the ${name} slider shows one dot for each of its ${count} stops and no stop labels`, async ({
    page,
  }) => {
    await openControls(page, name);

    await expect(card(page).locator('.fb-slider__dot')).toHaveCount(count);
    expect(await stopLabels(card(page))).toBe('');
  });
}

test("the title shows only the active level's name at each stop", async ({ page }) => {
  await openControls(page, reasoningModels.deliberator);

  const titles = await eachLevel({
    control: slider(page),
    levels: deliberatorLevels,
    measure: () => sliderTitle(card(page)),
  });

  expect(titles).toEqual(deliberatorLevels);
});

test('a long custom level name stays inside the popover card', async ({ page }) => {
  await openControls(page, reasoningModels.verbose);
  await slider(page).press('End');

  await expect(slider(page)).toHaveAttribute('aria-valuetext', verboseLevel);
  expect(await sliderLayout(card(page))).toEqual({ missing: [], dots: 2, outside: [] });
});

test('the popover fits a 320px-wide window with Extra High active', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openControls(page, reasoningModels.deliberator);
  await slider(page).press('End');
  await slider(page).press('ArrowLeft');

  await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Extra High');
  expect(await sliderLayout(card(page))).toEqual({ missing: [], dots: 7, outside: [] });
});

for (const count of [2, 3, 4, 5, 6, 7]) {
  test(`Slider with ${count} stops lays out on its own without app CSS`, async ({ page }) => {
    const { frame, control } = await openSliderPage(page, count);
    const levels = deliberatorLevels.slice(0, count);

    const layouts = await eachLevel({ control, levels, measure: () => sliderLayout(frame) });

    expect(layouts).toEqual(levels.map(() => ({ missing: [], dots: count, outside: [] })));
  });
}

test("Slider on its own keeps the thumb on each stop's dot for 2 to 7 stops", async ({ page }) => {
  const offsets = [];

  for (const count of [2, 3, 4, 5, 6, 7]) {
    const { frame, control } = await openSliderPage(page, count);

    const levels = await eachLevel({
      control,
      levels: deliberatorLevels.slice(0, count),
      measure: (index) => thumbOffset({ container: frame, index }),
    });

    offsets.push(...misaligned(levels).map((offset) => ({ count, ...offset })));
  }

  expect(offsets).toEqual([]);
});

const longLevel = `${verboseLevel}-${verboseEffort}`;

async function lengthenVerboseLevel(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/agents',
    async (route) => {
      const response = await route.fetch();

      const body = (await response.json()) as {
        agents: Array<{ reasoning?: Record<string, Array<{ key: string; label: string }>> }>;
      };

      const agents = body.agents.map((agent) => ({
        ...agent,
        reasoning: {
          ...agent.reasoning,
          [`browser/${reasoningModels.verbose}`]: [{ key: verboseEffort, label: longLevel }],
        },
      }));

      await route.fulfill({ response, json: { ...body, agents } });
    },
  );

  await page.reload();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();
}

test('a long custom level name truncates without widening the popover card', async ({ page }) => {
  await lengthenVerboseLevel(page);
  await openControls(page, reasoningModels.verbose);

  const width = await card(page).evaluate((element) => element.getBoundingClientRect().width);

  await slider(page).press('End');

  await expect(slider(page)).toHaveAttribute('aria-valuetext', longLevel);

  const title = await card(page).evaluate((element) => {
    const value = element.querySelector('.fb-slider__value')!;

    return {
      card: element.getBoundingClientRect().width,
      truncated: value.scrollWidth > value.clientWidth,
      overflow: getComputedStyle(value).textOverflow,
    };
  });

  expect(title).toEqual({ card: width, truncated: true, overflow: 'ellipsis' });
});

test('clicking between two dots selects the nearer stop', async ({ page }) => {
  await openControls(page, reasoningModels.deliberator);

  const dots = card(page).locator('.fb-slider__dot');
  const results = [];

  for (const [from, share] of [
    [2, 0.3],
    [2, 0.7],
    [5, 0.3],
  ] as const) {
    const start = (await dots.nth(from).boundingBox())!;
    const end = (await dots.nth(from + 1).boundingBox())!;

    await page.mouse.click(
      start.x + start.width / 2 + (end.x - start.x) * share,
      start.y + start.height / 2,
    );

    results.push({
      value: await slider(page).inputValue(),
      level: await slider(page).getAttribute('aria-valuetext'),
      title: await sliderTitle(card(page)),
    });
  }

  expect(results).toEqual([
    { value: '2', level: 'Low', title: 'Low' },
    { value: '3', level: 'Medium', title: 'Medium' },
    { value: '5', level: 'Extra High', title: 'Extra High' },
  ]);
});

test('switching from the 7-stop to the 2-stop model re-lays out the open slider', async ({
  page,
}) => {
  await openControls(page, reasoningModels.deliberator);
  await slider(page).press('End');
  await page.locator('.fb-model-selector__model').click();
  await page.getByRole('button', { name: reasoningModels.sprinter, exact: true }).click();

  await expect(card(page).locator('.fb-slider__dot')).toHaveCount(2);

  const levels = ['Default', 'High'];

  const layouts = await eachLevel({
    control: slider(page),
    levels,
    measure: () => sliderLayout(card(page)),
  });

  const offsets = await eachLevel({
    control: slider(page),
    levels,
    measure: (index) => thumbOffset({ container: card(page), index }),
  });

  expect(layouts).toEqual(levels.map(() => ({ missing: [], dots: 2, outside: [] })));
  expect(misaligned(offsets)).toEqual([]);
});

test('Slider with one stop places its dot where the thumb sits', async ({ page }) => {
  const { frame } = await openSliderPage(page, 1);

  const placement = await frame.evaluate((element) => {
    const dot = element.querySelector('.fb-slider__dot')!;
    const control = element.querySelector('.fb-slider__control')!.getBoundingClientRect();

    return {
      left: Math.round(parseFloat(getComputedStyle(dot).left) * 100) / 100,
      thumb: Math.round((control.height / 2) * 100) / 100,
    };
  });

  expect(placement.left).toBe(placement.thumb);
  expect(await sliderLayout(frame)).toEqual({ missing: [], dots: 1, outside: [] });
});

async function drawnThumb({ frame, index }: { frame: Locator; index: number }) {
  const image = await frame.locator('.fb-slider__control').screenshot({ scale: 'css' });

  return frame.evaluate(
    async (element, { image, index }) => {
      const control = element.querySelector('.fb-slider__control')!.getBoundingClientRect();
      const dot = element.querySelectorAll('.fb-slider__dot')[index].getBoundingClientRect();

      const response = await fetch(`data:image/png;base64,${image}`);
      const bitmap = await createImageBitmap(await response.blob());

      const canvas = document.createElement('canvas');

      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const context = canvas.getContext('2d')!;

      context.drawImage(bitmap, 0, 0);

      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);

      const light = (x: number, y: number) => data[(y * bitmap.width + x) * 4] > 230;

      const run = (length: number, hit: (at: number) => boolean) => {
        const hits = Array.from({ length }, (_, at) => at).filter(hit);

        return { middle: hits[0] + hits.length / 2, size: hits.length };
      };

      const across = run(bitmap.width, (x) => light(x, Math.floor(bitmap.height / 2)));
      const down = run(bitmap.height, (y) => light(Math.floor(across.middle), y));
      const round = (px: number) => Math.round(Math.abs(px) * 10) / 10;
      const inner = control.height - 4;

      return {
        index,
        x: round(across.middle - (dot.left + dot.width / 2 - control.left)),
        y: round(down.middle - control.height / 2),
        width: round(across.size - inner),
        height: round(down.size - inner),
      };
    },
    { image: image.toString('base64'), index },
  );
}

test("Slider draws a thumb-sized thumb centred on each stop's dot", async ({ page }) => {
  const { frame, control } = await openSliderPage(page, 7);

  const thumbs = await eachLevel({
    control,
    levels: deliberatorLevels,
    measure: (index) => drawnThumb({ frame, index }),
  });

  expect(
    thumbs.filter(({ x, y, width, height }) => !(x <= 3 && y <= 2 && width <= 2 && height <= 2)),
  ).toEqual([]);
});
