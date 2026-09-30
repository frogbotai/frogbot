import { expect, type Locator, type Page, test } from '@playwright/test';

import { signIn, user } from './__helpers/signIn';
import { chatPicksPreference, chatsSlug, pickerAgentSlug } from './fixtures/question/shared';

test.setTimeout(120_000);

test.beforeAll(async ({ request }) => {
  const response = await request.get('/api/users/init');

  expect(response.ok()).toBe(true);

  const { initialized } = await response.json();

  if (!initialized) {
    const registration = await request.post('/api/users/first-register', { data: user });

    expect(registration.ok()).toBe(true);
  }
});

test.beforeEach(async ({ page }) => {
  await signIn(page);

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  await page.goto(`/collections/${chatsSlug}/create`);
  await expect(page.locator('.fb-composer textarea')).toBeVisible();

  await page.locator('.fb-agent-selector__trigger').click();
  await page.getByRole('menuitem', { name: pickerAgentSlug, exact: true }).click();

  await expect(page.locator('.fb-agent-selector__trigger')).toHaveText(pickerAgentSlug);
});

test.afterEach(async ({ context, page }) => {
  await context.setOffline(false);

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

async function openModelList(page: Page) {
  await page.locator('.fb-model-selector__trigger').click();
  await page.locator('.fb-model-selector__model').click();

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

  await page.keyboard.type('opus');

  await expect(searchField(page)).toBeFocused();
  await expect(searchField(page)).toHaveValue('opus');

  await page.keyboard.press('ArrowDown');

  const first = list.locator('.fb-model-selector__option').first();

  await expect(first).toBeFocused();

  const id = await first.getAttribute('title');
  const name = await first.locator('.fb-model-selector__option-name').textContent();

  expect(id).toMatch(/opus/i);
  expect(name).toMatch(/opus/i);

  await page.keyboard.press('Enter');

  await expect(page.locator('.fb-model-selector__trigger .fb-model-selector__name')).toHaveText(
    name!,
  );
  await expect.poll(() => savedPicks(page)).toMatchObject({ agent: pickerAgentSlug, model: id });
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

  await expect(rows).toHaveCount(2);
  await expect(rows.locator('.fb-model-selector__option-name')).toHaveText([
    'questioner',
    'thinker',
  ]);
  await expect(rows.nth(0)).toHaveAttribute('title', 'browser/questioner');
  await expect(rows.nth(1)).toHaveAttribute('title', 'browser/thinker');
  await expect(rows.locator('svg.lucide-sparkle-icon')).toHaveCount(2);
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
    'browser/thinker',
  ]);
});

type PickerManifest = { slug: string; models: string[]; names?: Record<string, string> };

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

  await expect(page.locator('.fb-model-selector__trigger .fb-model-selector__name')).toHaveText(
    'questioner',
  );
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

  await expect(page.locator('.fb-model-selector__trigger .fb-model-selector__name')).toHaveText(
    'thinker',
  );
  await expect(searchField(page)).toBeHidden();
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
  await page.locator('.fb-agent-selector__trigger').click();
  await page.getByRole('menuitem', { name: pickerAgentSlug, exact: true }).click();
  await page.setViewportSize({ width: 320, height: 720 });

  const list = await openModelList(page);
  const row = list.locator(`.fb-model-selector__option[title="${id}"]`);

  await searchField(page).fill(id);

  if (choose) {
    await row.click();
    await page.locator('.fb-model-selector__model').click();
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
  const { names = {} } = await pickerManifest(page);
  const [id] = Object.entries(names).sort(([, a], [, b]) => b.length - a.length)[0];

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
