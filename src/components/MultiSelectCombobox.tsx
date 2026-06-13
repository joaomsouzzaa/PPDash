import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

interface MultiSelectComboboxProps {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Permite adicionar um valor digitado que não está na lista (campanha nova, Meta desconectado). */
  allowCustom?: boolean;
  emptyText?: string;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = "Selecione...",
  allowCustom = false,
  emptyText = "Nenhuma opção encontrada.",
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  // Selecionados sempre no topo (incluindo valores custom fora das opções),
  // seguidos pelas demais opções.
  const selectedSet = new Set(selected);
  const ordered = [
    ...selected,
    ...options.filter((o) => !selectedSet.has(o)),
  ];

  const trimmed = query.trim();
  const showCustom =
    allowCustom &&
    trimmed.length > 0 &&
    !options.some((o) => o.toLowerCase() === trimmed.toLowerCase()) &&
    !selected.some((s) => s.toLowerCase() === trimmed.toLowerCase());

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selecionados`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            selected.length === 0 && "text-muted-foreground",
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Buscar..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{allowCustom ? "Digite para adicionar um valor." : emptyText}</CommandEmpty>
            {showCustom && (
              <CommandGroup>
                <CommandItem
                  value={`__add__${trimmed}`}
                  onSelect={() => {
                    toggle(trimmed);
                    setQuery("");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar "{trimmed}"
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {ordered.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => toggle(option)}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedSet.has(option) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{option}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
