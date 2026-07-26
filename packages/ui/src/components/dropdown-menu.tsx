'use client'

import * as Primitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'

import { cn } from '../lib/utils'

export const DropdownMenu = Primitive.Root
export const DropdownMenuTrigger = Primitive.Trigger
export const DropdownMenuGroup = Primitive.Group
export const DropdownMenuSub = Primitive.Sub
export const DropdownMenuRadioGroup = Primitive.RadioGroup
export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof Primitive.Content>) { return <Primitive.Portal><Primitive.Content className={cn('z-50 min-w-32 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md', className)} sideOffset={sideOffset} {...props} /></Primitive.Portal> }
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) { return <Primitive.Item className={cn('relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:opacity-50', className)} {...props} /> }
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) { return <Primitive.Label className={cn('px-2 py-1.5 text-sm font-semibold', className)} {...props} /> }
export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) { return <Primitive.Separator className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} /> }
export const DropdownMenuCheckboxItem = Primitive.CheckboxItem
export const DropdownMenuRadioItem = Primitive.RadioItem
export const DropdownMenuItemIndicator = Primitive.ItemIndicator
export const DropdownMenuSubTrigger = Primitive.SubTrigger
export const DropdownMenuSubContent = Primitive.SubContent
