"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

// components
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/shared/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/shared/components/ui/popover";

// utils
import { cn } from "@/shared/utils/cn";

export interface ComboboxOption {
    value: string;
    label: string;
    keywords?: string[];
}

export interface ComboboxProps {
    options: ComboboxOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    disabled?: boolean;
    className?: string;
    id?: string;
}

export function Combobox({
    options,
    value,
    onChange,
    placeholder = "Seleccione una opción...",
    searchPlaceholder = "Buscar por nombre, lote o código...",
    emptyText = "Sin resultados",
    disabled = false,
    className,
    id
}: ComboboxProps): React.ReactElement {
    const [open, setOpen] = React.useState(false);

    const selectedOption = React.useMemo(
        () => options.find((opt) => opt.value === value),
        [options, value]
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    id={id}
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    disabled={disabled}
                    title={selectedOption ? selectedOption.label : undefined}
                    className={cn(
                        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                        !selectedOption && "text-muted-foreground",
                        className
                    )}
                >
                    <span className="truncate text-left">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] min-w-[300px] p-0"
                align="start"
            >
                <Command
                    filter={(itemValue, search, keywords = []) => {
                        const target = `${itemValue} ${keywords.join(" ")}`.toLowerCase();
                        return target.includes(search.trim().toLowerCase()) ? 1 : 0;
                    }}
                >
                    <CommandInput
                        placeholder={searchPlaceholder}
                        autoComplete="off"
                    />
                    <CommandList>
                        <CommandEmpty>{emptyText}</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.label}
                                    keywords={option.keywords}
                                    onSelect={() => {
                                        onChange(option.value);
                                        setOpen(false);
                                    }}
                                    className="flex items-start gap-2 py-2"
                                >
                                    <Check
                                        className={cn(
                                            "mt-0.5 h-4 w-4 shrink-0",
                                            value === option.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <span className="break-words leading-tight">
                                        {option.label}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
