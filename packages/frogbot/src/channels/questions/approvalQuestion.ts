import type { SettleOutcome } from '../../chat/turn/settle.js';
import type { PendingCall } from '../../chat/turn/types.js';
import type { QuestionInput, QuestionOutput } from '../../tools/question.js';
import type { QuestionOutcome } from './types.js';

export const APPROVAL_HEADER = 'Approval';
export const APPROVE_LABEL = 'Approve';
export const DENY_LABEL = 'Deny';

export function approvalQuestion(call: PendingCall): QuestionInput {
  const reason = call.approval?.reason;

  return {
    questions: [
      {
        header: APPROVAL_HEADER,
        question: reason ? `Approve ${call.toolName}? ${reason}` : `Approve ${call.toolName}?`,
        options: [{ label: APPROVE_LABEL }, { label: DENY_LABEL }],
        custom: true,
      },
    ],
  };
}

export function approvalOutcome(outcome: QuestionOutcome): SettleOutcome {
  if ('dismissed' in outcome) return outcome;

  const [answer] = outcome.output.answers;
  const reason = answer?.custom;

  if (reason) return { approved: false, reason };

  return { approved: answer?.selected.includes(APPROVE_LABEL) === true };
}

export function approvalAnswer(approval: { approved: boolean; reason?: string }): QuestionOutput {
  return {
    answers: [
      approval.reason && !approval.approved
        ? { header: APPROVAL_HEADER, selected: [], custom: approval.reason }
        : { header: APPROVAL_HEADER, selected: [approval.approved ? APPROVE_LABEL : DENY_LABEL] },
    ],
  };
}
