import { render } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import * as icons from '../exports/icons'

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
  'PencilIcon',
  'FacebookIcon',
  'FileIcon',
  'FirmwareFavicon',
  'FrogBotFavicon',
  'FolderIcon',
  'GoogleGeminiIcon',
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
] as const

describe('firmware icons', () => {
  it('exports the complete icon manifest', () => {
    expect(Object.keys(icons).sort()).toEqual([
      ...iconNames,
      'CheckIcon',
      'IconBase',
      'MenuIcon',
      'createLucideIcon',
    ].sort())
  })

  it('renders every exported icon', () => {
    for (const name of [...iconNames, 'CheckIcon', 'MenuIcon'] as const) {
      const component = icons[name as keyof typeof icons]
      const { container, unmount } = render(createElement(component))
      expect(container.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  it('renders both structural outliers', () => {
    const gemini = render(createElement(icons['GoogleGeminiIcon' as keyof typeof icons]))
    expect(gemini.container.querySelector('defs')).not.toBeNull()
    expect(gemini.container.querySelector('radialGradient')).not.toBeNull()
    expect(gemini.container.querySelector('clipPath')).not.toBeNull()
    gemini.unmount()

    const invalid = render(createElement(icons['InvalidStepIcon' as keyof typeof icons]))
    expect(invalid.container.querySelector('svg')).not.toBeNull()
  })

  it('supports factory defaults and icon prop overrides', () => {
    const createLucideIcon = icons['createLucideIcon' as keyof typeof icons] as unknown as (
      name: string,
      node: Array<[string, Record<string, string>]>,
      strokeWidth?: number,
      viewBox?: string,
    ) => React.ComponentType<{ absoluteStrokeWidth?: boolean; color?: string; size?: number }>
    const TestIcon = createLucideIcon('T', [['path', { d: 'M0 0' }]], 0, '0 0 20 20')
    const { container } = render(<TestIcon absoluteStrokeWidth color="red" size={10} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 20 20')
    expect(svg?.getAttribute('stroke-width')).toBe('0')
    expect(svg?.getAttribute('width')).toBe('10')
    expect(svg?.getAttribute('height')).toBe('10')
    expect(svg?.getAttribute('stroke')).toBe('red')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })
})
