import { type CSSProperties, type ReactNode, useMemo } from "react";

type CsvRow = Record<string, string | number | boolean | null | undefined>;
type CsvLinkProps<T extends CsvRow> = {
  data: T[];
  filename: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  children: ReactNode;
};
function quoteCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
export function CSVLink<T extends CsvRow>({ data, filename, className, style, children, ...props }: CsvLinkProps<T>) {
  const href = useMemo(() => {
    if (!data.length) return undefined;
    const columns = Object.keys(data[0]);
    const rows = [columns.map(quoteCsv).join(","), ...data.map((row) => columns.map((column) => quoteCsv(row[column])).join(","))];
    return `data:text/csv;charset=utf-8,${encodeURIComponent(rows.join("\r\n"))}`;
  }, [data]);
  return <a href={href} download={filename} className={className} style={style} {...props}>{children}</a>;
}
