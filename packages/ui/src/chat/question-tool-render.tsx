'use client';

import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';

import { Button } from '../components/button.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/tabs.js';
import { Textarea } from '../components/textarea.js';
import CheckIcon from '../icons/icons/CheckIcon.js';
import CheckmarkCircleIcon from '../icons/icons/CheckmarkCircleIcon.js';
import CloseIcon from '../icons/icons/CloseIcon.js';
import LoadingIcon from '../icons/icons/LoadingIcon.js';
import QuestionMarkCircleIcon from '../icons/icons/QuestionMarkCircleIcon.js';
import type { ToolRendererProps } from './tool-registry.js';

type QuestionOption = {
  label: string;
  description?: string;
};

type Question = {
  header: string;
  question: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};

type QuestionAnswer = {
  header: string;
  selected: string[];
  custom?: string;
};

type QuestionDraft = {
  selected: string[];
  custom: string;
};

const emptyDraft: QuestionDraft = { selected: [], custom: '' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isQuestion = (value: unknown): value is Question =>
  isRecord(value) &&
  typeof value.header === 'string' &&
  typeof value.question === 'string' &&
  Array.isArray(value.options) &&
  value.options.every((option) => isRecord(option) && typeof option.label === 'string');

const isAnswer = (value: unknown): value is QuestionAnswer =>
  isRecord(value) &&
  typeof value.header === 'string' &&
  Array.isArray(value.selected) &&
  value.selected.every((label) => typeof label === 'string');

const isAnswered = ({ selected, custom }: QuestionAnswer) => selected.length > 0 || Boolean(custom);

function readQuestions(input: unknown): Question[] {
  const questions = isRecord(input) ? input.questions : undefined;

  return Array.isArray(questions) ? questions.filter(isQuestion) : [];
}

function readAnswers(output: unknown): QuestionAnswer[] {
  const answers = isRecord(output) ? output.answers : undefined;

  return Array.isArray(answers) ? answers.filter(isAnswer) : [];
}

function toAnswer(question: Question, draft: QuestionDraft): QuestionAnswer {
  const custom = draft.custom.trim();
  const selected = question.options
    .map(({ label }) => label)
    .filter((label) => draft.selected.includes(label));

  return { header: question.header, selected, ...(custom ? { custom } : {}) };
}

export function QuestionToolRender({ addToolOutput, dismiss, part }: ToolRendererProps) {
  const questions = readQuestions(part.input);

  if (part.state === 'output-available') {
    return <QuestionAnswered answers={readAnswers(part.output)} />;
  }

  if (part.state === 'output-error' || part.state === 'output-denied') {
    return (
      <QuestionClosed
        questions={questions}
        reason={part.state === 'output-error' ? part.errorText : part.approval.reason}
      />
    );
  }

  if (part.state === 'input-streaming' || questions.length === 0) {
    return (
      <QuestionCard
        icon={<LoadingIcon className="fb-question-tool__icon fb-question-tool__icon--loading" />}
        title="Preparing question"
      />
    );
  }

  return <QuestionForm addToolOutput={addToolOutput} dismiss={dismiss} questions={questions} />;
}

function QuestionCard({
  children,
  icon,
  modifier,
  title,
}: {
  children?: ReactNode;
  icon: ReactNode;
  modifier?: 'answered' | 'closed';
  title: string;
}) {
  return (
    <section
      className={modifier ? `fb-question-tool fb-question-tool--${modifier}` : 'fb-question-tool'}
    >
      <header className="fb-question-tool__header">
        {icon}
        <h5 className="fb-question-tool__title">{title}</h5>
      </header>
      {children}
    </section>
  );
}

function QuestionAnswered({ answers }: { answers: QuestionAnswer[] }) {
  return (
    <QuestionCard
      icon={<CheckmarkCircleIcon className="fb-question-tool__icon" />}
      modifier="answered"
      title="Answered"
    >
      <dl className="fb-question-tool__answers">
        {answers.map((answer) => (
          <div className="fb-question-tool__answer" key={answer.header}>
            <dt className="fb-question-tool__answer-header">{answer.header}</dt>
            <dd className="fb-question-tool__answer-value">
              {[...answer.selected, ...(answer.custom ? [answer.custom] : [])].join(', ')}
            </dd>
          </div>
        ))}
      </dl>
    </QuestionCard>
  );
}

function QuestionClosed({ questions, reason }: { questions: Question[]; reason?: string }) {
  return (
    <QuestionCard
      icon={<CloseIcon className="fb-question-tool__icon" />}
      modifier="closed"
      title="Not answered"
    >
      {reason && <p className="fb-question-tool__reason">{reason}</p>}
      <ul className="fb-question-tool__questions">
        {questions.map((question) => (
          <li key={question.header}>{question.question}</li>
        ))}
      </ul>
    </QuestionCard>
  );
}

function QuestionForm({
  addToolOutput,
  dismiss,
  questions,
}: Pick<ToolRendererProps, 'addToolOutput' | 'dismiss'> & { questions: Question[] }) {
  const [drafts, setDrafts] = useState<QuestionDraft[]>([]);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const first = questions[0];
  const single = questions.length === 1;
  const instant = single && !first.multiple;
  const last = step >= questions.length - 1;
  const disabled = !addToolOutput || submitting;
  const answers = questions.map((question, index) =>
    toAnswer(question, drafts[index] ?? emptyDraft),
  );

  const settle = async (action: () => Promise<void>) => {
    if (busy.current) return;

    busy.current = true;
    setSubmitting(true);

    try {
      await action();
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  const submit = (next: QuestionAnswer[]) => {
    if (!addToolOutput || !next.every(isAnswered)) return;

    void settle(() => addToolOutput({ answers: next }));
  };

  const advance = () => {
    if (last) submit(answers);
    else setStep(step + 1);
  };

  const updateDraft = (index: number, update: (draft: QuestionDraft) => QuestionDraft) => {
    setDrafts((current) => {
      const next = [...current];

      next[index] = update(current[index] ?? emptyDraft);

      return next;
    });
  };

  const select = (question: Question, index: number, label: string) => {
    if (instant) {
      submit([{ header: question.header, selected: [label] }]);

      return;
    }

    updateDraft(index, (draft) => {
      if (!question.multiple) return { selected: [label], custom: '' };

      const selected = draft.selected.includes(label)
        ? draft.selected.filter((value) => value !== label)
        : [...draft.selected, label];

      return { ...draft, selected };
    });
  };

  const type = (question: Question, index: number, custom: string) => {
    updateDraft(index, (draft) => ({
      selected: question.multiple || !custom.trim() ? draft.selected : [],
      custom,
    }));
  };

  const fields = (question: Question, index: number) => (
    <QuestionFields
      disabled={disabled}
      draft={drafts[index] ?? emptyDraft}
      instant={instant}
      question={question}
      onAdvance={advance}
      onCustom={(custom) => type(question, index, custom)}
      onSelect={(label) => select(question, index, label)}
    />
  );

  return (
    <QuestionCard
      icon={<QuestionMarkCircleIcon className="fb-question-tool__icon" />}
      title={single ? first.header : 'Questions'}
    >
      {single ? (
        fields(first, 0)
      ) : (
        <Tabs value={String(step)} onValueChange={(value) => setStep(Number(value))}>
          <TabsList variant="outline" className="fb-question-tool__tabs">
            {questions.map((question, index) => (
              <TabsTrigger
                key={question.header}
                value={String(index)}
                variant="outline"
                className="fb-question-tool__tab"
              >
                {question.header}
                {isAnswered(answers[index]) && (
                  <CheckIcon className="fb-question-tool__tab-check" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {questions.map((question, index) => (
            <TabsContent
              key={question.header}
              value={String(index)}
              className="fb-question-tool__panel"
            >
              {fields(question, index)}
            </TabsContent>
          ))}
        </Tabs>
      )}
      {addToolOutput && (
        <footer className="fb-question-tool__footer">
          {dismiss && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => void settle(dismiss)}
            >
              Dismiss
            </Button>
          )}
          <div className="fb-question-tool__navigation">
            {step > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={submitting}
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            {(!instant || first.custom !== false) && (
              <Button
                type="button"
                size="sm"
                disabled={submitting || (last && !answers.every(isAnswered))}
                onClick={advance}
              >
                {last ? 'Submit' : 'Next'}
              </Button>
            )}
          </div>
        </footer>
      )}
    </QuestionCard>
  );
}

function QuestionFields({
  disabled,
  draft,
  instant,
  onAdvance,
  onCustom,
  onSelect,
  question,
}: {
  disabled: boolean;
  draft: QuestionDraft;
  instant: boolean;
  onAdvance: () => void;
  onCustom: (custom: string) => void;
  onSelect: (label: string) => void;
  question: Question;
}) {
  const role = instant ? undefined : question.multiple ? 'checkbox' : 'radio';
  const group = instant ? undefined : question.multiple ? 'group' : 'radiogroup';

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;

    event.preventDefault();
    onAdvance();
  };

  return (
    <div className="fb-question-tool__question">
      <p className="fb-question-tool__prompt">{question.question}</p>
      {question.multiple && <p className="fb-question-tool__hint">Select all that apply.</p>}
      <div role={group} aria-label={group && question.header} className="fb-question-tool__options">
        {question.options.map((option) => {
          const selected = draft.selected.includes(option.label);

          return (
            <button
              key={option.label}
              type="button"
              role={role}
              aria-checked={role && selected}
              disabled={disabled}
              className={
                selected
                  ? 'fb-question-tool__option fb-question-tool__option--selected'
                  : 'fb-question-tool__option'
              }
              onClick={() => onSelect(option.label)}
            >
              {role && (
                <span
                  aria-hidden="true"
                  className={`fb-question-tool__mark fb-question-tool__mark--${role}`}
                />
              )}
              <span className="fb-question-tool__option-main">
                <span className="fb-question-tool__option-label">{option.label}</span>
                {option.description && (
                  <span className="fb-question-tool__option-description">{option.description}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {question.custom !== false && (
        <Textarea
          aria-label={`Other answer for ${question.header}`}
          placeholder="Type your own answer"
          rows={1}
          value={draft.custom}
          disabled={disabled}
          className="fb-question-tool__custom"
          onChange={(event) => onCustom(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      )}
    </div>
  );
}
