/** Where a dragged question goes: from a row of one step to a row of another, or the same, step. */
export type QuestionMove = { fromStep: number; fromIndex: number; toStep: number; toIndex: number };

type Slot = { step: number; index?: number };

/**
 * Turns a drop in the builder's one sortable list into a question move. The list holds each
 * step's header followed by its questions; `counts` is the number of questions in each step.
 * The dragged question lands where the sortable puts it, so the step is the nearest header above
 * it: dropped on a header while moving down, it opens that step; moving up, it ends the step
 * before. Returns `undefined` for a header, an unknown index or a drop that changes nothing.
 */
export function resolveQuestionMove(
  counts: number[],
  moveFromIndex: number,
  moveToIndex: number,
): QuestionMove | undefined {
  const slots: Slot[] = counts.flatMap((count, step) => [
    { step },
    ...Array.from({ length: count }, (_, index) => ({ step, index })),
  ]);

  const moving = slots[moveFromIndex];
  if (moving?.index === undefined || !slots[moveToIndex] || moveFromIndex === moveToIndex) return;

  const order = slots.filter((slot) => slot !== moving);
  order.splice(moveToIndex, 0, moving);

  let toStep = 0;
  let toIndex = 0;

  for (const slot of order.slice(0, order.indexOf(moving))) {
    if (slot.index === undefined) {
      toStep = slot.step;
      toIndex = 0;
    } else {
      toIndex += 1;
    }
  }

  if (toStep === moving.step && toIndex === moving.index) return;

  return { fromStep: moving.step, fromIndex: moving.index, toStep, toIndex };
}
