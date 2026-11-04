'use client';

import { useState } from 'react';

import { Button } from '../components/button.js';
import { Textarea } from '../components/textarea.js';

export type ToolApprovalAnswer = { approved: boolean; reason?: string };

export type ToolApprovalProps = {
  /** Why the tool asks, from its `approval` rule. */
  reason?: string;
  /** Deny needs a typed reason, for adapters that can't end the turn on a bare denial. */
  reasonRequired?: boolean;
  onAnswer: (answer: ToolApprovalAnswer) => Promise<void> | void;
};

/** Approve and Deny for a tool call waiting on a person; Deny takes an optional reason. */
export function ToolApproval({ reason, reasonRequired = false, onAnswer }: ToolApprovalProps) {
  const [denying, setDenying] = useState(false);
  const [denial, setDenial] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const answer = async (value: ToolApprovalAnswer) => {
    setSubmitting(true);

    try {
      await onAnswer(value);
    } finally {
      setSubmitting(false);
    }
  };

  const trimmed = denial.trim();

  return (
    <div className="fb-tool-approval" data-part="tool-approval">
      {reason && <p className="fb-tool-approval__reason">{reason}</p>}
      {denying && (
        <Textarea
          className="fb-tool-approval__denial"
          aria-label="Reason for denying"
          placeholder={reasonRequired ? 'Tell the agent why' : 'Tell the agent why (optional)'}
          value={denial}
          disabled={submitting}
          onChange={(event) => setDenial(event.target.value)}
        />
      )}
      <div className="fb-tool-approval__actions">
        {denying ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => setDenying(false)}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={submitting || (reasonRequired && !trimmed)}
              onClick={() =>
                void answer({ approved: false, ...(trimmed ? { reason: trimmed } : {}) })
              }
            >
              Deny
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => setDenying(true)}
            >
              Deny
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={submitting}
              onClick={() => void answer({ approved: true })}
            >
              Approve
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
