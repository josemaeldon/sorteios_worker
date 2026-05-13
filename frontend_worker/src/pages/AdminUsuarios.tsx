import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { User, Plan, CreateUserData } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Users, ShieldCheck, User as UserIcon, CreditCard, Gift, Pencil, Trash2, RefreshCw, ExternalLink, Search, CheckCircle2, AlertTriangle, TrendingUp, Wallet, Clock3, Ban, Percent, PieChart, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const NO_PLAN_VALUE = 'none';

const AdminUsuarios: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    user,
    isAuthenticated,
    getAllUsers,
    getPlanos,
    createUser,
    updateUser,
    deleteUser,
    assignUserPlan,
    grantLifetimeAccess,
    approveUser,
    rejectUser,
  } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [planos, setPlanos] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(NO_PLAN_VALUE);
  const [extensionDays, setExtensionDays] = useState<string>('0');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'overdue'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'boleto' | 'card'>('all');
  const [formData, setFormData] = useState<Partial<CreateUserData>>({
    nome: '',
    email: '',
    senha: '',
    role: 'user',
    titulo_sistema: 'Sorteios',
  });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }
    if (user?.role !== 'admin') {
      navigate('/');
      return;
    }

    const load = async () => {
      setIsLoading(true);
      const [usersData, planosData] = await Promise.all([getAllUsers(), getPlanos()]);
      setUsers(usersData);
      setPlanos(planosData);
      setSelectedUser((prev) => prev || usersData[0] || null);
      setIsLoading(false);
    };
    load();
  }, [isAuthenticated, user, navigate, getAllUsers, getPlanos]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      const isActive = !!u.plano_id && !u.gratuidade_vitalicia && (!u.plano_vencimento || new Date(u.plano_vencimento).getTime() >= Date.now());
      const isPending = u.plano_pagamento_status === 'pending';
      const isOverdue = u.plano_pagamento_status === 'failed' || (!!u.plano_id && !!u.plano_vencimento && new Date(u.plano_vencimento).getTime() < Date.now() && !u.gratuidade_vitalicia);
      const paymentMethod = u.plano_pagamento_metodo || (u.gratuidade_vitalicia ? 'free' : (!u.plano_id ? 'none' : 'manual'));
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && isActive)
        || (statusFilter === 'pending' && isPending)
        || (statusFilter === 'overdue' && isOverdue);
      const matchesPayment = paymentFilter === 'all'
        || (paymentFilter === 'boleto' && paymentMethod === 'boleto')
        || (paymentFilter === 'card' && paymentMethod === 'card');
      const haystack = [
        u.nome,
        u.email,
        u.role,
        u.plano_pagamento_status,
        u.plano_pagamento_metodo,
        u.plano_id,
      ].filter(Boolean).join(' ').toLowerCase();
      return matchesStatus && matchesPayment && (term ? haystack.includes(term) : true);
    });
  }, [users, search, statusFilter, paymentFilter]);

  const selectedPlan = useMemo(
    () => planos.find((p) => p.id === selectedPlanId) || null,
    [planos, selectedPlanId],
  );

  function getUserPlanValue(u: User) {
    if (u.gratuidade_vitalicia || !u.plano_id) return 0;
    const plan = planos.find((p) => p.id === u.plano_id);
    return Number(plan?.valor || 0);
  }

  function getUserPaymentMethod(u: User) {
    if (u.plano_pagamento_metodo) return u.plano_pagamento_metodo;
    if (u.gratuidade_vitalicia) return 'free';
    if (!u.plano_id) return 'none';
    return 'manual';
  }

  const activePlanUsers = users.filter((u) => {
    if (!u.plano_id || u.gratuidade_vitalicia) return false;
    if (!u.plano_vencimento) return true;
    return new Date(u.plano_vencimento).getTime() >= Date.now();
  });
  const pendingPayments = users.filter((u) => u.plano_pagamento_status === 'pending');
  const failedPayments = users.filter((u) => u.plano_pagamento_status === 'failed');
  const lifetimeUsers = users.filter((u) => u.gratuidade_vitalicia);
  const freeTrialUsers = users.filter((u) => u.plano_id && planos.find((p) => p.id === u.plano_id)?.tipo_plano === 'teste_gratis');
  const financialStats = useMemo(() => {
    const activeRevenue = activePlanUsers.reduce((sum, u) => sum + getUserPlanValue(u), 0);
    const pendingRevenue = pendingPayments.reduce((sum, u) => sum + getUserPlanValue(u), 0);
    const overdueRevenue = failedPayments.reduce((sum, u) => sum + getUserPlanValue(u), 0);
    const boletoCount = users.filter((u) => getUserPaymentMethod(u) === 'boleto').length;
    const cardCount = users.filter((u) => getUserPaymentMethod(u) === 'card').length;
    const manualCount = users.filter((u) => getUserPaymentMethod(u) === 'manual').length;
    const freeCount = users.filter((u) => getUserPaymentMethod(u) === 'free').length;
    const activePercent = users.length > 0 ? Math.round((activePlanUsers.length / users.length) * 100) : 0;
    return { activeRevenue, pendingRevenue, overdueRevenue, boletoCount, cardCount, manualCount, freeCount, activePercent };
  }, [users, activePlanUsers, pendingPayments, failedPayments, planos]);

  const formatDate = (date?: string | null) => {
    if (!date) return '—';
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR');
  };

  const getPlanName = (u: User) => {
    if (u.gratuidade_vitalicia) return 'Gratuidade vitalícia';
    if (!u.plano_id) return 'Sem plano';
    return planos.find((p) => p.id === u.plano_id)?.nome || 'Plano';
  };

  const getPaymentBadge = (u: User) => {
    if (u.plano_pagamento_status === 'pending') {
      return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Pagamento pendente</Badge>;
    }
    if (u.plano_pagamento_status === 'failed') {
      return <Badge variant="destructive">Pagamento vencido</Badge>;
    }
    if (u.plano_pagamento_status === 'paid') {
      return <Badge variant="secondary">Pago</Badge>;
    }
    return <span className="text-muted-foreground text-sm">—</span>;
  };

  const refresh = async () => {
    const [usersData, planosData] = await Promise.all([getAllUsers(), getPlanos()]);
    setUsers(usersData);
    setPlanos(planosData);
    setSelectedUser((current) => usersData.find((u) => u.id === current?.id) || usersData[0] || null);
  };

  const openCreateUser = () => {
    setEditingUser(null);
    setFormData({ nome: '', email: '', senha: '', role: 'user', titulo_sistema: 'Sorteios' });
    setIsUserModalOpen(true);
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setFormData({ nome: u.nome, email: u.email, senha: '', role: u.role, titulo_sistema: u.titulo_sistema || 'Sorteios' });
    setIsUserModalOpen(true);
  };

  const handleSubmitUser = async () => {
    if (!editingUser && !formData.senha) {
      toast({ title: 'Senha obrigatória', description: 'Informe uma senha para o novo usuário.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    const payload = {
      nome: formData.nome || '',
      email: formData.email || '',
      senha: formData.senha || '',
      role: (formData.role || 'user') as 'admin' | 'user',
      titulo_sistema: formData.titulo_sistema || 'Sorteios',
    };
    const result = editingUser
      ? await updateUser(editingUser.id, payload)
      : await createUser(payload as CreateUserData);
    setIsSaving(false);
    if (result.success) {
      setIsUserModalOpen(false);
      await refresh();
      toast({ title: editingUser ? 'Usuário atualizado' : 'Usuário criado' });
      return;
    }
    toast({ title: 'Erro', description: result.error || 'Não foi possível salvar o usuário', variant: 'destructive' });
  };

  const openAssignPlan = (u: User) => {
    setSelectedUser(u);
    setSelectedPlanId(u.plano_id || NO_PLAN_VALUE);
    setExtensionDays('0');
    setIsPlanModalOpen(true);
  };

  const handleAssignPlan = async () => {
    if (!selectedUser) return;
    setIsSaving(true);
    const result = await assignUserPlan(selectedUser.id, selectedPlanId === NO_PLAN_VALUE ? null : selectedPlanId, Number(extensionDays || 0));
    setIsSaving(false);
    if (result.success) {
      setIsPlanModalOpen(false);
      await refresh();
      toast({ title: 'Plano aplicado', description: 'A assinatura foi atualizada.' });
      return;
    }
    toast({ title: 'Erro', description: result.error || 'Não foi possível aplicar o plano', variant: 'destructive' });
  };

  const toggleLifetime = async (u: User) => {
    const result = await grantLifetimeAccess(u.id, !u.gratuidade_vitalicia);
    if (result.success) {
      await refresh();
    }
  };

  const handleApprove = async (u: User) => {
    const result = await approveUser(u.id);
    if (result.success) await refresh();
  };

  const handleReject = async (u: User) => {
    const result = await rejectUser(u.id);
    if (result.success) await refresh();
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    setIsSaving(true);
    const result = await deleteUser(userToDelete.id);
    setIsSaving(false);
    if (result.success) {
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
      await refresh();
      return;
    }
    toast({ title: 'Erro', description: result.error || 'Não foi possível excluir o usuário', variant: 'destructive' });
  };

  const selectedUserIsActivePlan = !!selectedUser?.plano_id && (
    !selectedUser.plano_vencimento || new Date(selectedUser.plano_vencimento).getTime() >= Date.now()
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-header text-primary-foreground py-6 px-6">
        <div className="container mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="bg-primary-foreground/20 p-2 rounded-lg">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Usuários e Assinaturas</h1>
              <p className="text-primary-foreground/80 text-sm">Painel dedicado para gerenciar acesso, pagamentos e planos</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Usuários</div><div className="text-2xl font-bold">{users.length}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Assinaturas ativas</div><div className="text-2xl font-bold">{activePlanUsers.length}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Pagamentos pendentes</div><div className="text-2xl font-bold">{pendingPayments.length}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Pagamentos vencidos</div><div className="text-2xl font-bold">{failedPayments.length}</div></CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-4 w-4" />
                Receita recorrente estimada
              </CardTitle>
              <CardDescription>Baseada nos planos ativos com valor definido.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {financialStats.activeRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {activePlanUsers.length} assinatura(s) contribuindo para o caixa.
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-amber-950">
                <Clock3 className="h-4 w-4" />
                A receber
              </CardTitle>
              <CardDescription className="text-amber-900/70">Pagamentos já iniciados, ainda não compensados.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-950">
                {financialStats.pendingRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
              <p className="mt-3 text-sm text-amber-900/70">
                {pendingPayments.length} pagamento(s) aguardando confirmação da Stripe.
              </p>
            </CardContent>
          </Card>

          <Card className="border-destructive/20 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Ban className="h-4 w-4" />
                Receita em risco
              </CardTitle>
              <CardDescription>Assinaturas vencidas ou pagamentos falhados.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {financialStats.overdueRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {failedPayments.length} pagamento(s) precisam de ação.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                Saúde da base
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{financialStats.activePercent}%</div>
              <p className="text-sm text-muted-foreground">Usuários com assinatura ativa.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" />
                Boletos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{financialStats.boletoCount}</div>
              <p className="text-sm text-muted-foreground">Pagamentos gerados via boleto.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" />
                Cartão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{financialStats.cardCount}</div>
              <p className="text-sm text-muted-foreground">Pagamentos confirmados por cartão.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChart className="h-4 w-4" />
                Teste grátis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{freeTrialUsers.length}</div>
              <p className="text-sm text-muted-foreground">Usuários no plano de teste.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="h-4 w-4" />
              Mix financeiro
            </CardTitle>
            <CardDescription>Distribuição operacional por método de cobrança.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">Boleto</div>
              <div className="text-xl font-semibold">{financialStats.boletoCount}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">Cartão</div>
              <div className="text-xl font-semibold">{financialStats.cardCount}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">Manual/admin</div>
              <div className="text-xl font-semibold">{financialStats.manualCount}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">Gratuitos</div>
              <div className="text-xl font-semibold">{financialStats.freeCount}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros rápidos</CardTitle>
            <CardDescription>Filtre a lista por situação da assinatura e forma de pagamento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('all')}>Todos</Button>
              <Button variant={statusFilter === 'active' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('active')}>Ativo</Button>
              <Button variant={statusFilter === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('pending')}>Pendente</Button>
              <Button variant={statusFilter === 'overdue' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('overdue')}>Vencido</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant={paymentFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentFilter('all')}>Todos os meios</Button>
              <Button variant={paymentFilter === 'boleto' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentFilter('boleto')}>Boleto</Button>
              <Button variant={paymentFilter === 'card' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentFilter('card')}>Cartão</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome, email, plano ou status" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={openCreateUser}>
              <UserIcon className="h-4 w-4 mr-2" />
              Novo usuário
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Lista de usuários</CardTitle>
              <CardDescription>Veja plano, método de pagamento, vencimento e ações rápidas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="w-[190px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id} className={selectedUser?.id === u.id ? 'bg-muted/50' : ''} onClick={() => setSelectedUser(u)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {u.role === 'admin' ? <ShieldCheck className="h-4 w-4 text-primary" /> : <UserIcon className="h-4 w-4 text-muted-foreground" />}
                            <div className="flex flex-col">
                              <span>{u.nome}</span>
                              <span className="text-xs text-muted-foreground">{u.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.ativo ? 'default' : 'secondary'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline">{getPlanName(u)}</Badge>
                            {u.gratuidade_vitalicia && <span className="text-xs text-muted-foreground">Gratuidade vitalícia</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getPaymentBadge(u)}
                            {u.plano_pagamento_metodo && (
                              <span className="text-xs text-muted-foreground">Método: {u.plano_pagamento_metodo}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {u.plano_vencimento ? formatDate(u.plano_vencimento) : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button size="icon" variant="ghost" title="Editar" onClick={(e) => { e.stopPropagation(); openEditUser(u); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Plano" onClick={(e) => { e.stopPropagation(); openAssignPlan(u); }}>
                              <CreditCard className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Gratuidade" onClick={(e) => { e.stopPropagation(); toggleLifetime(u); }}>
                              <Gift className="h-4 w-4 text-green-600" />
                            </Button>
                            {u.ativo ? null : (
                              <>
                                <Button size="icon" variant="ghost" title="Aprovar" onClick={(e) => { e.stopPropagation(); handleApprove(u); }}>
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" title="Rejeitar" onClick={(e) => { e.stopPropagation(); handleReject(u); }}>
                                  <AlertTriangle className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                            <Button size="icon" variant="ghost" title="Excluir" onClick={(e) => { e.stopPropagation(); setUserToDelete(u); setIsDeleteModalOpen(true); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalhes do usuário</CardTitle>
              <CardDescription>Resumo operacional para suporte e cobrança.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedUser ? (
                <>
                  <div className="space-y-2">
                    <div className="text-lg font-semibold">{selectedUser.nome}</div>
                    <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={selectedUser.role === 'admin' ? 'default' : 'secondary'}>{selectedUser.role === 'admin' ? 'Administrador' : 'Usuário'}</Badge>
                      <Badge variant={selectedUser.ativo ? 'default' : 'secondary'}>{selectedUser.ativo ? 'Ativo' : 'Inativo'}</Badge>
                      {selectedUser.gratuidade_vitalicia && <Badge variant="secondary">Gratuidade vitalícia</Badge>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Plano atual</div>
                    <div className="font-medium">{getPlanName(selectedUser)}</div>
                    <div className="text-sm text-muted-foreground">
                      Vencimento: {selectedUser.plano_vencimento ? formatDate(selectedUser.plano_vencimento) : '—'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Início: {selectedUser.plano_inicio ? formatDate(selectedUser.plano_inicio) : '—'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Situação: {selectedUserIsActivePlan ? 'Assinatura ativa' : 'Sem assinatura ativa'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Pagamento</div>
                    <div>{getPaymentBadge(selectedUser)}</div>
                    <div className="text-sm text-muted-foreground">
                      Método: {selectedUser.plano_pagamento_metodo || '—'}
                    </div>
                    <div className="text-sm text-muted-foreground break-all">
                      Sessão Stripe: {selectedUser.plano_pagamento_sessao_id || '—'}
                    </div>
                    {selectedUser.plano_pagamento_voucher_url && (
                      <Button variant="outline" className="w-full" onClick={() => window.open(selectedUser.plano_pagamento_voucher_url as string, '_blank', 'noopener,noreferrer')}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir boleto
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Conta</div>
                    <div className="text-sm">Criado em: {formatDate(selectedUser.created_at)}</div>
                    <div className="text-sm">Atualizado em: {formatDate(selectedUser.updated_at || null)}</div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button onClick={() => openAssignPlan(selectedUser)}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Alterar plano
                    </Button>
                    <Button variant="outline" onClick={() => openEditUser(selectedUser)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar usuário
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Selecione um usuário para ver os detalhes.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
            <DialogDescription>Cadastre ou altere dados básicos do usuário.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input value={formData.nome || ''} onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email || ''} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Senha {editingUser ? '(opcional)' : ''}</Label>
              <Input type="password" value={formData.senha || ''} onChange={(e) => setFormData((prev) => ({ ...prev, senha: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={formData.role || 'user'} onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value as 'admin' | 'user' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Título do sistema</Label>
              <Input value={formData.titulo_sistema || ''} onChange={(e) => setFormData((prev) => ({ ...prev, titulo_sistema: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUserModalOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSubmitUser} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir plano</DialogTitle>
            <DialogDescription>Use o ciclo do plano para definir a data de vencimento.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Plano</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PLAN_VALUE}>Remover plano</SelectItem>
                  {planos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} - {Number(p.valor) > 0 ? `R$ ${Number(p.valor).toFixed(2).replace('.', ',')}` : 'Gratuito'} ({p.tipo_plano || 'mensal'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Dias extras de renovação</Label>
              <Input type="number" min="0" value={extensionDays} onChange={(e) => setExtensionDays(e.target.value)} />
            </div>
            {selectedPlan && (
              <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                Ciclo definido: {selectedPlan.ciclo_dias_renovacao || 30} dia(s). O vencimento final soma os dias extras.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPlanModalOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleAssignPlan} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription>
              {userToDelete ? `Confirma a exclusão de ${userToDelete.nome}?` : 'Confirma a exclusão do usuário?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsuarios;
