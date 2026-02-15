import { useState, useEffect } from "react";
import { CalendarIcon } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  preset: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
  onApply: (preset: string, start: Date | undefined, end: Date | undefined) => void;
}

const presets = [
  { label: "Hoje", value: "today" },
  { label: "Ontem", value: "yesterday" },
  { label: "Últimos 7 dias", value: "7d" },
  { label: "Últimos 14 dias", value: "14d" },
  { label: "Últimos 30 dias", value: "30d" },
  { label: "Este mês", value: "this_month" },
  { label: "Mês passado", value: "last_month" },
  { label: "Vitalício", value: "lifetime" },
  { label: "Personalizado", value: "custom" },
];

function getPresetRange(value: string): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (value) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = subDays(today, 1);
      return { from: y, to: y };
    }
    case "7d":
      return { from: subDays(today, 6), to: today };
    case "14d":
      return { from: subDays(today, 13), to: today };
    case "30d":
      return { from: subDays(today, 29), to: today };
    case "this_month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const prev = subMonths(today, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "lifetime":
      return { from: new Date(2020, 0, 1), to: today };
    default:
      return { from: subDays(today, 29), to: today };
  }
}

function getPresetLabel(value: string): string {
  return presets.find((p) => p.value === value)?.label || "Últimos 30 dias";
}

export function DateRangePicker({ preset, startDate, endDate, onApply }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(preset);
  const [range, setRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: startDate,
    to: endDate,
  });
  const [month, setMonth] = useState<Date>(subMonths(new Date(), 1));

  useEffect(() => {
    if (open) {
      setSelectedPreset(preset);
      if (startDate && endDate) {
        setRange({ from: startDate, to: endDate });
      } else {
        const r = getPresetRange(preset);
        setRange({ from: r.from, to: r.to });
      }
    }
  }, [open, preset, startDate, endDate]);

  const handlePresetClick = (value: string) => {
    setSelectedPreset(value);
    if (value !== "custom") {
      const r = getPresetRange(value);
      setRange({ from: r.from, to: r.to });
      setMonth(subMonths(r.to, 1));
      // Apply immediately for presets
      onApply(value, r.from, r.to);
      setOpen(false);
    }
  };

  const handleApply = () => {
    onApply(selectedPreset, range.from, range.to);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  const displayLabel = startDate && endDate
    ? `${format(startDate, "dd MMM yyyy", { locale: pt })} - ${format(endDate, "dd MMM yyyy", { locale: pt })}`
    : getPresetLabel(preset);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-[220px] justify-start text-left font-normal bg-card")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start" sideOffset={8}>
        <div className="flex">
          {/* Presets sidebar */}
          <div className="border-r border-border p-4 w-[180px] space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Predefinições
            </p>
            {presets.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePresetClick(p.value)}
                className={cn(
                  "flex items-center gap-2 w-full text-left text-sm py-1.5 px-2 rounded-md transition-colors",
                  selectedPreset === p.value
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <span
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center",
                    selectedPreset === p.value ? "border-primary" : "border-muted-foreground/40"
                  )}
                >
                  {selectedPreset === p.value && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </span>
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar area */}
          <div className="p-4">
            {/* Date display */}
            <div className="flex items-center gap-2 mb-4">
              <div className="border border-border rounded-md px-3 py-1.5 text-sm min-w-[140px] text-center">
                {range.from ? format(range.from, "d 'de' MMM. 'de' yyyy", { locale: pt }) : "—"}
              </div>
              <span className="text-muted-foreground">-</span>
              <div className="border border-border rounded-md px-3 py-1.5 text-sm min-w-[140px] text-center">
                {range.to ? format(range.to, "d 'de' MMM. 'de' yyyy", { locale: pt }) : "—"}
              </div>
            </div>

            <Calendar
              mode="range"
              selected={range.from ? { from: range.from, to: range.to } : undefined}
              onSelect={(r) => {
                if (r?.from && !r?.to) {
                  // First click — if same day as existing from, treat as single-day selection
                  if (range.from && r.from.getTime() === range.from.getTime() && !range.to) {
                    setRange({ from: r.from, to: r.from });
                  } else {
                    setRange({ from: r.from, to: undefined });
                  }
                } else {
                  setRange({ from: r?.from, to: r?.to });
                }
                setSelectedPreset("custom");
              }}
              numberOfMonths={2}
              month={month}
              onMonthChange={setMonth}
              locale={pt}
              className="p-0 pointer-events-auto"
            />

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleApply}>
                Atualizar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
