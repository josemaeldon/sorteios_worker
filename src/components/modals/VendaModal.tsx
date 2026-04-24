import React, { useState, useEffect } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { Venda, PagamentoVenda } from '@/types/bingo';
import { gerarId, formatarMoeda, formatarNumeroCartela } from '@/lib/utils/formatters';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, Save, Plus, Trash2, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
}

type TipoSelecao = 'individual' | 'faixa' | 'aleatorio';

const VendaModal: React.FC<VendaModalProps> = ({ isOpen, onClose, editingId }) => {
  const { sorteioAtivo, vendedores, cartelas, vendas, addVenda, updateVenda, atribuicoes } = useBingo();
  const { toast } = useToast();
  
  const [vendedorId, setVendedorId] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [cartelasSelecionadas, setCartelasSelecionadas] = useState<number[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoVenda[]>([{ forma_pagamento: 'dinheiro', valor: 0 }]);
  
  // Selection mode
  const [tipoSelecao, setTipoSelecao] = useState<TipoSelecao>('individual');
  const [faixaInput, setFaixaInput] = useState('');
  const [aleatorioInput, setAleatorioInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const vendedoresAtivos = vendedores.filter(v => v.ativo);
  const cartelasDoVendedor = cartelas.filter(c => c.vendedor_id === vendedorId && c.status === 'ativa');
  const valorCartela = sorteioAtivo?.valor_cartela || 0;
  const valorTotal = cartelasSelecionadas.length * valorCartela;
  const valorPago = pagamentos.reduce((sum, p) => sum + (p.valor || 0), 0);

  // Get cartelas already in sale (when editing)
  const cartelasNaVenda = editingId 
    ? vendas.find(v => v.id === editingId)?.numeros_cartelas.split(',').map(n => parseInt(n.trim())) || []
    : [];

  useEffect(() => {
    if (isOpen && editingId) {
      const venda = vendas.find(v => v.id === editingId);
      if (venda) {
        setVendedorId(venda.vendedor_id);
        setClienteNome(venda.cliente_nome);
        setClienteTelefone(venda.cliente_telefone || '');
        setCartelasSelecionadas(venda.numeros_cartelas.split(',').map(n => parseInt(n.trim())));
        setPagamentos(venda.pagamentos && venda.pagamentos.length > 0 
          ? venda.pagamentos 
          : [{ forma_pagamento: 'dinheiro', valor: venda.valor_pago }]);
        setTipoSelecao('individual');
        setFaixaInput('');
        setAleatorioInput('');
      }
    } else if (isOpen) {
      setVendedorId('');
      setClienteNome('');
      setClienteTelefone('');
      setCartelasSelecionadas([]);
      setPagamentos([{ forma_pagamento: 'dinheiro', valor: 0 }]);
      setTipoSelecao('individual');
      setFaixaInput('');
      setAleatorioInput('');
    }
  }, [isOpen, editingId, vendas]);

  const parseRange = (input: string): number[] => {
    const parts = input.split(/[-a]/i);
    if (parts.length === 2) {
      const start = parseInt(parts[0].trim());
      const end = parseInt(parts[1].trim());
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        const nums: number[] = [];
        for (let i = start; i <= end; i++) {
          nums.push(i);
        }
        return nums;
      }
    }
    return [];
  };

  const parseAleatoria = (input: string): number[] => {
    return input.split(/[,;\s]+/)
      .map(n => parseInt(n.trim()))
      .filter(n => !isNaN(n));
  };

  const aplicarFaixa = () => {
    const numeros = parseRange(faixaInput);
    const cartelasDisponiveis = cartelasDoVendedor.map(c => c.numero);
    const cartelasJaNaVenda = cartelasNaVenda;
    const disponiveis = [...cartelasDisponiveis, ...cartelasJaNaVenda];
    
    const validos = numeros.filter(n => disponiveis.includes(n) && !cartelasSelecionadas.includes(n));
    
    if (validos.length === 0) {
      toast({ title: "Atenção", description: "Nenhuma cartela válida encontrada na faixa especificada.", variant: "destructive" });
      return;
    }
    
    setCartelasSelecionadas(prev => [...prev, ...validos]);
    setFaixaInput('');
    toast({ title: "Sucesso", description: `${validos.length} cartela(s) adicionada(s).` });
  };

  const aplicarAleatorio = () => {
    const numeros = parseAleatoria(aleatorioInput);
    const cartelasDisponiveis = cartelasDoVendedor.map(c => c.numero);
    const cartelasJaNaVenda = cartelasNaVenda;
    const disponiveis = [...cartelasDisponiveis, ...cartelasJaNaVenda];
    
    const validos = numeros.filter(n => disponiveis.includes(n) && !cartelasSelecionadas.includes(n));
    
    if (validos.length === 0) {
      toast({ title: "Atenção", description: "Nenhuma cartela válida encontrada nos números especificados.", variant: "destructive" });
      return;
    }
    
    setCartelasSelecionadas(prev => [...prev, ...validos]);
    setAleatorioInput('');
    toast({ title: "Sucesso", description: `${validos.length} cartela(s) adicionada(s).` });
  };

  const toggleCartela = (numero: number) => {
    setCartelasSelecionadas(prev => 
      prev.includes(numero) ? prev.filter(n => n !== numero) : [...prev, numero]
    );
  };

  const removerCartela = (numero: number) => {
    setCartelasSelecionadas(prev => prev.filter(n => n !== numero));
  };

  const removerTodasCartelas = () => {
    setCartelasSelecionadas([]);
  };

  const addPagamento = () => {
    setPagamentos(prev => [...prev, { forma_pagamento: 'dinheiro', valor: 0 }]);
  };

  const removePagamento = (index: number) => {
    if (pagamentos.length > 1) {
      setPagamentos(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updatePagamento = (index: number, field: keyof PagamentoVenda, value: string | number) => {
    setPagamentos(prev => prev.map((p, i) => 
      i === index ? { ...p, [field]: value } : p
    ));
  };

  const distribuirValor = () => {
    const valorPorPagamento = valorTotal / pagamentos.length;
    setPagamentos(prev => prev.map(p => ({ ...p, valor: valorPorPagamento })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendedorId || cartelasSelecionadas.length === 0) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const vendedor = vendedores.find(v => v.id === vendedorId);
      
      // Filter out zero-value payments
      const pagamentosValidos = pagamentos.filter(p => p.valor > 0);
      const totalPago = pagamentosValidos.reduce((sum, p) => sum + p.valor, 0);

      const vendaData = {
        vendedor_id: vendedorId,
        vendedor_nome: vendedor?.nome,
        cliente_nome: clienteNome,
        cliente_telefone: clienteTelefone,
        numeros_cartelas: cartelasSelecionadas.join(','),
        valor_total: valorTotal,
        valor_pago: totalPago,
        pagamentos: pagamentosValidos.length > 0 ? pagamentosValidos : undefined,
        status: (totalPago >= valorTotal ? 'concluida' : 'pendente') as 'concluida' | 'pendente',
        data_venda: new Date().toISOString()
      };

      if (editingId) {
        await updateVenda(editingId, vendaData);
      } else {
        await addVenda(vendaData);
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get all available cartelas (from vendedor + already in sale when editing)
  const todasCartelasDisponiveis = editingId 
    ? [...cartelasDoVendedor, ...cartelas.filter(c => cartelasNaVenda.includes(c.numero) && c.vendedor_id === vendedorId)]
    : cartelasDoVendedor;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            {editingId ? 'Editar Venda' : 'Nova Venda'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Vendedor *</Label>
            <Select value={vendedorId} onValueChange={(v) => { setVendedorId(v); if (!editingId) setCartelasSelecionadas([]); }}>
              <SelectTrigger><SelectValue placeholder="Selecione um vendedor" /></SelectTrigger>
              <SelectContent>
                {vendedoresAtivos.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Cliente</Label>
              <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome completo (opcional)" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>
          
          {vendedorId && (
            <>
              {/* Selection Type */}
              <div className="space-y-2">
                <Label>Tipo de Seleção</Label>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    size="sm"
                    variant={tipoSelecao === 'individual' ? 'default' : 'outline'}
                    onClick={() => setTipoSelecao('individual')}
                  >
                    Individual
                  </Button>
                  <Button 
                    type="button" 
                    size="sm"
                    variant={tipoSelecao === 'faixa' ? 'default' : 'outline'}
                    onClick={() => setTipoSelecao('faixa')}
                  >
                    Faixa (1-10)
                  </Button>
                  <Button 
                    type="button" 
                    size="sm"
                    variant={tipoSelecao === 'aleatorio' ? 'default' : 'outline'}
                    onClick={() => setTipoSelecao('aleatorio')}
                  >
                    Aleatório (1,5,6)
                  </Button>
                </div>
              </div>

              {tipoSelecao === 'faixa' && (
                <div className="flex gap-2">
                  <Input 
                    placeholder="Ex: 1-10 ou 1 a 10"
                    value={faixaInput}
                    onChange={(e) => setFaixaInput(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="button" onClick={aplicarFaixa}>Aplicar</Button>
                </div>
              )}

              {tipoSelecao === 'aleatorio' && (
                <div className="flex gap-2">
                  <Input 
                    placeholder="Ex: 1, 5, 6, 10, 32"
                    value={aleatorioInput}
                    onChange={(e) => setAleatorioInput(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="button" onClick={aplicarAleatorio}>Aplicar</Button>
                </div>
              )}

              {tipoSelecao === 'individual' && (
                <div className="space-y-2">
                  <Label>Cartelas do Vendedor ({todasCartelasDisponiveis.length} disponíveis)</Label>
                  <div className="border rounded-lg p-4 max-h-40 overflow-y-auto">
                    {todasCartelasDisponiveis.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">Nenhuma cartela disponível</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {todasCartelasDisponiveis.map(c => (
                          <button key={c.numero} type="button" onClick={() => toggleCartela(c.numero)}
                            className={cn('w-12 h-12 rounded-lg font-bold text-sm border-2 transition-all',
                              cartelasSelecionadas.includes(c.numero) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:border-primary/50'
                            )}>{formatarNumeroCartela(c.numero)}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Selected Cartelas Preview */}
              {cartelasSelecionadas.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Cartelas Selecionadas ({cartelasSelecionadas.length})</Label>
                    <Button type="button" variant="destructive" size="sm" onClick={removerTodasCartelas} className="gap-1">
                      <Trash2 className="w-3 h-3" />
                      Remover Todas
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg">
                    {cartelasSelecionadas.sort((a, b) => a - b).map(num => (
                      <div key={num} className="flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-full text-sm font-semibold">
                        {formatarNumeroCartela(num)}
                        <button type="button" onClick={() => removerCartela(num)} className="hover:bg-primary-foreground/20 rounded-full p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Payment Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Pagamentos</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={distribuirValor}>
                  Distribuir Valor
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addPagamento} className="gap-1">
                  <Plus className="w-3 h-3" />
                  Adicionar
                </Button>
              </div>
            </div>
            
            {pagamentos.map((pag, index) => (
              <div key={index} className="flex gap-2 items-center">
                <Select 
                  value={pag.forma_pagamento} 
                  onValueChange={(v: string) => updatePagamento(index, 'forma_pagamento', v)}
                >
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  type="number" 
                  step="0.01" 
                  placeholder="Valor"
                  value={pag.valor || ''} 
                  onChange={(e) => updatePagamento(index, 'valor', parseFloat(e.target.value) || 0)}
                  className="flex-1"
                />
                {pagamentos.length > 1 && (
                  <Button type="button" variant="destructive" size="icon" onClick={() => removePagamento(index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Valor Total</div>
              <div className="text-xl font-bold text-foreground">{formatarMoeda(valorTotal)}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Valor Pago</div>
              <div className={cn("text-xl font-bold", valorPago >= valorTotal ? "text-success" : "text-warning")}>
                {formatarMoeda(valorPago)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Restante</div>
              <div className={cn("text-xl font-bold", valorTotal - valorPago <= 0 ? "text-success" : "text-destructive")}>
                {formatarMoeda(Math.max(0, valorTotal - valorPago))}
              </div>
            </div>
          </div>
          
          <div className="flex gap-4 pt-4">
            <Button type="submit" className="flex-1 gap-2" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSubmitting ? 'Salvando...' : (editingId ? 'Salvar' : 'Registrar')}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>Cancelar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default VendaModal;
