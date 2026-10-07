"use client";

import { useState, useSyncExternalStore } from "react";
import { Banknote, CreditCard, FileText, LayoutDashboard, Menu, Orbit, PanelLeftClose, PanelLeftOpen, Repeat2, Tags, TrendingUp, Upload, Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

export const APP_PAGES = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "incomes", label: "Ganhos", icon: TrendingUp },
  { id: "expenses", label: "Gastos", icon: Wallet },
  { id: "cards", label: "Cartões e faturas", icon: CreditCard },
  { id: "installments", label: "Parcelamentos", icon: Repeat2 },
  { id: "debts", label: "Dívidas", icon: Banknote },
  { id: "imports", label: "Importações", icon: Upload },
  { id: "categories", label: "Categorias", icon: Tags },
  { id: "notes", label: "Notas", icon: FileText },
] as const;
export type AppPage = (typeof APP_PAGES)[number]["id"];
const SIDEBAR_KEY = "orbt.sidebar.collapsed";
function subscribeSidebar(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("orbt-sidebar-change", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("orbt-sidebar-change", listener); };
}

function Navigation({ page, navigate }: { page: AppPage; navigate: (page: AppPage) => void }) {
  return <nav aria-label="Seções do sistema" className="sidebar-navigation">
    <span className="sidebar-group-label">Finanças</span>
    {APP_PAGES.filter((item) => item.id !== "notes").map((item) => <button key={item.id} aria-label={item.label} title={item.label} aria-current={page === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><item.icon size={19} aria-hidden="true" /><span>{item.label}</span></button>)}
    <div className="sidebar-divider" />
    <button aria-label="Notas" title="Notas" aria-current={page === "notes" ? "page" : undefined} onClick={() => navigate("notes")}><FileText size={19} aria-hidden="true" /><span>Notas</span></button>
  </nav>;
}

export function AppSidebar({ page, navigate }: { page: AppPage; navigate: (page: AppPage) => Promise<boolean> }) {
  const [fallback, setFallback] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, () => {
    try { return localStorage.getItem(SIDEBAR_KEY) === "true"; } catch { return fallback; }
  }, () => false);
  function toggle() {
    const next = !collapsed;
    try {
      localStorage.setItem(SIDEBAR_KEY, String(next));
      window.dispatchEvent(new Event("orbt-sidebar-change"));
    } catch { setFallback(next); }
  }
  return <aside className={`app-sidebar ${collapsed ? "sidebar-collapsed" : ""}`} aria-label="Menu principal">
    <div className="sidebar-brand"><Orbit size={25} /><strong>Orbt</strong></div>
    <Navigation page={page} navigate={(next) => void navigate(next)} />
    <Button variant="ghost" className="sidebar-toggle" aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expandir sidebar" : "Recolher sidebar"} onClick={toggle}>
      {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}<span>Recolher</span>
    </Button>
  </aside>;
}

export function MobileNavigation({ page, navigate }: { page: AppPage; navigate: (page: AppPage) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="ghost" size="icon" className="mobile-menu-trigger" aria-label="Abrir menu" aria-expanded={open}><Menu /></Button></DialogTrigger>
    <DialogContent className="mobile-sidebar" style={{ top: 0, left: 0, translate: "0 0", transform: "none" }}><DialogHeader><DialogTitle>Orbt</DialogTitle><DialogDescription>Sua central pessoal</DialogDescription></DialogHeader>
      <Navigation page={page} navigate={async (next) => { if (await navigate(next)) setOpen(false); }} />
    </DialogContent>
  </Dialog>;
}
