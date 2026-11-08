import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import * as icons from '../../../../packages/ui/src/exports/icons';
import { branchIcon } from '../../../../packages/ui/src/icons/icons/BranchIcon';
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
  'BrandAmexIcon',
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
  'BrandChatGptIcon',
  'ChangeScreenModeIcon',
  'BrandChromeIcon',
  'CheckmarkCircleIcon',
  'CheckmarkIcon',
  'CheckListIcon',
  'BrandClaudeAiIcon',
  'CloseIcon',
  'ComputerIcon',
  'ConfettiIcon',
  'CopyIcon',
  'CursorIcon',
  'DeleteIcon',
  'BrandDiscoverIcon',
  'DocxIcon',
  'DownloadIcon',
  'HourglassIcon',
  'HomeIcon',
  'InfoCircleIcon',
  'InvalidStepIcon',
  'KeyboardIcon',
  'KeyRoundIcon',
  'PencilIcon',
  'BrandFacebookIcon',
  'FileIcon',
  'FirmwareFavicon',
  'FrogBotFavicon',
  'FolderIcon',
  'BrandGoogleGeminiIcon',
  'BrandDropboxIcon',
  'BrandGitHubIcon',
  'BrandGoogleIcon',
  'BrandMicrosoftIcon',
  'BrandNotionIcon',
  'BrandSlackIcon',
  'BrandStripeIcon',
  'BrandXeroIcon',
  'BrandZoomIcon',
  'ImageIcon',
  'BrandInstagramIcon',
  'BrandLinkedInIcon',
  'LinkSquareIcon',
  'ListIcon',
  'LockIcon',
  'GoBackwardIcon',
  'GoForwardIcon',
  'LoadingIcon',
  'LogoutRightIcon',
  'MagicWandIcon',
  'BrandMastercardIcon',
  'BrandMcpIcon',
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
  'BrandRedditIcon',
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
  'BrandTwitterIcon',
  'UploadIcon',
  'UserAddIcon',
  'VideoIcon',
  'BrandVisaIcon',
  'WebIcon',
  'WrenchIcon',
  'XIcon',
  'BrandYoutubeIcon',
  'BoltIcon',
  'BookmarkIcon',
  'BriefcaseIcon',
  'BuildingIcon',
  'CalendarIcon',
  'ChartBarIcon',
  'ClockIcon',
  'CodeIcon',
  'CoinsIcon',
  'DatabaseIcon',
  'EyeIcon',
  'FilterIcon',
  'FlagIcon',
  'HeartIcon',
  'LayersIcon',
  'LightbulbIcon',
  'MailIcon',
  'MapPinIcon',
  'MegaphoneIcon',
  'NewspaperIcon',
  'PackageIcon',
  'PaletteIcon',
  'ReceiptIcon',
  'SearchIcon',
  'ShieldIcon',
  'ShoppingCartIcon',
  'TicketIcon',
  'ActivityIcon',
  'AirplaneIcon',
  'ArchiveIcon',
  'AtIcon',
  'BedIcon',
  'BrainIcon',
  'BranchIcon',
  'BugIcon',
  'CarIcon',
  'ClipboardIcon',
  'CloudIcon',
  'CreditCardIcon',
  'DollarIcon',
  'DashboardIcon',
  'DumbbellIcon',
  'FlaskIcon',
  'GiftIcon',
  'GraduationCapIcon',
  'HeadsetIcon',
  'HierarchyIcon',
  'HistoryIcon',
  'IdCardIcon',
  'InboxIcon',
  'KanbanIcon',
  'LockCheckIcon',
  'MapIcon',
  'MusicIcon',
  'NoteIcon',
  'PawIcon',
  'PercentIcon',
  'PhoneIcon',
  'PlugIcon',
  'QrCodeIcon',
  'RocketIcon',
  'ScaleIcon',
  'ServerIcon',
  'SignpostIcon',
  'StethoscopeIcon',
  'StoreIcon',
  'TableIcon',
  'TargetIcon',
  'TerminalIcon',
  'TransferIcon',
  'TrophyIcon',
  'TruckIcon',
  'UserShieldIcon',
  'UtensilsIcon',
  'VolumeIcon',
  'WalletIcon',
  'WorkflowIcon',
  'AwardIcon',
  'BadgeCheckIcon',
  'CrownIcon',
  'FlameIcon',
  'GemIcon',
  'HandCoinsIcon',
  'MedalIcon',
  'MoneyBagIcon',
  'PodiumIcon',
  'SparklesIcon',
  'TrendingDownIcon',
  'TrendingUpIcon',
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
    const gemini = render(createElement(icons.BrandGoogleGeminiIcon));

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

  it('draws BranchIcon as a split on the 20 grid', () => {
    expect(branchIcon.map(([, attributes]) => attributes.d)).toEqual([
      'M17.5 7.0833V5.5C17.5 4.0858 17.5 3.3787 17.0607 2.9393 16.6213 2.5 15.9143 2.5 14.5 2.5H12.9167M16.6667 3.3333L12.0833 7.9167',
      'M2.5 7.0833V5.5C2.5 4.0858 2.5 3.3787 2.9393 2.9393 3.3787 2.5 4.0858 2.5 5.5 2.5H7.0833M3.3333 3.3333L8.0474 8.0474C9.0108 9.0108 9.4925 9.4925 9.7462 10.1051 10 10.7177 10 11.3989 10 12.7614V17.5',
    ]);
    expect(
      render(createElement(icons.BranchIcon))
        .container.querySelector('svg')
        ?.getAttribute('viewBox'),
    ).toBe('0 0 20 20');
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
      expect.arrayContaining([...iconNames, 'CheckIcon', 'MenuIcon', 'SquareIcon', 'StarIcon']),
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
