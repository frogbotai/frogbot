'use client';

import './styles.css';

import { Button, ConfirmationDialog } from '@frogbotai/ui';
import {
  DraggableSortable,
  DraggableSortableItem,
  RenderFields,
  useAllFormFields,
  useForm,
} from '@frogbotai/ui/admin';
import type {
  ArrayFieldClient,
  ClientField,
  FieldState,
  FormState,
  SanitizedFieldPermissions,
} from 'payload';
import { type ComponentProps, useId, useState } from 'react';

import { fieldRefusal, type FormFieldInfo, missingRequired } from '../definition.js';
import type { FormMode } from '../types.js';
import { resolveQuestionMove } from './move.js';

export type FormBuilderProps = {
  /** The `steps` array field; the builder reads its row fields. */
  field: Pick<ArrayFieldClient, 'fields'>;
  path?: string;
  schemaPath?: string;
  permissions?: SanitizedFieldPermissions;
  readOnly?: boolean;
  /** Each target collection's fields, by slug, from `listQuestionFields`. */
  fields: Record<string, FormFieldInfo[]>;
};

type BuilderQuestion = {
  id: string;
  path: string;
  field: string;
  label?: string;
  description?: string;
  error?: string;
};

type BuilderStep = { id: string; path: string; questions: BuilderQuestion[] };

const WORDING = ['label', 'description', 'placeholder'];
const FILE_SETTINGS = ['maxFileSize', 'maxFiles', 'mimeTypes'];

function text(state: FormState, path: string): string | undefined {
  const value = state[path]?.value;

  return typeof value === 'string' && value ? value : undefined;
}

function readSteps(state: FormState, path: string): BuilderStep[] {
  return (state[path]?.rows ?? []).map((row, stepIndex) => {
    const stepPath = `${path}.${stepIndex}`;
    const questions = (state[`${stepPath}.questions`]?.rows ?? []).map((question, index) => {
      const questionPath = `${stepPath}.questions.${index}`;
      const fieldState = state[`${questionPath}.field`];

      return {
        id: question.id,
        path: questionPath,
        field: text(state, `${questionPath}.field`) ?? '',
        label: text(state, `${questionPath}.label`),
        description: text(state, `${questionPath}.description`),
        error: fieldState?.valid === false ? fieldState.errorMessage : undefined,
      };
    });

    return { id: row.id, path: stepPath, questions };
  });
}

function rowState(state: FormState, rowPath: string): FormState {
  const prefix = `${rowPath}.`;

  return Object.fromEntries(
    Object.entries(state).flatMap(([key, value]): [string, FieldState][] =>
      key.startsWith(prefix) ? [[key.slice(prefix.length), value]] : [],
    ),
  );
}

type RowPermissions = Record<string, SanitizedFieldPermissions> | true;

function rowPermissions(permissions: SanitizedFieldPermissions | undefined): RowPermissions {
  if (permissions === undefined || permissions === true) return true;

  return permissions.fields ?? true;
}

function childPermissions(permissions: RowPermissions, name: string): SanitizedFieldPermissions {
  return permissions === true ? true : (permissions[name] ?? true);
}

function childFields(field: { fields: ClientField[] }, names: string[]): ClientField[] {
  return names.flatMap((name) => {
    const child = field.fields.find((candidate) => 'name' in candidate && candidate.name === name);

    return child ? [child] : [];
  });
}

function withPlaceholder(field: ClientField, placeholder: string | undefined): ClientField {
  if (!placeholder) return field;

  return { ...field, admin: { ...field.admin, placeholder } } as ClientField;
}

function stepKey(id: string): string {
  return `step:${id}`;
}

function DragHandleIcon() {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      {[4, 8, 12].flatMap((y) =>
        [6, 10].map((x) => <circle cx={x} cy={y} fill="currentColor" key={`${x}-${y}`} r="1.25" />),
      )}
    </svg>
  );
}

function AddQuestion({
  collection,
  fields,
  mode,
  onAdd,
  readOnly,
  used,
}: {
  collection: string;
  fields: FormFieldInfo[];
  mode: FormMode;
  onAdd: (name: string) => void;
  readOnly?: boolean;
  used: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const unused = fields.filter(({ name }) => !used.has(name));
  const usable = unused.filter((field) => !fieldRefusal(field, mode));
  const refused = unused.filter((field) => fieldRefusal(field, mode));
  const anyUsable = fields.some((field) => !fieldRefusal(field, mode));

  return (
    <div className="fb-form-builder__add">
      <Button
        aria-controls={listId}
        aria-expanded={open}
        disabled={readOnly}
        onClick={() => setOpen(!open)}
        size="sm"
        type="button"
        variant="outline"
      >
        Add question
      </Button>
      {open && (
        <div className="fb-form-builder__picker" id={listId}>
          {!anyUsable && (
            <p className="fb-form-builder__note">
              No field of {collection} can be a question. Add one in config.
            </p>
          )}
          {anyUsable && usable.length === 0 && (
            <p className="fb-form-builder__note">Every usable field is on the form.</p>
          )}
          <ul className="fb-form-builder__choices">
            {usable.map((field) => (
              <li key={field.name}>
                <button
                  className="fb-form-builder__choice"
                  onClick={() => {
                    onAdd(field.name);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className="fb-form-builder__choice-label">{field.label}</span>
                  <span className="fb-form-builder__type">{field.type}</span>
                  {field.required && <span className="fb-form-builder__required">Required</span>}
                </button>
              </li>
            ))}
            {refused.map((field) => (
              <li
                className="fb-form-builder__choice fb-form-builder__choice--refused"
                key={field.name}
              >
                <span className="fb-form-builder__choice-label">{field.label}</span>
                <span className="fb-form-builder__type">{field.type}</span>
                <span className="fb-form-builder__reason">
                  {field.label} {fieldRefusal(field, mode)}.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  info,
  mode,
  onRemove,
  permissions,
  question,
  questionsField,
  readOnly,
  schemaPath,
  sortable,
}: {
  info: FormFieldInfo | undefined;
  mode: FormMode;
  onRemove: () => void;
  permissions: RowPermissions;
  question: BuilderQuestion;
  questionsField: ArrayFieldClient | undefined;
  readOnly?: boolean;
  schemaPath: string;
  sortable: Parameters<ComponentProps<typeof DraggableSortableItem>['children']>[0];
}) {
  const [open, setOpen] = useState(false);
  const wordingId = useId();
  const usable = info && !('refusal' in info) ? info : undefined;
  const label = question.label ?? info?.label ?? question.field;
  const description = question.description ?? usable?.description;
  const problem = info ? fieldRefusal(info, mode) : `isn't a field this form's collection has`;

  const { style: _style, ...handleAttributes } =
    sortable.attributes as typeof sortable.attributes & {
      style?: unknown;
    };

  const wording = questionsField
    ? childFields(questionsField, [
        ...WORDING,
        ...(usable?.type === 'upload' ? FILE_SETTINGS : []),
      ]).map((field) =>
        'name' in field && field.name === 'label'
          ? withPlaceholder(field, info?.label)
          : 'name' in field && field.name === 'description'
            ? withPlaceholder(field, usable?.description)
            : 'name' in field && field.name === 'placeholder'
              ? withPlaceholder(field, usable?.placeholder)
              : field,
      )
    : [];

  return (
    <li
      className={`fb-form-builder__question${sortable.isDragging ? ' fb-form-builder__question--dragging' : ''}`}
      ref={sortable.setNodeRef}
      style={{
        transform: sortable.transform,
        transition: sortable.transition,
        zIndex: sortable.isDragging ? 1 : undefined,
      }}
    >
      <div className="fb-form-builder__question-header">
        <button
          {...handleAttributes}
          {...sortable.listeners}
          aria-label={`Move ${label}`}
          className="fb-form-builder__handle"
          disabled={readOnly}
          ref={sortable.setActivatorNodeRef}
          type="button"
        >
          <DragHandleIcon />
        </button>
        <div className="fb-form-builder__question-summary">
          <span className="fb-form-builder__question-label">{label}</span>
          {info && <span className="fb-form-builder__type">{info.type}</span>}
          {info?.required && <span className="fb-form-builder__required">Required</span>}
          {description && <span className="fb-form-builder__help">{description}</span>}
        </div>
        <Button
          aria-controls={wordingId}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {open ? 'Done' : 'Edit'}
        </Button>
        <Button
          aria-label={`Remove ${label}`}
          disabled={readOnly}
          onClick={onRemove}
          size="sm"
          type="button"
          variant="ghost"
        >
          Remove
        </Button>
      </div>
      {(question.error ?? problem) && (
        <p className="fb-form-builder__warning" role="alert">
          {question.error ?? `${label} ${problem}.`}
        </p>
      )}
      {open && (
        <div className="fb-form-builder__wording" id={wordingId}>
          <RenderFields
            fields={wording}
            parentIndexPath=""
            parentPath={question.path}
            parentSchemaPath={schemaPath}
            permissions={permissions}
            readOnly={readOnly}
          />
        </div>
      )}
    </li>
  );
}

/**
 * The `forms.steps` field: questions picked from the target collection's fields, grouped into
 * steps and reordered by drag or keyboard. It edits the document form's rows, so saving, drafts
 * and errors work as on any edit page, and it never changes the collection's fields.
 */
export function FormBuilder({
  field,
  fields,
  path = 'steps',
  permissions,
  readOnly,
  schemaPath = path,
}: FormBuilderProps) {
  const [state] = useAllFormFields();
  const { addFieldRow, moveFieldRow, removeFieldRow } = useForm();
  const [removing, setRemoving] = useState<number>();

  const collection = text(state, 'collection');
  const mode = (text(state, 'mode') ?? 'create') as FormMode;
  const list = collection ? fields[collection] : undefined;
  const byName = new Map(list?.map((info) => [info.name, info]));

  const steps = readSteps(state, path);
  const shown: BuilderStep[] = steps.length
    ? steps
    : [{ id: '', path: `${path}.0`, questions: [] }];

  const used = new Set(
    steps.flatMap(({ questions }) => questions.map((question) => question.field)),
  );

  const missing = list ? missingRequired(list, used, mode) : [];
  const chrome = shown.length > 1;

  const questionsField = childFields(field, ['questions'])[0] as ArrayFieldClient | undefined;
  const [titleField] = childFields(field, ['title']);
  const stepPermissions = rowPermissions(permissions);
  const questionPermissions = rowPermissions(childPermissions(stepPermissions, 'questions'));
  const questionsSchemaPath = `${schemaPath}.questions`;

  const emptyStep = (): FormState => ({
    questions: { disableFormData: true, initialValue: 0, rows: [], valid: true, value: 0 },
  });

  const addStep = () => {
    for (let index = steps.length; index < Math.max(steps.length + 1, 2); index += 1) {
      addFieldRow({ path, rowIndex: index, schemaPath, subFieldState: emptyStep() });
    }
  };

  const addQuestion = (stepIndex: number, name: string) => {
    if (steps.length === 0) {
      addFieldRow({ path, rowIndex: 0, schemaPath, subFieldState: emptyStep() });
    }

    addFieldRow({
      path: `${path}.${stepIndex}.questions`,
      rowIndex: steps[stepIndex]?.questions.length ?? 0,
      schemaPath: questionsSchemaPath,
      subFieldState: { field: { initialValue: name, isModified: true, valid: true, value: name } },
    });
  };

  const removeStep = (stepIndex: number) => {
    removeFieldRow({ path, rowIndex: stepIndex });
    setRemoving(undefined);
  };

  const onDragEnd = ({
    moveFromIndex,
    moveToIndex,
  }: {
    moveFromIndex: number;
    moveToIndex: number;
  }) => {
    const move = resolveQuestionMove(
      steps.map(({ questions }) => questions.length),
      moveFromIndex,
      moveToIndex,
    );

    if (!move) return;

    const from = `${path}.${move.fromStep}.questions`;

    if (move.fromStep === move.toStep) {
      moveFieldRow({ path: from, moveFromIndex: move.fromIndex, moveToIndex: move.toIndex });

      return;
    }

    addFieldRow({
      path: `${path}.${move.toStep}.questions`,
      rowIndex: move.toIndex,
      schemaPath: questionsSchemaPath,
      subFieldState: rowState(state, `${from}.${move.fromIndex}`),
    });

    removeFieldRow({ path: from, rowIndex: move.fromIndex });
  };

  const ids = steps.flatMap((step) => [stepKey(step.id), ...step.questions.map(({ id }) => id)]);
  const removingStep = removing === undefined ? undefined : steps[removing];

  return (
    <div className="fb-form-builder">
      {!collection && (
        <p className="fb-form-builder__note">Pick a collection to add questions from its fields.</p>
      )}
      {state[path]?.valid === false && state[path]?.errorMessage && (
        <p className="fb-form-builder__warning" role="alert">
          {state[path]?.errorMessage}
        </p>
      )}
      {missing.map((info) => (
        <p className="fb-form-builder__warning" key={info.name} role="alert">
          Saving will be refused: add <em>{info.label}</em> or give it a default in config.
        </p>
      ))}
      <DraggableSortable className="fb-form-builder__steps" ids={ids} onDragEnd={onDragEnd}>
        {shown.map((step, stepIndex) => (
          <section
            aria-label={chrome ? `Step ${stepIndex + 1}` : undefined}
            className={`fb-form-builder__step${chrome ? ' fb-form-builder__step--framed' : ''}`}
            key={step.id || 'empty'}
          >
            {step.id && (
              <DraggableSortableItem id={stepKey(step.id)}>
                {({ setNodeRef }) =>
                  chrome ? (
                    <div className="fb-form-builder__step-header" ref={setNodeRef}>
                      {titleField && (
                        <RenderFields
                          fields={[withPlaceholder(titleField, `Step ${stepIndex + 1}`)]}
                          parentIndexPath=""
                          parentPath={step.path}
                          parentSchemaPath={schemaPath}
                          permissions={stepPermissions}
                          readOnly={readOnly}
                        />
                      )}
                      <Button
                        disabled={readOnly}
                        onClick={() =>
                          step.questions.length ? setRemoving(stepIndex) : removeStep(stepIndex)
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Remove step
                      </Button>
                    </div>
                  ) : (
                    <div className="fb-form-builder__step-anchor" ref={setNodeRef} />
                  )
                }
              </DraggableSortableItem>
            )}
            <ul className="fb-form-builder__questions">
              {step.questions.map((question, index) => (
                <DraggableSortableItem disabled={readOnly} id={question.id} key={question.id}>
                  {(sortable) => (
                    <QuestionRow
                      info={byName.get(question.field)}
                      mode={mode}
                      onRemove={() =>
                        removeFieldRow({ path: `${step.path}.questions`, rowIndex: index })
                      }
                      permissions={questionPermissions}
                      question={question}
                      questionsField={questionsField}
                      readOnly={readOnly}
                      schemaPath={questionsSchemaPath}
                      sortable={sortable}
                    />
                  )}
                </DraggableSortableItem>
              ))}
            </ul>
            {collection && list && (
              <AddQuestion
                collection={collection}
                fields={list}
                mode={mode}
                onAdd={(name) => addQuestion(stepIndex, name)}
                readOnly={readOnly}
                used={used}
              />
            )}
          </section>
        ))}
      </DraggableSortable>
      <Button disabled={readOnly} onClick={addStep} size="sm" type="button" variant="outline">
        Add step
      </Button>
      <ConfirmationDialog
        description={`Its ${removingStep?.questions.length ?? 0} questions leave the form. Records keep their answers.`}
        onCancel={() => setRemoving(undefined)}
        onConfirm={() => removing !== undefined && removeStep(removing)}
        open={removingStep !== undefined}
        primaryButtonText="Remove step"
        secondaryButtonText="Cancel"
        title={`Remove step ${(removing ?? 0) + 1}?`}
      />
    </div>
  );
}
