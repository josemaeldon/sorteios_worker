import React from 'react';
import { Dice5, BarChart3, Users, Grid3X3, ListTodo, ShoppingCart, PieChart, Shuffle, LayoutGrid } from 'lucide-react';
import { useBingo } from '@/contexts/BingoContext';
import { TabType } from '@/types/bingo';
import { cn } from '@/lib/utils';

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
    <nav className="bg-card shadow-sm border-b border-border sticky top-0 z-40">
      <div className="container mx-auto px-4">
        <div className="flex overflow-x-auto space-x-1 scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            const isDisabled = tab.id !== 'sorteios' && !sorteioAtivo;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                disabled={isDisabled}
                className={cn(
                  'py-4 px-6 font-semibold whitespace-nowrap flex items-center gap-2 transition-all duration-200 border-b-3',
                  isActive 
                    ? 'border-b-primary text-primary' 
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                  isDisabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
