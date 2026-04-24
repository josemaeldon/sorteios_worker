import React, { useState, useEffect } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { RodadaSorteio } from '@/types/bingo';
import { Dice5, Plus, Edit, Trash2, Play, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { callApi } from '@/lib/apiClient';
import { formatarData } from '@/lib/utils/formatters';
import { getBingoMaxNumber } from '@/lib/utils/bingoCardUtils';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const RodadasTab: React.FC = () => {
  const { sorteioAtivo, setCurrentTab } = useBingo();
  const { toast } = useToast();
  
  const [rodadas, setRodadas] = useState<RodadaSorteio[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRodada, setEditingRodada] = useState<RodadaSorteio | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRodadaId, setDeletingRodadaId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    nome: '',
    range_start: '1',
    range_end: '75',
    status: 'ativo' as 'ativo' | 'concluido' | 'cancelado'
  });

  useEffect(() => {
    if (sorteioAtivo) {
      loadRodadas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorteioAtivo?.id]);

  const loadRodadas = async () => {
    if (!sorteioAtivo) return;
    
    try {
      setIsLoading(true);
      const result = await callApi('getRodadas', { sorteio_id: sorteioAtivo.id });
      
      // Load history count for each rodada
      const rodadasWithCount = await Promise.all(
        (result.data || []).map(async (rodada: RodadaSorteio) => {
          try {
            const historyResult = await callApi('getRodadaHistorico', { rodada_id: rodada.id });
            return {
              ...rodada,
              numeros_sorteados: historyResult.data?.length || 0
            };
          } catch (error) {
            return {
              ...rodada,
              numeros_sorteados: 0
            };
          }
        })
      );
      
      setRodadas(rodadasWithCount);
    } catch (error: unknown) {
      console.error('Error loading rodadas:', error);
      toast({
        title: "Erro ao carregar rodadas",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNew = () => {
    setEditingRodada(null);
    const isRifa = sorteioAtivo?.tipo === 'rifa';
    const cols = sorteioAtivo?.grade_colunas ?? 5;
    const rows = sorteioAtivo?.grade_linhas ?? 5;
    setFormData({
      nome: '',
      range_start: '1',
      range_end: isRifa ? (sorteioAtivo?.quantidade_cartelas?.toString() ?? '75') : getBingoMaxNumber(cols, rows).toString(),
      status: 'ativo'
    });
    setIsModalOpen(true);
  };

  const handleEdit = (rodada: RodadaSorteio) => {
    setEditingRodada(rodada);
    setFormData({
      nome: rodada.nome,
      range_start: rodada.range_start.toString(),
      range_end: rodada.range_end.toString(),
      status: rodada.status
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingRodadaId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingRodadaId) return;
    
    try {
      await callApi('deleteRodada', { id: deletingRodadaId });
      toast({
        title: "Rodada excluída",
        description: "A rodada foi excluída com sucesso."
      });
      await loadRodadas();
    } catch (error: unknown) {
      toast({
        title: "Erro ao excluir rodada",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingRodadaId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sorteioAtivo) return;
    
    const range_start = parseInt(formData.range_start);
    const range_end = parseInt(formData.range_end);
    
    if (isNaN(range_start) || isNaN(range_end) || range_start >= range_end) {
      toast({
        title: "Erro",
        description: "A faixa de números é inválida.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      if (editingRodada) {
        await callApi('updateRodada', {
          id: editingRodada.id,
          nome: formData.nome,
          range_start,
          range_end,
          status: formData.status
        });
        toast({
          title: "Rodada atualizada",
          description: "A rodada foi atualizada com sucesso."
        });
      } else {
        await callApi('createRodada', {
          sorteio_id: sorteioAtivo.id,
          nome: formData.nome,
          range_start,
          range_end,
          status: formData.status
        });
        toast({
          title: "Rodada criada",
          description: "A rodada foi criada com sucesso."
        });
      }
      
      setIsModalOpen(false);
      await loadRodadas();
    } catch (error: unknown) {
      toast({
        title: "Erro ao salvar rodada",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    }
  };

  const handlePlay = (rodadaId: string) => {
    // Navigate to draw tab with this rodada selected
    localStorage.setItem('selectedRodadaId', rodadaId);
    setCurrentTab('sorteio');
  };

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <Dice5 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Rodadas</h2>
        <p className="text-muted-foreground">Selecione um sorteio para gerenciar rodadas</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ativo':
        return <Play className="w-4 h-4" />;
      case 'concluido':
        return <CheckCircle className="w-4 h-4" />;
      case 'cancelado':
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'bg-blue-500/10 text-blue-500';
      case 'concluido':
        return 'bg-success/10 text-success';
      case 'cancelado':
        return 'bg-destructive/10 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Dice5 className="w-6 h-6" />
          Rodadas - {sorteioAtivo.nome}
        </h2>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Rodada
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Carregando rodadas...</p>
        </div>
      ) : rodadas.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <Dice5 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">
            Nenhuma rodada encontrada
          </h3>
          <p className="text-muted-foreground mb-6">
            Crie sua primeira rodada para começar a sortear
          </p>
          <Button onClick={handleNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Criar Primeira Rodada
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rodadas.map((rodada) => (
            <div
              key={rodada.id}
              className="bg-card rounded-xl border border-border p-6 hover:shadow-lg transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground mb-1">
                    {rodada.nome}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className={cn('px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1', getStatusColor(rodada.status))}>
                      {getStatusIcon(rodada.status)}
                      {rodada.status === 'ativo' ? 'Ativo' : rodada.status === 'concluido' ? 'Concluído' : 'Cancelado'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Faixa:</span>
                  <span className="font-semibold text-foreground">{rodada.range_start} - {rodada.range_end}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total de números:</span>
                  <span className="font-semibold text-foreground">{rodada.range_end - rodada.range_start + 1}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sorteados:</span>
                  <span className="font-semibold text-primary">{rodada.numeros_sorteados || 0}</span>
                </div>
                {rodada.created_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Criado em:</span>
                    <span className="text-foreground">{formatarData(rodada.created_at)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handlePlay(rodada.id)}
                  className="flex-1 gap-2"
                  size="sm"
                >
                  <Play className="w-4 h-4" />
                  Sortear
                </Button>
                <Button
                  onClick={() => handleEdit(rodada)}
                  variant="outline"
                  size="sm"
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => handleDelete(rodada.id)}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dice5 className="w-5 h-5" />
              {editingRodada ? 'Editar Rodada' : 'Nova Rodada'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da Rodada *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Rodada 1, Rodada da Noite, etc."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="range_start">Número Inicial *</Label>
                <Input
                  id="range_start"
                  type="number"
                  value={formData.range_start}
                  onChange={(e) => setFormData({ ...formData, range_start: e.target.value })}
                  min="1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="range_end">Número Final *</Label>
                <Input
                  id="range_end"
                  type="number"
                  value={formData.range_end}
                  onChange={(e) => setFormData({ ...formData, range_end: e.target.value })}
                  min="2"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value: string) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Total de números: <span className="font-bold text-foreground">{parseInt(formData.range_end || '0') - parseInt(formData.range_start || '0') + 1}</span>
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" className="flex-1">
                {editingRodada ? 'Salvar' : 'Criar'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Rodada</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta rodada? Esta ação não pode ser desfeita.
              Todo o histórico de números sorteados desta rodada será perdido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RodadasTab;
