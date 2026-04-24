import React, { useState, useEffect } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRightLeft, AlertCircle } from 'lucide-react';
import { formatarNumeroCartela } from '@/lib/utils/formatters';
import { Atribuicao, CartelaAtribuida } from '@/types/bingo';
import { cn } from '@/lib/utils';

interface TransferenciaModalProps {
  isOpen: boolean;
  onClose: () => void;
  atribuicaoOrigem: Atribuicao | null;
  cartelaNumero: number | null; // If null, show multi-select mode
}

const TransferenciaModal: React.FC<TransferenciaModalProps> = ({ 
  isOpen, 
  onClose, 
  atribuicaoOrigem, 
  cartelaNumero 
}) => {
  const { vendedores, atribuicoes, transferirCartelas } = useBingo();
  const { toast } = useToast();
  
  const [vendedorDestinoId, setVendedorDestinoId] = useState('');
  const [selectedCartelas, setSelectedCartelas] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter active sellers excluding the origin seller
  const vendedoresDisponiveis = vendedores.filter(v => 
    v.ativo && v.id !== atribuicaoOrigem?.vendedor_id
  );

  // Get active cartelas from the attribution
  const cartelasAtivas = atribuicaoOrigem?.cartelas.filter(c => c.status === 'ativa') || [];

  useEffect(() => {
    if (isOpen) {
      setVendedorDestinoId('');
      // If a specific cartela was passed, pre-select it
      if (cartelaNumero) {
        setSelectedCartelas([cartelaNumero]);
      } else {
        setSelectedCartelas([]);
      }
    }
  }, [isOpen, cartelaNumero]);

  const toggleCartela = (numero: number) => {
    setSelectedCartelas(prev => 
      prev.includes(numero)
        ? prev.filter(n => n !== numero)
        : [...prev, numero]
    );
  };

  const selectAll = () => {
    setSelectedCartelas(cartelasAtivas.map(c => c.numero));
  };

  const deselectAll = () => {
    setSelectedCartelas([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!atribuicaoOrigem || selectedCartelas.length === 0 || !vendedorDestinoId) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos uma cartela e um vendedor de destino.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      await transferirCartelas(
        atribuicaoOrigem.id,
        selectedCartelas,
        vendedorDestinoId
      );

      const vendedorDestino = vendedores.find(v => v.id === vendedorDestinoId);
      
      toast({
        title: "Transferência realizada",
        description: `${selectedCartelas.length} cartela(s) transferida(s) para ${vendedorDestino?.nome}.`
      });

      onClose();
    } catch (error: unknown) {
      toast({
        title: "Erro ao transferir",
        description: (error instanceof Error ? error.message : 'Erro inesperado') || "Não foi possível transferir as cartelas.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if destination seller already has an attribution
  const atribuicaoDestino = atribuicoes.find(a => a.vendedor_id === vendedorDestinoId);

  const isSingleMode = cartelaNumero !== null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Transferir {isSingleMode ? 'Cartela' : 'Cartelas'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Origin info */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              De: <strong>{atribuicaoOrigem?.vendedor_nome}</strong>
            </p>
          </div>

          {/* Single cartela mode */}
          {isSingleMode && (
            <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
              <span className="px-3 py-1 bg-primary text-primary-foreground rounded-full font-bold">
                {formatarNumeroCartela(cartelaNumero)}
              </span>
              <span className="text-sm text-muted-foreground">Cartela selecionada</span>
            </div>
          )}

          {/* Multiple cartelas mode */}
          {!isSingleMode && cartelasAtivas.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Selecione as cartelas ({selectedCartelas.length} de {cartelasAtivas.length})</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                    Selecionar todas
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={deselectAll}>
                    Limpar
                  </Button>
                </div>
              </div>
              <div className="border border-border rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {cartelasAtivas.map(cartela => (
                    <button
                      key={cartela.numero}
                      type="button"
                      onClick={() => toggleCartela(cartela.numero)}
                      className={cn(
                        'w-12 h-12 rounded-lg font-bold text-sm transition-all duration-200 border-2',
                        selectedCartelas.includes(cartela.numero)
                          ? 'bg-primary text-primary-foreground border-primary shadow-glow'
                          : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                      )}
                    >
                      {formatarNumeroCartela(cartela.numero)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Destination seller */}
          <div className="space-y-2">
            <Label>Transferir para *</Label>
            <Select value={vendedorDestinoId} onValueChange={setVendedorDestinoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o vendedor de destino" />
              </SelectTrigger>
              <SelectContent>
                {vendedoresDisponiveis.map(v => {
                  const atribuicao = atribuicoes.find(a => a.vendedor_id === v.id);
                  return (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nome} {atribuicao && `(${atribuicao.cartelas.length} cartelas)`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {vendedoresDisponiveis.length === 0 && (
              <p className="text-sm text-warning">Nenhum outro vendedor ativo disponível</p>
            )}
          </div>

          {/* Info message */}
          {vendedorDestinoId && (
            <div className="bg-info/10 border border-info/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-info mt-0.5" />
              <div>
                <p className="text-sm text-foreground">
                  {atribuicaoDestino 
                    ? `As cartelas serão adicionadas à atribuição existente de ${vendedores.find(v => v.id === vendedorDestinoId)?.nome}.`
                    : `Uma nova atribuição será criada para ${vendedores.find(v => v.id === vendedorDestinoId)?.nome}.`
                  }
                </p>
              </div>
            </div>
          )}

          {/* Selected summary */}
          {selectedCartelas.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-sm">
                <strong>{selectedCartelas.length}</strong> cartela(s) selecionada(s): {' '}
                {selectedCartelas.sort((a, b) => a - b).slice(0, 10).map(n => formatarNumeroCartela(n)).join(', ')}
                {selectedCartelas.length > 10 && ` e mais ${selectedCartelas.length - 10}...`}
              </p>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <Button 
              type="submit" 
              className="flex-1 gap-2" 
              disabled={!vendedorDestinoId || selectedCartelas.length === 0 || isLoading}
            >
              <ArrowRightLeft className="w-4 h-4" />
              {isLoading ? 'Transferindo...' : `Transferir ${selectedCartelas.length} Cartela(s)`}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransferenciaModal;
