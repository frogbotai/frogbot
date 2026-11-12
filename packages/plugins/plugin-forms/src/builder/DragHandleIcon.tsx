export function DragHandleIcon() {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      {[4, 8, 12].flatMap((y) =>
        [6, 10].map((x) => <circle cx={x} cy={y} fill="currentColor" key={`${x}-${y}`} r="1.25" />),
      )}
    </svg>
  );
}
