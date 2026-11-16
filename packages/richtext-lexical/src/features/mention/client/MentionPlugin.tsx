'use client';

import { UserAvatar } from '@frogbotai/ui';
import { $createTextNode, type TextNode } from '@payloadcms/richtext-lexical/lexical';
import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@payloadcms/richtext-lexical/lexical/react/LexicalTypeaheadMenuPlugin';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { $createMentionNode } from '../node.js';
import { type MentionFeatureClientProps, personName } from '../shared.js';

const LIMIT = 8;
const menu = 'slash-menu-popup';

class PersonOption extends MenuOption {
  email?: string;
  id: number | string;
  label: string;
  name?: string;

  constructor(person: Person, titleField: string) {
    super(String(person.id));

    const title = person[titleField];

    this.id = person.id;
    this.email = typeof person.email === 'string' ? person.email : undefined;
    this.name = typeof title === 'string' && title && titleField !== 'email' ? title : undefined;
    this.label = personName(person, titleField);
  }
}

type Person = Record<string, unknown> & { id: number | string };

type People = { options: PersonOption[]; query: string | null };

function searchURL(
  { api, relationTo, titleField }: Omit<MentionFeatureClientProps, 'avatar'>,
  query: string,
) {
  const params = new URLSearchParams({ depth: '0', limit: String(LIMIT), sort: titleField });
  const fields = [...new Set([titleField, 'email'])];

  fields.forEach((field) => params.set(`select[${field}]`, 'true'));

  if (query) {
    fields.forEach((field, index) => params.set(`where[or][${index}][${field}][like]`, query));
  }

  return `${api}/${relationTo}?${params}`;
}

function usePeople(
  { api, relationTo, titleField }: MentionFeatureClientProps,
  query: string | null,
): People {
  const [people, setPeople] = useState<People>({ options: [], query: null });

  useEffect(() => {
    if (query === null) return;

    const controller = new AbortController();

    fetch(searchURL({ api, relationTo, titleField }, query), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { docs: [] }))
      .then(({ docs }: { docs: Person[] }) =>
        setPeople({ options: docs.map((doc) => new PersonOption(doc, titleField)), query }),
      )
      .catch(() => undefined);

    return () => controller.abort();
  }, [api, query, relationTo, titleField]);

  return people;
}

function highlight(text: string, query: string): ReactNode {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;

  if (at < 0) return text;

  return (
    <>
      {text.slice(0, at)}
      <strong>{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}

/** The `@` typeahead: lists people as you type and inserts the one you pick. */
export function MentionPlugin({ clientProps }: { clientProps: MentionFeatureClientProps }) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const people = usePeople(clientProps, query);
  const trigger = useBasicTypeaheadTriggerMatch('@', { minLength: 0 });
  const gravatar = clientProps.avatar === 'gravatar';

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

  const empty = Boolean(query) && people.query === query && !people.options.length;

  return (
    <LexicalTypeaheadMenuPlugin<PersonOption>
      menuRenderFn={(
        anchor,
        { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
        matching,
      ) =>
        anchor.current && (options.length || empty)
          ? createPortal(
              <div className={`${menu} fb-mention-menu`} role="listbox">
                <div className={`${menu}__group`}>
                  {options.map((option, index) => (
                    <button
                      aria-selected={selectedIndex === index}
                      className={`${menu}__item fb-mention-menu__item${selectedIndex === index ? ` ${menu}__item--selected` : ''}`}
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
                      <UserAvatar
                        email={option.email}
                        gravatar={gravatar}
                        name={option.name}
                        size={20}
                      />
                      <span className={`${menu}__item-text fb-mention-menu__name`}>
                        {highlight(option.label, matching)}
                      </span>
                      {option.name && option.email ? (
                        <span className="fb-mention-menu__email">
                          {highlight(option.email, matching)}
                        </span>
                      ) : null}
                    </button>
                  ))}
                  {options.length ? null : (
                    <p className="fb-mention-menu__empty">No people match</p>
                  )}
                </div>
              </div>,
              anchor.current,
            )
          : null
      }
      onQueryChange={setQuery}
      onSelectOption={select}
      options={people.options}
      triggerFn={trigger}
    />
  );
}
