import { BingoProvider, useBingo } from '@/contexts/BingoContext';
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

const MainContent = () => {
  const { currentTab } = useBingo();

  const renderTab = () => {
    switch (currentTab) {
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
      <main className="container mx-auto px-4 py-8">
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
