import React, { useRef } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatarData, formatarDataHora, formatarMoeda, formatarNumeroCartela } from '@/lib/utils/formatters';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer, Receipt } from 'lucide-react';

interface ReciboModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendaId: string | null;
}

const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao: 'Cartão',
  transferencia: 'Transferência',
};

const ReciboModal: React.FC<ReciboModalProps> = ({ isOpen, onClose, vendaId }) => {
  const { vendas, sorteioAtivo } = useBingo();
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const venda = vendas.find(v => v.id === vendaId);

  const handlePrint = () => {
    if (!printRef.current) return;
    const conteudo = printRef.current.innerHTML;
    const janela = window.open('', '_blank', 'width=600,height=800');
    if (!janela) return;
    janela.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Recibo de Venda</title>
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
            .recibo-total { border-top: 2px solid #111; padding-top: 12px; margin-top: 8px; }
            .recibo-total .row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 15px; }
            .recibo-total .row.destaque { font-weight: bold; font-size: 17px; }
            .status-badge { display: inline-block; padding: 2px 12px; border-radius: 99px; font-size: 13px; font-weight: bold; }
            .status-concluida { background: #dcfce7; color: #16a34a; }
            .status-pendente { background: #fef9c3; color: #ca8a04; }
            .recibo-footer { text-align: center; margin-top: 24px; font-size: 12px; color: #888; border-top: 1px solid #ddd; padding-top: 12px; }
            .recibo-assinaturas { display: flex; justify-content: space-between; gap: 32px; margin-top: 48px; }
            .recibo-assinaturas > div { flex: 1; text-align: center; }
            .recibo-assinaturas .linha { border-top: 1px solid #111; padding-top: 6px; margin-top: 48px; }
            .recibo-assinaturas .linha p { font-size: 12px; color: #555; margin-top: 2px; }
            .recibo-assinaturas .linha p.titulo { font-weight: bold; color: #111; }
          </style>
        </head>
        <body>${conteudo}</body>
      </html>
    `);
    janela.document.close();
    janela.focus();
    janela.print();
    janela.close();
  };

  if (!venda) return null;

  const numerosCartelas = venda.numeros_cartelas.split(',').map(n => n.trim()).filter(Boolean);
  const saldoRestante = Number(venda.valor_total || 0) - Number(venda.valor_pago || 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Recibo de Venda
          </DialogTitle>
        </DialogHeader>

        {/* Conteúdo imprimível */}
        <div ref={printRef}>
          {/* Cabeçalho */}
          <div className="recibo-header text-center border-b pb-4 mb-4">
            <h1 className="text-xl font-bold">RECIBO DE VENDA</h1>
            {sorteioAtivo && (
              <p className="text-sm text-muted-foreground mt-1">{sorteioAtivo.nome}</p>
            )}
          </div>

          {/* Identificação da venda */}
          <div className="recibo-section mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b pb-1 mb-2">
              Identificação
            </h2>
            <div className="recibo-row flex justify-between mb-1">
              <span className="label text-muted-foreground text-sm">Nº do Recibo</span>
              <span className="value font-semibold text-sm text-right">{venda.id.slice(-8).toUpperCase()}</span>
            </div>
            <div className="recibo-row flex justify-between mb-1">
              <span className="label text-muted-foreground text-sm">Data da Venda</span>
              <span className="value font-semibold text-sm text-right">{formatarDataHora(venda.data_venda)}</span>
            </div>
            {sorteioAtivo && (
              <>
                <div className="recibo-row flex justify-between mb-1">
                  <span className="label text-muted-foreground text-sm">Sorteio</span>
                  <span className="value font-semibold text-sm text-right">{sorteioAtivo.nome}</span>
                </div>
                <div className="recibo-row flex justify-between mb-1">
                  <span className="label text-muted-foreground text-sm">Data do Sorteio</span>
                  <span className="value font-semibold text-sm text-right">{formatarData(sorteioAtivo.data_sorteio)}</span>
                </div>
              </>
            )}
          </div>

          {/* Dados do cliente */}
          <div className="recibo-section mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b pb-1 mb-2">
              Comprador
            </h2>
            <div className="recibo-row flex justify-between mb-1">
              <span className="label text-muted-foreground text-sm">Nome</span>
              <span className="value font-semibold text-sm text-right">{venda.cliente_nome}</span>
            </div>
            {venda.cliente_telefone && (
              <div className="recibo-row flex justify-between mb-1">
                <span className="label text-muted-foreground text-sm">Telefone</span>
                <span className="value font-semibold text-sm text-right">{venda.cliente_telefone}</span>
              </div>
            )}
          </div>

          {/* Dados do vendedor */}
          {venda.vendedor_nome && (
            <div className="recibo-section mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b pb-1 mb-2">
                Vendedor
              </h2>
              <div className="recibo-row flex justify-between mb-1">
                <span className="label text-muted-foreground text-sm">Nome</span>
                <span className="value font-semibold text-sm text-right">{venda.vendedor_nome}</span>
              </div>
            </div>
          )}

          {/* Cartelas */}
          <div className="recibo-section mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b pb-1 mb-2">
              Cartelas / Números ({numerosCartelas.length})
            </h2>
            <div className="numeros flex flex-wrap gap-1.5 mt-2">
              {numerosCartelas.map((num, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 bg-emerald-500 text-white rounded-md text-sm font-bold"
                >
                  {formatarNumeroCartela(parseInt(num))}
                </span>
              ))}
            </div>
          </div>

          {/* Pagamentos */}
          {venda.pagamentos && venda.pagamentos.length > 0 && (
            <div className="recibo-section mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b pb-1 mb-2">
                Formas de Pagamento
              </h2>
              {venda.pagamentos.map((pag, idx) => (
                <div key={idx} className="recibo-row flex justify-between mb-1">
                  <span className="label text-muted-foreground text-sm capitalize">
                    {FORMA_PAGAMENTO_LABEL[pag.forma_pagamento] ?? pag.forma_pagamento}
                  </span>
                  <span className="value font-semibold text-sm text-right">{formatarMoeda(pag.valor)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Totais */}
          <div className="recibo-total border-t pt-3 mt-2">
            <div className="flex justify-between mb-1">
              <span className="text-sm text-muted-foreground">Valor Total</span>
              <span className="font-bold text-sm">{formatarMoeda(venda.valor_total)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-sm text-muted-foreground">Valor Pago</span>
              <span className="font-bold text-sm text-emerald-600">{formatarMoeda(venda.valor_pago)}</span>
            </div>
            {saldoRestante > 0 && (
              <div className="flex justify-between mb-1">
                <span className="text-sm text-muted-foreground">Saldo Restante</span>
                <span className="font-bold text-sm text-amber-600">{formatarMoeda(saldoRestante)}</span>
              </div>
            )}
            <div className="flex justify-between items-center mt-2 pt-2 border-t">
              <span className="text-sm font-semibold">Status</span>
              <span className={`px-3 py-0.5 rounded-full text-xs font-bold ${
                venda.status === 'concluida'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {venda.status === 'concluida' ? 'Concluída' : 'Pendente'}
              </span>
            </div>
          </div>

          {/* Assinaturas */}
          <div className="recibo-assinaturas mt-12 flex justify-between gap-8">
            <div className="flex-1 text-center">
              <div className="linha border-t border-black pt-2 mt-12">
                <p className="text-xs text-muted-foreground">{venda.cliente_nome}</p>
                <p className="titulo text-xs font-bold">Quem Pagou</p>
              </div>
            </div>
            <div className="flex-1 text-center">
              <div className="linha border-t border-black pt-2 mt-12">
                <p className="text-xs text-muted-foreground">{user?.nome || venda.vendedor_nome || 'Responsável'}</p>
                <p className="titulo text-xs font-bold">Quem Recebeu</p>
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="recibo-footer text-center mt-6 pt-3 border-t text-xs text-muted-foreground">
            <p>Documento gerado em {new Date().toLocaleString('pt-BR')}</p>
            {sorteioAtivo?.premio && (
              <p className="mt-1">Prêmio: {sorteioAtivo.premio}</p>
            )}
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-3 pt-2">
          <Button onClick={handlePrint} className="flex-1 gap-2">
            <Printer className="w-4 h-4" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReciboModal;
