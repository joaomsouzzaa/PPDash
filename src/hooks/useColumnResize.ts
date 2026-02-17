import { useCallback, useRef } from "react";

export function useColumnResize() {
  const tableRef = useRef<HTMLTableElement>(null);

  const autoFitColumn = useCallback((th: HTMLTableCellElement) => {
    const table = th.closest("table");
    if (!table) return;

    const colIndex = th.cellIndex;
    const rows = table.querySelectorAll("tr");
    let maxWidth = 0;

    // Measure the natural width of content in every cell of this column
    rows.forEach((row) => {
      const cell = row.cells[colIndex];
      if (!cell) return;

      // Temporarily remove width constraints to measure natural content
      const prevWidth = cell.style.width;
      const prevMinWidth = cell.style.minWidth;
      const prevMaxWidth = cell.style.maxWidth;
      cell.style.width = "auto";
      cell.style.minWidth = "0";
      cell.style.maxWidth = "none";

      // Measure scrollWidth for truncated content
      const contentWidth = cell.scrollWidth;
      maxWidth = Math.max(maxWidth, contentWidth);

      cell.style.width = prevWidth;
      cell.style.minWidth = prevMinWidth;
      cell.style.maxWidth = prevMaxWidth;
    });

    const finalWidth = Math.max(60, maxWidth + 16); // add padding
    th.style.width = `${finalWidth}px`;
    th.style.minWidth = `${finalWidth}px`;
  }, []);

  const onResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const handle = e.currentTarget as HTMLElement;
      const th = handle.parentElement as HTMLTableCellElement;
      if (!th) return;

      const startX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const startWidth = th.offsetWidth;

      const onMove = (ev: MouseEvent | TouchEvent) => {
        const clientX =
          "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
        const newWidth = Math.max(60, startWidth + (clientX - startX));
        th.style.width = `${newWidth}px`;
        th.style.minWidth = `${newWidth}px`;
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove);
      document.addEventListener("touchend", onUp);
    },
    []
  );

  const onResizeDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget as HTMLElement;
      const th = handle.parentElement as HTMLTableCellElement;
      if (!th) return;
      autoFitColumn(th);
    },
    [autoFitColumn]
  );

  return { tableRef, onResizeStart, onResizeDoubleClick };
}
