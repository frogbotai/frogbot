import type { ReactNode } from 'react';

import { Alert, AlertDescription } from '../components/alert.js';

export type ChatStatusProps = {
  error?: Error;
  aborted?: boolean;
  errorContent?: ((error: Error) => ReactNode) | false;
  abortedContent?: ReactNode;
  warningContent?: ReactNode;
};

export function ChatStatus({
  aborted,
  abortedContent,
  error,
  errorContent,
  warningContent,
}: ChatStatusProps) {
  return (
    <>
      {warningContent && <div>{warningContent}</div>}
      {aborted && abortedContent && <div>{abortedContent}</div>}
      {error && errorContent && <div role="alert">{errorContent(error)}</div>}
      {error && errorContent === undefined && (
        <Alert variant="destructive" className="fb-chat__error">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
