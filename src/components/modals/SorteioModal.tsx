import React, { useState, useEffect } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { useAuth } from '@/contexts/AuthContext';
import { User } from '@/types/auth';
import { Sorteio } from '@/types/bingo';
import { gerarId } from '@/lib/utils/formatters';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Dice5, Save, Loader2, Plus, Trash2, Gift } from 'lucide-react';

interface SorteioModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
}

const PAPER_PRESETS = [
  { label: 'A4 (210 × 297 mm)', value: 'A4', w: 210, h: 297 },
  { label: 'A5 (148 × 210 mm)', value: 'A5', w: 148, h: 210 },
  { label: 'A3 (297 × 420 mm)', value: 'A3', w: 297, h: 420 },
  { label: 'Letter (216 × 279 mm)', value: 'Letter', w: 216, h: 279 },
  { label: 'Rifa (210 × 70 mm)', value: 'Rifa', w: 210, h: 70 },
  { label: 'Personalizado', value: 'custom', w: 0, h: 0 },
];

const RIFA_PAPER_PRESET = PAPER_PRESETS.find(p => p.value === 'Rifa') ?? { label: 'Rifa (210 × 70 mm)', value: 'Rifa', w: 210, h: 70 };

const SorteioModal: React.FC<SorteioModalProps> = ({ isOpen, onClose, editingId }) => {
  const { sorteios, addSorteio, updateSorteio } = useBingo();
  const { user, getAllUsers } = useAuth();
  const { toast } = useToast();
  
  const isAdmin = user?.role === 'admin';
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [targetUserId, setTargetUserId] = useState('');

  const [formData, setFormData] = useState({
    nome: '',
    data_sorteio: '',
    premios: [''],
    valor_cartela: '',
    quantidade_cartelas: '',
    status: 'agendado' as 'agendado' | 'em_andamento' | 'concluido',
    tipo: 'bingo' as 'bingo' | 'rifa',
    papel_tamanho: 'A4',
    papel_largura: '210',
    papel_altura: '297',
    grade_colunas: '5',
    grade_linhas: '5',
    apenas_numero_rifa: false,
  });

  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState(0);

  // Load active users list for admin and reset targetUserId on close
  useEffect(() => {
    if (isOpen && isAdmin) {
      getAllUsers().then(data => setUsuarios(data.filter(u => u.ativo)));
    }
    if (!isOpen) {
      setTargetUserId('');
    }
  }, [isOpen, isAdmin, getAllUsers]);

  useEffect(() => {
    if (editingId) {
      const sorteio = sorteios.find(s => s.id === editingId);
      if (sorteio) {
        // Convert premios from DB or use single premio as array
        const premiosArray = sorteio.premios && sorteio.premios.length > 0 
          ? sorteio.premios 
          : (sorteio.premio ? [sorteio.premio] : ['']);

        const w = sorteio.papel_largura ?? 210;
        const h = sorteio.papel_altura ?? 297;
        const preset = PAPER_PRESETS.find(p => p.w === w && p.h === h && p.value !== 'custom');
        
        setFormData({
          nome: sorteio.nome,
          data_sorteio: sorteio.data_sorteio.split('T')[0],
          premios: premiosArray,
          valor_cartela: sorteio.valor_cartela.toString(),
          quantidade_cartelas: sorteio.quantidade_cartelas.toString(),
          status: sorteio.status,
          tipo: sorteio.tipo ?? 'bingo',
          papel_tamanho: preset ? preset.value : 'custom',
          papel_largura: w.toString(),
          papel_altura: h.toString(),
          grade_colunas: (sorteio.grade_colunas ?? 5).toString(),
          grade_linhas: (sorteio.grade_linhas ?? 5).toString(),
          apenas_numero_rifa: sorteio.apenas_numero_rifa ?? false,
        });
      }
    } else {
      setFormData({
        nome: '',
        data_sorteio: '',
        premios: [''],
        valor_cartela: '',
        quantidade_cartelas: '',
        status: 'agendado',
        tipo: 'bingo',
        papel_tamanho: 'A4',
        papel_largura: '210',
        papel_altura: '297',
        grade_colunas: '5',
        grade_linhas: '5',
        apenas_numero_rifa: false,
      });
    }
  }, [editingId, sorteios, isOpen]);

  // Reset progress when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsCreating(false);
      setProgress(0);
    }
  }, [isOpen]);

  // When paper preset changes, update width/height fields
  const handlePapelTamanhoChange = (value: string) => {
    const preset = PAPER_PRESETS.find(p => p.value === value);
    if (preset && preset.value !== 'custom') {
      setFormData(prev => ({
        ...prev,
        papel_tamanho: value,
        papel_largura: preset.w.toString(),
        papel_altura: preset.h.toString(),
      }));
    } else {
      setFormData(prev => ({ ...prev, papel_tamanho: value }));
    }
  };

  // When tipo changes, auto-configure paper and grid for rifa
  const handleTipoChange = (value: 'bingo' | 'rifa') => {
    if (value === 'rifa') {
      setFormData(prev => ({
        ...prev,
        tipo: 'rifa',
        papel_tamanho: RIFA_PAPER_PRESET.value,
        papel_largura: RIFA_PAPER_PRESET.w.toString(),
        papel_altura: RIFA_PAPER_PRESET.h.toString(),
        grade_colunas: '1',
        grade_linhas: '1',
        apenas_numero_rifa: true,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        tipo: 'bingo',
        papel_tamanho: 'A4',
        papel_largura: '210',
        papel_altura: '297',
        grade_colunas: '5',
        grade_linhas: '5',
        apenas_numero_rifa: false,
      }));
    }
  };

  const simulateProgress = (quantidade: number) => {
    // A barra é apenas "estimativa". Para volumes grandes, mantemos movimento até 99%
    // e finalizamos em 100% quando a criação realmente termina.
    const fastDurationMs = Math.min(Math.max(quantidade * 2, 1200), 5000); // vai até 85%
    const slowDurationMs = 12000; // 85% -> 99%
    const intervalMs = 120;

    const startedAt = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;

      let next = 0;
      if (elapsed <= fastDurationMs) {
        next = (elapsed / fastDurationMs) * 85;
      } else {
        const slowElapsed = elapsed - fastDurationMs;
        next = 85 + Math.min((slowElapsed / slowDurationMs) * 14, 14);
      }

      // nunca chega em 100% aqui (evita "travar" no final)
      setProgress(Math.min(99, Math.max(0, next)));
    }, intervalMs);

    return interval;
  };

  const handleAddPremio = () => {
    setFormData(prev => ({
      ...prev,
      premios: [...prev.premios, '']
    }));
  };

  const handleRemovePremio = (index: number) => {
    if (formData.premios.length > 1) {
      setFormData(prev => ({
        ...prev,
        premios: prev.premios.filter((_, i) => i !== index)
      }));
    }
  };

  const handlePremioChange = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      premios: prev.premios.map((p, i) => i === index ? value : p)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter empty premios
    const premiosValidos = formData.premios.filter(p => p.trim() !== '');
    
    if (!formData.nome || !formData.data_sorteio || premiosValidos.length === 0 || 
        !formData.valor_cartela || !formData.quantidade_cartelas) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios. Adicione pelo menos um prêmio.",
        variant: "destructive"
      });
      return;
    }

    const papelLargura = parseFloat(formData.papel_largura) || 210;
    const papelAltura = parseFloat(formData.papel_altura) || 297;
    const gradeColunas = Math.max(1, parseInt(formData.grade_colunas) || 5);
    const gradeLinhas = Math.max(1, parseInt(formData.grade_linhas) || 5);

    const sorteioData: Sorteio = {
      id: editingId || gerarId(),
      nome: formData.nome,
      data_sorteio: `${formData.data_sorteio}T20:00:00`,
      premio: premiosValidos[0], // First prize for backwards compatibility
      premios: premiosValidos,
      valor_cartela: parseFloat(formData.valor_cartela),
      quantidade_cartelas: parseInt(formData.quantidade_cartelas),
      status: formData.status,
      tipo: formData.tipo,
      papel_largura: papelLargura,
      papel_altura: papelAltura,
      grade_colunas: gradeColunas,
      grade_linhas: gradeLinhas,
      apenas_numero_rifa: formData.apenas_numero_rifa,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      vendas: {
        cartelas_vendidas: 0,
        total_arrecadado: 0
      }
    };

    if (editingId) {
      await updateSorteio(editingId, sorteioData);
      toast({
        title: "Sorteio atualizado",
        description: `O sorteio "${formData.nome}" foi atualizado com sucesso.`
      });
      onClose();
    } else {
      setIsCreating(true);
      setProgress(0);
      
      const quantidade = parseInt(formData.quantidade_cartelas);
      const progressInterval = simulateProgress(quantidade);
      
      try {
        await addSorteio(sorteioData, isAdmin && targetUserId ? targetUserId : undefined);
        clearInterval(progressInterval);
        setProgress(100);
        
        setTimeout(() => {
          toast({
            title: "Sorteio criado",
            description: `O sorteio "${formData.nome}" foi criado com ${quantidade} cartelas e ${premiosValidos.length} prêmio(s).`
          });
          onClose();
        }, 500);
      } catch (error) {
        clearInterval(progressInterval);
        setIsCreating(false);
        setProgress(0);
      }
    }
  };

  if (isCreating) {
    return (
      <Dialog open={isOpen}>
        <DialogContent className="sm:max-w-[400px]" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Criando Sorteio
            </DialogTitle>
          </DialogHeader>

           <div className="space-y-4 py-4">
             <p className="text-sm text-muted-foreground text-center">
               {progress >= 90
                 ? 'Finalizando... (pode levar alguns segundos)'
                 : `Gerando ${formData.quantidade_cartelas} cartelas...`}
             </p>
             
             <Progress value={progress} className="h-3" />
             
             <p className="text-center text-sm font-medium">
               {Math.round(progress)}%
             </p>
           </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dice5 className="w-5 h-5" />
            {editingId ? 'Editar Sorteio' : 'Novo Sorteio'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isAdmin && !editingId && (
            <div className="space-y-2">
              <Label htmlFor="target_user">Usuário Proprietário *</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger id="target_user">
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tipo do Sorteio */}
          <div className="space-y-2">
            <Label>Tipo do Sorteio *</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleTipoChange('bingo')}
                className={`flex-1 py-2 px-4 rounded-md border-2 text-sm font-medium transition-colors ${
                  formData.tipo === 'bingo'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:border-primary/50'
                }`}
              >
                Bingo
              </button>
              <button
                type="button"
                onClick={() => handleTipoChange('rifa')}
                className={`flex-1 py-2 px-4 rounded-md border-2 text-sm font-medium transition-colors ${
                  formData.tipo === 'rifa'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:border-primary/50'
                }`}
              >
                Rifa
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nome">Nome do Sorteio *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Ex: Rifa de Natal 2024"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_sorteio">Data do Sorteio *</Label>
              <Input
                id="data_sorteio"
                type="date"
                value={formData.data_sorteio}
                onChange={(e) => setFormData({ ...formData, data_sorteio: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value: 'agendado' | 'em_andamento' | 'concluido') => 
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Múltiplos Prêmios */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Gift className="w-4 h-4" />
                Prêmios *
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddPremio}
                className="gap-1"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </Button>
            </div>
            
            <div className="space-y-2">
              {formData.premios.map((premio, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex items-center justify-center w-8 h-10 rounded-md bg-muted text-muted-foreground text-sm font-medium">
                    {index + 1}º
                  </div>
                  <Input
                    value={premio}
                    onChange={(e) => handlePremioChange(index, e.target.value)}
                    placeholder={`Ex: ${index === 0 ? 'R$ 10.000,00 em dinheiro' : index === 1 ? 'TV 55 polegadas' : 'Smartphone'}`}
                  />
                  {formData.premios.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePremio(index)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valor_cartela">Valor da Cartela (R$) *</Label>
              <Input
                id="valor_cartela"
                type="number"
                step="0.01"
                min="0"
                value={formData.valor_cartela}
                onChange={(e) => setFormData({ ...formData, valor_cartela: e.target.value })}
                placeholder="Ex: 10.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantidade_cartelas">Quantidade de Cartelas *</Label>
              <Input
                id="quantidade_cartelas"
                type="number"
                min="1"
                value={formData.quantidade_cartelas}
                onChange={(e) => setFormData({ ...formData, quantidade_cartelas: e.target.value })}
                placeholder="Ex: 1000"
                required
              />
            </div>
          </div>

          {/* Tamanho do Papel */}
          <div className="space-y-3 border border-border rounded-lg p-3">
            <Label className="text-sm font-medium">Tamanho do Papel</Label>
            <Select value={formData.papel_tamanho} onValueChange={handlePapelTamanhoChange} disabled={formData.tipo === 'rifa'}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(formData.tipo === 'rifa'
                  ? PAPER_PRESETS.filter(p => p.value === 'Rifa')
                  : PAPER_PRESETS
                ).map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.papel_tamanho === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="papel_largura" className="text-xs text-muted-foreground">Largura (mm)</Label>
                  <Input
                    id="papel_largura"
                    type="number"
                    min="50"
                    max="600"
                    value={formData.papel_largura}
                    onChange={(e) => setFormData({ ...formData, papel_largura: e.target.value })}
                    placeholder="210"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="papel_altura" className="text-xs text-muted-foreground">Altura (mm)</Label>
                  <Input
                    id="papel_altura"
                    type="number"
                    min="50"
                    max="900"
                    value={formData.papel_altura}
                    onChange={(e) => setFormData({ ...formData, papel_altura: e.target.value })}
                    placeholder="297"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Grade de Números */}
          <div className="space-y-3 border border-border rounded-lg p-3">
            <Label className="text-sm font-medium">Grade de Números</Label>
            {formData.tipo === 'rifa' ? (
              <div className="flex items-center space-x-2 opacity-70">
                <Checkbox id="apenas_numero_rifa" checked disabled />
                <Label htmlFor="apenas_numero_rifa" className="text-sm font-normal">
                  Apenas número da rifa (sem grade de números)
                </Label>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="apenas_numero_rifa"
                    checked={formData.apenas_numero_rifa}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, apenas_numero_rifa: checked === true })
                    }
                  />
                  <Label htmlFor="apenas_numero_rifa" className="text-sm font-normal cursor-pointer">
                    Apenas número da rifa (sem grade de números)
                  </Label>
                </div>
                {!formData.apenas_numero_rifa && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="grade_colunas" className="text-xs text-muted-foreground">Colunas</Label>
                      <Input
                        id="grade_colunas"
                        type="number"
                        min="1"
                        max="20"
                        value={formData.grade_colunas}
                        onChange={(e) => setFormData({ ...formData, grade_colunas: e.target.value })}
                        placeholder="5"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="grade_linhas" className="text-xs text-muted-foreground">Linhas</Label>
                      <Input
                        id="grade_linhas"
                        type="number"
                        min="1"
                        max="20"
                        value={formData.grade_linhas}
                        onChange={(e) => setFormData({ ...formData, grade_linhas: e.target.value })}
                        placeholder="5"
                      />
                    </div>
                  </div>
                )}
                {!formData.apenas_numero_rifa && (() => {
                  const cols = parseInt(formData.grade_colunas) || 5;
                  const rows = parseInt(formData.grade_linhas) || 5;
                  return (
                    <p className="text-xs text-muted-foreground">
                      Grade de {cols} × {rows} = {cols * rows} números por cartela
                    </p>
                  );
                })()}
              </>
            )}
          </div>

          <div className="flex gap-4 pt-4">
            <Button type="submit" className="flex-1 gap-2" disabled={isAdmin && !editingId && !targetUserId}>
              <Save className="w-4 h-4" />
              {editingId ? 'Salvar Alterações' : 'Criar Sorteio'}
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

export default SorteioModal;
