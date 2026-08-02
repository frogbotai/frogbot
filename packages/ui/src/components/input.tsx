import type { InputHTMLAttributes } from 'react'

import { cn } from '../lib/utils'

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('flex h-9 w-full appearance-none rounded-lg border border-solid border-base-300 bg-base-200 px-3 py-1 text-sm shadow-sm transition-colors outline-none placeholder:text-base-600 hover:border-base-400 focus:border-base-500 focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none', className)} type={type} {...props} />
}
