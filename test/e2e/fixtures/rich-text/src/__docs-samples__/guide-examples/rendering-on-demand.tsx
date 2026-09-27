'use client';

import type { DefaultNodeTypes } from '@frogbotai/richtext-lexical';
import { buildEditorState, RenderLexical } from '@frogbotai/richtext-lexical/client';
import type { JSONFieldClientComponent } from 'frogbot';
import type { ComponentProps } from 'react';
import { useState } from 'react';

export const PreviewContentField: JSONFieldClientComponent = () => {
  return (
    <RenderLexical
      field={{ name: 'previewContent' }}
      initialValue={buildEditorState<DefaultNodeTypes>({
        text: 'Start writing.',
      })}
      schemaPath="collection.posts.content"
    />
  );
};

const createInitialValue = () => buildEditorState<DefaultNodeTypes>({ text: 'Start writing.' });

export function ControlledEditor() {
  const [value, setValue] =
    useState<ComponentProps<typeof RenderLexical>['value']>(createInitialValue);

  const isEditorValue = (v: unknown): v is ComponentProps<typeof RenderLexical>['value'] =>
    v === undefined || (typeof v === 'object' && v !== null);

  const updateValue: NonNullable<ComponentProps<typeof RenderLexical>['setValue']> = (
    nextValue,
  ) => {
    if (isEditorValue(nextValue)) {
      setValue(nextValue);
    }
  };

  return (
    <div>
      <RenderLexical
        field={{ name: 'draftContent', label: 'Draft content' }}
        schemaPath="collection.posts.content"
        setValue={updateValue}
        value={value}
      />

      <button onClick={() => setValue(createInitialValue())} type="button">
        Reset editor
      </button>
    </div>
  );
}

export const MismatchedSchemaField: JSONFieldClientComponent = () => {
  return (
    <RenderLexical
      field={{ name: 'mismatchedSchema' }}
      schemaPath="collection.posts.missingRichTextField"
    />
  );
};
