'use client';

import './index.css';

import {
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@frogbotai/ui';
import { InvalidStepIcon, LoadingIcon, RefreshIcon, SparkleIcon } from '@frogbotai/ui/icons';
import { getTranslation } from '@payloadcms/translations';
import {
  DefaultCell,
  isFieldRTL,
  ReactSelect,
  type ReactSelectOption,
  useAuth,
  useConfig,
  useDocumentInfo,
  useField,
  useLocale,
  useTranslation,
  withCondition,
} from '@payloadcms/ui';
import { aiFieldPaths, type AIFieldStatus, type AIKind, isAIFieldInputSet } from 'frogbot/fields';
import type {
  ClientField,
  DefaultCellComponentProps,
  LabelFunction,
  OptionObject,
  SelectFieldClientProps,
  TextFieldClientProps,
  Validate,
} from 'payload';
import {
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getFieldKind } from '../kind.js';
import { KindFieldLayout } from '../KindFieldLayout/index.client.js';
import { hasOptionColors } from '../optionColor.js';
import { OptionPills } from '../OptionPills/index.client.js';
import { type AIFieldDoc, watchAIFieldRecord } from './poller.js';
import { requestRegenerate } from './requests.js';

type AIRecord = Record<string, unknown>;

type AIRecordOverride = { base: AIRecord | undefined; doc: AIRecord };

type AITarget = {
  collectionSlug: string;
  draft: boolean;
  id: number | string | undefined;
  name: string;
  onDoc: (doc: AIFieldDoc) => void;
};

type AIStatusLine = { action?: string; text?: string };

const statuses = new Set<unknown>(['pending', 'done', 'error', 'manual']);

function getAIStatus(record: AIRecord | undefined, path: string): AIFieldStatus | null {
  const status = record?.[path];

  return statuses.has(status) ? (status as AIFieldStatus) : null;
}

function getAIInputs(field: ClientField): string[] {
  const { inputs } = (getFieldKind(field) ?? {}) as Partial<AIKind>;

  return Array.isArray(inputs) ? inputs : [];
}

function getFieldName(field: ClientField): string {
  return 'name' in field ? field.name : '';
}

function sameValue(left: unknown, right: unknown): boolean {
  if (!isAIFieldInputSet(left) && !isAIFieldInputSet(right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }

  return left === right;
}

function useLatestRecord(base: AIRecord | undefined) {
  const [override, setOverride] = useState<AIRecordOverride>();

  const record = override && override.base === base ? { ...base, ...override.doc } : base;

  const merge = useCallback(
    (doc: AIRecord) =>
      setOverride((current) => ({
        base,
        doc: current && current.base === base ? { ...current.doc, ...doc } : doc,
      })),
    [base],
  );

  return { overridden: record !== base, merge, record };
}

function useAIFieldTarget(collectionSlug: string) {
  const { config, getEntityConfig } = useConfig();
  const locale = useLocale()?.code;
  const collection = getEntityConfig({ collectionSlug });

  return {
    api: config.routes.api,
    hasDrafts: Boolean(collection?.versions?.drafts),
    listSelectAPI: Boolean(collection?.admin?.enableListViewSelectAPI),
    locale: locale || undefined,
  };
}

function useRegenerate({ collectionSlug, draft, id, name, onDoc }: AITarget) {
  const { api, hasDrafts, locale } = useAIFieldTarget(collectionSlug);
  const [busy, setBusy] = useState(false);

  const regenerate = useCallback(() => {
    if (id === undefined) return;

    setBusy(true);

    void requestRegenerate({
      api,
      collectionSlug,
      draft,
      drafts: hasDrafts,
      id,
      locale,
      name,
    })
      .then(onDoc, () => undefined)
      .finally(() => setBusy(false));
  }, [api, collectionSlug, draft, hasDrafts, id, locale, name, onDoc]);

  return { busy, regenerate };
}

function usePendingWatch({
  collectionSlug,
  id,
  name,
  onDoc,
  pending,
}: Omit<AITarget, 'draft'> & { pending: boolean }) {
  const { api, hasDrafts, locale } = useAIFieldTarget(collectionSlug);
  const onDocRef = useRef(onDoc);

  useEffect(() => {
    onDocRef.current = onDoc;
  });

  useEffect(() => {
    if (!pending || id === undefined) return undefined;

    return watchAIFieldRecord({
      api,
      collectionSlug,
      draft: hasDrafts,
      field: name,
      id,
      locale,
      onDoc: (doc) => {
        if (doc) onDocRef.current(doc);
      },
    });
  }, [api, collectionSlug, hasDrafts, id, locale, name, pending]);
}

function stopRowLink(event: MouseEvent, action: () => void): void {
  event.preventDefault();
  event.stopPropagation();

  action();
}

function drawValue(props: DefaultCellComponentProps, value: unknown): ReactNode {
  if (!isAIFieldInputSet(value)) return null;

  if (props.field.type === 'select' && hasOptionColors(props.field)) {
    return <OptionPills {...props} cellData={value} />;
  }

  return <DefaultCell {...props} cellData={value} />;
}

export function AICell(props: DefaultCellComponentProps) {
  const { cellData, collectionSlug, field, rowData, viewType } = props;
  const { permissions } = useAuth();
  const { hasDrafts, listSelectAPI } = useAIFieldTarget(collectionSlug);

  const name = getFieldName(field);
  const paths = aiFieldPaths(name);
  const isCard = viewType === 'board' || viewType === 'calendar';
  const plain = !Object.hasOwn(rowData ?? {}, paths.status) || (!isCard && listSelectAPI);

  const { merge, overridden, record } = useLatestRecord(rowData);
  const status = plain ? null : getAIStatus(record, paths.status);
  const id = rowData?.id as number | string | undefined;

  usePendingWatch({ collectionSlug, id, name, onDoc: merge, pending: status === 'pending' });

  const { busy, regenerate } = useRegenerate({
    collectionSlug,
    draft: hasDrafts && rowData?._status === 'draft',
    id,
    name,
    onDoc: merge,
  });

  const value = overridden ? record?.[name] : cellData;
  const drawn = drawValue(props, value);

  if (plain) return drawn;

  const error = typeof record?.[paths.error] === 'string' ? (record[paths.error] as string) : '';
  const message = error || 'Generation failed';

  if (isCard) {
    if (!drawn && status !== 'error') return null;

    return (
      <span className={`ai-cell${status === 'pending' ? ' ai-cell--pending' : ''}`}>
        {drawn}
        {status === 'error' && (
          <InvalidStepIcon aria-label={message} className="ai-cell__warning" role="img" size={14} />
        )}
      </span>
    );
  }

  const canUpdate = Boolean(permissions?.collections?.[collectionSlug]?.update);

  if (status === null) {
    const inputsSet = getAIInputs(field).some((input) => isAIFieldInputSet(record?.[input]));

    if (!inputsSet || !canUpdate) return drawn;

    return (
      <span className="ai-cell">
        {drawn}
        <Button
          className="ai-cell__generate"
          disabled={busy}
          onClick={(event) => stopRowLink(event, regenerate)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <SparkleIcon aria-hidden size={14} />
          Generate
        </Button>
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="ai-cell ai-cell--pending">
        {drawn}
        <LoadingIcon aria-label="Generating" className="ai-cell__spinner" role="img" size={14} />
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="ai-cell ai-cell--error">
        {drawn}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {canUpdate ? (
                <Button
                  aria-label="Retry"
                  className="ai-cell__action ai-cell__warning"
                  disabled={busy}
                  onClick={(event) => stopRowLink(event, regenerate)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <InvalidStepIcon aria-hidden size={14} />
                </Button>
              ) : (
                <span aria-label={message} className="ai-cell__warning" role="img">
                  <InvalidStepIcon aria-hidden size={14} />
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent side="top">{message}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>
    );
  }

  return (
    <span className="ai-cell">
      {drawn}
      {canUpdate && (
        <Button
          aria-label="Regenerate"
          className="ai-cell__action ai-cell__rerun"
          disabled={busy}
          onClick={(event) => stopRowLink(event, regenerate)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <RefreshIcon aria-hidden size={14} />
        </Button>
      )}
    </span>
  );
}

function getStatusLine(status: AIFieldStatus | null, error: string): AIStatusLine {
  if (status === 'pending') return { text: 'Generating…' };

  if (status === 'done') return { action: 'Regenerate' };

  if (status === 'error') return { action: 'Retry', text: error ? `Failed: ${error}` : 'Failed' };

  if (status === 'manual') {
    return { action: 'Regenerate', text: "Edited by hand, won't update automatically" };
  }

  return { action: 'Generate' };
}

type AIFieldProps = SelectFieldClientProps | TextFieldClientProps;

type AIFieldValue = null | string | string[];

type AIInputProps = {
  disabled: boolean;
  path: string;
  setValue: (value: AIFieldValue) => void;
  value: AIFieldValue | undefined;
};

type AISelectOption = { label: ReturnType<typeof getTranslation>; value: string };

type AISelectAdmin = {
  isClearable?: boolean;
  isSortable?: boolean;
  placeholder?: LabelFunction | string;
};

function isSelectField(field: AIFieldProps['field']): field is SelectFieldClientProps['field'] {
  return field.type === 'select';
}

function toOptionObjects(options: SelectFieldClientProps['field']['options']): OptionObject[] {
  return options.map((option) =>
    typeof option === 'string' ? { label: option, value: option } : option,
  );
}

function getValidateOptions(field: AIFieldProps['field']): Record<string, unknown> {
  if (isSelectField(field)) {
    return { hasMany: field.hasMany ?? false, options: toOptionObjects(field.options) };
  }

  return { maxLength: field.maxLength, minLength: field.minLength };
}

function AITextInput({
  disabled,
  field,
  path,
  setValue,
  value,
}: AIInputProps & { field: TextFieldClientProps['field'] }) {
  const { i18n } = useTranslation();
  const { config } = useConfig();
  const locale = useLocale();
  const { autoComplete, placeholder, rtl } = field.admin ?? {};

  const renderRTL = isFieldRTL({
    fieldLocalized: field.localized,
    fieldRTL: rtl,
    locale,
    localizationConfig: config.localization || undefined,
  });

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value),
    [setValue],
  );

  return (
    <Input
      autoComplete={autoComplete || undefined}
      dir={renderRTL ? 'rtl' : undefined}
      disabled={disabled}
      id={`field-${path.replace(/\./g, '__')}`}
      name={path}
      onChange={handleChange}
      placeholder={placeholder ? getTranslation(placeholder, i18n) : undefined}
      type="text"
      value={typeof value === 'string' ? value : ''}
    />
  );
}

function AISelectInput({
  disabled,
  field,
  path,
  setValue,
  value,
}: AIInputProps & { field: SelectFieldClientProps['field'] }) {
  const { hasMany = false } = field;
  const admin = field.admin as AISelectAdmin | undefined;
  const { i18n } = useTranslation();

  const options = useMemo<AISelectOption[]>(
    () =>
      toOptionObjects(field.options).map((option) => ({
        label: getTranslation(option.label, i18n),
        value: option.value,
      })),
    [field.options, i18n],
  );

  const toOption = (selected: string): AISelectOption =>
    options.find((option) => option.value === selected) ?? { label: selected, value: selected };

  const selected = hasMany
    ? (Array.isArray(value) ? value : []).map(toOption)
    : typeof value === 'string' && value !== ''
      ? toOption(value)
      : null;

  const handleChange = useCallback(
    (next: ReactSelectOption | ReactSelectOption[] | null) => {
      if (hasMany) {
        setValue(Array.isArray(next) ? next.map((option) => String(option.value)) : []);

        return;
      }

      setValue(next && !Array.isArray(next) ? String(next.value) : null);
    },
    [hasMany, setValue],
  );

  return (
    <ReactSelect
      disabled={disabled}
      id={`field-${path.replace(/\./g, '__')}`}
      isClearable={admin?.isClearable ?? true}
      isMulti={hasMany}
      isSortable={admin?.isSortable ?? true}
      onChange={handleChange}
      options={options}
      placeholder={admin?.placeholder}
      value={selected as ReactSelectOption | ReactSelectOption[]}
    />
  );
}

function AIFieldComponent(props: AIFieldProps) {
  const { field, path: pathFromProps, readOnly, validate } = props;
  const { name } = field;

  const { collectionSlug = '', docPermissions, id, savedDocumentData } = useDocumentInfo();
  const { hasDrafts } = useAIFieldTarget(collectionSlug);
  const validateOptions = useMemo(() => getValidateOptions(field), [field]);

  const memoizedValidate = useCallback<Validate>(
    (value, options) =>
      (validate as Validate | undefined)?.(value, { ...options, ...validateOptions }) ?? true,
    [validate, validateOptions],
  );

  const { customComponents, disabled, path, setValue, showError, value } = useField<AIFieldValue>({
    potentiallyStalePath: pathFromProps,
    validate: memoizedValidate,
  });

  const paths = aiFieldPaths(name);
  const { merge, record } = useLatestRecord(savedDocumentData);
  const status = getAIStatus(record, paths.status);
  const formValue = useRef(value);

  useEffect(() => {
    formValue.current = value;
  });

  const applyDoc = useCallback(
    (doc: AIFieldDoc) => {
      const savedValue = record?.[name];

      if (
        Object.hasOwn(doc, name) &&
        !sameValue(doc[name], savedValue) &&
        sameValue(formValue.current, savedValue)
      ) {
        setValue(doc[name] ?? null, true);
      }

      merge(doc);
    },
    [merge, name, record, setValue],
  );

  usePendingWatch({ collectionSlug, id, name, onDoc: applyDoc, pending: status === 'pending' });

  const { busy, regenerate } = useRegenerate({
    collectionSlug,
    draft: hasDrafts && record?._status === 'draft',
    id,
    name,
    onDoc: applyDoc,
  });

  const error = typeof record?.[paths.error] === 'string' ? (record[paths.error] as string) : '';
  const line = getStatusLine(status, error);
  const action = docPermissions?.update ? line.action : undefined;
  const showStatus = id !== undefined && (line.text || action);

  const inputProps: AIInputProps = {
    disabled: Boolean(readOnly || disabled),
    path,
    setValue,
    value,
  };

  return (
    <KindFieldLayout
      base={isSelectField(field) ? 'select' : 'text'}
      className="ai-field"
      customComponents={customComponents}
      field={field}
      path={path}
      readOnly={readOnly || disabled}
      showError={showError}
    >
      {isSelectField(field) ? (
        <AISelectInput {...inputProps} field={field} />
      ) : (
        <AITextInput {...inputProps} field={field} />
      )}
      {showStatus && (
        <div className="ai-field__status">
          {status === 'pending' && (
            <LoadingIcon aria-hidden className="ai-field__spinner" size={14} />
          )}
          {line.text && <span>{line.text}</span>}
          {line.text && action && <span aria-hidden> · </span>}
          {action && (
            <Button
              className="ai-field__action"
              disabled={busy}
              onClick={regenerate}
              size="sm"
              type="button"
              variant="link"
            >
              {action}
            </Button>
          )}
        </div>
      )}
    </KindFieldLayout>
  );
}

export const AIField = withCondition(AIFieldComponent);
