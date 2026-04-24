import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { User, CreateUserData, UserRole, Plan } from '@/types/auth';
import { Sorteio } from '@/types/bingo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Pencil, Trash2, Users, Loader2, ShieldCheck, User as UserIcon, UserPlus, UserMinus, Ticket, CreditCard, Settings, Gift, Mail, Check, X, Clock } from 'lucide-react';
import { z } from 'zod';
import { applyFavicon } from '@/hooks/useFavicon';
import { useToast } from '@/hooks/use-toast';

interface SorteioAdmin extends Sorteio {
  owner_nome: string;
  owner_email: string;
}

const userSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email inválido').max(255),
  senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres').max(100).optional().or(z.literal('')),
  role: z.enum(['admin', 'user']),
  titulo_sistema: z.string().min(1, 'Título do sistema é obrigatório').max(100),
});

const NO_PLAN_VALUE = 'none';

const planSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  valor: z.coerce.number().min(0, 'Valor deve ser maior ou igual a zero'),
  descricao: z.string().max(500).optional().or(z.literal('')),
  stripe_price_id: z.string().max(255).optional().or(z.literal('')),
});

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { user, getAllUsers, createUser, updateUser, deleteUser, approveUser, rejectUser, isAuthenticated, getAllSorteiosAdmin, getSorteioUsers, assignSorteioToUser, removeUserFromSorteio, changeSorteioOwner, getPlanos, createPlano, updatePlano, deletePlano, assignUserPlan, grantLifetimeAccess, getConfiguracoes, updateConfiguracoes } = useAuth();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Sorteio assignment state
  const [sorteios, setSorteios] = useState<SorteioAdmin[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedSorteio, setSelectedSorteio] = useState<SorteioAdmin | null>(null);
  const [sorteioUsers, setSorteioUsers] = useState<User[]>([]);
  const [sorteioOwnerId, setSorteioOwnerId] = useState<string>('');
  const [isLoadingAssign, setIsLoadingAssign] = useState(false);
  const [assignUserId, setAssignUserId] = useState<string>('');
  const [changeOwnerUserId, setChangeOwnerUserId] = useState<string>('');
  
  // Plans state
  const [planos, setPlanos] = useState<Plan[]>([]);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isDeletePlanModalOpen, setIsDeletePlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [planFormData, setPlanFormData] = useState({ nome: '', valor: '', descricao: '', stripe_price_id: '' });

  // User plan assignment state
  const [isUserPlanModalOpen, setIsUserPlanModalOpen] = useState(false);
  const [selectedUserForPlan, setSelectedUserForPlan] = useState<User | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [isSubmittingUserPlan, setIsSubmittingUserPlan] = useState(false);

  // Settings / Stripe state
  const [paymentGateway, setPaymentGateway] = useState<'stripe' | 'mercado_pago'>('stripe');
  const [stripePublicKey, setStripePublicKey] = useState('');
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [stripeSandboxMode, setStripeSandboxMode] = useState(false);
  const [stripeSandboxPublicKey, setStripeSandboxPublicKey] = useState('');
  const [stripeSandboxSecretKey, setStripeSandboxSecretKey] = useState('');
  const [stripeSandboxWebhookSecret, setStripeSandboxWebhookSecret] = useState('');
  // Mercado Pago state
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpClientId, setMpClientId] = useState('');
  const [mpClientSecret, setMpClientSecret] = useState('');
  const [mpSandboxPublicKey, setMpSandboxPublicKey] = useState('');
  const [mpSandboxAccessToken, setMpSandboxAccessToken] = useState('');
  const [mpSandboxMode, setMpSandboxMode] = useState(false);
  const [mpWebhookSecret, setMpWebhookSecret] = useState('');
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [faviconUrl, setFaviconUrl] = useState('');
  const faviconFileInputRef = useRef<HTMLInputElement>(null);

  // SMTP state
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpEncryption, setSmtpEncryption] = useState('tls');
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);

  // Email template state
  const [tplAdminSubject, setTplAdminSubject] = useState('Novo cadastro aguardando aprovação');
  const [tplAdminBody, setTplAdminBody] = useState('Olá Administrador,\n\nUm novo usuário se cadastrou e aguarda sua aprovação:\n\nNome: {{nome_usuario}}\nEmail: {{email_usuario}}\n\nAcesse o painel de administração para aprovar ou rejeitar o cadastro.\n\nAtenciosamente,\n{{titulo_sistema}}');
  const [tplApprovalSubject, setTplApprovalSubject] = useState('Seu cadastro foi aprovado');
  const [tplApprovalBody, setTplApprovalBody] = useState('Olá {{nome}},\n\nSeu cadastro foi aprovado! Você já pode acessar o sistema com seu email {{email}}.\n\nAtenciosamente,\n{{titulo_sistema}}');
  const [tplResetSubject, setTplResetSubject] = useState('Redefinição de senha');
  const [tplResetBody, setTplResetBody] = useState('Olá {{nome}},\n\nVocê solicitou a redefinição de sua senha. Clique no link abaixo:\n\n{{link}}\n\nSe não foi você quem solicitou, ignore este email.\n\nAtenciosamente,\n{{titulo_sistema}}');
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);

  // Pending approval state
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [userToReject, setUserToReject] = useState<User | null>(null);

  const pendingUsers = users.filter(u => !u.ativo);
  const activeUsers = users.filter(u => u.ativo);
  
  const [formData, setFormData] = useState<Partial<CreateUserData>>({
    nome: '',
    email: '',
    senha: '',
    role: 'user',
    titulo_sistema: 'Sorteios',
  });

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    const data = await getAllUsers();
    setUsers(data);
    setIsLoading(false);
  }, [getAllUsers]);

  const loadSorteios = useCallback(async () => {
    const data = await getAllSorteiosAdmin();
    setSorteios(data);
  }, [getAllSorteiosAdmin]);

  const loadPlanos = useCallback(async () => {
    const data = await getPlanos();
    setPlanos(data);
  }, [getPlanos]);

  const loadConfig = useCallback(async () => {
    setIsLoadingConfig(true);
    const config = await getConfiguracoes();
    setPaymentGateway((config['payment_gateway'] as 'stripe' | 'mercado_pago') || 'stripe');
    setStripePublicKey(config['stripe_public_key'] || '');
    setStripeSecretKey(config['stripe_secret_key'] || '');
    setStripeWebhookSecret(config['stripe_webhook_secret'] || '');
    setStripeSandboxMode(config['stripe_sandbox_mode'] === 'true');
    setStripeSandboxPublicKey(config['stripe_sandbox_public_key'] || '');
    setStripeSandboxSecretKey(config['stripe_sandbox_secret_key'] || '');
    setStripeSandboxWebhookSecret(config['stripe_sandbox_webhook_secret'] || '');
    setMpPublicKey(config['mp_public_key'] || '');
    setMpAccessToken(config['mp_access_token'] || '');
    setMpClientId(config['mp_client_id'] || '');
    setMpClientSecret(config['mp_client_secret'] || '');
    setMpSandboxPublicKey(config['mp_sandbox_public_key'] || '');
    setMpSandboxAccessToken(config['mp_sandbox_access_token'] || '');
    setMpSandboxMode(config['mp_sandbox_mode'] === 'true');
    setMpWebhookSecret(config['mp_webhook_secret'] || '');
    setFaviconUrl(config['favicon_url'] || '');
    // SMTP
    setSmtpHost(config['smtp_host'] || '');
    setSmtpPort(config['smtp_port'] || '587');
    setSmtpUser(config['smtp_user'] || '');
    setSmtpPass(config['smtp_pass'] || '');
    setSmtpFromName(config['smtp_from_name'] || '');
    setSmtpFromEmail(config['smtp_from_email'] || '');
    setSmtpEncryption(config['smtp_encryption'] || (config['smtp_secure'] === 'true' ? 'ssl' : 'none'));
    // Email templates
    if (config['email_admin_novo_cadastro_assunto']) setTplAdminSubject(config['email_admin_novo_cadastro_assunto']);
    if (config['email_admin_novo_cadastro_corpo'])   setTplAdminBody(config['email_admin_novo_cadastro_corpo']);
    if (config['email_confirmacao_assunto'])          setTplApprovalSubject(config['email_confirmacao_assunto']);
    if (config['email_confirmacao_corpo'])            setTplApprovalBody(config['email_confirmacao_corpo']);
    if (config['email_redefinicao_assunto'])          setTplResetSubject(config['email_redefinicao_assunto']);
    if (config['email_redefinicao_corpo'])            setTplResetBody(config['email_redefinicao_corpo']);
    setIsLoadingConfig(false);
  }, [getConfiguracoes]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }

    if (user?.role !== 'admin') {
      navigate('/');
      return;
    }

    loadUsers();
    loadSorteios();
    loadPlanos();
    loadConfig();
  }, [isAuthenticated, user, navigate, loadUsers, loadSorteios, loadPlanos, loadConfig]);

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    await updateConfiguracoes({
      payment_gateway: paymentGateway,
      stripe_public_key: stripePublicKey,
      stripe_secret_key: stripeSecretKey,
      stripe_webhook_secret: stripeWebhookSecret,
      stripe_sandbox_mode: stripeSandboxMode ? 'true' : 'false',
      stripe_sandbox_public_key: stripeSandboxPublicKey,
      stripe_sandbox_secret_key: stripeSandboxSecretKey,
      stripe_sandbox_webhook_secret: stripeSandboxWebhookSecret,
      mp_public_key: mpPublicKey,
      mp_access_token: mpAccessToken,
      mp_client_id: mpClientId,
      mp_client_secret: mpClientSecret,
      mp_sandbox_public_key: mpSandboxPublicKey,
      mp_sandbox_access_token: mpSandboxAccessToken,
      mp_sandbox_mode: mpSandboxMode ? 'true' : 'false',
      mp_webhook_secret: mpWebhookSecret,
      favicon_url: faviconUrl,
    });
    applyFavicon(faviconUrl || null);
    setIsSavingConfig(false);
  };

  const handleFaviconUpload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Arquivo inválido', description: 'Selecione uma imagem válida.', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Use imagens de até 2MB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFaviconUrl(reader.result as string);
    reader.onerror = () => toast({ title: 'Erro', description: 'Não foi possível carregar a imagem.', variant: 'destructive' });
    reader.readAsDataURL(file);
  };

  const handleClearFavicon = () => {
    setFaviconUrl('');
    if (faviconFileInputRef.current) faviconFileInputRef.current.value = '';
  };

  const handleSaveSmtp = async () => {
    setIsSavingSmtp(true);
    await updateConfiguracoes({
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_user: smtpUser,
      smtp_pass: smtpPass,
      smtp_from_name: smtpFromName,
      smtp_from_email: smtpFromEmail,
      smtp_encryption: smtpEncryption,
    });
    setIsSavingSmtp(false);
  };

  const handleSaveTemplates = async () => {
    setIsSavingTemplates(true);
    await updateConfiguracoes({
      email_admin_novo_cadastro_assunto: tplAdminSubject,
      email_admin_novo_cadastro_corpo: tplAdminBody,
      email_confirmacao_assunto: tplApprovalSubject,
      email_confirmacao_corpo: tplApprovalBody,
      email_redefinicao_assunto: tplResetSubject,
      email_redefinicao_corpo: tplResetBody,
    });
    setIsSavingTemplates(false);
  };

  const handleApproveUser = async (u: User) => {
    setIsApprovingId(u.id);
    await approveUser(u.id);
    setIsApprovingId(null);
    loadUsers();
  };

  const handleRejectClick = (u: User) => {
    setUserToReject(u);
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!userToReject) return;
    setIsSubmitting(true);
    await rejectUser(userToReject.id);
    setIsSubmitting(false);
    setIsRejectModalOpen(false);
    setUserToReject(null);
    loadUsers();
  };

  const handleOpenPlanModal = (plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanFormData({ nome: plan.nome, valor: String(plan.valor), descricao: plan.descricao || '', stripe_price_id: plan.stripe_price_id || '' });
    } else {
      setEditingPlan(null);
      setPlanFormData({ nome: '', valor: '', descricao: '', stripe_price_id: '' });
    }
    setPlanErrors({});
    setIsPlanModalOpen(true);
  };

  const handleClosePlanModal = () => {
    setIsPlanModalOpen(false);
    setEditingPlan(null);
    setPlanFormData({ nome: '', valor: '', descricao: '', stripe_price_id: '' });
    setPlanErrors({});
  };

  const handleSubmitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanErrors({});
    try {
      planSchema.parse(planFormData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) newErrors[err.path[0] as string] = err.message;
        });
        setPlanErrors(newErrors);
        return;
      }
    }
    setIsSubmittingPlan(true);
    const payload = { nome: planFormData.nome, valor: Number(planFormData.valor), descricao: planFormData.descricao, stripe_price_id: planFormData.stripe_price_id || undefined };
    const result = editingPlan
      ? await updatePlano(editingPlan.id, payload)
      : await createPlano(payload);
    setIsSubmittingPlan(false);
    if (result.success) {
      handleClosePlanModal();
      loadPlanos();
    } else {
      setPlanErrors({ form: result.error || 'Erro ao salvar plano' });
    }
  };

  const handleDeletePlanClick = (plan: Plan) => {
    setPlanToDelete(plan);
    setIsDeletePlanModalOpen(true);
  };

  const handleConfirmDeletePlan = async () => {
    if (!planToDelete) return;
    setIsSubmittingPlan(true);
    const result = await deletePlano(planToDelete.id);
    setIsSubmittingPlan(false);
    if (result.success) {
      setIsDeletePlanModalOpen(false);
      setPlanToDelete(null);
      loadPlanos();
    }
  };

  const handleOpenUserPlanModal = (u: User) => {
    setSelectedUserForPlan(u);
    setSelectedPlanId(u.plano_id || NO_PLAN_VALUE);
    setIsUserPlanModalOpen(true);
  };

  const handleAssignUserPlan = async () => {
    if (!selectedUserForPlan) return;
    setIsSubmittingUserPlan(true);
    await assignUserPlan(selectedUserForPlan.id, selectedPlanId === NO_PLAN_VALUE ? null : selectedPlanId);
    setIsSubmittingUserPlan(false);
    setIsUserPlanModalOpen(false);
    loadUsers();
  };

  const handleToggleLifetime = async (u: User) => {
    await grantLifetimeAccess(u.id, !u.gratuidade_vitalicia);
    loadUsers();
  };

  const handleOpenModal = (userToEdit?: User) => {
    if (userToEdit) {
      setEditingUser(userToEdit);
      setFormData({
        nome: userToEdit.nome,
        email: userToEdit.email,
        senha: '',
        role: userToEdit.role,
        titulo_sistema: userToEdit.titulo_sistema || 'Sorteios',
      });
    } else {
      setEditingUser(null);
      setFormData({ nome: '', email: '', senha: '', role: 'user', titulo_sistema: 'Sorteios' });
    }
    setErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData({ nome: '', email: '', senha: '', role: 'user', titulo_sistema: 'Sorteios' });
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    const dataToValidate = {
      ...formData,
      senha: editingUser && !formData.senha ? undefined : formData.senha,
    };
    
    try {
      if (editingUser) {
        if (formData.senha) {
          userSchema.parse(dataToValidate);
        } else {
          userSchema.omit({ senha: true }).parse(dataToValidate);
        }
      } else {
        userSchema.parse(dataToValidate);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
        return;
      }
    }
    
    setIsSubmitting(true);
    
    let result;
    if (editingUser) {
      const updateData: Partial<CreateUserData> = {
        nome: formData.nome,
        email: formData.email,
        role: formData.role,
        titulo_sistema: formData.titulo_sistema,
      };
      if (formData.senha) {
        updateData.senha = formData.senha;
      }
      result = await updateUser(editingUser.id, updateData);
    } else {
      result = await createUser(formData as CreateUserData);
    }
    
    setIsSubmitting(false);
    
    if (result.success) {
      handleCloseModal();
      loadUsers();
    } else {
      setErrors({ form: result.error || 'Erro ao salvar usuário' });
    }
  };

  const handleDeleteClick = (userToRemove: User) => {
    setUserToDelete(userToRemove);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    
    setIsSubmitting(true);
    const result = await deleteUser(userToDelete.id);
    setIsSubmitting(false);
    
    if (result.success) {
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
      loadUsers();
    }
  };

  const handleOpenAssignModal = async (sorteio: Sorteio) => {
    setSelectedSorteio(sorteio);
    setAssignUserId('');
    setIsLoadingAssign(true);
    setIsAssignModalOpen(true);
    const { data, owner_id } = await getSorteioUsers(sorteio.id);
    setSorteioUsers(data);
    setSorteioOwnerId(owner_id);
    setIsLoadingAssign(false);
  };

  const handleAssignUser = async () => {
    if (!selectedSorteio || !assignUserId) return;
    setIsLoadingAssign(true);
    await assignSorteioToUser(selectedSorteio.id, assignUserId);
    const { data, owner_id } = await getSorteioUsers(selectedSorteio.id);
    setSorteioUsers(data);
    setSorteioOwnerId(owner_id);
    setAssignUserId('');
    setIsLoadingAssign(false);
  };

  const handleRemoveUser = async (userId: string) => {
    if (!selectedSorteio) return;
    setIsLoadingAssign(true);
    await removeUserFromSorteio(selectedSorteio.id, userId);
    const { data, owner_id } = await getSorteioUsers(selectedSorteio.id);
    setSorteioUsers(data);
    setSorteioOwnerId(owner_id);
    setIsLoadingAssign(false);
  };

  const handleChangeOwner = async () => {
    if (!selectedSorteio || !changeOwnerUserId) return;
    setIsLoadingAssign(true);
    await changeSorteioOwner(selectedSorteio.id, changeOwnerUserId);
    const { data, owner_id } = await getSorteioUsers(selectedSorteio.id);
    setSorteioUsers(data);
    setSorteioOwnerId(owner_id);
    setChangeOwnerUserId('');
    loadSorteios();
    setIsLoadingAssign(false);
  };

  const assignableUsers = users.filter(u => !sorteioUsers.some(su => su.id === u.id));

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
        <div className="container mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="bg-primary-foreground/20 p-2 rounded-lg">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Configurações</h1>
                <p className="text-primary-foreground/80 text-sm">Gerencie os acessos do sistema</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6 space-y-6">
        <Tabs defaultValue="usuarios">
          <TabsList className="mb-4">
            <TabsTrigger value="usuarios" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuários
              {pendingUsers.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {pendingUsers.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="planos" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Planos
            </TabsTrigger>
            <TabsTrigger value="configuracoes" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email / SMTP
            </TabsTrigger>
          </TabsList>

          {/* ========== USUÁRIOS TAB ========== */}
          <TabsContent value="usuarios" className="space-y-6">

          {/* ── Cadastros Pendentes ── */}
          {pendingUsers.length > 0 && (
            <Card className="border-orange-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-700">
                  <Clock className="h-5 w-5" />
                  Cadastros Pendentes
                  <Badge variant="destructive">{pendingUsers.length}</Badge>
                </CardTitle>
                <CardDescription>Novos cadastros aguardando aprovação do administrador</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="table-container">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Solicitado em</TableHead>
                        <TableHead className="w-[140px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.nome}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>{new Date(u.created_at).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-700 border-green-300 hover:bg-green-50"
                                disabled={isApprovingId === u.id}
                                onClick={() => handleApproveUser(u)}
                                title="Aprovar cadastro"
                              >
                                {isApprovingId === u.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <Check className="h-4 w-4" />}
                                <span className="ml-1">Aprovar</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => handleRejectClick(u)}
                                title="Rejeitar cadastro"
                              >
                                <X className="h-4 w-4" />
                                <span className="ml-1">Rejeitar</span>
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
          )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Usuários Ativos</CardTitle>
              <CardDescription>{activeUsers.length} usuário(s) ativo(s)</CardDescription>
            </div>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </CardHeader>
          <CardContent>
            <div className="table-container">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Gratuidade</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {u.role === 'admin' ? (
                            <ShieldCheck className="h-4 w-4 text-primary" />
                          ) : (
                            <UserIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                          {u.nome}
                        </div>
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' ? 'Administrador' : 'Usuário'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`status-badge ${u.ativo ? 'status-ativo' : 'status-inativo'}`}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {u.gratuidade_vitalicia
                          ? <Badge variant="secondary">Gratuidade</Badge>
                          : u.plano_id
                          ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge variant="outline">{planos.find(p => p.id === u.plano_id)?.nome || 'Plano'}</Badge>
                              {u.plano_vencimento && (
                                <span className="text-xs text-muted-foreground">
                                  Vence: {new Date(u.plano_vencimento).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          )
                          : <span className="text-muted-foreground text-sm">—</span>
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!u.gratuidade_vitalicia}
                            onCheckedChange={() => handleToggleLifetime(u)}
                            disabled={u.id === user?.id}
                          />
                          {u.gratuidade_vitalicia && (
                            <Gift className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar usuário"
                            onClick={() => handleOpenModal(u)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Atribuir plano"
                            onClick={() => handleOpenUserPlanModal(u)}
                          >
                            <CreditCard className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={u.id === user?.id}
                            title="Excluir usuário"
                            onClick={() => handleDeleteClick(u)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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

        {/* Sorteio Assignment Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-5 w-5" />
                Atribuição de Sorteios
              </CardTitle>
              <CardDescription>Atribua sorteios existentes a quantos usuários desejar</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {sorteios.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum sorteio cadastrado no sistema.</p>
            ) : (
              <div className="table-container">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome do Sorteio</TableHead>
                      <TableHead>Proprietário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="w-[120px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorteios.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nome}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{s.owner_nome}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.status === 'em_andamento' ? 'default' : 'secondary'}>
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {s.data_sorteio ? new Date(s.data_sorteio).toLocaleDateString('pt-BR') : '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAssignModal(s)}
                          >
                            <Users className="h-4 w-4 mr-1" />
                            Atribuir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          {/* ========== PLANOS TAB ========== */}
          <TabsContent value="planos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Planos
                  </CardTitle>
                  <CardDescription>Gerencie os planos disponíveis no sistema</CardDescription>
                </div>
                <Button onClick={() => handleOpenPlanModal()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Plano
                </Button>
              </CardHeader>
              <CardContent>
                {planos.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum plano cadastrado. Clique em "Novo Plano" para adicionar.</p>
                ) : (
                  <div className="table-container">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Criado em</TableHead>
                          <TableHead className="w-[100px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {planos.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.nome}</TableCell>
                            <TableCell>
                              {Number(p.valor) === 0
                                ? <Badge variant="secondary">Gratuito</Badge>
                                : <span>R$ {Number(p.valor).toFixed(2)}</span>
                              }
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{p.descricao || '—'}</TableCell>
                            <TableCell>{new Date(p.created_at).toLocaleDateString('pt-BR')}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenPlanModal(p)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeletePlanClick(p)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== CONFIGURAÇÕES TAB ========== */}
          <TabsContent value="configuracoes">
            <div className="space-y-6">
            {/* Favicon Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Favicon do Sistema
                </CardTitle>
                <CardDescription>Configure o ícone exibido na aba do navegador em todas as páginas</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingConfig ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4 max-w-lg">
                    <div className="space-y-2">
                      <Label htmlFor="favicon_url">URL do Favicon</Label>
                      <div className="flex items-center gap-3">
                        {faviconUrl && (
                          <img
                            src={faviconUrl}
                            alt="Favicon"
                            className="h-8 w-8 rounded object-contain border"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <Input
                          id="favicon_url"
                          value={faviconUrl}
                          onChange={(e) => setFaviconUrl(e.target.value)}
                          placeholder="https://exemplo.com/favicon.ico"
                          disabled={isSavingConfig}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Input
                          ref={faviconFileInputRef}
                          type="file"
                          accept="image/*"
                          disabled={isSavingConfig}
                          onChange={(e) => handleFaviconUpload(e.target.files?.[0] || null)}
                        />
                        <Button type="button" variant="outline" disabled={isSavingConfig} onClick={handleClearFavicon}>
                          Limpar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Cole uma URL pública ou envie uma imagem (.ico, .png, .svg). Deixe em branco para remover o favicon.</p>
                    </div>
                    <Button onClick={handleSaveConfig} disabled={isSavingConfig}>
                      {isSavingConfig && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Salvar Favicon
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configurações de Pagamento
                </CardTitle>
                <CardDescription>Escolha o gateway de pagamento e configure as credenciais da API</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingConfig ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4 max-w-lg">
                    {/* Gateway selector */}
                    <div className="space-y-2">
                      <Label>Gateway de Pagamento</Label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setPaymentGateway('stripe')}
                          disabled={isSavingConfig}
                          className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-colors ${paymentGateway === 'stripe' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                        >
                          Stripe
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentGateway('mercado_pago')}
                          disabled={isSavingConfig}
                          className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-colors ${paymentGateway === 'mercado_pago' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                        >
                          Mercado Pago
                        </button>
                      </div>
                    </div>

                    {paymentGateway === 'stripe' && (
                      <>
                        {/* Sandbox mode toggle */}
                        <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                          <div>
                            <p className="font-semibold text-orange-800 text-sm">Modo Sandbox (Testes)</p>
                            <p className="text-xs text-orange-600 mt-0.5">Ativado: usa chaves de teste (pk_test_ / sk_test_). Desativado: usa chaves de produção (pk_live_ / sk_live_).</p>
                          </div>
                          <Switch
                            checked={stripeSandboxMode}
                            onCheckedChange={setStripeSandboxMode}
                            disabled={isSavingConfig}
                          />
                        </div>

                        {/* Live keys */}
                        <div className={`space-y-4 rounded-lg border p-4 ${stripeSandboxMode ? 'border-gray-200 opacity-60' : 'border-green-200 bg-green-50/30'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Chaves de Produção (Live)</p>
                        <div className="space-y-2">
                          <Label htmlFor="stripe_public_key">Chave Pública (Publishable Key)</Label>
                          <Input
                            id="stripe_public_key"
                            value={stripePublicKey}
                            onChange={(e) => setStripePublicKey(e.target.value)}
                            placeholder="pk_live_..."
                            disabled={isSavingConfig}
                          />
                          <p className="text-xs text-muted-foreground">Chave pública para uso no frontend (começa com pk_live_)</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stripe_secret_key">Chave Secreta (Secret Key)</Label>
                          <Input
                            id="stripe_secret_key"
                            type="password"
                            value={stripeSecretKey}
                            onChange={(e) => setStripeSecretKey(e.target.value)}
                            placeholder="sk_live_..."
                            disabled={isSavingConfig}
                          />
                          <p className="text-xs text-muted-foreground">Chave secreta para uso no backend (começa com sk_live_). Mantenha em segredo.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stripe_webhook_secret">Webhook Secret (Produção)</Label>
                          <Input
                            id="stripe_webhook_secret"
                            type="password"
                            value={stripeWebhookSecret}
                            onChange={(e) => setStripeWebhookSecret(e.target.value)}
                            placeholder="whsec_..."
                            disabled={isSavingConfig}
                          />
                          <p className="text-xs text-muted-foreground">Segredo do webhook Stripe para verificação de assinaturas (começa com whsec_).</p>
                        </div>
                        </div>

                        {/* Sandbox keys */}
                        <div className={`space-y-4 rounded-lg border p-4 ${stripeSandboxMode ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200 opacity-60'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Chaves de Sandbox (Testes)</p>
                        <div className="space-y-2">
                          <Label htmlFor="stripe_sandbox_public_key">Chave Pública Sandbox</Label>
                          <Input
                            id="stripe_sandbox_public_key"
                            value={stripeSandboxPublicKey}
                            onChange={(e) => setStripeSandboxPublicKey(e.target.value)}
                            placeholder="pk_test_..."
                            disabled={isSavingConfig}
                          />
                          <p className="text-xs text-muted-foreground">Chave pública de teste (começa com pk_test_)</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stripe_sandbox_secret_key">Chave Secreta Sandbox</Label>
                          <Input
                            id="stripe_sandbox_secret_key"
                            type="password"
                            value={stripeSandboxSecretKey}
                            onChange={(e) => setStripeSandboxSecretKey(e.target.value)}
                            placeholder="sk_test_..."
                            disabled={isSavingConfig}
                          />
                          <p className="text-xs text-muted-foreground">Chave secreta de teste (começa com sk_test_). Mantenha em segredo.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stripe_sandbox_webhook_secret">Webhook Secret (Sandbox)</Label>
                          <Input
                            id="stripe_sandbox_webhook_secret"
                            type="password"
                            value={stripeSandboxWebhookSecret}
                            onChange={(e) => setStripeSandboxWebhookSecret(e.target.value)}
                            placeholder="whsec_..."
                            disabled={isSavingConfig}
                          />
                          <p className="text-xs text-muted-foreground">Segredo do webhook de teste (começa com whsec_).</p>
                        </div>
                        </div>
                      </>
                    )}

                    {paymentGateway === 'mercado_pago' && (
                      <>
                        {/* MP Sandbox mode toggle */}
                        <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                          <div>
                            <p className="font-semibold text-orange-800 text-sm">Modo Sandbox (Testes)</p>
                            <p className="text-xs text-orange-600 mt-0.5">Ativado: usa o Access Token de teste. Desativado: usa o Access Token de produção.</p>
                          </div>
                          <Switch
                            checked={mpSandboxMode}
                            onCheckedChange={setMpSandboxMode}
                            disabled={isSavingConfig}
                          />
                        </div>

                        {/* MP Production token */}
                        <div className={`space-y-4 rounded-lg border p-4 ${mpSandboxMode ? 'border-gray-200 opacity-60' : 'border-green-200 bg-green-50/30'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Produção</p>
                          <div className="space-y-2">
                            <Label htmlFor="mp_public_key">Chave Pública (Public Key)</Label>
                            <Input
                              id="mp_public_key"
                              type="password"
                              value={mpPublicKey}
                              onChange={(e) => setMpPublicKey(e.target.value)}
                              placeholder="APP_USR-..."
                              disabled={isSavingConfig}
                            />
                            <p className="text-xs text-muted-foreground">Chave pública de produção obtida no painel do Mercado Pago.</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mp_access_token">Access Token (Produção)</Label>
                            <Input
                              id="mp_access_token"
                              type="password"
                              value={mpAccessToken}
                              onChange={(e) => setMpAccessToken(e.target.value)}
                              placeholder="APP_USR-..."
                              disabled={isSavingConfig}
                            />
                            <p className="text-xs text-muted-foreground">Access Token de produção obtido no painel do Mercado Pago (começa com APP_USR-).</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mp_client_id">Client ID (Produção)</Label>
                            <Input
                              id="mp_client_id"
                              type="password"
                              value={mpClientId}
                              onChange={(e) => setMpClientId(e.target.value)}
                              placeholder="Client ID da aplicação"
                              disabled={isSavingConfig}
                            />
                            <p className="text-xs text-muted-foreground">Client ID da aplicação no painel do Mercado Pago.</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mp_client_secret">Client Secret (Produção)</Label>
                            <Input
                              id="mp_client_secret"
                              type="password"
                              value={mpClientSecret}
                              onChange={(e) => setMpClientSecret(e.target.value)}
                              placeholder="Client Secret da aplicação"
                              disabled={isSavingConfig}
                            />
                            <p className="text-xs text-muted-foreground">Client Secret da aplicação no painel do Mercado Pago.</p>
                          </div>
                        </div>

                        {/* MP Sandbox token */}
                        <div className={`space-y-4 rounded-lg border p-4 ${mpSandboxMode ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200 opacity-60'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Sandbox (Testes)</p>
                          <div className="space-y-2">
                            <Label htmlFor="mp_sandbox_public_key">Chave Pública (Sandbox)</Label>
                            <Input
                              id="mp_sandbox_public_key"
                              type="password"
                              value={mpSandboxPublicKey}
                              onChange={(e) => setMpSandboxPublicKey(e.target.value)}
                              placeholder="TEST-..."
                              disabled={isSavingConfig}
                            />
                            <p className="text-xs text-muted-foreground">Chave pública de teste obtida no painel do Mercado Pago.</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mp_sandbox_access_token">Access Token (Sandbox)</Label>
                            <Input
                              id="mp_sandbox_access_token"
                              type="password"
                              value={mpSandboxAccessToken}
                              onChange={(e) => setMpSandboxAccessToken(e.target.value)}
                              placeholder="TEST-..."
                              disabled={isSavingConfig}
                            />
                            <p className="text-xs text-muted-foreground">Access Token de teste obtido no painel do Mercado Pago (começa com TEST-).</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="mp_webhook_secret">Webhook Secret</Label>
                          <Input
                            id="mp_webhook_secret"
                            type="password"
                            value={mpWebhookSecret}
                            onChange={(e) => setMpWebhookSecret(e.target.value)}
                            placeholder="Segredo configurado no painel do Mercado Pago"
                            disabled={isSavingConfig}
                          />
                          <p className="text-xs text-muted-foreground">Segredo para verificação de assinatura dos webhooks. Configure no painel do Mercado Pago em Webhooks.</p>
                        </div>
                      </>
                    )}

                    <Button onClick={handleSaveConfig} disabled={isSavingConfig}>
                      {isSavingConfig && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Salvar Configurações
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </TabsContent>
          <TabsContent value="email" className="space-y-6">
            {isLoadingConfig ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* SMTP Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Configurações de SMTP
                    </CardTitle>
                    <CardDescription>Configure o servidor de e-mail para envio de notificações</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                      <div className="space-y-2">
                        <Label htmlFor="smtp_host">Servidor SMTP (Host)</Label>
                        <Input id="smtp_host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" disabled={isSavingSmtp} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_port">Porta</Label>
                        <Input id="smtp_port" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" disabled={isSavingSmtp} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_user">Usuário / Email</Label>
                        <Input id="smtp_user" type="email" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="noreply@exemplo.com" disabled={isSavingSmtp} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_pass">Senha</Label>
                        <Input id="smtp_pass" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••••" disabled={isSavingSmtp} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_from_name">Nome do Remetente</Label>
                        <Input id="smtp_from_name" value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="Sistema de Sorteios" disabled={isSavingSmtp} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_from_email">Email do Remetente</Label>
                        <Input id="smtp_from_email" type="email" value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="noreply@exemplo.com" disabled={isSavingSmtp} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_encryption">Criptografia</Label>
                        <Select value={smtpEncryption} onValueChange={setSmtpEncryption} disabled={isSavingSmtp}>
                          <SelectTrigger id="smtp_encryption">
                            <SelectValue placeholder="Selecione a criptografia" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ssl">SSL (porta 465)</SelectItem>
                            <SelectItem value="tls">TLS / STARTTLS (porta 587)</SelectItem>
                            <SelectItem value="none">Nenhuma (porta 25)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button className="mt-4" onClick={handleSaveSmtp} disabled={isSavingSmtp}>
                      {isSavingSmtp && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Salvar SMTP
                    </Button>
                  </CardContent>
                </Card>

                {/* Email Templates */}
                <Card>
                  <CardHeader>
                    <CardTitle>Modelos de E-mail</CardTitle>
                    <CardDescription>
                      Personalize as mensagens enviadas pelo sistema. Use as variáveis disponíveis entre chaves duplas.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8">

                    {/* Admin notification */}
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-sm">Notificação de novo cadastro (para o Administrador)</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Variáveis disponíveis: <code className="bg-muted px-1 rounded">{'{{nome_usuario}}'}</code>{' '}
                          <code className="bg-muted px-1 rounded">{'{{email_usuario}}'}</code>{' '}
                          <code className="bg-muted px-1 rounded">{'{{titulo_sistema}}'}</code>
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tpl_admin_subject">Assunto</Label>
                        <Input id="tpl_admin_subject" value={tplAdminSubject} onChange={(e) => setTplAdminSubject(e.target.value)} disabled={isSavingTemplates} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tpl_admin_body">Mensagem</Label>
                        <Textarea id="tpl_admin_body" rows={5} value={tplAdminBody} onChange={(e) => setTplAdminBody(e.target.value)} disabled={isSavingTemplates} className="font-mono text-sm" />
                      </div>
                    </div>

                    <div className="border-t pt-6 space-y-3">
                      <div>
                        <h4 className="font-semibold text-sm">Confirmação de cadastro aprovado (para o Usuário)</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Variáveis disponíveis: <code className="bg-muted px-1 rounded">{'{{nome}}'}</code>{' '}
                          <code className="bg-muted px-1 rounded">{'{{email}}'}</code>{' '}
                          <code className="bg-muted px-1 rounded">{'{{titulo_sistema}}'}</code>
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tpl_approval_subject">Assunto</Label>
                        <Input id="tpl_approval_subject" value={tplApprovalSubject} onChange={(e) => setTplApprovalSubject(e.target.value)} disabled={isSavingTemplates} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tpl_approval_body">Mensagem</Label>
                        <Textarea id="tpl_approval_body" rows={5} value={tplApprovalBody} onChange={(e) => setTplApprovalBody(e.target.value)} disabled={isSavingTemplates} className="font-mono text-sm" />
                      </div>
                    </div>

                    <div className="border-t pt-6 space-y-3">
                      <div>
                        <h4 className="font-semibold text-sm">Redefinição de senha</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Variáveis disponíveis: <code className="bg-muted px-1 rounded">{'{{nome}}'}</code>{' '}
                          <code className="bg-muted px-1 rounded">{'{{email}}'}</code>{' '}
                          <code className="bg-muted px-1 rounded">{'{{link}}'}</code>{' '}
                          <code className="bg-muted px-1 rounded">{'{{titulo_sistema}}'}</code>
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tpl_reset_subject">Assunto</Label>
                        <Input id="tpl_reset_subject" value={tplResetSubject} onChange={(e) => setTplResetSubject(e.target.value)} disabled={isSavingTemplates} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tpl_reset_body">Mensagem</Label>
                        <Textarea id="tpl_reset_body" rows={5} value={tplResetBody} onChange={(e) => setTplResetBody(e.target.value)} disabled={isSavingTemplates} className="font-mono text-sm" />
                      </div>
                    </div>

                    <Button onClick={handleSaveTemplates} disabled={isSavingTemplates}>
                      {isSavingTemplates && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Salvar Modelos
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Reject pending user confirmation modal */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Cadastro</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja rejeitar o cadastro de "{userToReject?.nome}" ({userToReject?.email})?
              O registro será removido permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectModalOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmReject} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            <DialogDescription>
              {editingUser 
                ? 'Atualize os dados do usuário. Deixe a senha em branco para manter a atual.' 
                : 'Preencha os dados para criar um novo usuário.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.form && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {errors.form}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                disabled={isSubmitting}
              />
              {errors.nome && <p className="text-destructive text-sm">{errors.nome}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isSubmitting}
              />
              {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="senha">
                Senha {editingUser && '(deixe em branco para manter)'}
              </Label>
              <Input
                id="senha"
                type="password"
                value={formData.senha}
                onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                disabled={isSubmitting}
                placeholder={editingUser ? '••••••••' : 'Mínimo 6 caracteres'}
              />
              {errors.senha && <p className="text-destructive text-sm">{errors.senha}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Tipo de Usuário</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="titulo_sistema">Título do Sistema</Label>
              <Input
                id="titulo_sistema"
                value={formData.titulo_sistema}
                onChange={(e) => setFormData({ ...formData, titulo_sistema: e.target.value })}
                disabled={isSubmitting}
                placeholder="Ex: Meus Sorteios"
              />
              {errors.titulo_sistema && <p className="text-destructive text-sm">{errors.titulo_sistema}</p>}
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingUser ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o usuário "{userToDelete?.nome}"? 
              Esta ação não pode ser desfeita e todos os dados associados serão removidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sorteio Assignment Modal */}
      <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Atribuir Sorteio: {selectedSorteio?.nome}
            </DialogTitle>
            <DialogDescription>
              Gerencie quais usuários têm acesso a este sorteio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add user */}
            <div className="space-y-2">
              <Label>Adicionar usuário</Label>
              <div className="flex gap-2">
                <Select value={assignUserId} onValueChange={setAssignUserId} disabled={isLoadingAssign}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione um usuário..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAssignUser} disabled={!assignUserId || isLoadingAssign} size="icon">
                  {isLoadingAssign ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Current users */}
            <div className="space-y-2">
              <Label>Usuários com acesso</Label>
              {isLoadingAssign ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : sorteioUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum usuário atribuído.</p>
              ) : (
                <div className="border rounded-lg divide-y">
                  {sorteioUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        {u.role === 'admin' ? (
                          <ShieldCheck className="h-4 w-4 text-primary" />
                        ) : (
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{u.nome}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        {u.id === sorteioOwnerId && (
                          <Badge variant="outline" className="text-xs ml-1">Proprietário</Badge>
                        )}
                      </div>
                      {u.id !== sorteioOwnerId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveUser(u.id)}
                          disabled={isLoadingAssign}
                        >
                          <UserMinus className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Change owner */}
            <div className="space-y-2 border-t pt-4">
              <Label>Alterar proprietário</Label>
              <div className="flex gap-2">
                <Select value={changeOwnerUserId} onValueChange={setChangeOwnerUserId} disabled={isLoadingAssign}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione o novo proprietário..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.id !== sorteioOwnerId).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleChangeOwner} disabled={!changeOwnerUserId || isLoadingAssign} size="icon" variant="outline">
                  {isLoadingAssign ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignModalOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Plan Modal */}
      <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
            <DialogDescription>
              {editingPlan ? 'Atualize os dados do plano.' : 'Preencha os dados para criar um novo plano.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitPlan} className="space-y-4">
            {planErrors.form && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {planErrors.form}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="plan_nome">Nome do Plano</Label>
              <Input
                id="plan_nome"
                value={planFormData.nome}
                onChange={(e) => setPlanFormData({ ...planFormData, nome: e.target.value })}
                disabled={isSubmittingPlan}
                placeholder="Ex: Básico, Premium..."
              />
              {planErrors.nome && <p className="text-destructive text-sm">{planErrors.nome}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan_valor">Valor (R$)</Label>
              <Input
                id="plan_valor"
                type="number"
                min="0"
                step="0.01"
                value={planFormData.valor}
                onChange={(e) => setPlanFormData({ ...planFormData, valor: e.target.value })}
                disabled={isSubmittingPlan}
                placeholder="0.00 para gratuito"
              />
              {planErrors.valor && <p className="text-destructive text-sm">{planErrors.valor}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan_descricao">Descrição (opcional)</Label>
              <Textarea
                id="plan_descricao"
                value={planFormData.descricao}
                onChange={(e) => setPlanFormData({ ...planFormData, descricao: e.target.value })}
                disabled={isSubmittingPlan}
                placeholder="Descreva os benefícios do plano..."
                rows={3}
              />
              {planErrors.descricao && <p className="text-destructive text-sm">{planErrors.descricao}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan_stripe_price_id">Stripe Price ID (opcional)</Label>
              <Input
                id="plan_stripe_price_id"
                value={planFormData.stripe_price_id}
                onChange={(e) => setPlanFormData({ ...planFormData, stripe_price_id: e.target.value })}
                disabled={isSubmittingPlan}
                placeholder="price_..."
              />
              <p className="text-xs text-muted-foreground">ID do preço configurado no Stripe. Se informado, será usado no checkout.</p>
              {planErrors.stripe_price_id && <p className="text-destructive text-sm">{planErrors.stripe_price_id}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClosePlanModal} disabled={isSubmittingPlan}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmittingPlan}>
                {isSubmittingPlan && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingPlan ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Plan Confirmation Modal */}
      <Dialog open={isDeletePlanModalOpen} onOpenChange={setIsDeletePlanModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o plano "{planToDelete?.nome}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeletePlanModalOpen(false)} disabled={isSubmittingPlan}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeletePlan} disabled={isSubmittingPlan}>
              {isSubmittingPlan && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign User Plan Modal */}
      <Dialog open={isUserPlanModalOpen} onOpenChange={setIsUserPlanModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Atribuir Plano: {selectedUserForPlan?.nome}
            </DialogTitle>
            <DialogDescription>
              Selecione um plano para o usuário ou remova o plano atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId} disabled={isSubmittingUserPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem plano atribuído" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PLAN_VALUE}>Sem plano</SelectItem>
                  {planos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} {Number(p.valor) > 0 ? `— R$ ${Number(p.valor).toFixed(2)}` : '(Gratuito)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPlanId && selectedPlanId !== NO_PLAN_VALUE && (
              <p className="text-xs text-muted-foreground">
                O plano será atribuído a partir de hoje e vencerá todo mês no mesmo dia.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUserPlanModalOpen(false)} disabled={isSubmittingUserPlan}>
              Cancelar
            </Button>
            <Button onClick={handleAssignUserPlan} disabled={isSubmittingUserPlan}>
              {isSubmittingUserPlan && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
