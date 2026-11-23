import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
} from 'frogbot';
import { APIError } from 'frogbot';

type TaskData = { completed?: boolean | null; status?: string | null };

/**
 * Keeps `completed` and the Done status in step, so Mark complete moves a card to Done and
 * dragging a card to Done completes it. When both change in one save, `completed` wins.
 */
export function syncDone<T extends TaskData>(data: T, previous?: TaskData): T {
  const completedChanged =
    data.completed !== undefined &&
    Boolean(data.completed) !== Boolean(previous?.completed);

  const status = data.status === undefined ? previous?.status : data.status;

  if (completedChanged) {
    if (data.completed) return { ...data, status: 'done' };

    return status === 'done' ? { ...data, status: 'todo' } : data;
  }

  if (data.status !== undefined && data.status !== previous?.status) {
    return { ...data, completed: data.status === 'done' };
  }

  return data;
}

export const syncDoneHook: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => syncDone(data, originalDoc);

/** The id of a relationship value, populated or not. */
export const relationId = (value: unknown): number | string | undefined =>
  typeof value === 'object' && value !== null && 'id' in value
    ? (value.id as number | string)
    : ((value as number | string | null | undefined) ?? undefined);

/**
 * A subtask takes its parent's project, so `+` on a task needs no project pick, and a task can't
 * sit under one of its own subtasks. A saved parent that was deleted is cleared, so the subtask
 * becomes a top-level task in its project instead of failing validation.
 */
export const followParent: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const id = relationId(
    data?.parent === undefined ? originalDoc?.parent : data.parent,
  );

  if (!data || id === undefined) return data;

  const find = (task: number | string) =>
    req.frogbot.findByID({
      collection: 'tasks',
      id: task,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    });

  const parent = await find(id);

  if (!parent) {
    const stale =
      data.parent === undefined ||
      relationId(data.parent) === relationId(originalDoc?.parent);

    return stale ? { ...data, parent: null } : data;
  }

  const self = relationId(originalDoc?.id);
  const seen = new Set<number | string>();

  let ancestor: typeof parent | null = parent;

  while (self !== undefined && ancestor && !seen.has(ancestor.id)) {
    if (ancestor.id === self) {
      throw new APIError(
        "A task can't be a subtask of itself or of its own subtask.",
        400,
        undefined,
        true,
      );
    }

    seen.add(ancestor.id);

    const next = relationId(ancestor.parent);

    ancestor = next === undefined ? null : await find(next);
  }

  return { ...data, project: parent.project };
};

/**
 * When a task changes project, its subtasks move with it. Each subtask's save takes the id from
 * its parent in `followParent` and runs this hook again, so deeper levels follow.
 */
export const moveSubtasks: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (
    operation !== 'update' ||
    relationId(doc.project) === relationId(previousDoc?.project)
  ) {
    return doc;
  }

  await req.frogbot.update({
    collection: 'tasks',
    where: { parent: { equals: doc.id } },
    data: { project: doc.project },
    depth: 0,
    overrideAccess: true,
    req,
  });

  return doc;
};
