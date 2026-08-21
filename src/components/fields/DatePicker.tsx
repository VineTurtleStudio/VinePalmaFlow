import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function DatePicker({
  value,
  onChange,
  className = "",
  placeholder = "选择日期",
  allowClear = true,
}: {
  value?: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const closePanel = () => {
    setOpen(false);
    setPos(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const selected = value ? new Date(`${value}T00:00:00`) : null;

  const openPanel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const input = inputRef.current;
    if (!input) return;
    const r = input.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4, width: r.width });
    setViewYear((selected ?? new Date()).getFullYear());
    setViewMonth((selected ?? new Date()).getMonth() + 1);
    setOpen(true);
  };

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const today = new Date();

  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <input
        ref={inputRef}
        readOnly
        value={value ?? ""}
        onClick={openPanel}
        placeholder={placeholder}
        className={`cursor-pointer ${className}`}
      />
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onMouseDown={closePanel} />
            <div
              className="fixed z-50 w-64 rounded-xl border border-base-200 bg-white p-3 shadow-xl dark:border-base-700 dark:bg-base-800"
              style={{ left: Math.min(pos.left, window.innerWidth - 260), top: pos.top }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-base-400 hover:bg-base-100 dark:hover:bg-base-700"
                  title="上一月"
                >
                  ‹
                </button>
                <span className="text-sm font-medium text-base-700 dark:text-base-200">
                  {viewYear} 年 {viewMonth} 月
                </span>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-base-400 hover:bg-base-100 dark:hover:bg-base-700"
                  title="下一月"
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-7 text-center text-[10px] text-base-400 dark:text-base-500">
                {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
                  <span key={d} className="py-0.5">
                    {d}
                  </span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-0.5">
                {cells.map((day, i) => {
                  if (day === null) return <span key={`e${i}`} />;
                  const date = new Date(viewYear, viewMonth - 1, day);
                  const key = toDateInputValue(date);
                  const isSelected = selected && toDateInputValue(selected) === key;
                  const isToday = toDateInputValue(today) === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => {
                        onChange(key);
                        closePanel();
                      }}
                      className={`h-7 rounded-md text-xs transition-colors ${
                        isSelected
                          ? "bg-brand-600 text-white"
                          : isToday
                            ? "text-brand-600 ring-1 ring-brand-400 dark:text-brand-300"
                            : "text-base-700 hover:bg-base-100 dark:text-base-200 dark:hover:bg-base-700"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-base-100 pt-2 dark:border-base-700">
                <button
                  type="button"
                  onClick={() => {
                    onChange(toDateInputValue(today));
                    closePanel();
                  }}
                  className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                >
                  今天
                </button>
                {allowClear && value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      closePanel();
                    }}
                    className="text-xs text-base-400 hover:text-red-500"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
