import { Venda, Cartela, Vendedor, Atribuicao, Sorteio } from '@/types/bingo';
import { formatarMoeda, formatarDataHora, getStatusLabel, formatarNumeroCartela } from './formatters';

type JsPdfCtor = (typeof import('jspdf'))['default'];
type AutoTableFn = (typeof import('jspdf-autotable'))['default'];
type XlsxModule = typeof import('xlsx');

let pdfToolsPromise: Promise<{ jsPDF: JsPdfCtor; autoTable: AutoTableFn }> | null = null;
let xlsxPromise: Promise<XlsxModule> | null = null;

const loadPdfTools = async (): Promise<{ jsPDF: JsPdfCtor; autoTable: AutoTableFn }> => {
  if (!pdfToolsPromise) {
    pdfToolsPromise = Promise.all([import('jspdf'), import('jspdf-autotable')]).then(
      ([jspdfModule, autoTableModule]) => ({
        jsPDF: jspdfModule.default,
        autoTable: autoTableModule.default,
      }),
    );
  }
  return pdfToolsPromise;
};

const loadXlsx = async (): Promise<XlsxModule> => {
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx');
  }
  return xlsxPromise;
};

// Helper function to parse cartelas string to array
const parseCartelas = (numeros_cartelas: string): number[] => {
  if (!numeros_cartelas) return [];
  return numeros_cartelas.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
};

// Helper to format premio (handles string or number)
const formatPremio = (premio: string | number): string => {
  if (typeof premio === 'number') return formatarMoeda(premio);
  const num = parseFloat(premio);
  return isNaN(num) ? premio : formatarMoeda(num);
};

// PDF Export Functions
export const exportVendasPDF = async (vendas: Venda[], sorteio: Sorteio, vendedores: Vendedor[]) => {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(59, 130, 246);
  doc.text('Relatório de Vendas', 14, 22);
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(`Sorteio: ${sorteio.nome}`, 14, 32);
  doc.text(`Data de geração: ${new Date().toLocaleString('pt-BR')}`, 14, 40);
  
  // Stats
  const totalVendas = vendas.length;
  const totalValor = vendas.reduce((acc, v) => acc + Number(v.valor_total || 0), 0);
  const totalPago = vendas.reduce((acc, v) => acc + Number(v.valor_pago || 0), 0);
  const totalPendente = totalValor - totalPago;
  
  doc.setFontSize(10);
  doc.text(`Total de vendas: ${totalVendas}`, 14, 50);
  doc.text(`Valor total: ${formatarMoeda(totalValor)}`, 14, 56);
  doc.text(`Valor pago: ${formatarMoeda(totalPago)}`, 80, 56);
  doc.text(`Valor pendente: ${formatarMoeda(totalPendente)}`, 140, 56);
  
  // Table
  const tableData = vendas.map(venda => {
    const vendedor = vendedores.find(v => v.id === venda.vendedor_id);
    const pagamentosStr = venda.pagamentos && venda.pagamentos.length > 0
      ? venda.pagamentos.map(p => `${p.forma_pagamento}: ${formatarMoeda(p.valor)}`).join(', ')
      : 'N/A';
    return [
      venda.cliente_nome,
      vendedor?.nome || 'N/A',
      venda.numeros_cartelas || '-',
      formatarMoeda(venda.valor_total),
      formatarMoeda(venda.valor_pago),
      pagamentosStr,
      getStatusLabel(venda.status),
      formatarDataHora(venda.created_at)
    ];
  });
  
  autoTable(doc, {
    startY: 65,
    head: [['Cliente', 'Vendedor', 'Cartelas', 'Valor Total', 'Valor Pago', 'Forma Pagamento', 'Status', 'Data']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  
  doc.save(`vendas-${sorteio.nome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportCartelasPDF = async (cartelas: Cartela[], sorteio: Sorteio) => {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(59, 130, 246);
  doc.text('Relatório de Cartelas', 14, 22);
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(`Sorteio: ${sorteio.nome}`, 14, 32);
  doc.text(`Data de geração: ${new Date().toLocaleString('pt-BR')}`, 14, 40);
  
  // Stats
  const disponiveis = cartelas.filter(c => c.status === 'disponivel').length;
  const atribuidas = cartelas.filter(c => c.status === 'ativa').length;
  const vendidas = cartelas.filter(c => c.status === 'vendida').length;
  const devolvidas = cartelas.filter(c => c.status === 'devolvida').length;
  
  doc.setFontSize(10);
  doc.text(`Total: ${cartelas.length}`, 14, 50);
  doc.text(`Disponíveis: ${disponiveis}`, 50, 50);
  doc.text(`Atribuídas: ${atribuidas}`, 95, 50);
  doc.text(`Vendidas: ${vendidas}`, 135, 50);
  doc.text(`Devolvidas: ${devolvidas}`, 170, 50);
  
  // Table
  const tableData = cartelas.map(cartela => [
    formatarNumeroCartela(cartela.numero),
    getStatusLabel(cartela.status),
    cartela.vendedor_nome || '-'
  ]);
  
  autoTable(doc, {
    startY: 60,
    head: [['Número', 'Status', 'Vendedor']],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  
  doc.save(`cartelas-${sorteio.nome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportAtribuicoesPDF = async (atribuicoes: Atribuicao[], sorteio: Sorteio, vendedores: Vendedor[]) => {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(59, 130, 246);
  doc.text('Relatório de Atribuições', 14, 22);
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(`Sorteio: ${sorteio.nome}`, 14, 32);
  doc.text(`Data de geração: ${new Date().toLocaleString('pt-BR')}`, 14, 40);
  
  // Stats
  const totalCartelas = atribuicoes.reduce((acc, a) => acc + a.cartelas.length, 0);
  const cartelasAtivas = atribuicoes.reduce((acc, a) => acc + a.cartelas.filter(c => c.status === 'ativa').length, 0);
  const cartelasVendidas = atribuicoes.reduce((acc, a) => acc + a.cartelas.filter(c => c.status === 'vendida').length, 0);
  
  doc.setFontSize(10);
  doc.text(`Total de atribuições: ${atribuicoes.length}`, 14, 50);
  doc.text(`Total de cartelas: ${totalCartelas}`, 80, 50);
  doc.text(`Ativas: ${cartelasAtivas}`, 130, 50);
  doc.text(`Vendidas: ${cartelasVendidas}`, 160, 50);
  
  // Table
  const tableData = atribuicoes.map(atrib => {
    const vendedor = vendedores.find(v => v.id === atrib.vendedor_id);
    const ativas = atrib.cartelas.filter(c => c.status === 'ativa').length;
    const vendidas = atrib.cartelas.filter(c => c.status === 'vendida').length;
    const devolvidas = atrib.cartelas.filter(c => c.status === 'devolvida').length;
    return [
      vendedor?.nome || 'N/A',
      atrib.cartelas.length.toString(),
      ativas.toString(),
      vendidas.toString(),
      devolvidas.toString(),
      formatarDataHora(atrib.created_at)
    ];
  });
  
  autoTable(doc, {
    startY: 60,
    head: [['Vendedor', 'Total Cartelas', 'Ativas', 'Vendidas', 'Devolvidas', 'Data Criação']],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  
  doc.save(`atribuicoes-${sorteio.nome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportVendedoresPDF = async (vendedores: Vendedor[], atribuicoes: Atribuicao[], vendas: Venda[], sorteio: Sorteio) => {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(59, 130, 246);
  doc.text('Relatório de Vendedores', 14, 22);
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(`Sorteio: ${sorteio.nome}`, 14, 32);
  doc.text(`Data de geração: ${new Date().toLocaleString('pt-BR')}`, 14, 40);
  
  // Table
  const tableData = vendedores.map(vendedor => {
    const atribuicao = atribuicoes.find(a => a.vendedor_id === vendedor.id);
    const vendasVendedor = vendas.filter(v => v.vendedor_id === vendedor.id);
    const totalVendas = vendasVendedor.reduce((acc, v) => acc + Number(v.valor_total || 0), 0);
    return [
      vendedor.nome,
      vendedor.telefone || '-',
      vendedor.email || '-',
      atribuicao?.cartelas.length.toString() || '0',
      vendasVendedor.length.toString(),
      formatarMoeda(totalVendas),
      vendedor.ativo ? 'Ativo' : 'Inativo'
    ];
  });
  
  autoTable(doc, {
    startY: 50,
    head: [['Nome', 'Telefone', 'Email', 'Cartelas', 'Vendas', 'Total Vendas', 'Status']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  
  doc.save(`vendedores-${sorteio.nome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
};

// Excel Export Functions
export const exportVendasExcel = async (vendas: Venda[], sorteio: Sorteio, vendedores: Vendedor[]) => {
  const XLSX = await loadXlsx();
  const data = vendas.map(venda => {
    const vendedor = vendedores.find(v => v.id === venda.vendedor_id);
    const cartelas = parseCartelas(venda.numeros_cartelas);
    const pagamentosStr = venda.pagamentos && venda.pagamentos.length > 0
      ? venda.pagamentos.map(p => `${p.forma_pagamento}: ${formatarMoeda(p.valor)}`).join(', ')
      : 'N/A';
    return {
      'Cliente': venda.cliente_nome,
      'Telefone Cliente': venda.cliente_telefone || '',
      'Vendedor': vendedor?.nome || 'N/A',
      'Cartelas': venda.numeros_cartelas || '-',
      'Qtd Cartelas': cartelas.length,
      'Valor Total': venda.valor_total,
      'Valor Pago': venda.valor_pago,
      'Valor Pendente': venda.valor_total - venda.valor_pago,
      'Forma Pagamento': pagamentosStr,
      'Status': getStatusLabel(venda.status),
      'Data': formatarDataHora(venda.created_at)
    };
  });
  
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
  
  // Auto-size columns
  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
  ws['!cols'] = colWidths;
  
  XLSX.writeFile(wb, `vendas-${sorteio.nome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportCartelasExcel = async (cartelas: Cartela[], sorteio: Sorteio) => {
  const XLSX = await loadXlsx();
  const data = cartelas.map(cartela => ({
    'Número': formatarNumeroCartela(cartela.numero),
    'Status': getStatusLabel(cartela.status),
    'Vendedor': cartela.vendedor_nome || '-'
  }));
  
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cartelas');
  
  const colWidths = [{ wch: 10 }, { wch: 15 }, { wch: 25 }];
  ws['!cols'] = colWidths;
  
  XLSX.writeFile(wb, `cartelas-${sorteio.nome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportAtribuicoesExcel = async (atribuicoes: Atribuicao[], sorteio: Sorteio, vendedores: Vendedor[]) => {
  const XLSX = await loadXlsx();
  const data = atribuicoes.flatMap(atrib => {
    const vendedor = vendedores.find(v => v.id === atrib.vendedor_id);
    return atrib.cartelas.map(cartela => ({
      'Vendedor': vendedor?.nome || 'N/A',
      'Número Cartela': formatarNumeroCartela(cartela.numero),
      'Status': getStatusLabel(cartela.status),
      'Data Atribuição': formatarDataHora(cartela.data_atribuicao),
      'Data Devolução': cartela.data_devolucao ? formatarDataHora(cartela.data_devolucao) : '-'
    }));
  });
  
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Atribuições');
  
  const colWidths = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
  ws['!cols'] = colWidths;
  
  XLSX.writeFile(wb, `atribuicoes-${sorteio.nome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportVendedoresExcel = async (vendedores: Vendedor[], atribuicoes: Atribuicao[], vendas: Venda[], sorteio: Sorteio) => {
  const XLSX = await loadXlsx();
  const data = vendedores.map(vendedor => {
    const atribuicao = atribuicoes.find(a => a.vendedor_id === vendedor.id);
    const vendasVendedor = vendas.filter(v => v.vendedor_id === vendedor.id);
    const totalVendas = vendasVendedor.reduce((acc, v) => acc + Number(v.valor_total || 0), 0);
    return {
      'Nome': vendedor.nome,
      'Telefone': vendedor.telefone || '-',
      'Email': vendedor.email || '-',
      'CPF': vendedor.cpf || '-',
      'Endereço': vendedor.endereco || '-',
      'Cartelas Atribuídas': atribuicao?.cartelas.length || 0,
      'Quantidade Vendas': vendasVendedor.length,
      'Total em Vendas': totalVendas,
      'Status': vendedor.ativo ? 'Ativo' : 'Inativo'
    };
  });
  
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vendedores');
  
  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
  ws['!cols'] = colWidths;
  
  XLSX.writeFile(wb, `vendedores-${sorteio.nome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`);
};

// Complete Report PDF
export const exportRelatorioCompletoPDF = async (
  sorteio: Sorteio,
  vendedores: Vendedor[],
  cartelas: Cartela[],
  atribuicoes: Atribuicao[],
  vendas: Venda[]
) => {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();
  
  // Cover page
  doc.setFontSize(28);
  doc.setTextColor(59, 130, 246);
  doc.text('Relatório Completo', 105, 60, { align: 'center' });
  
  doc.setFontSize(20);
  doc.setTextColor(60);
  doc.text(sorteio.nome, 105, 80, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(`Data de geração: ${new Date().toLocaleString('pt-BR')}`, 105, 100, { align: 'center' });
  
  // Summary stats
  const totalVendas = vendas.reduce((acc, v) => acc + Number(v.valor_total || 0), 0);
  const totalPago = vendas.reduce((acc, v) => acc + Number(v.valor_pago || 0), 0);
  const cartelasVendidas = cartelas.filter(c => c.status === 'vendida').length;
  
  // Calcular vendas por forma de pagamento
  const vendasPorPagamento = {
    dinheiro: 0,
    pix: 0,
    cartao: 0,
    transferencia: 0
  };
  
  const isValidPaymentType = (type: string): type is 'dinheiro' | 'pix' | 'cartao' | 'transferencia' => {
    return ['dinheiro', 'pix', 'cartao', 'transferencia'].includes(type);
  };
  
  vendas.forEach(venda => {
    if (venda.pagamentos && venda.pagamentos.length > 0) {
      venda.pagamentos.forEach(pag => {
        if (isValidPaymentType(pag.forma_pagamento)) {
          vendasPorPagamento[pag.forma_pagamento] += Number(pag.valor || 0);
        }
      });
    }
  });
  
  doc.setFontSize(14);
  doc.text('Resumo Geral', 14, 130);
  
  doc.setFontSize(11);
  doc.text(`Prêmio: ${formatPremio(sorteio.premio)}`, 14, 145);
  doc.text(`Valor por cartela: ${formatarMoeda(sorteio.valor_cartela)}`, 14, 155);
  doc.text(`Total de cartelas: ${cartelas.length}`, 14, 165);
  doc.text(`Cartelas vendidas: ${cartelasVendidas}`, 14, 175);
  doc.text(`Total de vendedores: ${vendedores.length}`, 14, 185);
  doc.text(`Total de vendas: ${vendas.length}`, 14, 195);
  doc.text(`Receita total: ${formatarMoeda(totalVendas)}`, 14, 205);
  doc.text(`Valor recebido: ${formatarMoeda(totalPago)}`, 14, 215);
  doc.text(`Valor pendente: ${formatarMoeda(totalVendas - totalPago)}`, 14, 225);
  
  // Breakdown por forma de pagamento
  doc.setFontSize(14);
  doc.text('Vendas por Forma de Pagamento', 14, 245);
  
  doc.setFontSize(11);
  let yPos = 260;
  doc.text(`Dinheiro: ${formatarMoeda(vendasPorPagamento.dinheiro)}`, 14, yPos);
  doc.text(`PIX: ${formatarMoeda(vendasPorPagamento.pix)}`, 100, yPos);
  yPos += 10;
  doc.text(`Cartão: ${formatarMoeda(vendasPorPagamento.cartao)}`, 14, yPos);
  doc.text(`Transferência: ${formatarMoeda(vendasPorPagamento.transferencia)}`, 100, yPos);
  
  // Page 2 - Vendas
  doc.addPage();
  doc.setFontSize(16);
  doc.setTextColor(59, 130, 246);
  doc.text('Vendas', 14, 20);
  
  const vendasData = vendas.map(venda => {
    const vendedor = vendedores.find(v => v.id === venda.vendedor_id);
    const cartelas = parseCartelas(venda.numeros_cartelas);
    const pagamentosStr = venda.pagamentos && venda.pagamentos.length > 0
      ? venda.pagamentos.map(p => p.forma_pagamento).join(', ')
      : 'N/A';
    return [
      venda.cliente_nome,
      vendedor?.nome || 'N/A',
      cartelas.length.toString(),
      formatarMoeda(venda.valor_total),
      pagamentosStr,
      getStatusLabel(venda.status)
    ];
  });
  
  autoTable(doc, {
    startY: 30,
    head: [['Cliente', 'Vendedor', 'Cartelas', 'Valor', 'Pagamento', 'Status']],
    body: vendasData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] },
  });
  
  // Page 3 - Vendedores
  doc.addPage();
  doc.setFontSize(16);
  doc.setTextColor(59, 130, 246);
  doc.text('Vendedores', 14, 20);
  
  const vendedoresData = vendedores.map(vendedor => {
    const atribuicao = atribuicoes.find(a => a.vendedor_id === vendedor.id);
    const vendasVendedor = vendas.filter(v => v.vendedor_id === vendedor.id);
    const total = vendasVendedor.reduce((acc, v) => acc + Number(v.valor_total || 0), 0);
    return [
      vendedor.nome,
      atribuicao?.cartelas.length.toString() || '0',
      vendasVendedor.length.toString(),
      formatarMoeda(total)
    ];
  });
  
  autoTable(doc, {
    startY: 30,
    head: [['Nome', 'Cartelas', 'Vendas', 'Total']],
    body: vendedoresData,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [59, 130, 246] },
  });
  
  doc.save(`relatorio-completo-${sorteio.nome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
};

// Per-seller report PDF
export const exportRelatorioVendedorPDF = async (
  vendedor: Vendedor,
  atribuicoes: Atribuicao[],
  vendas: Venda[],
  sorteio: Sorteio,
) => {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();

  const atribuicao = atribuicoes.find(a => a.vendedor_id === vendedor.id);
  const vendasVendedor = vendas.filter(v => v.vendedor_id === vendedor.id);
  const totalVendas = vendasVendedor.reduce((acc, v) => acc + Number(v.valor_total || 0), 0);
  const totalPago = vendasVendedor.reduce((acc, v) => acc + Number(v.valor_pago || 0), 0);

  // Header
  doc.setFontSize(20);
  doc.setTextColor(59, 130, 246);
  doc.text('Relatório do Vendedor', 14, 22);

  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(`Sorteio: ${sorteio.nome}`, 14, 32);
  doc.text(`Vendedor: ${vendedor.nome}`, 14, 40);
  if (vendedor.telefone) doc.text(`Telefone: ${vendedor.telefone}`, 14, 48);
  doc.text(`Data de geração: ${new Date().toLocaleString('pt-BR')}`, 14, vendedor.telefone ? 56 : 48);

  let yPos = vendedor.telefone ? 66 : 58;

  // Stats summary
  const ativas = atribuicao?.cartelas.filter(c => c.status === 'ativa').length ?? 0;
  const vendidas = atribuicao?.cartelas.filter(c => c.status === 'vendida').length ?? 0;
  const devolvidas = atribuicao?.cartelas.filter(c => c.status === 'devolvida').length ?? 0;
  const extraviadas = atribuicao?.cartelas.filter(c => c.status === 'extraviada').length ?? 0;
  const totalCartelas = atribuicao?.cartelas.length ?? 0;

  doc.setFontSize(10);
  doc.text(`Total de cartelas atribuídas: ${totalCartelas}`, 14, yPos);
  yPos += 8;
  doc.text(`Ativas: ${ativas}`, 14, yPos);
  doc.text(`Vendidas: ${vendidas}`, 60, yPos);
  doc.text(`Devolvidas: ${devolvidas}`, 100, yPos);
  doc.text(`Extraviadas: ${extraviadas}`, 145, yPos);
  yPos += 8;
  doc.text(`Total em vendas: ${formatarMoeda(totalVendas)}`, 14, yPos);
  doc.text(`Valor pago: ${formatarMoeda(totalPago)}`, 80, yPos);
  doc.text(`Pendente: ${formatarMoeda(totalVendas - totalPago)}`, 145, yPos);
  yPos += 12;

  // Cartelas table
  if (atribuicao && atribuicao.cartelas.length > 0) {
    doc.setFontSize(13);
    doc.setTextColor(59, 130, 246);
    doc.text('Cartelas Atribuídas', 14, yPos);
    yPos += 4;

    const cartelasData = atribuicao.cartelas.map(c => [
      formatarNumeroCartela(c.numero),
      getStatusLabel(c.status),
      formatarDataHora(c.data_atribuicao),
      c.data_devolucao ? formatarDataHora(c.data_devolucao) : '-',
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Cartela', 'Status', 'Data Atribuição', 'Data Devolução']],
      body: cartelasData,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });

    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Vendas table
  if (vendasVendedor.length > 0) {
    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(13);
    doc.setTextColor(59, 130, 246);
    doc.text('Vendas Realizadas', 14, yPos);
    yPos += 4;

    const vendasData = vendasVendedor.map(v => {
      const pagamentosStr = v.pagamentos && v.pagamentos.length > 0
        ? v.pagamentos.map(p => `${p.forma_pagamento}: ${formatarMoeda(p.valor)}`).join(', ')
        : 'N/A';
      return [
        v.cliente_nome || '-',
        v.numeros_cartelas || '-',
        formatarMoeda(v.valor_total),
        formatarMoeda(v.valor_pago),
        pagamentosStr,
        getStatusLabel(v.status),
        formatarDataHora(v.created_at),
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Cliente', 'Cartelas', 'Valor Total', 'Valor Pago', 'Pagamento', 'Status', 'Data']],
      body: vendasData,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  }

  const safeName = vendedor.nome.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  doc.save(`relatorio-vendedor-${safeName}-${new Date().toISOString().split('T')[0]}.pdf`);
};

// Per-seller report Excel
export const exportRelatorioVendedorExcel = async (
  vendedor: Vendedor,
  atribuicoes: Atribuicao[],
  vendas: Venda[],
  sorteio: Sorteio,
) => {
  const XLSX = await loadXlsx();

  const atribuicao = atribuicoes.find(a => a.vendedor_id === vendedor.id);
  const vendasVendedor = vendas.filter(v => v.vendedor_id === vendedor.id);

  const wb = XLSX.utils.book_new();

  // Sheet 1: Cartelas
  const cartelasData = (atribuicao?.cartelas ?? []).map(c => ({
    'Número': formatarNumeroCartela(c.numero),
    'Status': getStatusLabel(c.status),
    'Data Atribuição': formatarDataHora(c.data_atribuicao),
    'Data Devolução': c.data_devolucao ? formatarDataHora(c.data_devolucao) : '-',
  }));

  const wsCartelas = XLSX.utils.json_to_sheet(cartelasData);
  wsCartelas['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsCartelas, 'Cartelas');

  // Sheet 2: Vendas
  const vendasData = vendasVendedor.map(v => {
    const pagamentosStr = v.pagamentos && v.pagamentos.length > 0
      ? v.pagamentos.map(p => `${p.forma_pagamento}: ${formatarMoeda(p.valor)}`).join(', ')
      : 'N/A';
    return {
      'Cliente': v.cliente_nome || '-',
      'Cartelas': v.numeros_cartelas || '-',
      'Valor Total': v.valor_total,
      'Valor Pago': v.valor_pago,
      'Valor Pendente': v.valor_total - v.valor_pago,
      'Forma Pagamento': pagamentosStr,
      'Status': getStatusLabel(v.status),
      'Data': formatarDataHora(v.created_at),
    };
  });

  const wsVendas = XLSX.utils.json_to_sheet(vendasData);
  const defaultVendasCols = ['Cliente', 'Cartelas', 'Valor Total', 'Valor Pago', 'Valor Pendente', 'Forma Pagamento', 'Status', 'Data'];
  wsVendas['!cols'] = (vendasData.length > 0 ? Object.keys(vendasData[0]) : defaultVendasCols).map(k => ({ wch: Math.max(k.length, 15) }));
  XLSX.utils.book_append_sheet(wb, wsVendas, 'Vendas');

  const safeName = vendedor.nome.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  XLSX.writeFile(wb, `relatorio-vendedor-${safeName}-${new Date().toISOString().split('T')[0]}.xlsx`);
};
