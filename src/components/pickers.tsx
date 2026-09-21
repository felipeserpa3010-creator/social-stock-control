import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ProductWithCategory } from "@/lib/queries";

export function ProductSelect({
  products,
  value,
  onChange,
  placeholder = "Selecionar produto",
  disabled,
  id,
}: {
  products: ProductWithCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);

  const grouped = useMemo(() => {
    const map = new Map<string, ProductWithCategory[]>();
    products.forEach((p) => {
      const key = p.categories?.nome ?? "Sem categoria";
      map.set(key, [...(map.get(key) ?? []), p]);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [products]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-9 w-full justify-between font-normal", !selected && "text-muted-foreground")}
        >
          <span className="truncate">
            {selected ? `${selected.nome} (${selected.unidade_medida})` : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar produto..." />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
            {grouped.map(([categoria, items]) => (
              <CommandGroup key={categoria} heading={categoria}>
                {items.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.nome} ${categoria} ${p.unidade_medida}`.toLowerCase()}
                    onSelect={() => {
                      onChange(p.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("size-4", value === p.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{p.nome}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {p.unidade_medida}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
