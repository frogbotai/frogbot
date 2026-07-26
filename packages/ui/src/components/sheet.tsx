'use client'

import * as Primitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '../lib/utils'

export const Sheet = Primitive.Root
export const SheetTrigger = Primitive.Trigger
export const SheetClose = Primitive.Close
export function SheetContent({ children, className, side = 'right', ...props }: ComponentProps<typeof Primitive.Content> & { side?: 'top' | 'right' | 'bottom' | 'left' }) {
  const sides = { top: 'inset-x-0 top-0 border-b', right: 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm', bottom: 'inset-x-0 bottom-0 border-t', left: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm' }
  return <Primitive.Portal><Primitive.Overlay className="fixed inset-0 z-50 bg-black/80" /><Primitive.Content className={cn('fixed z-50 bg-background p-6 shadow-lg', sides[side], className)} {...props}>{children}<Primitive.Close className="absolute right-4 top-4 opacity-70"><X className="size-4" /><span className="sr-only">Close</span></Primitive.Close></Primitive.Content></Primitive.Portal>
}
export function SheetHeader({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('flex flex-col gap-2 text-center sm:text-left', className)} {...props} /> }
export function SheetFooter({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2', className)} {...props} /> }
export function SheetTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) { return <Primitive.Title className={cn('text-lg font-semibold', className)} {...props} /> }
export function SheetDescription({ className, ...props }: ComponentProps<typeof Primitive.Description>) { return <Primitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} /> }
