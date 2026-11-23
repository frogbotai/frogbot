import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
} from 'frogbot';

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

/** A subtask belongs to its parent's project, so `+` on a task needs no project pick. */
export const inheritProject: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const parent = data?.parent === undefined ? originalDoc?.parent : data.parent;
  const id = typeof parent === 'object' && parent !== null ? parent.id : parent;

  if (!data || id === null || id === undefined) return data;

  const doc = await req.frogbot.findByID({
    collection: 'tasks',
    id,
    depth: 0,
    disableErrors: true,
    req,
  });

  return doc ? { ...data, project: doc.project } : data;
};
