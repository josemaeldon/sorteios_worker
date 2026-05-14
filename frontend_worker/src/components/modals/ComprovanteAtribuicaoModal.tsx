import React, { useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileDown, Printer, Receipt } from 'lucide-react';
import { formatarMoeda, formatarNumeroCartela } from '@/lib/utils/formatters';

export interface ComprovanteAtribuicaoData {
  sorteioNome: string;
  vendedorNome: string;
  numeros: number[];
  valorCartela: number;
  dataHora: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: ComprovanteAtribuicaoData | null;
}

const ComprovanteAtribuicaoModal: React.FC<Props> = ({ isOpen, onClose, data }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const numerosOrdenados = useMemo(() => [...(data?.numeros || [])].sort((a, b) => a - b), [data?.numeros]);
  const totalPrevisto = (data?.valorCartela || 0) * numerosOrdenados.length;

  const handlePrint = () => {
    if (!printRef.current || !data) return;
    const janela = window.open('', '_blank', 'width=700,height=900');
    if (!janela) return;
    janela.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Comprovante de Atribuição</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Arial, sans-serif; font-size: 14px; color: #111; padding: 24px; }
            .recibo-header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
            .recibo-header h1 { font-size: 22px; font-weight: bold; }
            .recibo-header p { font-size: 13px; color: #555; margin-top: 4px; }
            .recibo-section { margin-bottom: 16px; }
            .recibo-section h2 { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; }
            .recibo-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .recibo-row .label { color: #555; }
            .recibo-row .value { font-weight: 600; text-align: right; }
            .numeros { display: flex; flex-wrap: wrap; gap: 6px; }
            .numero { background: #16a34a; color: white; border-radius: 4px; padding: 4px 8px; font-weight: bold; font-size: 13px; min-width: 40px; text-align: center; }
            .recibo-assinaturas { display: flex; justify-content: space-between; gap: 32px; margin-top: 48px; }
            .recibo-assinaturas > div { flex: 1; text-align: center; }
            .recibo-assinaturas .linha { border-top: 1px solid #111; padding-top: 6px; margin-top: 48px; }
            .recibo-assinaturas .linha p { font-size: 12px; color: #555; margin-top: 2px; }
            .recibo-assinaturas .linha p.titulo { font-weight: bold; color: #111; }
          </style>
        </head>
        <body>${printRef.current.innerHTML}</body>
      </html>
    `);
    janela.document.close();
    janela.focus();
    janela.print();
    janela.close();
  };

  const handleSavePdf = async () => {
    if (!data) return;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Comprovante de Cartelas Entregues', 14, 20);
    doc.setFontSize(11);
    doc.text(`Sorteio: ${data.sorteioNome}`, 14, 30);
    doc.text(`Vendedor: ${data.vendedorNome}`, 14, 37);
    doc.text(`Data/Hora: ${data.dataHora}`, 14, 44);
    doc.text(`Quantidade: ${numerosOrdenados.length}`, 14, 51);
    doc.text(`Previsao de venda: ${formatarMoeda(totalPrevisto)}`, 14, 58);
    const rows = numerosOrdenados.map((n) => [formatarNumeroCartela(n)]);
    autoTable(doc, {
      startY: 66,
      head: [['Cartelas Entregues']],
      body: rows,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [29, 78, 216] },
      theme: 'striped',
    });
    doc.save(`comprovante-atribuicao-${data.vendedorNome.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  if (!data) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Comprovante de Entrega
          </DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
          <div className="recibo-header text-center border-b pb-4 mb-4">
            <h2 className="text-xl font-bold">COMPROVANTE DE CARTELAS ENTREGUES</h2>
            <p className="text-sm text-muted-foreground mt-1">{data.sorteioNome}</p>
          </div>
          <div className="recibo-section mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b pb-1 mb-2">
              Identificação
            </h2>
            <div className="recibo-row flex justify-between mb-1">
              <span className="label text-muted-foreground text-sm">Data/Hora</span>
              <span className="value font-semibold text-sm text-right">{data.dataHora}</span>
            </div>
            <div className="recibo-row flex justify-between mb-1">
              <span className="label text-muted-foreground text-sm">Vendedor</span>
              <span className="value font-semibold text-sm text-right">{data.vendedorNome}</span>
            </div>
            <div className="recibo-row flex justify-between mb-1">
              <span className="label text-muted-foreground text-sm">Quantidade</span>
              <span className="value font-semibold text-sm text-right">{numerosOrdenados.length} cartela(s)</span>
            </div>
            <div className="recibo-row flex justify-between mb-1">
              <span className="label text-muted-foreground text-sm">Previsão de venda</span>
              <span className="value font-semibold text-sm text-right">{formatarMoeda(totalPrevisto)}</span>
            </div>
          </div>

          <div className="recibo-section mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b pb-1 mb-2">
              Cartelas Entregues ({numerosOrdenados.length})
            </h2>
            <div className="numeros flex flex-wrap gap-1.5 mt-2">
              {numerosOrdenados.map((n) => (
                <span key={n} className="numero inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 bg-emerald-500 text-white rounded-md text-sm font-bold">
                  {formatarNumeroCartela(n)}
                </span>
              ))}
            </div>
          </div>

          <div className="recibo-assinaturas mt-12 flex justify-between gap-8">
            <div className="flex-1 text-center">
              <div className="linha border-t border-black pt-2 mt-12">
                <p className="text-xs text-muted-foreground">{data.vendedorNome}</p>
                <p className="titulo text-xs font-bold">Quem Recebeu</p>
              </div>
            </div>
            <div className="flex-1 text-center">
              <div className="linha border-t border-black pt-2 mt-12">
                <p className="text-xs text-muted-foreground">Responsável</p>
                <p className="titulo text-xs font-bold">Quem Entregou</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1 gap-2" onClick={handleSavePdf}>
            <FileDown className="w-4 h-4" />
            Salvar PDF
          </Button>
          <Button className="flex-1 gap-2" variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            Imprimir
          </Button>
          <Button className="flex-1" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ComprovanteAtribuicaoModal;
