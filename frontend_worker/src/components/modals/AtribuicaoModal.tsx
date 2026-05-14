import React, { useState, useEffect } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { Atribuicao, CartelaAtribuida } from '@/types/bingo';
import { gerarId, formatarNumeroCartela } from '@/lib/utils/formatters';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
import { ListTodo, Save, Eraser, AlertCircle, X, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AtribuicaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingAtribuicao?: Atribuicao | null;
  initialVendedorId?: string | null;
}

type TipoSelecao = 'individual' | 'faixa' | 'aleatorio';

const AtribuicaoModal: React.FC<AtribuicaoModalProps> = ({ isOpen, onClose, editingAtribuicao, initialVendedorId }) => {
  const { 
    sorteioAtivo, 
    vendedores, 
    cartelas, 
    atribuicoes,
    addAtribuicaoComProgresso, 
    addCartelasToAtribuicaoComProgresso,
    removeCartelaFromAtribuicao,
    atualizarStatusCartela 
  } = useBingo();
  const { toast } = useToast();
  
  const [vendedorId, setVendedorId] = useState('');
  const [cartelasSelecionadas, setCartelasSelecionadas] = useState<number[]>([]);
  const [tipoSelecao, setTipoSelecao] = useState<TipoSelecao>('individual');
  const [faixaInput, setFaixaInput] = useState('');
  const [aleatorioInput, setAleatorioInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const vendedoresAtivos = vendedores.filter(v => v.ativo);
  const cartelasDisponiveis = cartelas.filter(c => c.status === 'disponivel' || c.status === 'devolvida');

  // Check if seller already has an attribution
  const atribuicaoExistente = atribuicoes.find(a => a.vendedor_id === vendedorId);

  useEffect(() => {
    if (isOpen) {
      if (editingAtribuicao) {
        setVendedorId(editingAtribuicao.vendedor_id);
        setCartelasSelecionadas(editingAtribuicao.cartelas.map(c => c.numero));
      } else {
        setVendedorId(initialVendedorId || '');
        setCartelasSelecionadas([]);
      }
      setTipoSelecao('individual');
      setFaixaInput('');
      setAleatorioInput('');
    }
  }, [isOpen, editingAtribuicao, initialVendedorId]);

  const gerarComprovanteAtribuicao = (vendedorNome: string, numeros: number[]) => {
    if (numeros.length === 0) return;
    const numerosOrdenados = [...numeros].sort((a, b) => a - b);
    const totalPrevisto = (sorteioAtivo?.valor_cartela || 0) * numerosOrdenados.length;
    const conteudo = `
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
            .section h2 { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .row .label { color: #555; }
            .row .value { font-weight: 600; text-align: right; }
            .numeros { display: flex; flex-wrap: wrap; gap: 6px; }
            .numero { background: #1d4ed8; color: white; border-radius: 4px; padding: 4px 8px; font-weight: bold; font-size: 13px; min-width: 40px; text-align: center; }
            .assinaturas { display: flex; justify-content: space-between; gap: 32px; margin-top: 48px; }
            .assinaturas > div { flex: 1; text-align: center; }
            .linha { border-top: 1px solid #111; padding-top: 6px; margin-top: 48px; }
            .linha p { font-size: 12px; color: #555; margin-top: 2px; }
            .linha p.titulo { font-weight: bold; color: #111; }
            .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #888; border-top: 1px solid #ddd; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>COMPROVANTE DE CARTELAS ENTREGUES</h1>
            <p>${sorteioAtivo?.nome || ''}</p>
          </div>
          <div class="section">
            <h2>Identificação</h2>
            <div class="row"><span class="label">Data/Hora</span><span class="value">${new Date().toLocaleString('pt-BR')}</span></div>
            <div class="row"><span class="label">Vendedor</span><span class="value">${vendedorNome}</span></div>
            <div class="row"><span class="label">Quantidade</span><span class="value">${numerosOrdenados.length} cartela(s)</span></div>
            <div class="row"><span class="label">Previsão de venda</span><span class="value">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPrevisto)}</span></div>
          </div>
          <div class="section">
            <h2>Cartelas Entregues</h2>
            <div class="numeros">
              ${numerosOrdenados.map(n => `<span class="numero">${formatarNumeroCartela(n)}</span>`).join('')}
            </div>
          </div>
          <div class="assinaturas">
            <div><div class="linha"><p>${vendedorNome}</p><p class="titulo">Recebedor</p></div></div>
            <div><div class="linha"><p>Responsável</p><p class="titulo">Entregador</p></div></div>
          </div>
          <div class="footer">Documento gerado automaticamente pelo sistema.</div>
        </body>
      </html>
    `;
    const janela = window.open('', '_blank', 'width=700,height=900');
    if (!janela) return;
    janela.document.write(conteudo);
    janela.document.close();
    janela.focus();
  };

  const parseRange = (input: string): number[] => {
    // Parse "1-10" or "1 a 10" format
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
    // Parse "1, 5, 6, 10, 32" format
    return input.split(/[,;\s]+/)
      .map(n => parseInt(n.trim()))
      .filter(n => !isNaN(n));
  };

  const aplicarFaixa = () => {
    const numeros = parseRange(faixaInput);
    const disponiveis = cartelasDisponiveis.map(c => c.numero);
    const validos = numeros.filter(n => disponiveis.includes(n) && !cartelasSelecionadas.includes(n));
    
    if (validos.length === 0) {
      toast({ title: "Atenção", description: "Nenhuma cartela disponível encontrada na faixa especificada.", variant: "destructive" });
      return;
    }
    
    setCartelasSelecionadas(prev => [...prev, ...validos]);
    setFaixaInput('');
    toast({ title: "Sucesso", description: `${validos.length} cartela(s) adicionada(s).` });
  };

  const aplicarAleatorio = () => {
    const numeros = parseAleatoria(aleatorioInput);
    const disponiveis = cartelasDisponiveis.map(c => c.numero);
    const validos = numeros.filter(n => disponiveis.includes(n) && !cartelasSelecionadas.includes(n));
    
    if (validos.length === 0) {
      toast({ title: "Atenção", description: "Nenhuma cartela disponível encontrada nos números especificados.", variant: "destructive" });
      return;
    }
    
    setCartelasSelecionadas(prev => [...prev, ...validos]);
    setAleatorioInput('');
    toast({ title: "Sucesso", description: `${validos.length} cartela(s) adicionada(s).` });
  };

  const toggleCartela = (numero: number) => {
    setCartelasSelecionadas(prev => 
      prev.includes(numero) 
        ? prev.filter(n => n !== numero)
        : [...prev, numero]
    );
  };

  const removerCartela = (numero: number) => {
    setCartelasSelecionadas(prev => prev.filter(n => n !== numero));
  };

  const limparSelecao = () => {
    setCartelasSelecionadas([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!vendedorId) {
      toast({
        title: "Erro",
        description: "Selecione um vendedor.",
        variant: "destructive"
      });
      return;
    }

    if (cartelasSelecionadas.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos uma cartela.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    setProgress(10);

    try {
      const vendedor = vendedores.find(v => v.id === vendedorId);

      if (editingAtribuicao) {
        // Handle editing - find removed and added cartelas
        const cartelasAnteriores = editingAtribuicao.cartelas.map(c => c.numero);
        const removidas = cartelasAnteriores.filter(n => !cartelasSelecionadas.includes(n));
        const adicionadas = cartelasSelecionadas.filter(n => !cartelasAnteriores.includes(n));

        setProgress(10);

        // Remove cartelas
        for (const num of removidas) {
          await removeCartelaFromAtribuicao(editingAtribuicao.id, num);
        }

        setProgress(30);

        // Add new cartelas
        if (adicionadas.length > 0) {
          await addCartelasToAtribuicaoComProgresso(
            editingAtribuicao.id,
            vendedorId,
            adicionadas,
            (done, total) => setProgress(30 + Math.round((done / total) * 70)),
          );
        } else {
          setProgress(100);
        }

        toast({
          title: "Atribuição atualizada",
          description: `Atribuição atualizada com sucesso.`
        });
        if (adicionadas.length > 0) {
          gerarComprovanteAtribuicao(vendedor?.nome || 'Vendedor', adicionadas);
        }
      } else if (atribuicaoExistente) {
        // Add cartelas to existing attribution
        await addCartelasToAtribuicaoComProgresso(
          atribuicaoExistente.id,
          vendedorId,
          cartelasSelecionadas,
          (done, total) => setProgress(Math.round((done / total) * 100)),
        );
        toast({
          title: "Cartelas adicionadas",
          description: `${cartelasSelecionadas.length} cartela(s) adicionada(s) à atribuição existente.`
        });
        gerarComprovanteAtribuicao(vendedor?.nome || 'Vendedor', cartelasSelecionadas);
      } else {
        // Create new attribution
        await addAtribuicaoComProgresso(
          vendedorId,
          cartelasSelecionadas,
          (done, total) => setProgress(Math.round((done / total) * 100)),
        );

        toast({
          title: "Atribuição realizada",
          description: `${cartelasSelecionadas.length} cartela(s) atribuída(s) com sucesso.`
        });
        gerarComprovanteAtribuicao(vendedor?.nome || 'Vendedor', cartelasSelecionadas);
      }

      onClose();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao salvar a atribuição.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
      setProgress(0);
    }
  };

  const isEditing = !!editingAtribuicao;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="w-5 h-5" />
            {isEditing ? 'Editar Atribuição' : atribuicaoExistente && vendedorId ? 'Adicionar Cartelas' : 'Nova Atribuição'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Vendedor *</Label>
            <Select value={vendedorId} onValueChange={setVendedorId} disabled={isEditing}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um vendedor" />
              </SelectTrigger>
              <SelectContent>
                {vendedoresAtivos.map(v => {
                  const atribuicao = atribuicoes.find(a => a.vendedor_id === v.id);
                  return (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nome} {atribuicao && `(${atribuicao.cartelas.length} cartelas)`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {vendedoresAtivos.length === 0 && (
              <p className="text-sm text-warning">Nenhum vendedor ativo cadastrado</p>
            )}
          </div>

          {atribuicaoExistente && vendedorId && !isEditing && (
            <div className="bg-info/10 border border-info/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-info mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Este vendedor já possui uma atribuição</p>
                <p className="text-sm text-muted-foreground">
                  Ele já tem {atribuicaoExistente.cartelas.length} cartela(s). As novas cartelas serão adicionadas à atribuição existente.
                </p>
              </div>
            </div>
          )}

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
              <div className="flex justify-between items-center">
                <Label>Cartelas Disponíveis ({cartelasDisponiveis.length})</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={limparSelecao}
                  className="gap-1"
                >
                  <Eraser className="w-3 h-3" />
                  Limpar
                </Button>
              </div>
              <div className="border border-border rounded-lg p-4 max-h-60 overflow-y-auto">
                {cartelasDisponiveis.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhuma cartela disponível para atribuição
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {cartelasDisponiveis.map(cartela => (
                      <button
                        key={cartela.numero}
                        type="button"
                        onClick={() => toggleCartela(cartela.numero)}
                        className={cn(
                          'w-12 h-12 rounded-lg font-bold text-sm transition-all duration-200 border-2',
                          cartelasSelecionadas.includes(cartela.numero)
                            ? 'bg-primary text-primary-foreground border-primary shadow-glow'
                            : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                        )}
                      >
                        {formatarNumeroCartela(cartela.numero)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          {cartelasSelecionadas.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Cartelas Selecionadas ({cartelasSelecionadas.length})</Label>
                <Button type="button" variant="destructive" size="sm" onClick={limparSelecao} className="gap-1">
                  <Trash2 className="w-3 h-3" />
                  Remover Todas
                </Button>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex flex-wrap gap-2 justify-center">
                  {cartelasSelecionadas.sort((a, b) => a - b).map(num => (
                    <div key={num} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-full font-semibold text-sm">
                      {formatarNumeroCartela(num)}
                      <button type="button" onClick={() => removerCartela(num)} className="hover:bg-primary-foreground/20 rounded-full p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isSubmitting && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Atribuindo cartelas...</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <Button type="submit" className="flex-1 gap-2" disabled={!vendedorId || cartelasSelecionadas.length === 0 || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Atribuindo...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isEditing ? 'Salvar Alterações' : atribuicaoExistente && vendedorId ? 'Adicionar Cartelas' : 'Atribuir Cartelas'}
                </>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AtribuicaoModal;
