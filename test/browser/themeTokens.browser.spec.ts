import { expect, type Page, test, type TestInfo } from '@playwright/test';

import { type AdminTheme, setAdminTheme } from './__helpers/adminTheme';
import { aiFieldName, chatsSlug, tasksSlug } from './fixtures/question/shared';

const day = '2026-01-15';

const nav = '.frogbot-nav-shell';

const surfaces = [
  {
    name: 'list',
    path: `/collections/${tasksSlug}?columns=${encodeURIComponent(JSON.stringify(['title', aiFieldName]))}`,
    ready: [nav, '.collection-list', `td.cell-${aiFieldName}`],
  },
  {
    name: 'board',
    path: `/collections/${tasksSlug}/board`,
    ready: [nav, '.collection-view-shell'],
  },
  {
    name: 'calendar',
    path: `/collections/${tasksSlug}/calendar?mode=month&date=${day}T00:00:00.000Z`,
    ready: [nav, '.collection-view-shell'],
  },
  { name: 'settings', path: '/settings/collections', ready: ['.frogbot-settings-template'] },
  { name: 'chat', path: `/collections/${chatsSlug}/create`, ready: [nav, '.frogbot-chat-view'] },
];

type Unresolved = { name: string; selector: string };

function findUnresolvedVars(page: Page) {
  return page.evaluate(() => {
    const unresolved = new Map<string, { name: string; selector: string }>();

    const visit = (rules: CSSRuleList, inFrogBot: boolean) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSLayerBlockRule) {
          visit(rule.cssRules, inFrogBot || rule.name.split('.').includes('frogbot'));
        } else if (rule instanceof CSSStyleRule) {
          if (inFrogBot) check(rule);
          if (rule.cssRules.length) visit(rule.cssRules, inFrogBot);
        } else if ('cssRules' in rule) {
          visit((rule as CSSGroupingRule).cssRules, inFrogBot);
        }
      }
    };

    const check = (rule: CSSStyleRule) => {
      const names = Array.from(rule.style.cssText.matchAll(/var\((--[\w-]+)\)/g), (m) => m[1]);
      if (!names.length) return;

      let elements: Element[];

      try {
        elements = Array.from(document.querySelectorAll(rule.selectorText)).slice(0, 5);
      } catch {
        return;
      }

      for (const element of elements) {
        const style = getComputedStyle(element);

        for (const name of names) {
          if (style.getPropertyValue(name).trim()) continue;
          unresolved.set(`${rule.selectorText} ${name}`, { name, selector: rule.selectorText });
        }
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        visit(sheet.cssRules, false);
      } catch {
        continue;
      }
    }

    return [...unresolved.values()];
  });
}

async function attach(page: Page, testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(`${name}.png`);

  await page.screenshot({ fullPage: true, path: file });
  await testInfo.attach(name, { contentType: 'image/png', path: file });
}

test.beforeAll(async ({ request }) => {
  const response = await request.post(`/api/${tasksSlug}`, {
    data: { dueAt: `${day}T09:00:00.000Z`, title: 'Theme tokens' },
  });

  expect(response.ok()).toBe(true);
});

for (const theme of ['light', 'dark'] as AdminTheme[]) {
  test.describe(`admin theme tokens, ${theme}`, () => {
    for (const surface of surfaces) {
      test(`${surface.name} resolves every FrogBot var()`, async ({ page }, testInfo) => {
        await setAdminTheme(page, theme);
        await page.goto(surface.path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        for (const selector of surface.ready) {
          await expect(page.locator(selector).first()).toBeVisible();
        }

        await attach(page, testInfo, `${surface.name}-${theme}`);

        const unresolved: Unresolved[] = await findUnresolvedVars(page);

        expect(unresolved).toEqual([]);
      });
    }
  });
}
