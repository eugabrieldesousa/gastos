"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const subscribe = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;
const themes = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

export function ThemeMenu() {
  const mounted = useSyncExternalStore(subscribe, getMounted, getServerMounted);
  const { theme, setTheme } = useTheme();
  const selected = mounted ? themes.find((option) => option.value === theme) : undefined;
  const Icon = selected?.icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="theme-button"
          disabled={!mounted}
          aria-label={selected ? `Tema: ${selected.label}` : "Tema"}
        >
          <Icon aria-hidden="true" size={14} />
          Tema
          <ChevronDown aria-hidden="true" size={13} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Escolher tema">
        <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
          {themes.map(({ value, label, icon: OptionIcon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="theme-option">
              <OptionIcon aria-hidden="true" />{label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
