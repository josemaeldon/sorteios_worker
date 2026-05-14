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
            .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
            .header h1 { font-size: 22px; font-weight: bold; }
            .header p { font-size: 13px; color: #555; margin-top: 4px; }
            .section { margin-bottom: 16px; }
            .section h2 { font-size: 13px; font-weight: bold; text-transform: uppercase; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .numero { display: inline-block; background: #1d4ed8; color: #fff; border-radius: 4px; padding: 4px 8px; margin: 3px; font-weight: bold; font-size: 13px; min-width: 40px; text-align: center; }
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
          <div className="text-center border-b pb-3 mb-4">
            <h2 className="text-xl font-bold">COMPROVANTE DE CARTELAS ENTREGUES</h2>
            <p className="text-sm text-muted-foreground mt-1">{data.sorteioNome}</p>
          </div>
          <div className="space-y-1 mb-4">
            <div className="flex justify-between"><span className="text-muted-foreground">Data/Hora</span><strong>{data.dataHora}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vendedor</span><strong>{data.vendedorNome}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><strong>{numerosOrdenados.length} cartela(s)</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Previsão de venda</span><strong>{formatarMoeda(totalPrevisto)}</strong></div>
          </div>
          <div className="border-t pt-3">
            <p className="text-sm font-semibold mb-2">Cartelas Entregues</p>
            <div className="flex flex-wrap gap-1.5">
              {numerosOrdenados.map((n) => (
                <span key={n} className="px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm font-bold">
                  {formatarNumeroCartela(n)}
                </span>
              ))}
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
