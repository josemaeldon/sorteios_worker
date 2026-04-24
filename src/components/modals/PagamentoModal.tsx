import React, { useState } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { formatarMoeda } from '@/lib/utils/formatters';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Save, Loader2 } from 'lucide-react';

interface PagamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendaId: string | null;
}

const PagamentoModal: React.FC<PagamentoModalProps> = ({ isOpen, onClose, vendaId }) => {
  const { vendas, updateVenda } = useBingo();
  const { toast } = useToast();
  const [valor, setValor] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<'dinheiro' | 'pix' | 'cartao' | 'transferencia'>('dinheiro');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const venda = vendas.find(v => v.id === vendaId);
  const saldoRestante = venda ? Number(venda.valor_total || 0) - Number(venda.valor_pago || 0) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendaId || !venda) return;

    setIsSubmitting(true);

    try {
      const valorPagamento = parseFloat(valor) || 0;
      const novoValorPago = Number(venda.valor_pago || 0) + valorPagamento;
      
      await updateVenda(vendaId, {
        valor_pago: novoValorPago,
        status: novoValorPago >= Number(venda.valor_total || 0) ? 'concluida' : 'pendente'
      });

      toast({ title: "Pagamento registrado", description: `Pagamento de ${formatarMoeda(valorPagamento)} registrado.` });
      setValor('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!venda) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Registrar Pagamento
          </DialogTitle>
        </DialogHeader>
        <div className="bg-muted/50 p-4 rounded-lg mb-4">
          <div className="flex justify-between mb-2"><span>Total:</span><span className="font-bold">{formatarMoeda(venda.valor_total)}</span></div>
          <div className="flex justify-between mb-2"><span>Pago:</span><span className="font-bold text-success">{formatarMoeda(venda.valor_pago)}</span></div>
          <div className="flex justify-between border-t pt-2"><span>Restante:</span><span className="font-bold text-warning">{formatarMoeda(saldoRestante)}</span></div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Valor do Pagamento *</Label>
            <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.00" required />
          </div>
          <div className="space-y-2">
            <Label>Forma de Pagamento</Label>
            <Select value={formaPagamento} onValueChange={(v: string) => setFormaPagamento(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-4 pt-4">
            <Button type="submit" className="flex-1 gap-2" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSubmitting ? 'Registrando...' : 'Registrar'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>Cancelar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PagamentoModal;
