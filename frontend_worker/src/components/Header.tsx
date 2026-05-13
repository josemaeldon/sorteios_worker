import React from 'react';
import { Dice5, Target, LogOut, Settings, User, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useBingo } from '@/contexts/BingoContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useOfflineMode } from '@/lib/offlineMode';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const Header: React.FC = () => {
  const { sorteioAtivo } = useBingo();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { enabled, online, queueSize, syncing, toggle } = useOfflineMode();

  const badgeState = !online ? {
    label: 'Offline',
    className: 'bg-rose-500 text-white border-rose-400',
    icon: WifiOff,
  } : syncing ? {
    label: 'Sincronizando',
    className: 'bg-amber-500 text-white border-amber-400',
    icon: RefreshCw,
  } : {
    label: 'Online',
    className: 'bg-emerald-500 text-white border-emerald-400',
    icon: Wifi,
  };
  const BadgeIcon = badgeState.icon;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <header className="gradient-header text-primary-foreground shadow-lg relative">
      <div className={`pointer-events-none fixed bottom-4 right-4 z-50 rounded-full border px-3 py-1.5 shadow-lg backdrop-blur-md ${badgeState.className} ${syncing ? 'offline-sync-pulse' : ''}`}>
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide">
          <BadgeIcon className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{badgeState.label}</span>
          {enabled && queueSize > 0 && !syncing && online ? (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              {queueSize}
            </span>
          ) : null}
        </div>
      </div>
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Dice5 className="w-8 h-8" />
              {user?.titulo_sistema || 'Sorteios'}
            </h1>
            <p className="text-primary-foreground/70 mt-1">
              Sistema completo de gestão de rifas e sorteios
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <div className="text-sm text-primary-foreground/70 flex items-center justify-end gap-1">
                <Target className="w-4 h-4" />
                Sorteio Selecionado
              </div>
              <div className="text-lg font-bold">
                {sorteioAtivo ? sorteioAtivo.nome : 'Nenhum sorteio selecionado'}
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              className={`gap-2 border transition-colors ${enabled ? 'border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white' : 'border-rose-400 bg-rose-500 text-white hover:bg-rose-600 hover:text-white'}`}
              onClick={toggle}
              title={enabled ? 'Desativar modo offline' : 'Ativar modo offline'}
            >
              {enabled && online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              <span className="text-sm hidden sm:inline">
                {enabled ? `Offline pronto${queueSize > 0 ? ` (${queueSize})` : ''}` : 'Ativar offline'}
              </span>
              <span className="text-xs sm:hidden">
                {enabled ? 'Offline' : 'Offline'}
              </span>
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatar_url} alt={user?.nome} />
                    <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-xs">
                      {user?.nome ? getInitials(user.nome) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">{user?.nome}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user?.avatar_url} alt={user?.nome} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {user?.nome ? getInitials(user.nome) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span>{user?.nome}</span>
                      <span className="text-xs text-muted-foreground">{user?.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  Meu Perfil
                </DropdownMenuItem>
                {user?.role === 'admin' && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('/admin/usuarios')}>
                      <User className="h-4 w-4 mr-2" />
                      Usuários e assinaturas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/admin')}>
                      <Settings className="h-4 w-4 mr-2" />
                      Configurações
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
