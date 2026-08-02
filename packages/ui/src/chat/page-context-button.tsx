'use client'

import { PlusCircleIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip'
import { CheckIcon } from '../icons/check'
import BookOpenIcon from '../icons/icons/BookOpenIcon'
import XIcon from '../icons/icons/XIcon'
import { cn } from '../lib/utils'

export interface PageContextTab {
  active: boolean
  id: number
  title: string
  url: string
}

export interface PageContextButtonProps {
  addPageContext: (tabId: number) => Promise<void>
  getOpenTabs: () => Promise<{ success: boolean; tabs?: PageContextTab[] }>
  isCompact?: boolean
  isLoading: boolean
  removePageContext: (tabId: number) => void
  selectedTabIds: Set<number>
}

export function PageContextButton({ addPageContext, getOpenTabs, isCompact, isLoading, removePageContext, selectedTabIds }: PageContextButtonProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [tabs, setTabs] = useState<PageContextTab[]>([])
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setShowMenu(false), [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const outsideMenu = menuRef.current ? !menuRef.current.contains(event.target as Node) : true
      const outsideButton = buttonRef.current ? !buttonRef.current.contains(event.target as Node) : true
      if (outsideMenu && outsideButton) closeMenu()
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [closeMenu, showMenu])

  const handleClick = useCallback(async (event: React.MouseEvent) => {
    event.preventDefault()
    if (showMenu) {
      closeMenu()
      return
    }
    const result = await getOpenTabs()
    if (result.success && result.tabs) {
      setTabs(result.tabs)
      setShowMenu(true)
    }
  }, [closeMenu, getOpenTabs, showMenu])

  const handleTabToggle = useCallback((tabId: number) => {
    if (selectedTabIds.has(tabId)) removePageContext(tabId)
    else void addPageContext(tabId)
  }, [addPageContext, removePageContext, selectedTabIds])

  return <div className="relative inline-block overflow-visible border-none bg-base-200 p-0 outline-none">
    <Tooltip>
      <TooltipTrigger asChild><button ref={buttonRef} type="button" aria-label="Add tab context" className={cn('slide-up-1 clear-button rounded-full p-1.5 text-base-700 hover:bg-base-300 hover:text-base-1000 active:bg-base-400 active:text-base-1000 sm:p-[9px]', showMenu && 'bg-base-300')} onClick={handleClick} disabled={isLoading}><BookOpenIcon className={cn('size-5', !isCompact && 'sm:size-[22px]')} /></button></TooltipTrigger>
      <TooltipContent align="center" side="top">Add tab context</TooltipContent>
    </Tooltip>
    {showMenu && buttonRef.current && createPortal(<div ref={menuRef} className="fixed z-50 flex w-[400px] max-w-[calc(100vw-16px)] flex-col rounded-lg border border-solid border-base-300 bg-base-250 py-4 shadow-lg" style={{
      left: (() => {
        const buttonRect = buttonRef.current!.getBoundingClientRect()
        const actualWidth = Math.min(400, window.innerWidth - 16)
        const calculatedLeft = buttonRect.left + buttonRect.width / 2 - actualWidth / 2
        return Math.max(8, Math.min(calculatedLeft, window.innerWidth - actualWidth - 8))
      })(),
      bottom: window.innerHeight - buttonRef.current.getBoundingClientRect().top + 10,
    }}>
      <div className="flex items-center justify-between px-4 pb-2"><h3 className="text-base font-bold text-base-700">Add tabs</h3><button type="button" aria-label="Close tab menu" onClick={closeMenu} className="clear-button text-base-600 transition-colors hover:text-base-800"><XIcon className="size-5" /></button></div>
      <div className="flex max-h-[300px] flex-col gap-1 overflow-y-auto pl-1 pr-2">{tabs.map((tab) => {
        const faviconUrl = tab.url ? `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=32` : null
        return <div key={tab.id} onClick={() => handleTabToggle(tab.id)} className="clear-button slide-right-1 flex w-full items-center gap-2 rounded-lg border-none px-3 py-2 text-left transition-colors hover:bg-base-300">{faviconUrl ? <img src={faviconUrl} alt="" className="size-6 rounded" /> : <div className="size-6 rounded-full bg-base-800" />}<p className="flex-1 truncate text-sm font-medium text-base-700">{tab.title}</p><div className={cn('flex size-4 items-center justify-center rounded-full transition-colors', selectedTabIds.has(tab.id) ? 'border-green-500 bg-green-400' : 'border-base-400 bg-transparent')}>{selectedTabIds.has(tab.id) ? <CheckIcon size={10} className="text-base-100" /> : <PlusCircleIcon size={16} />}</div></div>
      })}</div>
    </div>, document.body)}
  </div>
}
