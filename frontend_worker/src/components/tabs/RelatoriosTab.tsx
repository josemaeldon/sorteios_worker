import React, { useState } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { PieChart, FileText, FileSpreadsheet, Download, Users, ShoppingCart, CreditCard, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/useApi';
import { formatarMoeda } from '@/lib/utils/formatters';
import {
  exportVendasPDF,
  exportVendasExcel,
  exportCartelasPDF,
  exportCartelasExcel,
  exportAtribuicoesPDF,
  exportAtribuicoesExcel,
  exportVendedoresPDF,
  exportVendedoresExcel,
  exportRelatorioVendedorPDF,
  exportRelatorioVendedorExcel,
} from '@/lib/utils/exportUtils';

const RelatoriosTab: React.FC = () => {
  const { sorteioAtivo, vendedores, cartelas, atribuicoes, vendas } = useBingo();
  const { toast } = useToast();
  const { callApi } = useApi();
  const [selectedVendedorId, setSelectedVendedorId] = useState<string>('todos');
  const [isGeneratingCompletePdf, setIsGeneratingCompletePdf] = useState(false);

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <PieChart className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Relatórios</h2>
        <p className="text-muted-foreground">Selecione um sorteio para gerar relatórios</p>
      </div>
    );
  }

  // Estatísticas
  const totalVendas = vendas.reduce((acc, v) => acc + Number(v.valor_total || 0), 0);
  const totalPago = vendas.reduce((acc, v) => acc + Number(v.valor_pago || 0), 0);
  const cartelasVendidas = cartelas.filter(c => c.status === 'vendida').length;
  const cartelasDisponiveis = cartelas.filter(c => c.status === 'disponivel').length;
  const cartelasAtribuidas = cartelas.filter(c => c.status === 'ativa').length;

  const handleExport = async (type: string, format: 'pdf' | 'excel') => {
    try {
      switch (type) {
        case 'vendas':
          if (vendas.length === 0) {
            toast({ title: 'Sem dados', description: 'Não há vendas para exportar', variant: 'destructive' });
            return;
          }
          if (format === 'pdf') {
            await exportVendasPDF(vendas, sorteioAtivo, vendedores);
          } else {
            await exportVendasExcel(vendas, sorteioAtivo, vendedores);
          }
          break;
        case 'cartelas':
          if (cartelas.length === 0) {
            toast({ title: 'Sem dados', description: 'Não há cartelas para exportar', variant: 'destructive' });
            return;
          }
          if (format === 'pdf') {
            await exportCartelasPDF(cartelas, sorteioAtivo);
          } else {
            await exportCartelasExcel(cartelas, sorteioAtivo);
          }
          break;
        case 'atribuicoes':
          if (atribuicoes.length === 0) {
            toast({ title: 'Sem dados', description: 'Não há atribuições para exportar', variant: 'destructive' });
            return;
          }
          if (format === 'pdf') {
            await exportAtribuicoesPDF(atribuicoes, sorteioAtivo, vendedores);
          } else {
            await exportAtribuicoesExcel(atribuicoes, sorteioAtivo, vendedores);
          }
          break;
        case 'vendedores':
          if (vendedores.length === 0) {
            toast({ title: 'Sem dados', description: 'Não há vendedores para exportar', variant: 'destructive' });
            return;
          }
          if (format === 'pdf') {
            await exportVendedoresPDF(vendedores, atribuicoes, vendas, sorteioAtivo);
          } else {
            await exportVendedoresExcel(vendedores, atribuicoes, vendas, sorteioAtivo);
          }
          break;
        case 'vendedor': {
          if (selectedVendedorId === 'todos') {
            toast({ title: 'Selecione um vendedor', description: 'Escolha um vendedor para gerar o relatório individual', variant: 'destructive' });
            return;
          }
          const vendedor = vendedores.find(v => v.id === selectedVendedorId);
          if (!vendedor) return;
          if (format === 'pdf') {
            await exportRelatorioVendedorPDF(vendedor, atribuicoes, vendas, sorteioAtivo);
          } else {
            await exportRelatorioVendedorExcel(vendedor, atribuicoes, vendas, sorteioAtivo);
          }
          break;
        }
        case 'completo':
          if (isGeneratingCompletePdf) {
            return;
          }
          setIsGeneratingCompletePdf(true);
          try {
            const response = await callApi('generateRelatorioCompletoPdfLink', {
              sorteio_id: sorteioAtivo.id,
            }) as {
              download_url?: string;
              download_link?: string;
            };

            const resolvedUrl = response.download_link || response.download_url;
            if (!resolvedUrl) {
              throw new Error('Link de download não retornado pelo servidor.');
            }

            const href = resolvedUrl.startsWith('http')
              ? resolvedUrl
              : `${window.location.origin}${resolvedUrl}`;

            const anchor = document.createElement('a');
            anchor.href = href;
            anchor.rel = 'noopener noreferrer';
            anchor.target = '_blank';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
          } finally {
            setIsGeneratingCompletePdf(false);
          }
          break;
      }
      toast({ 
        title: 'Exportado com sucesso!', 
        description: `Relatório de ${type} exportado em ${format.toUpperCase()}` 
      });
    } catch (error) {
      toast({ 
        title: 'Erro ao exportar', 
        description: 'Ocorreu um erro ao gerar o arquivo', 
        variant: 'destructive' 
      });
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <PieChart className="w-6 h-6" />
        Relatórios - {sorteioAtivo.nome}
      </h2>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Receita Total</p>
                <p className="text-lg font-bold text-foreground">{formatarMoeda(totalVendas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-success/10 to-success/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/20 rounded-lg">
                <Package className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cartelas Vendidas</p>
                <p className="text-lg font-bold text-foreground">{cartelasVendidas} / {cartelas.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/10 to-warning/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/20 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Vendas</p>
                <p className="text-lg font-bold text-foreground">{vendas.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-info/10 to-info/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-info/20 rounded-lg">
                <Users className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vendedores Ativos</p>
                <p className="text-lg font-bold text-foreground">{vendedores.filter(v => v.ativo).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Relatórios disponíveis */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Relatório de Vendas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Relatório de Vendas
            </CardTitle>
            <CardDescription>
              Exportar todas as vendas com detalhes de clientes, vendedores e valores
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button 
              onClick={() => handleExport('vendas', 'pdf')}
              className="flex-1"
              variant="outline"
            >
              <FileText className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button 
              onClick={() => handleExport('vendas', 'excel')}
              className="flex-1"
              variant="outline"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel
            </Button>
          </CardContent>
        </Card>

        {/* Relatório de Cartelas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-success" />
              Relatório de Cartelas
            </CardTitle>
            <CardDescription>
              Lista completa de cartelas com status e vendedor responsável
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button 
              onClick={() => handleExport('cartelas', 'pdf')}
              className="flex-1"
              variant="outline"
            >
              <FileText className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button 
              onClick={() => handleExport('cartelas', 'excel')}
              className="flex-1"
              variant="outline"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel
            </Button>
          </CardContent>
        </Card>

        {/* Relatório de Atribuições */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-warning" />
              Relatório de Atribuições
            </CardTitle>
            <CardDescription>
              Cartelas atribuídas por vendedor com status de cada uma
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button 
              onClick={() => handleExport('atribuicoes', 'pdf')}
              className="flex-1"
              variant="outline"
            >
              <FileText className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button 
              onClick={() => handleExport('atribuicoes', 'excel')}
              className="flex-1"
              variant="outline"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel
            </Button>
          </CardContent>
        </Card>

        {/* Relatório de Vendedores */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-info" />
              Relatório de Vendedores
            </CardTitle>
            <CardDescription>
              Performance dos vendedores com cartelas e vendas realizadas
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button 
              onClick={() => handleExport('vendedores', 'pdf')}
              className="flex-1"
              variant="outline"
            >
              <FileText className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button 
              onClick={() => handleExport('vendedores', 'excel')}
              className="flex-1"
              variant="outline"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Relatório por Vendedor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Relatório por Vendedor
          </CardTitle>
          <CardDescription>
            Relatório individual com cartelas atribuídas e vendas realizadas por vendedor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedVendedorId} onValueChange={setSelectedVendedorId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Selecione um vendedor...</SelectItem>
              {vendedores.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-3">
            <Button
              onClick={() => handleExport('vendedor', 'pdf')}
              className="flex-1"
              variant="outline"
              disabled={selectedVendedorId === 'todos'}
            >
              <FileText className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button
              onClick={() => handleExport('vendedor', 'excel')}
              className="flex-1"
              variant="outline"
              disabled={selectedVendedorId === 'todos'}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Relatório Completo */}
      <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Relatório Completo
          </CardTitle>
          <CardDescription>
            Documento PDF com resumo geral, vendas, vendedores e estatísticas do sorteio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => handleExport('completo', 'pdf')}
            className="w-full"
            disabled={isGeneratingCompletePdf}
          >
            <FileText className="w-4 h-4 mr-2" />
            {isGeneratingCompletePdf ? 'Gerando PDF no servidor...' : 'Gerar Relatório Completo em PDF'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default RelatoriosTab;
