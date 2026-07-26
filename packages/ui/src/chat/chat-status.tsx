import type { ReactNode } from 'react'

export type ChatStatusProps = {
  error?: Error
  aborted?: boolean
  errorContent?: (error: Error) => ReactNode
  abortedContent?: ReactNode
  warningContent?: ReactNode
}

export function ChatStatus({ aborted, abortedContent, error, errorContent, warningContent }: ChatStatusProps) {
  return <>
    {warningContent && <div>{warningContent}</div>}
    {aborted && abortedContent && <div>{abortedContent}</div>}
    {error && errorContent && <div role="alert">{errorContent(error)}</div>}
  </>
}
