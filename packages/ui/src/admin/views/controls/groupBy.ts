export function isGroupByEnabled({
  collectionGroupBy,
  enableGroupBy,
}: {
  collectionGroupBy: boolean | undefined;
  enableGroupBy: boolean | undefined;
}): boolean {
  return enableGroupBy ?? Boolean(collectionGroupBy);
}
