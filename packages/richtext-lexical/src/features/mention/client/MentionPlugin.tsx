'use client';

import { $createTextNode, type TextNode } from '@payloadcms/richtext-lexical/lexical';
import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@payloadcms/richtext-lexical/lexical/react/LexicalTypeaheadMenuPlugin';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { $createMentionNode } from '../node.js';
import type { MentionFeatureClientProps } from '../shared.js';

const LIMIT = 8;
const menu = 'slash-menu-popup';

class PersonOption extends MenuOption {
  id: number | string;
  label: string;

  constructor(id: number | string, label: string) {
    super(String(id));
    this.id = id;
    this.label = label;
  }
}

type Person = Record<string, unknown> & { id: number | string };

function searchURL({ api, relationTo, titleField }: MentionFeatureClientProps, query: string) {
  const params = new URLSearchParams({ depth: '0', limit: String(LIMIT), sort: titleField });
  const fields = [...new Set([titleField, 'email'])];

  params.set(`select[${titleField}]`, 'true');

  if (query) {
    fields.forEach((field, index) => params.set(`where[or][${index}][${field}][like]`, query));
  }

  return `${api}/${relationTo}?${params}`;
}

function usePeople(
  { api, relationTo, titleField }: MentionFeatureClientProps,
  query: string | null,
) {
  const [people, setPeople] = useState<PersonOption[]>([]);

  useEffect(() => {
    if (query === null) return;

    const controller = new AbortController();

    fetch(searchURL({ api, relationTo, titleField }, query), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { docs: [] }))
      .then(({ docs }: { docs: Person[] }) =>
        setPeople(
          docs.map((doc) => {
            const title = doc[titleField];

            return new PersonOption(
              doc.id,
              typeof title === 'string' && title ? title : `#${doc.id}`,
            );
          }),
        ),
      )
      .catch(() => undefined);

    return () => controller.abort();
  }, [api, query, relationTo, titleField]);

  return people;
}

/** The `@` typeahead: lists people as you type and inserts the one you pick. */
export function MentionPlugin({ clientProps }: { clientProps: MentionFeatureClientProps }) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const people = usePeople(clientProps, query);
  const trigger = useBasicTypeaheadTriggerMatch('@', { minLength: 0 });

  const select = useCallback(
    (option: PersonOption, queryNode: TextNode | null, close: () => void) => {
      editor.update(() => {
        const mention = $createMentionNode({
          label: option.label,
          relationTo: clientProps.relationTo,
          value: option.id,
        });

        const space = $createTextNode(' ');

        if (queryNode) queryNode.replace(mention);

        mention.insertAfter(space);
        space.select();
        close();
      });
    },
    [clientProps.relationTo, editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<PersonOption>
      menuRenderFn={(
        anchor,
        { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchor.current && options.length
          ? createPortal(
              <div className={menu} role="listbox">
                <div className={`${menu}__group`}>
                  {options.map((option, index) => (
                    <button
                      aria-selected={selectedIndex === index}
                      className={`${menu}__item${selectedIndex === index ? ` ${menu}__item--selected` : ''}`}
                      key={option.key}
                      onClick={() => {
                        setHighlightedIndex(index);
                        selectOptionAndCleanUp(option);
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      ref={option.setRefElement}
                      role="option"
                      tabIndex={-1}
                      type="button"
                    >
                      <span className={`${menu}__item-text`}>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>,
              anchor.current,
            )
          : null
      }
      onQueryChange={setQuery}
      onSelectOption={select}
      options={people}
      triggerFn={trigger}
    />
  );
}
