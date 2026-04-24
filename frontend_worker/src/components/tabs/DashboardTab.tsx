import React, { useState } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { formatarMoeda } from '@/lib/utils/formatters';
import { BarChart3, DollarSign, Ticket, ShoppingCart, Users, TrendingUp, Trophy, Banknote, Smartphone, CreditCard, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DashboardTab: React.FC = () => {
  const { sorteioAtivo, vendedores, vendas, cartelas, setCurrentTab } = useBingo();
  const [isRankingModalOpen, setIsRankingModalOpen] = useState(false);

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Dashboard</h2>
        <p className="text-muted-foreground">Selecione um sorteio para visualizar o dashboard</p>
      </div>
    );
  }

  const cartelasVendidas = cartelas.filter(c => c.status === 'vendida').length;
  const cartelasAtribuidas = cartelas.filter(c => c.status === 'ativa').length;
  const cartelasDisponiveis = cartelas.filter(c => c.status === 'disponivel').length;
  const totalArrecadado = vendas.reduce((sum, v) => sum + Number(v.valor_pago || 0), 0);
  const totalVendas = vendas.length;
  const vendedoresAtivos = vendedores.filter(v => v.ativo).length;
  const percentualVendido = sorteioAtivo.quantidade_cartelas > 0 
    ? ((cartelasVendidas / sorteioAtivo.quantidade_cartelas) * 100) 
    : 0;

  // Calcular vendas por forma de pagamento
  const vendasPorPagamento = {
    dinheiro: { total: 0, count: 0 },
    pix: { total: 0, count: 0 },
    cartao: { total: 0, count: 0 },
    transferencia: { total: 0, count: 0 }
  };

  const isValidPaymentType = (type: string): type is 'dinheiro' | 'pix' | 'cartao' | 'transferencia' => {
    return ['dinheiro', 'pix', 'cartao', 'transferencia'].includes(type);
  };

  vendas.forEach(venda => {
    if (venda.pagamentos && venda.pagamentos.length > 0) {
      venda.pagamentos.forEach(pag => {
        if (isValidPaymentType(pag.forma_pagamento)) {
          vendasPorPagamento[pag.forma_pagamento].total += Number(pag.valor || 0);
          vendasPorPagamento[pag.forma_pagamento].count += 1;
        }
      });
    }
  });

  // Ranking de vendedores
  const rankingCompletoVendedores = vendedores
    .map(v => {
      const vendasVendedor = vendas.filter(venda => venda.vendedor_id === v.id);
      const totalVendido = vendasVendedor.reduce((sum, venda) => sum + Number(venda.valor_total || 0), 0);
      const cartelasVendidasVendedor = vendasVendedor.reduce((sum, venda) => 
        sum + venda.numeros_cartelas.split(',').length, 0);
      return {
        ...v,
        cartelas_vendidas: cartelasVendidasVendedor,
        valor_arrecadado: totalVendido
      };
    })
    .sort((a, b) => b.valor_arrecadado - a.valor_arrecadado);

  const rankingVendedores = rankingCompletoVendedores.slice(0, 5);

  const ultimasVendas = [...vendas]
    .sort((a, b) => new Date(b.data_venda).getTime() - new Date(a.data_venda).getTime())
    .slice(0, 5);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="w-6 h-6" />
        <h2 className="text-2xl font-bold text-foreground">
          Dashboard - {sorteioAtivo.nome}
        </h2>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Total Arrecadado</p>
                <p className="text-2xl font-bold text-foreground">{formatarMoeda(totalArrecadado)}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-full">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="mt-4 text-sm text-success flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              {percentualVendido.toFixed(1)}% do total
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Cartelas Vendidas</p>
                <p className="text-2xl font-bold text-foreground">{cartelasVendidas}</p>
                <p className="text-sm text-muted-foreground">
                  de {sorteioAtivo.quantidade_cartelas} total
                </p>
              </div>
              <div className="p-3 bg-success/10 rounded-full">
                <Ticket className="w-6 h-6 text-success" />
              </div>
            </div>
            <div className="progress-bar mt-4">
              <div className="progress-fill" style={{ width: `${percentualVendido}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Total de Vendas</p>
                <p className="text-2xl font-bold text-foreground">{totalVendas}</p>
              </div>
              <div className="p-3 bg-info/10 rounded-full">
                <ShoppingCart className="w-6 h-6 text-info" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              Média: {formatarMoeda(totalVendas > 0 ? totalArrecadado / totalVendas : 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Vendedores Ativos</p>
                <p className="text-2xl font-bold text-foreground">{vendedoresAtivos}</p>
              </div>
              <div className="p-3 bg-warning/10 rounded-full">
                <Users className="w-6 h-6 text-warning" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              de {vendedores.length} cadastrados
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status das Cartelas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <span className="text-lg font-bold text-muted-foreground">{cartelasDisponiveis}</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Disponíveis</p>
              <p className="text-sm text-muted-foreground">Prontas para atribuição</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
              <span className="text-lg font-bold text-warning">{cartelasAtribuidas}</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Atribuídas</p>
              <p className="text-sm text-muted-foreground">Com vendedores</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
              <span className="text-lg font-bold text-success">{cartelasVendidas}</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Vendidas</p>
              <p className="text-sm text-muted-foreground">Já comercializadas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumo de Vendas por Forma de Pagamento */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Vendas por Forma de Pagamento</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/20 rounded-lg">
                  <Banknote className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Dinheiro</p>
                  <p className="text-xl font-bold text-foreground">{formatarMoeda(vendasPorPagamento.dinheiro.total)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {vendasPorPagamento.dinheiro.count} pagamento(s)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <Smartphone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">PIX</p>
                  <p className="text-xl font-bold text-foreground">{formatarMoeda(vendasPorPagamento.pix.total)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {vendasPorPagamento.pix.count} pagamento(s)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-500/20 rounded-lg">
                  <CreditCard className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Cartão</p>
                  <p className="text-xl font-bold text-foreground">{formatarMoeda(vendasPorPagamento.cartao.total)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {vendasPorPagamento.cartao.count} pagamento(s)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 border-orange-200 dark:border-orange-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-500/20 rounded-lg">
                  <ArrowRightLeft className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Transferência</p>
                  <p className="text-xl font-bold text-foreground">{formatarMoeda(vendasPorPagamento.transferencia.total)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {vendasPorPagamento.transferencia.count} pagamento(s)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking de Vendedores */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-warning" />
              Ranking de Vendedores
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setIsRankingModalOpen(true)}>
              Ver completo
            </Button>
          </CardHeader>
          <CardContent>
            {rankingVendedores.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum vendedor cadastrado ainda
              </p>
            ) : (
              <div className="space-y-4">
                {rankingVendedores.map((vendedor, index) => (
                  <div key={vendedor.id} className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                      ${index === 0 ? 'bg-yellow-400 text-yellow-900' : 
                        index === 1 ? 'bg-gray-300 text-gray-700' : 
                        index === 2 ? 'bg-amber-600 text-amber-100' : 
                        'bg-muted text-muted-foreground'}`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{vendedor.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {vendedor.cartelas_vendidas} cartelas vendidas
                      </p>
                    </div>
                    <p className="font-bold text-foreground">
                      {formatarMoeda(vendedor.valor_arrecadado)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimas Vendas */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Últimas Vendas
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setCurrentTab('vendas')}>
              Ver todas
            </Button>
          </CardHeader>
          <CardContent>
            {ultimasVendas.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma venda registrada ainda
              </p>
            ) : (
              <div className="space-y-4">
                {ultimasVendas.map((venda) => (
                  <div key={venda.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium text-foreground">{venda.cliente_nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {venda.numeros_cartelas.split(',').length} cartela(s)
                      </p>
                    </div>
                    <p className="font-bold text-foreground">{formatarMoeda(venda.valor_total)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isRankingModalOpen} onOpenChange={setIsRankingModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-warning" />
              Ranking Completo de Vendedores
            </DialogTitle>
          </DialogHeader>
          {rankingCompletoVendedores.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum vendedor cadastrado ainda
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3">
              {rankingCompletoVendedores.map((vendedor, index) => (
                <div key={vendedor.id} className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/30">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                    ${index === 0 ? 'bg-yellow-400 text-yellow-900' : 
                      index === 1 ? 'bg-gray-300 text-gray-700' : 
                      index === 2 ? 'bg-amber-600 text-amber-100' : 
                      'bg-muted text-muted-foreground'}`}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{vendedor.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {vendedor.cartelas_vendidas} cartela(s) vendida(s)
                    </p>
                  </div>
                  <p className="font-bold text-foreground whitespace-nowrap">
                    {formatarMoeda(vendedor.valor_arrecadado)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DashboardTab;
