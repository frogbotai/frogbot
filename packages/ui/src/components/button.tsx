import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../lib/utils'

export const buttonVariants = cva('inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0', {
  variants: {
    variant: {
      default: 'bg-base-1000 text-base-200 hover:bg-base-700 active:bg-base-600',
      destructive: 'bg-red-500 text-base-900 hover:bg-red-700 active:bg-red-600',
      outline: 'border border-solid border-base-400 bg-base-250 hover:bg-base-350 active:bg-base-400',
      secondary: 'bg-base-250 hover:bg-base-350 active:bg-base-400',
      ghost: 'text-base-700 hover:bg-base-400 hover:text-base-1000 active:text-base-1000',
      link: 'text-primary underline-offset-4 hover:underline',
    },
    size: { default: 'h-9 px-4 py-2', sm: 'h-8 px-3', lg: 'h-10 px-6', icon: 'size-9' },
  },
  defaultVariants: { size: 'default', variant: 'default' },
})

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }

export function Button({ asChild, className, size, variant, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return <Component className={cn(buttonVariants({ className, size, variant }))} {...props} />
}
