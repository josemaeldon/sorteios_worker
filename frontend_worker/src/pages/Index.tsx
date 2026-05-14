import { BingoProvider, useBingo } from '@/contexts/BingoContext';
import { Navigate, useParams } from 'react-router-dom';
import { TabType } from '@/types/bingo';
import React from 'react';
import Header from '@/components/Header';
import Navigation from '@/components/Navigation';
import SorteiosTab from '@/components/tabs/SorteiosTab';
import DashboardTab from '@/components/tabs/DashboardTab';
import DrawTab from '@/components/tabs/DrawTab';
import VendedoresTab from '@/components/tabs/VendedoresTab';
import CartelasTab from '@/components/tabs/CartelasTab';
import AtribuicoesTab from '@/components/tabs/AtribuicoesTab';
import VendasTab from '@/components/tabs/VendasTab';
import RelatoriosTab from '@/components/tabs/RelatoriosTab';
import BingoCardsBuilderTab from '@/components/tabs/BingoCardsBuilderTab';

const validTabs: TabType[] = ['sorteios', 'dashboard', 'rodadas', 'vendedores', 'cartelas', 'atribuicoes', 'vendas', 'relatorios', 'sorteio', 'cartelas-bingo'];

const MainContent = () => {
  const { currentTab, setCurrentTab, sorteioAtivo, sorteios, setSorteioAtivo } = useBingo();
  const { tab, sorteioId } = useParams<{ tab: string; sorteioId?: string }>();

  if (!tab || !validTabs.includes(tab as TabType)) {
    return <Navigate to="/app/sorteios" replace />;
  }

  const routeTab = tab as TabType;
  React.useEffect(() => {
    if (currentTab !== routeTab) {
      setCurrentTab(routeTab);
    }
  }, [currentTab, routeTab, setCurrentTab]);

  React.useEffect(() => {
    if (sorteioId) {
      const selected = sorteios.find((s) => s.id === sorteioId) || null;
      if (selected && sorteioAtivo?.id !== selected.id) {
        setSorteioAtivo(selected);
      }
    }
  }, [sorteioId, sorteios, sorteioAtivo, setSorteioAtivo]);

  const renderTab = () => {
    switch (routeTab) {
      case 'sorteios': return <SorteiosTab />;
      case 'dashboard': return <DashboardTab />;
      case 'sorteio': return <DrawTab />;
      case 'vendedores': return <VendedoresTab />;
      case 'cartelas': return <CartelasTab />;
      case 'cartelas-bingo': return <BingoCardsBuilderTab />;
      case 'atribuicoes': return <AtribuicoesTab />;
      case 'vendas': return <VendasTab />;
      case 'relatorios': return <RelatoriosTab />;
      default: return <SorteiosTab />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Navigation />
      <main className="w-full max-w-none px-3 sm:px-4 lg:px-6 py-8">
        {renderTab()}
      </main>
    </div>
  );
};

const Index = () => {
  return (
    <BingoProvider>
      <MainContent />
    </BingoProvider>
  );
};

export default Index;
