'use client'

import * as Primitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '../lib/utils'

export const Select = Primitive.Root
export const SelectGroup = Primitive.Group
export const SelectValue = Primitive.Value
export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof Primitive.Trigger>) { return <Primitive.Trigger className={cn('flex h-9 w-full items-center justify-between whitespace-nowrap rounded-lg border border-solid border-base-300 bg-base-200 px-3 py-2 text-sm shadow-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1', className)} {...props}>{children}<Primitive.Icon><ChevronDown className="size-4 opacity-50" /></Primitive.Icon></Primitive.Trigger> }
export function SelectContent({ className, children, position = 'popper', ...props }: ComponentProps<typeof Primitive.Content>) { return <Primitive.Portal><Primitive.Content className={cn('relative z-50 max-h-96 min-w-32 overflow-hidden rounded-lg border border-solid border-base-300 bg-base-150 shadow-md', className)} position={position} {...props}><Primitive.ScrollUpButton className="flex justify-center py-1"><ChevronUp className="size-4" /></Primitive.ScrollUpButton><Primitive.Viewport className="p-1">{children}</Primitive.Viewport><Primitive.ScrollDownButton className="flex justify-center py-1"><ChevronDown className="size-4" /></Primitive.ScrollDownButton></Primitive.Content></Primitive.Portal> }
export function SelectLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) { return <Primitive.Label className={cn('px-2 py-1.5 text-sm font-semibold', className)} {...props} /> }
export function SelectItem({ className, children, ...props }: ComponentProps<typeof Primitive.Item>) { return <Primitive.Item className={cn('relative flex w-full cursor-default select-none items-center rounded-lg py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-base-200 focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}><Primitive.ItemText>{children}</Primitive.ItemText><Primitive.ItemIndicator className="absolute right-2"><Check className="size-4" /></Primitive.ItemIndicator></Primitive.Item> }
export function SelectSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) { return <Primitive.Separator className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} /> }
