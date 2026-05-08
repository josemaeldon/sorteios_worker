import React from 'react';
import { Dice5, BarChart3, Users, Grid3X3, ListTodo, ShoppingCart, PieChart, Shuffle, LayoutGrid } from 'lucide-react';
import { useBingo } from '@/contexts/BingoContext';
import { TabType } from '@/types/bingo';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';

const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: 'sorteios', label: 'Sorteios', icon: Dice5 },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'sorteio', label: 'Sortear', icon: Shuffle },
  { id: 'vendedores', label: 'Vendedores', icon: Users },
  { id: 'cartelas', label: 'Cartelas', icon: Grid3X3 },
  { id: 'cartelas-bingo', label: 'Construtor', icon: LayoutGrid },
  { id: 'atribuicoes', label: 'Atribuições', icon: ListTodo },
  { id: 'vendas', label: 'Vendas', icon: ShoppingCart },
  { id: 'relatorios', label: 'Relatórios', icon: PieChart },
];

const Navigation: React.FC = () => {
  const { currentTab, setCurrentTab, sorteioAtivo } = useBingo();

  const handleTabClick = (tabId: TabType) => {
    if (tabId !== 'sorteios' && !sorteioAtivo) {
      return;
    }
    setCurrentTab(tabId);
  };

  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-sidebar-foreground/90 group-data-[collapsible=icon]:hidden">
            Menu
          </span>
          <SidebarTrigger className="h-7 w-7" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                const isDisabled = tab.id !== 'sorteios' && !sorteioAtivo;

                return (
                  <SidebarMenuItem key={tab.id}>
                    <SidebarMenuButton
                      onClick={() => handleTabClick(tab.id)}
                      disabled={isDisabled}
                      isActive={isActive}
                      tooltip={tab.label}
                      className={cn(isDisabled && 'opacity-50 cursor-not-allowed')}
                    >
                      <Icon />
                      <span>{tab.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
};

export default Navigation;
