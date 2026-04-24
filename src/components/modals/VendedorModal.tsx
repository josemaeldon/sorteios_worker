import React, { useState, useEffect } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { Vendedor } from '@/types/bingo';
import { gerarId } from '@/lib/utils/formatters';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserPlus, Save, Loader2 } from 'lucide-react';

interface VendedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
}

const VendedorModal: React.FC<VendedorModalProps> = ({ isOpen, onClose, editingId }) => {
  const { sorteioAtivo, vendedores, addVendedor, updateVendedor } = useBingo();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    email: '',
    cpf: '',
    endereco: '',
    ativo: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingId) {
      const vendedor = vendedores.find(v => v.id === editingId);
      if (vendedor) {
        setFormData({
          nome: vendedor.nome,
          telefone: vendedor.telefone || '',
          email: vendedor.email || '',
          cpf: vendedor.cpf || '',
          endereco: vendedor.endereco || '',
          ativo: vendedor.ativo
        });
      }
    } else {
      setFormData({
        nome: '',
        telefone: '',
        email: '',
        cpf: '',
        endereco: '',
        ativo: true
      });
    }
  }, [editingId, vendedores, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome) {
      toast({
        title: "Erro",
        description: "O nome do vendedor é obrigatório.",
        variant: "destructive"
      });
      return;
    }

    if (!sorteioAtivo) {
      toast({
        title: "Erro",
        description: "Selecione um sorteio primeiro.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const vendedorData: Vendedor = {
        id: editingId || gerarId(),
        sorteio_id: sorteioAtivo.id,
        nome: formData.nome,
        telefone: formData.telefone,
        email: formData.email,
        cpf: formData.cpf,
        endereco: formData.endereco,
        ativo: formData.ativo,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (editingId) {
        await updateVendedor(editingId, vendedorData);
        toast({
          title: "Vendedor atualizado",
          description: `O vendedor "${formData.nome}" foi atualizado com sucesso.`
        });
      } else {
        await addVendedor(vendedorData);
        toast({
          title: "Vendedor criado",
          description: `O vendedor "${formData.nome}" foi criado com sucesso.`
        });
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            {editingId ? 'Editar Vendedor' : 'Novo Vendedor'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Nome completo do vendedor"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                value={formData.cpf}
                onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                placeholder="000.000.000-00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@exemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço</Label>
            <Textarea
              id="endereco"
              value={formData.endereco}
              onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
              placeholder="Endereço completo"
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="ativo"
              checked={formData.ativo}
              onCheckedChange={(checked) => setFormData({ ...formData, ativo: !!checked })}
            />
            <Label htmlFor="ativo" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Vendedor ativo
            </Label>
          </div>

          <div className="flex gap-4 pt-4">
            <Button type="submit" className="flex-1 gap-2" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSubmitting ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Cadastrar Vendedor')}
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

export default VendedorModal;
