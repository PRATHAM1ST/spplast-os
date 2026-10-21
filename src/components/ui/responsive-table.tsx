"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
  type ComponentProps,
} from "react";
type ElementProps = {
  children?: ReactNode;
  colSpan?: number;
  "data-label"?: string;
  role?: string;
};
function plain(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<ElementProps>(node)) return plain(node.props.children);
  return Children.toArray(node)
    .map((n) =>
      typeof n === "string"
        ? n
        : isValidElement<ElementProps>(n)
          ? plain(n.props.children)
          : "",
    )
    .join(" ");
}
/** One accessible record structure: a table on desktop, labeled record cards on phones. */
export function ResponsiveTable({
  children,
  className = "",
  ...props
}: ComponentProps<"table">) {
  const sections = Children.toArray(children);
  const head = sections.find((n) => isValidElement(n) && n.type === "thead") as
    ReactElement<ElementProps> | undefined;
  const headerRow =
    head &&
    (Children.toArray(head.props.children).find(
      (n) => isValidElement(n) && n.type === "tr",
    ) as ReactElement<ElementProps> | undefined);
  const labels = headerRow
    ? Children.toArray(headerRow.props.children).map(plain)
    : [];
  return (
    <table {...props} role="table" className={`responsive-table ${className}`}>
      {sections.map((section) => {
        if (!isValidElement<ElementProps>(section) || section.type !== "tbody")
          return section;
        return cloneElement(
          section,
          { role: "rowgroup" },
          Children.map(section.props.children, (row) => {
            if (!isValidElement<ElementProps>(row) || row.type !== "tr")
              return row;
            return cloneElement(
              row,
              { role: "row" },
              Children.map(row.props.children, (cell, index) => {
                if (!isValidElement<ElementProps>(cell) || cell.type !== "td")
                  return cell;
                return cloneElement(cell, {
                  role: "cell",
                  "data-label": cell.props.colSpan ? undefined : labels[index],
                });
              }),
            );
          }),
        );
      })}
    </table>
  );
}
