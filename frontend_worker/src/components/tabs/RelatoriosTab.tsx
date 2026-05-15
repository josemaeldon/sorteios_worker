import React, { useState } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { PieChart, FileText, FileSpreadsheet, Download, Users, ShoppingCart, CreditCard, Package, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
  const cartelasDevolvidas = cartelas.filter(c => c.status === 'devolvida').length;
  const totalPendente = Math.max(0, totalVendas - totalPago);
  const tipoSorteio = sorteioAtivo.tipo === 'rifa' ? 'Rifa' : 'Bingo';
  const papelW = sorteioAtivo.papel_largura ?? 210;
  const papelH = sorteioAtivo.papel_altura ?? 297;
  const gradeCols = sorteioAtivo.grade_colunas ?? 5;
  const gradeRows = sorteioAtivo.grade_linhas ?? 5;
  const semGrade = sorteioAtivo.apenas_numero_rifa === true;

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

  const exportCards = [
    { id: 'vendas', titulo: 'Vendas', descricao: 'Clientes, valores, pagamentos e status', icon: ShoppingCart, colorClass: 'text-primary', disabled: vendas.length === 0 },
    { id: 'cartelas', titulo: 'Cartelas', descricao: 'Status geral e responsável por cartela', icon: Package, colorClass: 'text-emerald-600', disabled: cartelas.length === 0 },
    { id: 'atribuicoes', titulo: 'Atribuições', descricao: 'Distribuição de cartelas por vendedor', icon: CreditCard, colorClass: 'text-amber-600', disabled: atribuicoes.length === 0 },
    { id: 'vendedores', titulo: 'Vendedores', descricao: 'Performance e faturamento por vendedor', icon: Users, colorClass: 'text-sky-600', disabled: vendedores.length === 0 },
  ] as const;

  return (
    <div className="animate-fade-in space-y-6">
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                <PieChart className="w-6 h-6" />
                Relatórios
              </h2>
              <p className="text-sm text-muted-foreground">{sorteioAtivo.nome}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{tipoSorteio}</Badge>
              <Badge variant="outline">{papelW}mm × {papelH}mm</Badge>
              <Badge variant={semGrade ? 'secondary' : 'outline'}>
                {semGrade ? 'Sem grade' : `Grade ${gradeCols} × ${gradeRows} (${gradeCols * gradeRows})`}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Receita</p>
            <p className="text-base font-bold text-foreground">{formatarMoeda(totalVendas)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-success/10 to-success/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Recebido</p>
            <p className="text-base font-bold text-foreground">{formatarMoeda(totalPago)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-warning/10 to-warning/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Pendente</p>
            <p className="text-base font-bold text-foreground">{formatarMoeda(totalPendente)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-info/10 to-info/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Vendas</p>
            <p className="text-base font-bold text-foreground">{vendas.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-muted/80 to-muted/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Vendedores ativos</p>
            <p className="text-base font-bold text-foreground">{vendedores.filter(v => v.ativo).length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {exportCards.map((report) => {
          const Icon = report.icon;
          return (
            <Card key={report.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${report.colorClass}`} />
                      {report.titulo}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{report.descricao}</p>
                  </div>
                  <Badge variant={report.disabled ? 'secondary' : 'outline'}>
                    {report.disabled ? 'Sem dados' : 'Pronto'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handleExport(report.id, 'pdf')}
                    variant="outline"
                    size="sm"
                    disabled={report.disabled}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                  <Button
                    onClick={() => handleExport(report.id, 'excel')}
                    variant="outline"
                    size="sm"
                    disabled={report.disabled}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Excel
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4 text-primary" />
              Relatório por vendedor
            </CardTitle>
            <CardDescription>Escolha um vendedor para exportação individual</CardDescription>
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
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => handleExport('vendedor', 'pdf')}
                variant="outline"
                size="sm"
                disabled={selectedVendedorId === 'todos'}
              >
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button
                onClick={() => handleExport('vendedor', 'excel')}
                variant="outline"
                size="sm"
                disabled={selectedVendedorId === 'todos'}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutGrid className="w-4 h-4 text-primary" />
              Mapa de cartelas
            </CardTitle>
            <CardDescription>Status atual para leitura rápida</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Disponíveis</span><span className="font-semibold">{cartelasDisponiveis}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Atribuídas</span><span className="font-semibold">{cartelasAtribuidas}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Vendidas</span><span className="font-semibold">{cartelasVendidas}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Devolvidas</span><span className="font-semibold">{cartelasDevolvidas}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="w-5 h-5 text-primary" />
            Relatório Completo
          </CardTitle>
          <CardDescription>Documento único em PDF com consolidado de vendas, vendedores e indicadores</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => handleExport('completo', 'pdf')}
            className="w-full"
            disabled={isGeneratingCompletePdf}
          >
            <FileText className="w-4 h-4 mr-2" />
            {isGeneratingCompletePdf ? 'Gerando PDF no servidor...' : 'Gerar PDF completo'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default RelatoriosTab;
