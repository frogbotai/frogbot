import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import * as icons from '../../../../packages/ui/src/exports/icons';
import type { IconNode, LucideIcon, LucideProps } from '../../../../packages/ui/src/icons/types';
import {
  excludedIcons,
  type LoadedIcon,
  loadIcons,
  shapeStrokes,
} from '../../../__helpers/shared/icons';

const loadedIcons = await loadIcons();
const strokedIcons = loadedIcons.filter(({ name }) => !(name in excludedIcons));

const iconNames = [
  'AiSearchIcon',
  'AiUserIcon',
  'AmexIcon',
  'ArrowDownFilledIcon',
  'ArrowDownIcon',
  'ArrowExpandIcon',
  'ArrowUpFilledIcon',
  'ArrowUpIcon',
  'ChevronDownIcon',
  'ChevronLeftIcon',
  'ChevronRightIcon',
  'ChevronUpIcon',
  'BrowserIcon',
  'BubbleChatIcon',
  'AttachmentIcon',
  'BellIcon',
  'BookOpenIcon',
  'ChatGptIcon',
  'ChangeScreenModeIcon',
  'ChromeIcon',
  'CheckmarkCircleIcon',
  'CheckmarkIcon',
  'CheckListIcon',
  'ClaudeAiIcon',
  'CloseIcon',
  'ComputerIcon',
  'ConfettiIcon',
  'CopyIcon',
  'CursorIcon',
  'DeleteIcon',
  'DiscoverIcon',
  'DocxIcon',
  'DownloadIcon',
  'HourglassIcon',
  'HomeIcon',
  'InfoCircleIcon',
  'InvalidStepIcon',
  'KeyRoundIcon',
  'PencilIcon',
  'FacebookIcon',
  'FileIcon',
  'FirmwareFavicon',
  'FrogBotFavicon',
  'FolderIcon',
  'GoogleGeminiIcon',
  'DropboxIcon',
  'GitHubIcon',
  'GoogleIcon',
  'MicrosoftIcon',
  'NotionIcon',
  'SlackIcon',
  'StripeIcon',
  'XeroIcon',
  'ZoomIcon',
  'ImageIcon',
  'InstagramIcon',
  'LinkedInIcon',
  'LinkSquareIcon',
  'ListIcon',
  'LockIcon',
  'GoBackwardIcon',
  'GoForwardIcon',
  'LoadingIcon',
  'LogoutRightIcon',
  'MagicWandIcon',
  'MastercardIcon',
  'McpIcon',
  'MessageSquareTextIcon',
  'RefreshIcon',
  'MicIcon',
  'MinusIcon',
  'MoreHorizontalIcon',
  'MoreVerticalIcon',
  'PawnIcon',
  'PeopleIcon',
  'PdfIcon',
  'PencilEditIcon',
  'PinIcon',
  'PlusSignIcon',
  'ProfileIcon',
  'QuestionMarkCircleIcon',
  'RedoIcon',
  'RedditIcon',
  'RobotIcon',
  'RookIcon',
  'ScrollIcon',
  'SendIcon',
  'ResizeIcon',
  'SettingIcon',
  'SidebarLeftIcon',
  'SparkleIcon',
  'SquareLockIcon',
  'StopIcon',
  'StoplightIcon',
  'TagIcon',
  'ThumbsDownIcon',
  'TileIcon',
  'TimerIcon',
  'ThumbsUpIcon',
  'TwitterIcon',
  'UploadIcon',
  'UserAddIcon',
  'VideoIcon',
  'VisaIcon',
  'WebIcon',
  'WrenchIcon',
  'XIcon',
  'YoutubeIcon',
] as const;

describe('firmware icons', () => {
  it('exports the complete icon manifest', () => {
    expect(Object.keys(icons).sort()).toEqual(
      [
        ...iconNames,
        'CheckIcon',
        'IconBase',
        'MenuIcon',
        'SquareIcon',
        'StarIcon',
        'createLucideIcon',
      ].sort(),
    );
  });

  it('renders every exported icon', () => {
    for (const name of [...iconNames, 'CheckIcon', 'MenuIcon', 'SquareIcon', 'StarIcon'] as const) {
      const component = icons[name];
      const { container, unmount } = render(createElement(component));
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });

  it('renders both structural outliers', () => {
    const gemini = render(createElement(icons.GoogleGeminiIcon));
    expect(gemini.container.querySelector('defs')).not.toBeNull();
    expect(gemini.container.querySelector('radialGradient')).not.toBeNull();
    expect(gemini.container.querySelector('clipPath')).not.toBeNull();
    gemini.unmount();

    const invalid = render(createElement(icons.InvalidStepIcon));
    expect(invalid.container.querySelector('svg')).not.toBeNull();
  });

  it('draws bubble-chat as a closed bubble without a status dot', () => {
    const { container } = render(createElement(icons.BubbleChatIcon));
    const svg = container.querySelector('svg');
    const paints = [...container.querySelectorAll('[fill], [stroke]')].flatMap((element) => [
      element.getAttribute('fill'),
      element.getAttribute('stroke'),
    ]);

    expect(
      paints.filter((paint) => paint !== null && paint !== 'none' && paint !== 'currentColor'),
    ).toEqual([]);
    expect(container.querySelector('circle')).toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(container.querySelector('path')?.getAttribute('d')).toMatch(/Z$/);
  });

  it('supports factory defaults and icon prop overrides', () => {
    const createLucideIcon = icons['createLucideIcon' as keyof typeof icons] as unknown as (
      name: string,
      node: Array<[string, Record<string, string>]>,
      strokeWidth?: number,
      viewBox?: string,
    ) => React.ComponentType<{ absoluteStrokeWidth?: boolean; color?: string; size?: number }>;
    const TestIcon = createLucideIcon('T', [['path', { d: 'M0 0' }]], 0, '0 0 20 20');
    const { container } = render(<TestIcon absoluteStrokeWidth color="red" size={10} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 20 20');
    expect(svg?.getAttribute('stroke-width')).toBe('0');
    expect(svg?.getAttribute('width')).toBe('10');
    expect(svg?.getAttribute('height')).toBe('10');
    expect(svg?.getAttribute('stroke')).toBe('red');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});

const gridOf = (svg: SVGSVGElement) =>
  Math.max(
    ...svg
      .getAttribute('viewBox')!
      .trim()
      .split(/[\s,]+/)
      .slice(2)
      .map(Number),
  );

const pxAt20 = (strokeWidth: string | null, grid: number) => (Number(strokeWidth) * 20) / grid;

const isClose = (actual: number, expected: number) => Math.abs(actual - expected) < 0.005;

const round = (px: number) => Number(px.toFixed(2));

function renderSvg(Component: LucideIcon, props: LucideProps = {}) {
  const { container, unmount } = render(createElement(Component, props));

  return { svg: container.querySelector('svg')!, unmount };
}

function strokeProblems(stroked: LoadedIcon[]): string[] {
  return stroked.flatMap(({ name, Component }) => {
    const { svg, unmount } = renderSvg(Component);
    const grid = gridOf(svg);
    const problems: string[] = [];

    const px = pxAt20(svg.getAttribute('stroke-width'), grid);
    const target = name === 'MagicWandIcon' ? 1.75 : 2;

    if (!isClose(px, target)) {
      const hint =
        target === 2 ? ' — remove its stroke argument; IconBase derives it from the viewBox' : '';

      problems.push(`${name}: draws ${round(px)}px at 20px, expected ${target}px${hint}`);
    }

    for (const shape of svg.querySelectorAll('[stroke-width]')) {
      const shapePx = pxAt20(shape.getAttribute('stroke-width'), grid);
      const allowed = shapeStrokes[name];

      if (shapePx === 0 || (allowed !== undefined && isClose(shapePx, allowed))) continue;

      problems.push(
        allowed === undefined
          ? `${name}: a ${shape.tagName} sets its own stroke (${round(shapePx)}px at 20px); only ${Object.keys(shapeStrokes).join(' and ')} may`
          : `${name}: a ${shape.tagName} draws ${round(shapePx)}px at 20px, expected ${allowed}px`,
      );
    }

    unmount();

    return problems;
  });
}

describe('icon line weight', () => {
  it('every stroked icon draws 2px at 20px', () => {
    expect(strokeProblems(strokedIcons)).toEqual([]);
  });

  it('the weight guard names a stroked icon that misses the target', () => {
    const WrongGrid = icons.createLucideIcon(
      'WrongGrid',
      [['path', { d: 'M4 16h24' }]],
      2,
      '0 0 32 32',
    );
    const ShapeStroke = icons.createLucideIcon(
      'ShapeStroke',
      [['path', { d: 'M4 12h16', strokeWidth: '1' }]],
      2.4,
    );

    const problems = strokeProblems([
      { name: 'WrongGrid', Component: WrongGrid },
      { name: 'ShapeStroke', Component: ShapeStroke },
    ]);

    expect(problems).toEqual([
      'WrongGrid: draws 1.25px at 20px, expected 2px — remove its stroke argument; IconBase derives it from the viewBox',
      'ShapeStroke: a path sets its own stroke (0.83px at 20px); only CursorIcon and InvalidStepIcon may',
    ]);
  });

  it('excluded icons keep their recorded root stroke', () => {
    const rendered = Object.fromEntries(
      loadedIcons
        .filter(({ name }) => name in excludedIcons)
        .map(({ name, Component }) => {
          const { svg, unmount } = renderSvg(Component);
          const strokeWidth = svg.getAttribute('stroke-width');

          unmount();

          return [name, strokeWidth === null ? null : Number(strokeWidth)];
        }),
    );

    expect(rendered).toEqual(excludedIcons);
  });

  it('the guard covers internal icons and has no stale exclusions', () => {
    const names = loadedIcons.map(({ name }) => name);

    expect(names).toEqual(
      expect.arrayContaining([
        ...iconNames,
        'BranchIcon',
        'CheckIcon',
        'MenuIcon',
        'SquareIcon',
        'StarIcon',
      ]),
    );
    expect(names).toEqual(
      expect.arrayContaining([...Object.keys(excludedIcons), ...Object.keys(shapeStrokes)]),
    );
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });
});

describe('icon stroke defaults', () => {
  const line: IconNode = [['path', { d: 'M4 12h16' }]];

  const strokeOf = (Component: LucideIcon, props: LucideProps = {}) => {
    const { svg, unmount } = renderSvg(Component, props);
    const strokeWidth = svg.getAttribute('stroke-width');

    unmount();

    return strokeWidth;
  };

  it('derives the default stroke from the viewBox', () => {
    const onGrid = (viewBox: string) =>
      strokeOf(icons.createLucideIcon('Grid', line, undefined, viewBox));

    expect(onGrid('0 0 24 24')).toBe('2.4');
    expect(onGrid('0 0 20 20')).toBe('2');
    expect(onGrid('0 0 48 48')).toBe('4.8');
    expect(strokeOf(icons.createLucideIcon('NoViewBox', line))).toBe('2.4');
  });

  it('gives IconBase on its own the 24-grid default', () => {
    const { container } = render(createElement(icons.IconBase, { iconNode: line }));

    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('2.4');
  });

  it('reads the grid from a viewBox with a negative origin or commas', () => {
    const onGrid = (viewBox: string) =>
      strokeOf(icons.createLucideIcon('Grid', line, undefined, viewBox));

    expect(onGrid('-0.92 -0.73 18 18')).toBe('1.8');
    expect(onGrid('0,0,20,20')).toBe('2');
  });

  it('draws exactly the requested px with absoluteStrokeWidth on any grid', () => {
    const drawnPx = (Component: LucideIcon, props: LucideProps) => {
      const { svg, unmount } = renderSvg(Component, {
        size: 32,
        absoluteStrokeWidth: true,
        ...props,
      });
      const px = (Number(svg.getAttribute('stroke-width')) * 32) / gridOf(svg);

      unmount();

      return px;
    };

    expect(drawnPx(icons.FileIcon, { strokeWidth: 2 })).toBeCloseTo(2, 5);
    expect(drawnPx(icons.FolderIcon, { strokeWidth: 2 })).toBeCloseTo(2, 5);
    expect(drawnPx(icons.FileIcon, {})).toBeCloseTo(2, 5);
    expect(drawnPx(icons.FolderIcon, {})).toBeCloseTo(2, 5);
  });

  it('scales the drawn line with size on the 24, 20, 48 and 16 grids', () => {
    const drawnPx = (Component: LucideIcon, size: number) => {
      const { svg, unmount } = renderSvg(Component, { size });
      const px = (Number(svg.getAttribute('stroke-width')) * size) / gridOf(svg);

      unmount();

      return px;
    };

    const scaled = [icons.FileIcon, icons.FolderIcon, icons.PeopleIcon, icons.SendIcon].map(
      (Component) => [drawnPx(Component, 16), drawnPx(Component, 24)],
    );

    scaled.forEach(([small, large]) => {
      expect(small).toBeCloseTo(1.6, 5);
      expect(large).toBeCloseTo(2.4, 5);
    });
  });

  it('uses a caller stroke as given', () => {
    expect(strokeOf(icons.CheckIcon, { strokeWidth: 4 })).toBe('4');
    expect(strokeOf(icons.FileIcon, { strokeWidth: 0 })).toBe('0');
  });

  it('follows a caller viewBox', () => {
    expect(strokeOf(icons.FileIcon, { viewBox: '0 0 48 48' })).toBe('4.8');
  });

  it('fills LockIcon and XIcon with no outline', () => {
    for (const Component of [icons.LockIcon, icons.XIcon]) {
      const { svg, unmount } = renderSvg(Component);
      const fills = [...svg.querySelectorAll('path')].map((path) => path.getAttribute('fill'));

      expect(svg.getAttribute('stroke-width')).toBe('0');
      expect(new Set(fills)).toEqual(new Set(['currentColor']));

      unmount();
    }
  });
});
