'use client';

import { useState } from 'react';

import { Badge } from '../../../components/badge.js';
import { Button } from '../../../components/button.js';
import { SearchInput } from '../../../components/search-input.js';
import DeleteIcon from '../../../icons/icons/DeleteIcon.js';
import LoadingIcon from '../../../icons/icons/LoadingIcon.js';
import type { MemoryItem, MemoryViewClientProps } from './types.js';

export function MemoryViewClient({
  apiPath,
  pageSize,
  initialMemories,
  initialHasNextPage,
  initialError,
}: MemoryViewClientProps) {
  const [memories, setMemories] = useState(initialMemories);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [error, setError] = useState(initialError ?? '');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string>();
  const [loading, setLoading] = useState(false);
  const query = search.trim().toLowerCase();

  const shown = memories.filter((memory) =>
    `${memory.key ?? ''} ${memory.text}`.toLowerCase().includes(query),
  );

  const fetchPage = async (page: number) => {
    const params = new URLSearchParams({
      scope: 'me',
      limit: String(pageSize),
      page: String(page),
    });

    const response = await fetch(`${apiPath}?${params}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (!response.ok) throw new Error('load');

    return (await response.json()) as { docs: MemoryItem[]; hasNextPage: boolean };
  };

  const loadMore = async () => {
    setLoading(true);
    setError('');

    try {
      const offset = memories.length;
      const first = Math.floor(offset / pageSize) + 1;
      const pages = offset % pageSize ? [first, first + 1] : [first];
      const results: Awaited<ReturnType<typeof fetchPage>>[] = [];

      for (const page of pages) results.push(await fetchPage(page));

      setMemories((current) => [
        ...current,
        ...results
          .flatMap(({ docs }) => docs)
          .filter(({ id }, index, docs) => docs.findIndex((doc) => doc.id === id) === index)
          .filter(({ id }) => !current.some((memory) => memory.id === id)),
      ]);

      setHasNextPage(results.at(-1)?.hasNextPage ?? false);
    } catch {
      setError('Could not load more memories. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const forget = async (memory: MemoryItem) => {
    if (pending) return;

    setPending(memory.id);
    setError('');

    try {
      const response = await fetch(`${apiPath}/${encodeURIComponent(memory.id)}?scope=me`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (!response.ok) throw new Error('forget');

      setMemories((current) => current.filter(({ id }) => id !== memory.id));
    } catch {
      setError('Could not forget this memory. Please try again.');
    } finally {
      setPending(undefined);
    }
  };

  return (
    <div className="frogbot-memory">
      <SearchInput
        aria-label="Search memories"
        placeholder="Search memories…"
        value={search}
        onChange={setSearch}
      />
      {error && (
        <div className="frogbot-memory__error" role="alert">
          {error}
        </div>
      )}
      {shown.length === 0 ? (
        error ? null : (
          <div className="frogbot-memory__empty">
            <p>{query ? 'No memories match your search' : 'No memories yet'}</p>
            {!query && (
              <span className="frogbot-memory__muted">
                Agents with memory save what they learn about you here.
              </span>
            )}
          </div>
        )
      ) : (
        <ul className="frogbot-memory__rows">
          {shown.map((memory) => (
            <li key={memory.id} className="frogbot-memory__row">
              <div className="frogbot-memory__body">
                <p>{memory.text}</p>
                <span className="frogbot-memory__meta">
                  {memory.pinned && <Badge variant="accent">Pinned</Badge>}
                  {memory.key && <span className="frogbot-memory__muted">{memory.key}</span>}
                  <span className="frogbot-memory__muted">
                    {new Date(memory.updatedAt).toLocaleDateString()}
                  </span>
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Forget "${memory.text}"`}
                disabled={pending !== undefined}
                onClick={() => void forget(memory)}
              >
                {pending === memory.id ? (
                  <LoadingIcon size={16} className="frogbot-memory__spinner" />
                ) : (
                  <DeleteIcon size={16} />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="frogbot-memory__more"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {loading ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
