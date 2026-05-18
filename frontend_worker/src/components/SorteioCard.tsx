import React from 'react';
import { Sorteio } from '@/types/bingo';
import { formatarData, formatarMoeda, getStatusLabel } from '@/lib/utils/formatters';
import { Edit, Trash2, User, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SorteioCardProps {
  sorteio: Sorteio;
  isActive: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onBackup: (id: string) => void;
}

const SorteioCard: React.FC<SorteioCardProps> = ({
  sorteio,
  isActive,
  onSelect,
  onEdit,
  onDelete,
  onBackup
}) => {
  const cartelasVendidas = sorteio.vendas?.cartelas_vendidas || 0;
  const totalCartelas = sorteio.quantidade_cartelas || 1;
  const percentualVendido = ((cartelasVendidas / totalCartelas) * 100).toFixed(1);
  const bloqueioAtribuicoes = Number(sorteio.bloqueio_atribuicoes || 0);
  const bloqueioVendas = Number(sorteio.bloqueio_vendas || 0);
  const bloqueioValidacoes = Number(sorteio.bloqueio_validacoes || 0);
  const deleteBlocked = bloqueioAtribuicoes > 0 || bloqueioVendas > 0 || bloqueioValidacoes > 0;
  const deleteBlockedMessage = `Não pode excluir: Atribuições (${bloqueioAtribuicoes}), Vendas (${bloqueioVendas}) ou Validações (${bloqueioValidacoes}) ativas. Remova esses elementos para excluir o sorteio.`;
  
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(sorteio.id);
  };
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(sorteio.id);
  };

  const handleBackup = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBackup(sorteio.id);
  };

  return (
    <div 
      className={cn('sorteio-card', isActive && 'active')}
      onClick={() => onSelect(sorteio.id)}
    >
      <div className="card-actions">
        <button 
          onClick={handleEdit}
          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button 
          onClick={handleBackup}
          className="w-8 h-8 rounded-full bg-muted text-foreground flex items-center justify-center hover:bg-muted/80 transition-colors"
        >
          <Download className="w-4 h-4" />
        </button>
        {deleteBlocked ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <button
                    type="button"
                    disabled
                    onClick={handleDelete}
                    className="w-8 h-8 rounded-full bg-danger/60 text-danger-foreground flex items-center justify-center opacity-80 cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="z-[2147483647] max-w-xs border-2 border-danger bg-danger text-danger-foreground shadow-[0_18px_45px_-12px_rgba(0,0,0,0.65)]">
                {deleteBlockedMessage}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <button
            onClick={handleDelete}
            className="w-8 h-8 rounded-full bg-danger text-danger-foreground flex items-center justify-center hover:bg-danger/90 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground">{sorteio.nome}</h3>
          <span className={cn('status-badge', `status-${sorteio.status}`)}>
            {getStatusLabel(sorteio.status)}
          </span>
          {sorteio.owner_nome && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              <span>{sorteio.owner_nome}</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">{formatarData(sorteio.data_sorteio)}</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm text-muted-foreground mb-1">
          {sorteio.premios && sorteio.premios.length > 1 ? 'Prêmios:' : 'Prêmio:'}
        </div>
        {sorteio.premios && sorteio.premios.length > 0 ? (
          <div className="space-y-1">
            {sorteio.premios.map((premio, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {index + 1}º
                </span>
                <span className={cn("font-bold text-foreground", index === 0 ? "text-lg" : "text-sm")}>
                  {premio}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-lg font-bold text-foreground">{sorteio.premio || 'Não definido'}</div>
        )}
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm text-muted-foreground mb-1">
          <span>Cartelas: {sorteio.quantidade_cartelas || 0}</span>
          <span>Valor: {formatarMoeda(sorteio.valor_cartela)}</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${percentualVendido}%` }} />
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {cartelasVendidas} vendidas ({percentualVendido}%)
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <div>
          <div className="font-semibold text-foreground">Vendidas:</div>
          <div className="text-muted-foreground">{cartelasVendidas}</div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-foreground">Arrecadado:</div>
          <div className="text-muted-foreground">{formatarMoeda(sorteio.vendas?.total_arrecadado || 0)}</div>
        </div>
      </div>
    </div>
  );
};

export default SorteioCard;
