import { defineErrors } from 'frogbot';

/** The forms plugin's error codes. */
export const formError = defineErrors({
  'forms.not-found': {
    status: 404,
    title: 'Form not found.',
    hint: "Check the form's slug, and that it takes new responses.",
  },
  'forms.closed': {
    status: 410,
    title: 'This form is closed.',
    hint: "Ask the form's owner to reopen it.",
  },
  'forms.link-invalid': {
    status: 410,
    title: 'This link is no longer valid.',
    hint: "Ask the form's owner for a new link.",
  },
  'forms.invalid': {
    status: 400,
    title: 'Some answers need fixing.',
    hint: 'Fix the answers named in `errors`, then submit again.',
    exit: 2,
  },
  'forms.invalid-answer': {
    status: 400,
    title: 'An answer has the wrong type for its question.',
    hint: "Send each answer in its question's type, as the form definition lists.",
    exit: 2,
  },
  'forms.files-too-large': {
    status: 413,
    title: 'The files are too large, or there are too many.',
    hint: 'Send fewer or smaller files.',
  },
  'forms.not-human': {
    status: 400,
    title: "We couldn't verify you're human. Try again.",
    hint: 'Complete the check, then submit again.',
  },
  'forms.rate-limited': {
    status: 429,
    title: 'Too many submissions. Try again later.',
    hint: 'Wait the seconds in `Retry-After`, then submit again.',
    retryable: true,
  },
  'forms.busy': {
    status: 503,
    title: 'This form is busy. Try again.',
    hint: 'Try again in a moment.',
    retryable: true,
  },
});
