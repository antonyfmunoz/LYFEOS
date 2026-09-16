import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type MonthPickerProps = {
  value: string;
  onChange: (month: string) => void;
  className?: string;
  ariaLabel?: string;
  dataTestId?: string;
};

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const isMonthValue = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const toMonthValue = (year: number, monthIndex: number) => `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

/** A local, app-styled month selector for filters that aggregate by calendar month. */
export function MonthPicker({ value, onChange, className, ariaLabel = "Select month", dataTestId }: MonthPickerProps) {
  const initialYear = isMonthValue(value) ? Number(value.slice(0, 4)) : new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(initialYear);

  useEffect(() => {
    if (isMonthValue(value)) setYear(Number(value.slice(0, 4)));
  }, [value]);

  const display = isMonthValue(value)
    ? new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "Select month";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          data-testid={dataTestId}
          className={cn("w-full justify-start bg-background/50 text-left font-normal border-primary/30 hover:bg-background/70", className)}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {display}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border border-primary/30 bg-background p-4 shadow-md glassmorphic">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon" aria-label="Previous year" className="h-8 w-8" onClick={() => setYear((current) => current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <p className="font-medium text-sm">{year}</p>
            <Button type="button" variant="ghost" size="icon" aria-label="Next year" className="h-8 w-8" onClick={() => setYear((current) => current + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {monthNames.map((name, index) => {
              const selected = value === toMonthValue(year, index);
              return <Button key={name} type="button" variant="ghost" size="sm" aria-pressed={selected} className={cn("justify-center", selected && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")} onClick={() => { onChange(toMonthValue(year, index)); setOpen(false); }}>{name.slice(0, 3)}</Button>;
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
