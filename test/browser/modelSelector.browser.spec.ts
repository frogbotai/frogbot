import { expect, type Locator, type Page, test } from '@playwright/test';

import { signIn } from './__helpers/signIn';
import { chatPicksPreference, chatsSlug, pickerAgentSlug } from './fixtures/question/shared';

test.setTimeout(120_000);

async function choosePickerAgent(page: Page) {
  await page.locator('.fb-agent-selector__trigger').click();
  await page.getByRole('menuitem', { name: pickerAgentSlug, exact: true }).click();

  await expect(page.locator('.fb-agent-selector__trigger')).toHaveText(pickerAgentSlug);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  await page.goto(`/collections/${chatsSlug}/create`);
  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await choosePickerAgent(page);
});

test.afterEach(async ({ context, page }) => {
  await context.setOffline(false);

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

function trigger(page: Page) {
  return page.locator('.fb-model-selector__trigger');
}

function triggerName(page: Page) {
  return page.locator('.fb-model-selector__trigger .fb-model-selector__name');
}

function card(page: Page) {
  return page.locator('.fb-model-selector__content');
}

function slider(page: Page) {
  return page.getByRole('slider', { name: 'Reasoning' });
}

async function openModelList(page: Page) {
  await trigger(page).click();

  await expect(trigger(page)).toHaveText('Select model');

  const list = page.locator('.fb-model-selector__list');

  await expect(list).toBeVisible();
  await expect.poll(() => list.locator('.fb-model-selector__option').count()).toBeGreaterThan(400);

  return list;
}

async function scrollbarStyles({ list, authored }: { list: Locator; authored: boolean }) {
  return list.evaluate((element, authored) => {
    const styleRules = (rules: CSSRuleList): CSSStyleRule[] =>
      Array.from(rules).flatMap((rule) => {
        if (rule instanceof CSSStyleRule) return [rule];

        return 'cssRules' in rule ? styleRules((rule as CSSGroupingRule).cssRules) : [];
      });

    const rules = Array.from(document.styleSheets).flatMap((sheet) => styleRules(sheet.cssRules));
    const listRule = rules.find((rule) => rule.selectorText === '.fb-model-selector__list');
    const style = authored ? listRule?.style : getComputedStyle(element);

    const transparentTrack = style?.scrollbarColor
      ? /(transparent|rgba\(0, 0, 0, 0\))$/.test(style.scrollbarColor)
      : rules.some(
          (rule) =>
            rule.selectorText === '.fb-model-selector__list::-webkit-scrollbar-track' &&
            rule.style.background === 'transparent',
        );

    return { transparentTrack, width: style?.scrollbarWidth };
  }, authored);
}

for (const theme of ['light', 'dark'] as const) {
  test(`the ${theme} scrollbar has a thin themed thumb and transparent track`, async ({
    browserName,
    page,
  }) => {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme,
    );

    const list = await openModelList(page);
    const authored = browserName === 'firefox';

    await expect
      .poll(() => scrollbarStyles({ list, authored }))
      .toEqual({ transparentTrack: true, width: 'thin' });
    await expect
      .poll(() =>
        list.evaluate((element) => {
          const style = getComputedStyle(element);
          const color = document.createElement('span');

          color.style.color = 'var(--theme-base-350)';
          element.append(color);

          const thumb = getComputedStyle(color).color;

          color.remove();

          return !style.scrollbarColor || style.scrollbarColor.startsWith(thumb);
        }),
      )
      .toBe(true);
  });
}

test('the scrollbar list scrolls with the mouse wheel', async ({ page }) => {
  const list = await openModelList(page);
  const start = await list.evaluate((element) => element.scrollTop);

  await list.hover();
  await page.mouse.wheel(0, 500);

  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(start);
});

test('the scrollbar list scrolls with the keyboard', async ({ page }) => {
  const list = await openModelList(page);

  await list.locator('.fb-model-selector__option').first().focus();

  const start = await list.evaluate((element) => element.scrollTop);

  await page.keyboard.press('PageDown');

  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(start);
});

function searchField(page: Page) {
  return page.getByLabel('Search models');
}

async function savedPicks(page: Page) {
  const response = await page.request.get(`/api/payload-preferences/${chatPicksPreference}`);

  return response.ok() ? (await response.json()).value : undefined;
}

async function rowLogos(list: Locator) {
  return list.locator('.fb-model-selector__option').evaluateAll((rows) =>
    rows.map((row) => {
      const logos = row.querySelectorAll('svg.fb-model-selector__logo');

      return {
        id: row.getAttribute('title'),
        logos: logos.length,
        fallback: logos[0]?.classList.contains('lucide-sparkle-icon') ?? false,
        paths: logos[0]?.querySelectorAll('path').length ?? 0,
      };
    }),
  );
}

test('typing from a row searches, and Down then Enter chooses the first result', async ({
  page,
}) => {
  const list = await openModelList(page);

  await expect(list.locator('.fb-model-selector__option:focus')).toHaveAttribute(
    'title',
    'browser/questioner',
  );

  await page.keyboard.type('deliberator');

  await expect(searchField(page)).toBeFocused();
  await expect(searchField(page)).toHaveValue('deliberator');

  await page.keyboard.press('ArrowDown');

  const first = list.locator('.fb-model-selector__option').first();

  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('title', 'browser/deliberator');

  await page.keyboard.press('Enter');

  await expect(trigger(page)).toHaveText('Select effort');
  await expect(slider(page)).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(triggerName(page)).toHaveText('deliberator');
  await expect
    .poll(() => savedPicks(page))
    .toMatchObject({ agent: pickerAgentSlug, model: 'browser/deliberator' });
});

test('Escape clears the query first, then closes the list', async ({ page }) => {
  const list = await openModelList(page);

  await page.keyboard.type('sonnet');

  await expect(searchField(page)).toHaveValue('sonnet');

  await page.keyboard.press('Escape');

  await expect(searchField(page)).toHaveValue('');
  await expect(list).toBeVisible();
  await expect.poll(() => list.locator('.fb-model-selector__option').count()).toBeGreaterThan(400);

  await page.keyboard.press('Escape');

  await expect(page.locator('.fb-model-selector__content')).toBeHidden();
  await expect(page.locator('.fb-model-selector__trigger')).toBeFocused();
});

test('rows show catalog names, find models by ID, and carry a provider logo', async ({ page }) => {
  const list = await openModelList(page);
  const novaMicro = list.getByRole('button', { name: 'Nova Micro (US)', exact: true });

  await expect(novaMicro).toHaveAttribute('title', 'bedrock/us.amazon.nova-micro-v1:0');

  const logos = await rowLogos(list);

  expect(logos.length).toBeGreaterThan(400);
  expect(logos.filter(({ logos }) => logos !== 1)).toEqual([]);
  expect(logos.filter(({ id, fallback }) => fallback !== id!.startsWith('browser/'))).toEqual([]);

  await searchField(page).fill('nova-micro-v1');

  await expect(novaMicro).toBeVisible();
  await expect
    .poll(() =>
      list.locator('.fb-model-selector__option').evaluateAll((rows) =>
        rows
          .map((row) => row.getAttribute('title')!)
          .filter(
            (id) =>
              !id
                .replace(/[^a-z0-9]/gi, '')
                .toLowerCase()
                .includes('novamicrov1'),
          ),
      ),
    )
    .toEqual([]);
});

test('custom models show their ID as the name with the fallback icon', async ({ page }) => {
  const list = await openModelList(page);

  await searchField(page).fill('browser');

  const rows = list.locator('.fb-model-selector__option');

  await expect(rows).toHaveCount(5);
  await expect(rows.locator('.fb-model-selector__option-name')).toHaveText([
    'questioner',
    'deliberator',
    'sprinter',
    'thinker',
    'verbose',
  ]);
  await expect(rows.nth(0)).toHaveAttribute('title', 'browser/questioner');
  await expect(rows.nth(1)).toHaveAttribute('title', 'browser/deliberator');
  await expect(rows.nth(2)).toHaveAttribute('title', 'browser/sprinter');
  await expect(rows.nth(3)).toHaveAttribute('title', 'browser/thinker');
  await expect(rows.nth(4)).toHaveAttribute('title', 'browser/verbose');
  await expect(rows.locator('svg.lucide-sparkle-icon')).toHaveCount(5);
  await expect(rows.locator('.fb-model-selector__option-id')).toHaveCount(0);
});

test('typing sonnet filters about 500 models within 100 ms per key', async ({
  browserName,
  page,
}, testInfo) => {
  const list = await openModelList(page);

  await searchField(page).focus();

  const timings = await searchField(page).evaluate(async (input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const result: number[] = [];

    for (const length of [1, 2, 3, 4, 5, 6]) {
      const start = performance.now();

      setValue.call(input, 'sonnet'.slice(0, length));
      input.dispatchEvent(new Event('input', { bubbles: true }));

      await frame();
      await frame();

      result.push(Math.round((performance.now() - start) * 10) / 10);
    }

    return result;
  });

  testInfo.annotations.push({
    type: 'timings',
    description: `${browserName}: ${timings.join(', ')} ms`,
  });
  console.log(`model search timings (${browserName}): ${timings.join(', ')} ms`);

  const ids = await list
    .locator('.fb-model-selector__option')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('title')));

  expect(ids.length).toBeGreaterThan(0);
  expect(ids.filter((id) => !/sonnet/i.test(id!))).toEqual([]);
  expect(Math.max(...timings)).toBeLessThan(100);
});

test('opening and searching the list makes no image or off-host requests', async ({ page }) => {
  const requests: Array<{ url: string; type: string }> = [];

  page.on('request', (request) =>
    requests.push({ url: request.url(), type: request.resourceType() }),
  );

  await openModelList(page);
  await page.keyboard.type('sonnet');
  await searchField(page).fill('nova-micro-v1');
  await searchField(page).fill('');

  expect(requests.filter(({ type }) => type === 'image')).toEqual([]);
  expect(
    requests.filter(({ url }) => !['localhost', '127.0.0.1'].includes(new URL(url).hostname)),
  ).toEqual([]);
});

test('logos render while offline, with the fallback for custom models', async ({
  context,
  page,
}) => {
  await context.setOffline(true);

  const list = await openModelList(page);
  const logos = await rowLogos(list);

  expect(logos.filter(({ logos, paths }) => logos !== 1 || paths === 0)).toEqual([]);
  expect(logos.filter(({ fallback }) => fallback).map(({ id }) => id)).toEqual([
    'browser/questioner',
    'browser/deliberator',
    'browser/sprinter',
    'browser/thinker',
    'browser/verbose',
  ]);
});

type PickerManifest = {
  slug: string;
  models: string[];
  names?: Record<string, string>;
  reasoning?: Record<string, unknown[]>;
};

async function pickerManifest(page: Page) {
  const response = page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname === '/api/agents',
  );

  await page.reload();

  const { agents } = (await (await response).json()) as { agents: PickerManifest[] };

  return agents.find(({ slug }) => slug === pickerAgentSlug)!;
}

test('the agent manifest the chat loads names the picker models it has names for', async ({
  page,
}) => {
  const picker = await pickerManifest(page);
  const names = picker.names ?? {};

  expect(picker.models.length).toBeGreaterThan(400);
  expect(names['bedrock/us.amazon.nova-micro-v1:0']).toBe('Nova Micro (US)');
  expect(Object.keys(names).filter((id) => !picker.models.includes(id))).toEqual([]);
  expect(Object.values(names).filter((name) => !name.trim())).toEqual([]);
  expect(names).not.toHaveProperty('browser/questioner');
  expect(names).not.toHaveProperty('browser/thinker');
});

test('Escape with a query clears it while a row has focus and keeps the list open', async ({
  page,
}) => {
  const list = await openModelList(page);

  await page.keyboard.type('nova-micro');
  await page.keyboard.press('ArrowDown');

  await expect(list.locator('.fb-model-selector__option').first()).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(searchField(page)).toHaveValue('');
  await expect(list).toBeVisible();
  await expect.poll(() => list.locator('.fb-model-selector__option').count()).toBeGreaterThan(400);
});

test('Escape restores a selected model the query hid, with its check and selection unchanged', async ({
  page,
}) => {
  const list = await openModelList(page);
  const current = list.locator('.fb-model-selector__option[aria-current="true"]');

  await page.keyboard.type('nova-micro');

  await expect(current).toHaveCount(0);

  await page.keyboard.press('Escape');

  await expect(current).toHaveAttribute('title', 'browser/questioner');
  await expect(current.locator('.fb-model-selector__check')).toBeVisible();
  await expect(list.locator('.fb-model-selector__check')).toHaveCount(1);

  await page.keyboard.press('Escape');

  await expect(triggerName(page)).toHaveText('questioner');
});

test('Space on a focused row chooses it instead of typing into the search', async ({ page }) => {
  const list = await openModelList(page);

  await page.keyboard.type('thinker');
  await page.keyboard.press('ArrowDown');

  await expect(list.locator('.fb-model-selector__option').first()).toHaveAttribute(
    'title',
    'browser/thinker',
  );

  await page.keyboard.press('Space');

  await expect(trigger(page)).toHaveText('Select effort');
  await expect(searchField(page)).toBeHidden();
  await expect(slider(page)).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(triggerName(page)).toHaveText('thinker');
});

test('modified keys on a focused row stay with the row', async ({ page }) => {
  const list = await openModelList(page);
  const focused = list.locator('.fb-model-selector__option:focus');

  await expect(focused).toHaveAttribute('title', 'browser/questioner');

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Alt+o');

  await expect(focused).toHaveAttribute('title', 'browser/questioner');
  await expect(searchField(page)).toHaveValue('');
});

async function narrowRowLayout({ page, id, choose }: { page: Page; id: string; choose: boolean }) {
  await choosePickerAgent(page);
  await page.setViewportSize({ width: 320, height: 720 });

  const list = await openModelList(page);
  const row = list.locator(`.fb-model-selector__option[title="${id}"]`);

  await searchField(page).fill(id);

  if (choose) {
    await row.click();

    await expect(card(page)).toBeHidden();

    await openModelList(page);
    await searchField(page).fill(id);
  }

  await expect(row).toBeVisible();

  return row.evaluate((element) => {
    const card = element.closest('.fb-model-selector__content')!.getBoundingClientRect();

    const parts = Object.entries({
      logo: '.fb-model-selector__logo',
      name: '.fb-model-selector__option-name',
      id: '.fb-model-selector__option-id',
      check: '.fb-model-selector__check',
    }).flatMap(([part, selector]) => {
      const node = element.querySelector(selector);

      return node ? [{ part, node, box: node.getBoundingClientRect() }] : [];
    });

    const truncated = parts
      .filter(({ node }) => node.scrollWidth > node.clientWidth)
      .map(({ part }) => part);

    return {
      parts: parts.map(({ part }) => part),
      outside: parts
        .filter(({ box }) => box.width === 0 || box.left < card.left || box.right > card.right)
        .map(({ part }) => part),
      truncated,
      cardInViewport: card.left >= 0 && card.right <= window.innerWidth,
      current: element.getAttribute('aria-current'),
    };
  });
}

test('a 320px viewport keeps the logo, truncated name and check of the selected row inside the card', async ({
  page,
}) => {
  const { names = {}, reasoning = {} } = await pickerManifest(page);

  const [id] = Object.entries(names)
    .filter(([id]) => !reasoning[id]?.length)
    .sort(([, a], [, b]) => b.length - a.length)[0];

  const layout = await narrowRowLayout({ page, id, choose: true });

  expect(layout).toEqual({
    parts: ['logo', 'name', 'check'],
    outside: [],
    truncated: ['name'],
    cardInViewport: true,
    current: 'true',
  });
});

test('a 320px viewport keeps the logo, name and secondary ID of a duplicate name inside the card', async ({
  page,
}) => {
  const { names = {} } = await pickerManifest(page);
  const values = Object.values(names);

  const [id] = Object.entries(names)
    .filter(([, name]) => values.indexOf(name) !== values.lastIndexOf(name))
    .sort(([a], [b]) => b.length - a.length)[0];

  const layout = await narrowRowLayout({ page, id, choose: false });

  expect(layout).toEqual({
    parts: ['logo', 'name', 'id'],
    outside: [],
    truncated: ['id'],
    cardInViewport: true,
    current: null,
  });
});

test('opening with a model without effort options shows the list with no Back button', async ({
  page,
}) => {
  const list = await openModelList(page);

  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  await expect(page.locator('.fb-model-selector__model')).toHaveCount(0);
  await expect(list.locator('.fb-model-selector__option:focus')).toHaveAttribute(
    'title',
    'browser/questioner',
  );
});

test('choosing the current model without effort options closes the selector', async ({ page }) => {
  const list = await openModelList(page);

  await list.locator('.fb-model-selector__option[title="browser/questioner"]').click();

  await expect(card(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveText('questioner');
});

test('choosing another model without effort options closes the selector and saves it', async ({
  page,
}) => {
  const { models, names = {}, reasoning = {} } = await pickerManifest(page);
  const id = models.find((model) => model !== 'browser/questioner' && !reasoning[model])!;
  const name = names[id] ?? id.slice(id.indexOf('/') + 1);

  await choosePickerAgent(page);

  const list = await openModelList(page);

  await searchField(page).fill(id);
  await list.locator(`.fb-model-selector__option[title="${id}"]`).click();

  await expect(card(page)).toBeHidden();
  await expect(trigger(page)).toHaveText(name);
  await expect.poll(() => savedPicks(page)).toMatchObject({ agent: pickerAgentSlug, model: id });
});

async function cardBox(page: Page) {
  return card(page).evaluate((element) => {
    const { left, right, width } = element.getBoundingClientRect();

    return { left, right, width };
  });
}

async function cardWidths(page: Page) {
  return page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);

    return {
      cap: Math.min(22 * rem, window.innerWidth - 2 * rem),
      viewportCap: window.innerWidth - 2 * rem,
      viewport: window.innerWidth,
    };
  });
}

test('the popover keeps one width across the list, search results, no results and the effort view', async ({
  page,
}) => {
  const list = await openModelList(page);
  const boxes = [{ state: 'list', ...(await cardBox(page)) }];

  await searchField(page).fill('browser/thinker');

  await expect(list.locator('.fb-model-selector__option')).toHaveCount(1);

  boxes.push({ state: 'one row', ...(await cardBox(page)) });

  await searchField(page).fill('zzzz-no-model');

  await expect(list.locator('.fb-model-selector__empty')).toHaveText('No models found');

  boxes.push({ state: 'no results', ...(await cardBox(page)) });

  await searchField(page).fill('');
  await list.locator('.fb-model-selector__option[title="browser/thinker"]').click();

  await expect(slider(page)).toBeVisible();

  boxes.push({ state: 'effort', ...(await cardBox(page)) });

  await page.locator('.fb-model-selector__model').click();

  await expect(searchField(page)).toBeVisible();

  boxes.push({ state: 'list again', ...(await cardBox(page)) });

  const { cap } = await cardWidths(page);

  expect(
    boxes
      .filter(
        ({ left, width }) => Math.abs(width - cap) > 0.5 || Math.abs(left - boxes[0].left) > 0.5,
      )
      .map(({ state, left, width }) => ({ state, left, width, cap })),
  ).toEqual([]);
});

function sliderWidth(page: Page) {
  return card(page)
    .locator('.fb-slider')
    .evaluate((element) => element.getBoundingClientRect().width);
}

test('the effort slider keeps its width after reopening and after returning from the list', async ({
  page,
}) => {
  const list = await openModelList(page);

  await searchField(page).fill('browser/thinker');
  await list.locator('.fb-model-selector__option[title="browser/thinker"]').click();

  await expect(slider(page)).toBeVisible();

  const widths = [await sliderWidth(page)];

  await page.keyboard.press('Escape');

  await expect(card(page)).toBeHidden();

  await trigger(page).click();

  await expect(slider(page)).toBeVisible();

  widths.push(await sliderWidth(page));

  await page.locator('.fb-model-selector__model').click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await expect(slider(page)).toBeVisible();

  widths.push(await sliderWidth(page));

  expect(widths[0]).toBeGreaterThan(0);
  expect(widths.filter((width) => Math.abs(width - widths[0]) > 0.5)).toEqual([]);
});

test('a 280px window caps the popover to the viewport and keeps its width while searching', async ({
  page,
}) => {
  await page.setViewportSize({ width: 280, height: 720 });

  const list = await openModelList(page);
  const boxes = [{ state: 'list', ...(await cardBox(page)) }];

  await searchField(page).fill('browser/thinker');

  await expect(list.locator('.fb-model-selector__option')).toHaveCount(1);

  boxes.push({ state: 'one row', ...(await cardBox(page)) });

  await searchField(page).fill('zzzz-no-model');

  await expect(list.locator('.fb-model-selector__empty')).toHaveText('No models found');

  boxes.push({ state: 'no results', ...(await cardBox(page)) });

  const { viewportCap, viewport } = await cardWidths(page);

  expect(
    boxes
      .filter(
        ({ left, right, width }) =>
          Math.abs(width - viewportCap) > 0.5 ||
          Math.abs(width - boxes[0].width) > 0.5 ||
          left < 0 ||
          right > viewport,
      )
      .map((box) => ({ ...box, viewportCap, viewport })),
  ).toEqual([]);
});

async function renameModels({ page, names }: { page: Page; names: Record<string, string> }) {
  await page.route(
    (url) => url.pathname === '/api/agents',
    async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { agents: PickerManifest[] };

      const agents = body.agents.map((agent) => ({
        ...agent,
        names: {
          ...agent.names,
          ...Object.fromEntries(Object.entries(names).filter(([id]) => agent.models.includes(id))),
        },
      }));

      await route.fulfill({ response, json: { ...body, agents } });
    },
  );

  await page.reload();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await choosePickerAgent(page);
}

test('a long model name truncates on one line and keeps its ID in the row title', async ({
  page,
}) => {
  const id = 'browser/deliberator';
  const name = 'Deliberator Extended Thinking Preview with an Unusually Long Catalog Name';

  await renameModels({ page, names: { [id]: name } });

  const list = await openModelList(page);
  const row = list.getByRole('button', { name, exact: true });

  await searchField(page).fill(id);

  await expect(row).toHaveAttribute('title', id);
  expect(
    await row.locator('.fb-model-selector__option-name').evaluate((element) => {
      const style = getComputedStyle(element);

      return {
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        truncated: element.scrollWidth > element.clientWidth,
        oneLine: element.getBoundingClientRect().height <= parseFloat(style.lineHeight) + 0.5,
      };
    }),
  ).toEqual({ whiteSpace: 'nowrap', textOverflow: 'ellipsis', truncated: true, oneLine: true });

  const { cap } = await cardWidths(page);

  expect((await cardBox(page)).width).toBeCloseTo(cap, 0);
});

function searchBoxStyle(search: Locator) {
  return search.evaluate((element) => {
    const probe = document.createElement('span');

    probe.style.backgroundColor = 'var(--theme-base-200)';
    probe.style.color = 'var(--theme-base-300)';
    probe.style.boxShadow = '0 0 0 2px var(--theme-base-400)';
    element.parentElement!.append(probe);

    const style = getComputedStyle(element);
    const token = getComputedStyle(probe);

    const result = {
      actual: {
        backgroundColor: style.backgroundColor,
        borderTopColor: style.borderTopColor,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
      },
      expected: {
        backgroundColor: token.backgroundColor,
        borderTopColor: token.color,
        borderTopWidth: '1px',
        boxShadow: token.boxShadow,
      },
    };

    probe.remove();

    return result;
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`the ${theme} model search box uses the input background, border and focus ring`, async ({
    page,
  }) => {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme,
    );

    await openModelList(page);
    await searchField(page).focus();

    const { actual, expected } = await searchBoxStyle(page.locator('.fb-model-selector__search'));

    expect(expected.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(actual).toEqual(expected);
  });
}

const shortNames = { 'browser/questioner': 'o3', 'browser/sprinter': 'o4' };

async function composerLayout(page: Page) {
  return page.locator('.fb-composer').evaluate(async (composer) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const round = (value: number) => Math.round(value * 2) / 2;

    const box = (element: Element) => {
      const { left, top, width, height } = element.getBoundingClientRect();

      return [left, top, width, height].map(round);
    };

    const selector = composer.querySelector('.fb-model-selector__trigger')!.getBoundingClientRect();
    const start = composer.querySelectorAll(
      '.fb-composer__start > :not(.fb-model-selector__trigger)',
    );

    return {
      textarea: box(composer.querySelector('textarea')!),
      start: Array.from(start).map(box),
      end: Array.from(composer.querySelectorAll('.fb-composer__end > *')).map(box),
      trigger: [round(selector.left), round(selector.top)],
      controls: round(
        composer.querySelector('.fb-composer__controls')!.getBoundingClientRect().height,
      ),
    };
  });
}

async function sweepComposer({ page, label }: { page: Page; label: string }) {
  const results = [];

  for (let width = 320; width <= 480; width += 10) {
    await page.setViewportSize({ width, height: 720 });

    const closed = await composerLayout(page);

    await trigger(page).click();

    await expect(trigger(page)).toHaveText(label);

    const open = await composerLayout(page);

    await page.keyboard.press('Escape');

    await expect(card(page)).toBeHidden();

    results.push({ width, closed, open });
  }

  return results;
}

test('the open Select model label does not move or wrap the composer from 320 to 480px', async ({
  page,
}) => {
  await renameModels({ page, names: shortNames });

  await expect(triggerName(page)).toHaveText('o3');

  const results = await sweepComposer({ page, label: 'Select model' });

  expect(results.map(({ width, open }) => ({ width, layout: open }))).toEqual(
    results.map(({ width, closed }) => ({ width, layout: closed })),
  );
});

test('the open Select effort label does not move or wrap the composer from 320 to 480px', async ({
  page,
}) => {
  await renameModels({ page, names: shortNames });

  const list = await openModelList(page);

  await searchField(page).fill('browser/sprinter');
  await list.locator('.fb-model-selector__option[title="browser/sprinter"]').click();

  await expect(trigger(page)).toHaveText('Select effort');

  await page.keyboard.press('Escape');

  await expect(trigger(page)).toHaveText('o4 · Default');

  const results = await sweepComposer({ page, label: 'Select effort' });

  expect(results.map(({ width, open }) => ({ width, layout: open }))).toEqual(
    results.map(({ width, closed }) => ({ width, layout: closed })),
  );
});

async function plainModel(page: Page) {
  const { models, reasoning = {} } = await pickerManifest(page);

  const id = models.find(
    (model) =>
      model !== 'browser/questioner' &&
      !reasoning[model]?.length &&
      !models.some((other) => other !== model && other.includes(model)),
  )!;

  await choosePickerAgent(page);

  return id;
}

async function searchFor({ page, id }: { page: Page; id: string }) {
  const list = await openModelList(page);

  await searchField(page).fill(id);

  await expect(list.locator('.fb-model-selector__option').first()).toHaveAttribute('title', id);

  return list;
}

test('Enter in the search on a model without effort options closes and focuses the trigger', async ({
  page,
}) => {
  const id = await plainModel(page);

  await searchFor({ page, id });
  await searchField(page).press('Enter');

  await expect(card(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => savedPicks(page)).toMatchObject({ agent: pickerAgentSlug, model: id });
});

test('Space on a row without effort options closes and focuses the trigger', async ({ page }) => {
  const id = await plainModel(page);

  const list = await searchFor({ page, id });

  await page.keyboard.press('ArrowDown');

  await expect(list.locator('.fb-model-selector__option').first()).toBeFocused();

  await page.keyboard.press('Space');

  await expect(card(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => savedPicks(page)).toMatchObject({ agent: pickerAgentSlug, model: id });
});

test('reopening after a choice closed the selector shows the full list with an empty search', async ({
  page,
}) => {
  const id = await plainModel(page);

  await searchFor({ page, id });
  await searchField(page).press('Enter');

  await expect(card(page)).toBeHidden();

  const list = await openModelList(page);

  await expect(searchField(page)).toHaveValue('');
  await expect(list.locator('.fb-model-selector__option:focus')).toHaveAttribute('title', id);
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
});

test('a saved pick the agent no longer offers shows the default model and opens on the list', async ({
  page,
}) => {
  const saved = await page.request.post(`/api/payload-preferences/${chatPicksPreference}`, {
    data: { value: { agent: pickerAgentSlug, model: 'browser/retired', reasoning: {} } },
  });

  expect(saved.ok()).toBe(true);

  await page.reload();

  await expect(page.locator('.fb-agent-selector__trigger')).toHaveText(pickerAgentSlug);
  await expect(trigger(page)).toHaveText('questioner');

  const list = await openModelList(page);

  await expect(list.locator('.fb-model-selector__option:focus')).toHaveAttribute(
    'title',
    'browser/questioner',
  );
});

async function dropModel({ page, id }: { page: Page; id: string }) {
  await page.route(
    (url) => url.pathname === '/api/agents',
    async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { agents: PickerManifest[] };

      const agents = body.agents.map((agent) =>
        agent.slug === pickerAgentSlug
          ? { ...agent, models: agent.models.filter((model) => model !== id) }
          : agent,
      );

      await route.fulfill({ response, json: { ...body, agents } });
    },
  );

  await page.reload();

  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await choosePickerAgent(page);
}

test('an active model missing from the list opens on the list with the search focused', async ({
  page,
}) => {
  await dropModel({ page, id: 'browser/questioner' });

  await expect(trigger(page)).toHaveText('browser/questioner');

  const list = await openModelList(page);

  await expect(searchField(page)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  await expect(list.locator('.fb-model-selector__option[aria-current]')).toHaveCount(0);
});
