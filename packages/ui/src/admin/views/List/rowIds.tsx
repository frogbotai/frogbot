import { cloneElement, Fragment, isValidElement, type ReactNode } from 'react';

type TableColumn = { active?: boolean; renderedCells?: ReactNode[] };

type TableElementProps = {
  children?: ReactNode;
  columns?: TableColumn[];
  data?: Array<{ _id?: unknown; id?: unknown }>;
};

function markCells(cells: ReactNode[], data: NonNullable<TableElementProps['data']>): ReactNode[] {
  return cells.map((cell, index) => (
    <Fragment key={index}>
      {cell}
      <span data-row-id={String(data[index]?.id ?? data[index]?._id)} hidden />
    </Fragment>
  ));
}

/**
 * Puts each row's id inside its first rendered cell. Payload's orderable table renders rows
 * without `data-id` and reorders them locally after a drag, so the cell is the only place the id
 * stays with its row.
 */
export function withRowIds(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(withRowIds);
  if (!isValidElement<TableElementProps>(node)) return node;

  const { children, columns, data } = node.props;

  if (Array.isArray(columns) && Array.isArray(data)) {
    const first = columns.findIndex(
      (column) => column.active && Array.isArray(column.renderedCells),
    );

    return first === -1
      ? node
      : cloneElement(node, {
          columns: columns.map((column, index) =>
            index === first && column.renderedCells
              ? { ...column, renderedCells: markCells(column.renderedCells, data) }
              : column,
          ),
        });
  }

  return children === undefined ? node : cloneElement(node, { children: withRowIds(children) });
}
