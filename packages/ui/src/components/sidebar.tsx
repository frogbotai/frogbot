'use client'

import { type ComponentProps, createContext, useContext, useState } from 'react'

import { useHotkey } from '../hooks/use-hotkey'
import { useIsMobile } from '../hooks/use-mobile'
import { cn } from '../lib/utils'
import { Sheet, SheetContent, SheetTitle } from './sheet'

interface SidebarValue { isMobile: boolean; open: boolean; openMobile: boolean; setOpen: (open: boolean) => void; setOpenMobile: (open: boolean) => void; toggleSidebar: () => void }
const SidebarContext = createContext<SidebarValue | null>(null)
export function useSidebar() { const value = useContext(SidebarContext); if (!value) throw new Error('useSidebar must be used within SidebarProvider'); return value }
export function SidebarProvider({ children, className, defaultOpen = true, onOpenChange, open: controlledOpen, ...props }: ComponentProps<'div'> & { defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const isMobile = useIsMobile()
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const [openMobile, setOpenMobile] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (next: boolean) => { if (controlledOpen === undefined) setInternalOpen(next); onOpenChange?.(next) }
  const toggleSidebar = () => isMobile ? setOpenMobile(!openMobile) : setOpen(!open)
  useHotkey('b', toggleSidebar, { meta: true })
  return <SidebarContext.Provider value={{ isMobile, open, openMobile, setOpen, setOpenMobile, toggleSidebar }}><div className={cn('flex min-h-svh w-full', className)} {...props}>{children}</div></SidebarContext.Provider>
}
export function Sidebar({ children, className, side = 'left', ...props }: ComponentProps<'aside'> & { side?: 'left' | 'right' }) {
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar()
  if (isMobile) return <Sheet open={openMobile} onOpenChange={setOpenMobile}><SheetContent className="w-72 bg-sidebar p-0 text-sidebar-foreground" side={side}><SheetTitle className="sr-only">Sidebar</SheetTitle>{children}</SheetContent></Sheet>
  return <aside className={cn('w-64 border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] data-[closed=true]:w-0', className)} data-closed={!open} {...props}>{children}</aside>
}
export function SidebarInset({ className, ...props }: ComponentProps<'main'>) { return <main className={cn('min-w-0 flex-1', className)} {...props} /> }
export function SidebarTrigger({ className, ...props }: ComponentProps<'button'>) { const { toggleSidebar } = useSidebar(); return <button {...props} aria-label="Toggle sidebar" className={className} onClick={toggleSidebar} type="button" /> }
