import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Plan } from '@/types/auth';
import { LojaCartela } from '@/types/bingo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  ArrowLeft, User, Loader2, Save, Camera, X, Lock, Mail, Type,
  CreditCard, CheckCircle, Settings, Users, Plus, Pencil, Trash2,
  HelpCircle, Dice5, BarChart3, Shuffle, Grid3X3, LayoutGrid,
  ListTodo, ShoppingCart, PieChart, Store, Eye, Image as ImageIcon,
} from 'lucide-react';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface LojaComprador {
  nome: string;
  email: string;
  cpf?: string;
  telefone?: string;
  cidade?: string;
  endereco?: string;
  total_compras: number;
  ultima_compra: string;
  comprador_id?: string;
  owner_user_id?: string;
}

const profileSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email inválido').max(255),
  titulo_sistema: z.string().min(1, 'Título do sistema é obrigatório').max(100),
});

const passwordSchema = z.object({
  senha_atual: z.string().min(6, 'Senha atual é obrigatória'),
  nova_senha: z.string().min(6, 'Nova senha deve ter pelo menos 6 caracteres'),
  confirmar_senha: z.string(),
}).refine((data) => data.nova_senha === data.confirmar_senha, {
  message: "As senhas não coincidem",
  path: ["confirmar_senha"],
});

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, updateProfile, isAuthenticated, getPublicPlanos, createStripeCheckout, refreshUser, getUserConfiguracoes, updateUserConfiguracoes, getLojaCompradores, getCartelasComprador, createLojaComprador, updateLojaComprador, deleteLojaComprador } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPasswordFields, setShowPasswordFields] = useState(false);

  // Subscription tab state
  const [planos, setPlanos] = useState<Plan[]>([]);
  const [isLoadingPlanos, setIsLoadingPlanos] = useState(false);
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const paymentSuccess = searchParams.get('payment') === 'success';
  const defaultTab = searchParams.get('tab') === 'assinatura' ? 'assinatura'
    : searchParams.get('tab') === 'pagamentos' ? 'pagamentos'
    : searchParams.get('tab') === 'aparencia' ? 'aparencia'
    : searchParams.get('tab') === 'clientes' ? 'clientes'
    : searchParams.get('tab') === 'ajuda' ? 'ajuda'
    : 'dados';

  // Payment gateway config state
  const [gatewayConfig, setGatewayConfig] = useState<Record<string, string>>({});
  const [isLoadingGateway, setIsLoadingGateway] = useState(false);
  const [isSavingGateway, setIsSavingGateway] = useState(false);

  // Store branding state
  const [brandingConfig, setBrandingConfig] = useState<Record<string, string>>({
    loja_favicon_url: '',
    loja_logo_url: '',
    loja_hero_image_url: '',
  });
  const [isLoadingBranding, setIsLoadingBranding] = useState(false);
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // Store clients state
  const [lojaCompradores, setLojaCompradores] = useState<LojaComprador[]>([]);
  const [isLoadingCompradores, setIsLoadingCompradores] = useState(false);
  const [showCompradorDialog, setShowCompradorDialog] = useState(false);
  const [editingComprador, setEditingComprador] = useState<LojaComprador | null>(null);
  const [compradorForm, setCompradorForm] = useState({ nome: '', email: '', cpf: '', telefone: '', cidade: '', endereco: '' });
  const [isSavingComprador, setIsSavingComprador] = useState(false);
  const [deletingComprador, setDeletingComprador] = useState<LojaComprador | null>(null);
  const [isDeletingComprador, setIsDeletingComprador] = useState(false);

  // Cartelas por comprador
  const [viewingCompradorEmail, setViewingCompradorEmail] = useState<string | null>(null);
  const [compradorCartelas, setCompradorCartelas] = useState<LojaCartela[]>([]);
  const [isLoadingCartelasComprador, setIsLoadingCartelasComprador] = useState(false);

  // After returning from a successful Stripe payment, refresh the user so the
  // new plano_id is reflected in the local state.
  useEffect(() => {
    if (paymentSuccess) {
      refreshUser()
        .then(() => {
          toast({ title: 'Assinatura ativada', description: 'Seu plano foi ativado com sucesso!' });
        })
        .catch(() => {
          toast({ title: 'Plano ativado', description: 'Atualize a página para ver seu plano atualizado.', variant: 'destructive' });
        })
        .finally(() => {
          navigate('/profile?tab=assinatura', { replace: true });
        });
    }
  }, [paymentSuccess, refreshUser, toast, navigate]);
  
  const [formData, setFormData] = useState({
    nome: user?.nome || '',
    email: user?.email || '',
    titulo_sistema: user?.titulo_sistema || 'Sorteios',
    avatar_url: user?.avatar_url || '',
  });
  
  const [passwordData, setPasswordData] = useState({
    senha_atual: '',
    nova_senha: '',
    confirmar_senha: '',
  });

  React.useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth');
    }
  }, [isAuthenticated, navigate]);

  const loadPlanos = async () => {
    if (planos.length > 0) return;
    setIsLoadingPlanos(true);
    const data = await getPublicPlanos();
    setPlanos(data);
    setIsLoadingPlanos(false);
  };

  const loadGatewayConfig = async () => {
    setIsLoadingGateway(true);
    const cfg = await getUserConfiguracoes();
    setGatewayConfig(cfg);
    setIsLoadingGateway(false);
  };

  const loadBrandingConfig = async () => {
    setIsLoadingBranding(true);
    const cfg = await getUserConfiguracoes();
    setBrandingConfig({
      loja_favicon_url: cfg['loja_favicon_url'] || '',
      loja_logo_url: cfg['loja_logo_url'] || '',
      loja_hero_image_url: cfg['loja_hero_image_url'] || '',
    });
    setIsLoadingBranding(false);
  };

  const handleSaveGateway = async () => {
    setIsSavingGateway(true);
    const result = await updateUserConfiguracoes(gatewayConfig);
    setIsSavingGateway(false);
    if (!result.success) {
      toast({ title: 'Erro', description: result.error || 'Erro ao salvar configurações.', variant: 'destructive' });
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
      reader.readAsDataURL(file);
    });
  };

  const handleBrandingUpload = async (
    field: 'loja_favicon_url' | 'loja_logo_url' | 'loja_hero_image_url',
    file: File | null,
  ) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Arquivo inválido', description: 'Selecione uma imagem válida.', variant: 'destructive' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Use imagens de até 2MB.', variant: 'destructive' });
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBrandingConfig((prev) => ({ ...prev, [field]: dataUrl }));
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível carregar a imagem.', variant: 'destructive' });
    }
  };

  const handleSaveBranding = async () => {
    setIsSavingBranding(true);
    const result = await updateUserConfiguracoes(brandingConfig);
    setIsSavingBranding(false);
    if (!result.success) {
      toast({ title: 'Erro', description: result.error || 'Erro ao salvar aparência da loja.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Aparência atualizada', description: 'As personalizações da loja foram salvas.' });
  };

  const loadLojaCompradores = async () => {
    setIsLoadingCompradores(true);
    const data = await getLojaCompradores();
    setLojaCompradores(data);
    setIsLoadingCompradores(false);
  };

  const openCartelasComprador = async (email: string) => {
    setViewingCompradorEmail(email);
    setCompradorCartelas([]);
    setIsLoadingCartelasComprador(true);
    const data = await getCartelasComprador(email);
    setCompradorCartelas(data as LojaCartela[]);
    setIsLoadingCartelasComprador(false);
  };

  const openAddComprador = () => {
    setEditingComprador(null);
    setCompradorForm({ nome: '', email: '', cpf: '', telefone: '', cidade: '', endereco: '' });
    setShowCompradorDialog(true);
  };

  const openEditComprador = (c: LojaComprador) => {
    setEditingComprador(c);
    setCompradorForm({ nome: c.nome || '', email: c.email || '', cpf: c.cpf || '', telefone: c.telefone || '', cidade: c.cidade || '', endereco: c.endereco || '' });
    setShowCompradorDialog(true);
  };

  const handleSaveComprador = async () => {
    if (!compradorForm.nome.trim() || !compradorForm.email.trim()) {
      toast({ title: 'Campos obrigatórios', description: 'Nome e e-mail são obrigatórios.', variant: 'destructive' });
      return;
    }
    setIsSavingComprador(true);
    const payload = {
      nome: compradorForm.nome.trim(),
      email: editingComprador ? editingComprador.email : compradorForm.email.trim(),
      cpf: compradorForm.cpf.trim() || undefined,
      telefone: compradorForm.telefone.trim() || undefined,
      cidade: compradorForm.cidade.trim() || undefined,
      endereco: compradorForm.endereco.trim() || undefined,
    };
    const result = editingComprador ? await updateLojaComprador(payload) : await createLojaComprador(payload);
    setIsSavingComprador(false);
    if (result.success) {
      setShowCompradorDialog(false);
      await loadLojaCompradores();
    } else {
      toast({ title: 'Erro', description: result.error || 'Erro ao salvar cliente.', variant: 'destructive' });
    }
  };

  const handleDeleteComprador = async () => {
    if (!deletingComprador) return;
    setIsDeletingComprador(true);
    const result = await deleteLojaComprador(deletingComprador.email);
    setIsDeletingComprador(false);
    if (result.success) {
      setDeletingComprador(null);
      await loadLojaCompradores();
    } else {
      toast({ title: 'Erro', description: result.error || 'Erro ao remover cliente.', variant: 'destructive' });
    }
  };

  const handleCheckout = async (plano: Plan) => {
    setCheckoutError(null);
    setCheckoutLoadingId(plano.id);
    const result = await createStripeCheckout(
      plano.id,
      '/profile?tab=assinatura&payment=success',
      '/profile?tab=assinatura',
    );
    if (result.url) {
      window.location.href = result.url;
    } else {
      setCheckoutError(result.error || 'Erro ao iniciar checkout. Tente novamente.');
      setCheckoutLoadingId(null);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Erro",
        description: "Por favor, selecione uma imagem válida.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Erro",
        description: "A imagem deve ter no máximo 2MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Convert image to base64 for storage
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({ ...prev, avatar_url: base64String }));
        toast({
          title: "Imagem carregada",
          description: "Clique em Salvar para confirmar as alterações.",
        });
        setIsUploading(false);
      };
      reader.onerror = () => {
        toast({
          title: "Erro ao carregar imagem",
          description: "Tente novamente.",
          variant: "destructive",
        });
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error: unknown) {
      console.error('Upload error:', error);
      toast({
        title: "Erro ao carregar imagem",
        description: (error instanceof Error ? error.message : 'Erro inesperado') || "Tente novamente.",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    setFormData(prev => ({ ...prev, avatar_url: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // Validate profile data
    try {
      profileSchema.parse(formData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = (err instanceof Error ? err.message : 'Erro inesperado');
          }
        });
        setErrors(newErrors);
        return;
      }
    }
    
    // Validate password if changing
    if (showPasswordFields && (passwordData.senha_atual || passwordData.nova_senha || passwordData.confirmar_senha)) {
      try {
        passwordSchema.parse(passwordData);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const newErrors: Record<string, string> = {};
          error.errors.forEach((err) => {
            if (err.path[0]) {
              newErrors[err.path[0] as string] = (err instanceof Error ? err.message : 'Erro inesperado');
            }
          });
          setErrors(newErrors);
          return;
        }
      }
    }
    
    setIsSubmitting(true);
    
    const updateData: Record<string, unknown> = {
      nome: formData.nome,
      email: formData.email,
      titulo_sistema: formData.titulo_sistema,
      avatar_url: formData.avatar_url || undefined,
    };
    
    if (showPasswordFields && passwordData.senha_atual && passwordData.nova_senha) {
      updateData.senha_atual = passwordData.senha_atual;
      updateData.nova_senha = passwordData.nova_senha;
    }
    
    const result = await updateProfile(updateData);
    setIsSubmitting(false);
    
    if (result.success) {
      toast({
        title: "Perfil atualizado",
        description: "Suas configurações foram salvas.",
      });
      setPasswordData({ senha_atual: '', nova_senha: '', confirmar_senha: '' });
      setShowPasswordFields(false);
    } else {
      setErrors({ form: result.error || 'Erro ao atualizar perfil' });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

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
                <User className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Meu Perfil</h1>
                <p className="text-primary-foreground/80 text-sm">Gerencie suas informações pessoais</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6 max-w-3xl">
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-6 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="dados" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Dados Pessoais
            </TabsTrigger>
            <TabsTrigger value="assinatura" className="flex items-center gap-2" onClick={loadPlanos}>
              <CreditCard className="h-4 w-4" />
              Minha Assinatura
            </TabsTrigger>
            <TabsTrigger value="pagamentos" className="flex items-center gap-2" onClick={loadGatewayConfig}>
              <Settings className="h-4 w-4" />
              Gateway de Pagamento
            </TabsTrigger>
            <TabsTrigger value="aparencia" className="flex items-center gap-2" onClick={loadBrandingConfig}>
              <ImageIcon className="h-4 w-4" />
              Aparência da Loja
            </TabsTrigger>
            <TabsTrigger value="clientes" className="flex items-center gap-2" onClick={loadLojaCompradores}>
              <Users className="h-4 w-4" />
              Clientes da Loja
            </TabsTrigger>
            <TabsTrigger value="ajuda" className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              Como Usar
            </TabsTrigger>
          </TabsList>

          {/* ========== DADOS PESSOAIS ========== */}
          <TabsContent value="dados">
        <form onSubmit={handleSubmit} className="space-y-6">
          {errors.form && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              {errors.form}
            </div>
          )}

          {/* Avatar Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Foto de Perfil
              </CardTitle>
              <CardDescription>Sua imagem de identificação no sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative">
                  <Avatar className="h-28 w-28 cursor-pointer ring-4 ring-border hover:ring-primary transition-all" onClick={handleAvatarClick}>
                    <AvatarImage src={formData.avatar_url} alt={formData.nome} />
                    <AvatarFallback className="text-3xl bg-primary text-primary-foreground">
                      {formData.nome ? getInitials(formData.nome) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  
                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  )}
                  
                  <button
                    type="button"
                    onClick={handleAvatarClick}
                    className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors shadow-lg"
                    disabled={isUploading}
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAvatarClick}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Camera className="h-4 w-4 mr-2" />
                    )}
                    Alterar foto
                  </Button>
                  
                  {formData.avatar_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleRemoveAvatar}
                      disabled={isUploading}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Remover foto
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações Pessoais
              </CardTitle>
              <CardDescription>Seus dados básicos de identificação</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    disabled={isSubmitting}
                    placeholder="Seu nome"
                  />
                  {errors.nome && <p className="text-destructive text-sm">{errors.nome}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={isSubmitting}
                      placeholder="seu@email.com"
                      className="pl-10"
                    />
                  </div>
                  {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Preferences Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="h-5 w-5" />
                Preferências do Sistema
              </CardTitle>
              <CardDescription>Personalize sua experiência</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo_sistema">Título do Sistema</Label>
                <Input
                  id="titulo_sistema"
                  value={formData.titulo_sistema}
                  onChange={(e) => setFormData({ ...formData, titulo_sistema: e.target.value })}
                  disabled={isSubmitting}
                  placeholder="Ex: Meus Sorteios"
                />
                <p className="text-sm text-muted-foreground">
                  Este título será exibido no cabeçalho do sistema
                </p>
                {errors.titulo_sistema && <p className="text-destructive text-sm">{errors.titulo_sistema}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Password Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Segurança
              </CardTitle>
              <CardDescription>Altere sua senha de acesso</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showPasswordFields ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPasswordFields(true)}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Alterar senha
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="senha_atual">Senha atual</Label>
                    <Input
                      id="senha_atual"
                      type="password"
                      value={passwordData.senha_atual}
                      onChange={(e) => setPasswordData({ ...passwordData, senha_atual: e.target.value })}
                      disabled={isSubmitting}
                      placeholder="Digite sua senha atual"
                    />
                    {errors.senha_atual && <p className="text-destructive text-sm">{errors.senha_atual}</p>}
                  </div>
                  
                  <Separator />
                  
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nova_senha">Nova senha</Label>
                      <Input
                        id="nova_senha"
                        type="password"
                        value={passwordData.nova_senha}
                        onChange={(e) => setPasswordData({ ...passwordData, nova_senha: e.target.value })}
                        disabled={isSubmitting}
                        placeholder="Mínimo 6 caracteres"
                      />
                      {errors.nova_senha && <p className="text-destructive text-sm">{errors.nova_senha}</p>}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="confirmar_senha">Confirmar nova senha</Label>
                      <Input
                        id="confirmar_senha"
                        type="password"
                        value={passwordData.confirmar_senha}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmar_senha: e.target.value })}
                        disabled={isSubmitting}
                        placeholder="Repita a nova senha"
                      />
                      {errors.confirmar_senha && <p className="text-destructive text-sm">{errors.confirmar_senha}</p>}
                    </div>
                  </div>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowPasswordFields(false);
                      setPasswordData({ senha_atual: '', nova_senha: '', confirmar_senha: '' });
                      setErrors({});
                    }}
                    className="text-muted-foreground"
                  >
                    Cancelar alteração de senha
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/')} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || isUploading}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar alterações
            </Button>
          </div>
        </form>
          </TabsContent>

          {/* ========== MINHA ASSINATURA ========== */}
          <TabsContent value="assinatura" className="space-y-6">
            {/* Current plan status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Plano Atual
                </CardTitle>
              </CardHeader>
              <CardContent>
                {user?.gratuidade_vitalicia ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-sm px-3 py-1">Gratuidade Vitalícia</Badge>
                    <span className="text-muted-foreground text-sm">Acesso completo sem custo</span>
                  </div>
                ) : user?.plano_id ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="font-medium">Plano ativo</span>
                    </div>
                    {user.plano_vencimento && (
                      <p className="text-sm text-muted-foreground">
                        Válido até: {new Date(user.plano_vencimento).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Nenhum plano ativo. Assine um plano abaixo para usar o sistema.</p>
                )}
              </CardContent>
            </Card>

            {/* Plan listing */}
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {user?.plano_id ? 'Alterar Plano' : 'Escolha um Plano'}
              </h3>

              {checkoutError && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                  {checkoutError}
                </div>
              )}

              {isLoadingPlanos ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : planos.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nenhum plano disponível no momento. Entre em contato com o administrador.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {planos.map((plano) => {
                    const isCurrentPlan = user?.plano_id === plano.id;
                    return (
                      <Card key={plano.id} className={`border-2 flex flex-col ${isCurrentPlan ? 'border-primary' : ''}`}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{plano.nome}</CardTitle>
                            {isCurrentPlan && <Badge>Atual</Badge>}
                          </div>
                          {plano.descricao && (
                            <CardDescription>{plano.descricao}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-3 flex flex-col flex-1 justify-between">
                          <div className="space-y-2">
                            <p className="text-2xl font-bold text-primary">
                              {(() => {
                                const valor = Number(plano.valor);
                                return valor > 0 ? `R$ ${valor.toFixed(2).replace('.', ',')}` : 'Gratuito';
                              })()}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span>Acesso completo ao sistema</span>
                            </div>
                          </div>
                          <Button
                            className="w-full mt-2"
                            variant={isCurrentPlan ? 'outline' : 'default'}
                            onClick={() => handleCheckout(plano)}
                            disabled={checkoutLoadingId !== null || isCurrentPlan}
                          >
                            {checkoutLoadingId === plano.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            {isCurrentPlan ? 'Plano atual' : Number(plano.valor) > 0 ? 'Assinar agora' : 'Ativar plano'}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ========== GATEWAY DE PAGAMENTO ========== */}
          <TabsContent value="pagamentos" className="space-y-6">
            {isLoadingGateway ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Gateway de Pagamento
                    </CardTitle>
                    <CardDescription>
                      Configure o gateway de pagamento da sua loja. As configurações são individuais e independentes de outros usuários.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-w-lg">
                      {/* Gateway selector */}
                      <div className="space-y-2">
                        <Label>Gateway de Pagamento</Label>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setGatewayConfig(prev => ({ ...prev, payment_gateway: 'stripe' }))}
                            className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-colors ${(gatewayConfig['payment_gateway'] || 'stripe') === 'stripe' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                          >
                            Stripe
                          </button>
                          <button
                            type="button"
                            onClick={() => setGatewayConfig(prev => ({ ...prev, payment_gateway: 'mercado_pago' }))}
                            className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-colors ${gatewayConfig['payment_gateway'] === 'mercado_pago' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                          >
                            Mercado Pago
                          </button>
                        </div>
                      </div>

                      {(gatewayConfig['payment_gateway'] || 'stripe') === 'stripe' && (
                        <>
                          {/* Sandbox mode toggle */}
                          <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                            <div>
                              <p className="font-semibold text-orange-800 text-sm">Modo Sandbox (Testes)</p>
                              <p className="text-xs text-orange-600 mt-0.5">Ativado: usa chaves de teste (pk_test_ / sk_test_). Desativado: usa chaves de produção (pk_live_ / sk_live_).</p>
                            </div>
                            <Switch
                              checked={gatewayConfig['stripe_sandbox_mode'] === 'true'}
                              onCheckedChange={(checked) => setGatewayConfig(prev => ({ ...prev, stripe_sandbox_mode: checked ? 'true' : 'false' }))}
                            />
                          </div>

                          {/* Live keys */}
                          <div className={`space-y-4 rounded-lg border p-4 ${gatewayConfig['stripe_sandbox_mode'] === 'true' ? 'border-gray-200 opacity-60' : 'border-green-200 bg-green-50/30'}`}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Chaves de Produção (Live)</p>
                            <div className="space-y-2">
                              <Label htmlFor="stripe_public_key">Chave Pública (Publishable Key)</Label>
                              <Input
                                id="stripe_public_key"
                                value={gatewayConfig['stripe_public_key'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, stripe_public_key: e.target.value }))}
                                placeholder="pk_live_..."
                              />
                              <p className="text-xs text-muted-foreground">Chave pública para uso no frontend (começa com pk_live_)</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="stripe_secret_key">Chave Secreta (Secret Key)</Label>
                              <Input
                                id="stripe_secret_key"
                                type="password"
                                value={gatewayConfig['stripe_secret_key'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, stripe_secret_key: e.target.value }))}
                                placeholder="sk_live_..."
                              />
                              <p className="text-xs text-muted-foreground">Chave secreta para uso no backend (começa com sk_live_). Mantenha em segredo.</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="stripe_webhook_secret">Webhook Secret (Produção)</Label>
                              <Input
                                id="stripe_webhook_secret"
                                type="password"
                                value={gatewayConfig['stripe_webhook_secret'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, stripe_webhook_secret: e.target.value }))}
                                placeholder="whsec_..."
                              />
                              <p className="text-xs text-muted-foreground">Segredo do webhook Stripe para verificação de assinaturas (começa com whsec_).</p>
                            </div>
                          </div>

                          {/* Sandbox keys */}
                          <div className={`space-y-4 rounded-lg border p-4 ${gatewayConfig['stripe_sandbox_mode'] === 'true' ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200 opacity-60'}`}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Chaves de Sandbox (Testes)</p>
                            <div className="space-y-2">
                              <Label htmlFor="stripe_sandbox_public_key">Chave Pública Sandbox</Label>
                              <Input
                                id="stripe_sandbox_public_key"
                                value={gatewayConfig['stripe_sandbox_public_key'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, stripe_sandbox_public_key: e.target.value }))}
                                placeholder="pk_test_..."
                              />
                              <p className="text-xs text-muted-foreground">Chave pública de teste (começa com pk_test_)</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="stripe_sandbox_secret_key">Chave Secreta Sandbox</Label>
                              <Input
                                id="stripe_sandbox_secret_key"
                                type="password"
                                value={gatewayConfig['stripe_sandbox_secret_key'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, stripe_sandbox_secret_key: e.target.value }))}
                                placeholder="sk_test_..."
                              />
                              <p className="text-xs text-muted-foreground">Chave secreta de teste (começa com sk_test_). Mantenha em segredo.</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="stripe_sandbox_webhook_secret">Webhook Secret (Sandbox)</Label>
                              <Input
                                id="stripe_sandbox_webhook_secret"
                                type="password"
                                value={gatewayConfig['stripe_sandbox_webhook_secret'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, stripe_sandbox_webhook_secret: e.target.value }))}
                                placeholder="whsec_..."
                              />
                              <p className="text-xs text-muted-foreground">Segredo do webhook de teste (começa com whsec_).</p>
                            </div>
                          </div>
                        </>
                      )}

                      {gatewayConfig['payment_gateway'] === 'mercado_pago' && (
                        <>
                          {/* MP Sandbox mode toggle */}
                          <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                            <div>
                              <p className="font-semibold text-orange-800 text-sm">Modo Sandbox (Testes)</p>
                              <p className="text-xs text-orange-600 mt-0.5">Ativado: usa o Access Token de teste. Desativado: usa o Access Token de produção.</p>
                            </div>
                            <Switch
                              checked={gatewayConfig['mp_sandbox_mode'] === 'true'}
                              onCheckedChange={(checked) => setGatewayConfig(prev => ({ ...prev, mp_sandbox_mode: checked ? 'true' : 'false' }))}
                            />
                          </div>

                          {/* MP Production token */}
                          <div className={`space-y-4 rounded-lg border p-4 ${gatewayConfig['mp_sandbox_mode'] === 'true' ? 'border-gray-200 opacity-60' : 'border-green-200 bg-green-50/30'}`}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Produção</p>
                            <div className="space-y-2">
                              <Label htmlFor="mp_public_key">Chave Pública (Public Key)</Label>
                              <Input
                                id="mp_public_key"
                                type="password"
                                value={gatewayConfig['mp_public_key'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, mp_public_key: e.target.value }))}
                                placeholder="APP_USR-..."
                              />
                              <p className="text-xs text-muted-foreground">Chave pública de produção obtida no painel do Mercado Pago.</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mp_access_token">Access Token (Produção)</Label>
                              <Input
                                id="mp_access_token"
                                type="password"
                                value={gatewayConfig['mp_access_token'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, mp_access_token: e.target.value }))}
                                placeholder="APP_USR-..."
                              />
                              <p className="text-xs text-muted-foreground">Access Token de produção obtido no painel do Mercado Pago (começa com APP_USR-).</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mp_client_id">Client ID (Produção)</Label>
                              <Input
                                id="mp_client_id"
                                type="password"
                                value={gatewayConfig['mp_client_id'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, mp_client_id: e.target.value }))}
                                placeholder="Client ID da aplicação"
                              />
                              <p className="text-xs text-muted-foreground">Client ID da aplicação no painel do Mercado Pago.</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mp_client_secret">Client Secret (Produção)</Label>
                              <Input
                                id="mp_client_secret"
                                type="password"
                                value={gatewayConfig['mp_client_secret'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, mp_client_secret: e.target.value }))}
                                placeholder="Client Secret da aplicação"
                              />
                              <p className="text-xs text-muted-foreground">Client Secret da aplicação no painel do Mercado Pago.</p>
                            </div>
                          </div>

                          {/* MP Sandbox token */}
                          <div className={`space-y-4 rounded-lg border p-4 ${gatewayConfig['mp_sandbox_mode'] === 'true' ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200 opacity-60'}`}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Sandbox (Testes)</p>
                            <div className="space-y-2">
                              <Label htmlFor="mp_sandbox_public_key">Chave Pública (Sandbox)</Label>
                              <Input
                                id="mp_sandbox_public_key"
                                type="password"
                                value={gatewayConfig['mp_sandbox_public_key'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, mp_sandbox_public_key: e.target.value }))}
                                placeholder="TEST-..."
                              />
                              <p className="text-xs text-muted-foreground">Chave pública de teste obtida no painel do Mercado Pago.</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="mp_sandbox_access_token">Access Token (Sandbox)</Label>
                              <Input
                                id="mp_sandbox_access_token"
                                type="password"
                                value={gatewayConfig['mp_sandbox_access_token'] || ''}
                                onChange={(e) => setGatewayConfig(prev => ({ ...prev, mp_sandbox_access_token: e.target.value }))}
                                placeholder="TEST-..."
                              />
                              <p className="text-xs text-muted-foreground">Access Token de teste obtido no painel do Mercado Pago (começa com TEST-).</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="mp_webhook_secret">Webhook Secret</Label>
                            <Input
                              id="mp_webhook_secret"
                              type="password"
                              value={gatewayConfig['mp_webhook_secret'] || ''}
                              onChange={(e) => setGatewayConfig(prev => ({ ...prev, mp_webhook_secret: e.target.value }))}
                              placeholder="Segredo configurado no painel do Mercado Pago"
                            />
                            <p className="text-xs text-muted-foreground">Segredo para verificação de assinatura dos webhooks. Configure no painel do Mercado Pago em Webhooks.</p>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button onClick={handleSaveGateway} disabled={isSavingGateway}>
                    {isSavingGateway ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar Configurações
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ========== APARÊNCIA DA LOJA ========== */}
          <TabsContent value="aparencia" className="space-y-6">
            {isLoadingBranding ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      Aparência da Loja Pública
                    </CardTitle>
                    <CardDescription>
                      Personalize o favicon, a logo e a imagem de destaque do topo da sua loja. Cada usuário mantém sua própria identidade visual.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="loja_favicon_url">Favicon da Plataforma</Label>
                      <Input
                        id="loja_favicon_url"
                        value={brandingConfig.loja_favicon_url || ''}
                        onChange={(e) => setBrandingConfig((prev) => ({ ...prev, loja_favicon_url: e.target.value }))}
                        placeholder="Cole uma URL ou envie uma imagem"
                      />
                      <div className="flex gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleBrandingUpload('loja_favicon_url', e.target.files?.[0] || null)}
                        />
                        <Button type="button" variant="outline" onClick={() => setBrandingConfig((prev) => ({ ...prev, loja_favicon_url: '' }))}>
                          Limpar
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="loja_logo_url">Logo da Loja</Label>
                      <Input
                        id="loja_logo_url"
                        value={brandingConfig.loja_logo_url || ''}
                        onChange={(e) => setBrandingConfig((prev) => ({ ...prev, loja_logo_url: e.target.value }))}
                        placeholder="Cole uma URL ou envie uma imagem"
                      />
                      <div className="flex gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleBrandingUpload('loja_logo_url', e.target.files?.[0] || null)}
                        />
                        <Button type="button" variant="outline" onClick={() => setBrandingConfig((prev) => ({ ...prev, loja_logo_url: '' }))}>
                          Limpar
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="loja_hero_image_url">Imagem de Destaque no Topo</Label>
                      <Input
                        id="loja_hero_image_url"
                        value={brandingConfig.loja_hero_image_url || ''}
                        onChange={(e) => setBrandingConfig((prev) => ({ ...prev, loja_hero_image_url: e.target.value }))}
                        placeholder="Cole uma URL ou envie uma imagem"
                      />
                      <div className="flex gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleBrandingUpload('loja_hero_image_url', e.target.files?.[0] || null)}
                        />
                        <Button type="button" variant="outline" onClick={() => setBrandingConfig((prev) => ({ ...prev, loja_hero_image_url: '' }))}>
                          Limpar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button onClick={handleSaveBranding} disabled={isSavingBranding}>
                    {isSavingBranding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar Aparência
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ========== CLIENTES DA LOJA ========== */}
          <TabsContent value="clientes" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Clientes da Minha Loja
                    </CardTitle>
                    <CardDescription>
                      Gerencie os clientes da sua loja. Você pode adicionar, editar ou remover cadastros.
                    </CardDescription>
                  </div>
                  <Button onClick={openAddComprador} size="sm" className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Novo Cliente
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingCompradores ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : lojaCompradores.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">
                    Nenhum cliente encontrado. Os clientes aparecerão aqui após realizarem compras na sua loja ou você pode adicioná-los manualmente.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Nome</th>
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">E-mail</th>
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">CPF</th>
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Telefone</th>
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Cidade</th>
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Compras</th>
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Última Compra</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lojaCompradores.map((c, idx) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 pr-4">{c.nome || '—'}</td>
                            <td className="py-2 pr-4">{c.email || '—'}</td>
                            <td className="py-2 pr-4">{c.cpf || '—'}</td>
                            <td className="py-2 pr-4">{c.telefone || '—'}</td>
                            <td className="py-2 pr-4">{c.cidade || '—'}</td>
                            <td className="py-2 pr-4">
                              <Badge variant="secondary">{c.total_compras}</Badge>
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground text-xs">
                              {c.ultima_compra ? new Date(c.ultima_compra).toLocaleDateString('pt-BR') : '—'}
                            </td>
                            <td className="py-2">
                              <div className="flex items-center gap-1">
                                {Number(c.total_compras) > 0 && (
                                  <Button variant="ghost" size="sm" onClick={() => openCartelasComprador(c.email)} className="h-7 w-7 p-0 text-primary" title="Ver cartelas adquiridas">
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => openEditComprador(c)} className="h-7 w-7 p-0">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeletingComprador(c)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== COMO USAR ========== */}
          <TabsContent value="ajuda" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  Como Usar o Sistema
                </CardTitle>
                <CardDescription>
                  Guia completo com todos os passos para utilizar as funções e recursos da plataforma.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full space-y-2" aria-label="Guia de uso do sistema">

                  {/* Sorteios */}
                  <AccordionItem value="sorteios" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <Dice5 className="h-4 w-4 text-primary" />
                        1. Sorteios — Gerenciar Eventos
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>O módulo <strong>Sorteios</strong> é o ponto de partida do sistema. Aqui você cria e gerencia todos os seus eventos de bingo.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Acesse a aba <strong>Sorteios</strong> no menu principal.</li>
                        <li>Clique em <strong>Novo Sorteio</strong> para criar um evento.</li>
                        <li>Preencha o nome, data e demais informações do sorteio.</li>
                        <li>Após criar, clique no sorteio para torná-lo <strong>ativo</strong> — as outras abas ficarão disponíveis.</li>
                        <li>Você pode editar ou excluir sorteios existentes pelos ícones de ação na lista.</li>
                        <li>Cada sorteio possui um <strong>link público</strong> para compartilhar com os participantes.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Dashboard */}
                  <AccordionItem value="dashboard" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        2. Dashboard — Visão Geral
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>O <strong>Dashboard</strong> exibe um resumo financeiro e operacional do sorteio ativo.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Selecione um sorteio ativo para habilitar o Dashboard.</li>
                        <li>Visualize o total de cartelas vendidas, receita gerada e cartelas disponíveis.</li>
                        <li>Acompanhe o desempenho de cada vendedor e o andamento das vendas em tempo real.</li>
                        <li>Use as métricas para tomar decisões sobre o evento.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Sortear */}
                  <AccordionItem value="sortear" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <Shuffle className="h-4 w-4 text-primary" />
                        3. Sortear — Realizar o Sorteio ao Vivo
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>A aba <strong>Sortear</strong> é usada durante a realização do bingo ao vivo.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Com um sorteio ativo, acesse a aba <strong>Sortear</strong>.</li>
                        <li>Clique em <strong>Sortear Número</strong> para gerar um número aleatório.</li>
                        <li>Os números sorteados ficam registrados na tela e não se repetem.</li>
                        <li>O sistema verifica automaticamente se alguma cartela completou o bingo.</li>
                        <li>Você pode reiniciar o sorteio a qualquer momento usando o botão de reset.</li>
                        <li>Os participantes podem acompanhar os números sorteados em tempo real pela <strong>Loja Pública</strong>.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Vendedores */}
                  <AccordionItem value="vendedores" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <Users className="h-4 w-4 text-primary" />
                        4. Vendedores — Equipe de Vendas
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>O módulo <strong>Vendedores</strong> permite gerenciar a equipe responsável por vender as cartelas.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Acesse a aba <strong>Vendedores</strong> com um sorteio ativo.</li>
                        <li>Clique em <strong>Novo Vendedor</strong> e preencha nome e informações de contato.</li>
                        <li>Cada vendedor recebe um link ou código exclusivo para suas vendas.</li>
                        <li>Acompanhe o desempenho individual de cada vendedor no Dashboard.</li>
                        <li>Edite ou desative vendedores conforme necessário.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Cartelas */}
                  <AccordionItem value="cartelas" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <Grid3X3 className="h-4 w-4 text-primary" />
                        5. Cartelas — Gerenciar Cartelas
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>O módulo <strong>Cartelas</strong> centraliza todas as cartelas do sorteio ativo.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Acesse a aba <strong>Cartelas</strong> com um sorteio ativo.</li>
                        <li>Visualize todas as cartelas geradas, com status (disponível, vendida, premiada).</li>
                        <li>Filtre por status para encontrar cartelas específicas.</li>
                        <li>Imprima cartelas individuais ou em lote em formato PDF.</li>
                        <li>Veja os dados do comprador de cada cartela vendida.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Construtor */}
                  <AccordionItem value="construtor" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <LayoutGrid className="h-4 w-4 text-primary" />
                        6. Construtor de Cartelas — Criação Personalizada
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>O <strong>Construtor de Cartelas</strong> permite criar cartelas de bingo personalizadas para o seu evento.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Acesse a aba <strong>Construtor</strong> com um sorteio ativo.</li>
                        <li>Defina a quantidade de cartelas a serem geradas.</li>
                        <li>Configure o intervalo de números, tamanho da grade e outras opções.</li>
                        <li>Clique em <strong>Gerar Cartelas</strong> para criar o lote.</li>
                        <li>As cartelas geradas ficam disponíveis na aba <strong>Cartelas</strong> e na loja pública.</li>
                        <li>Exporte as cartelas em PDF para impressão.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Atribuições */}
                  <AccordionItem value="atribuicoes" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <ListTodo className="h-4 w-4 text-primary" />
                        7. Atribuições — Vincular Cartelas a Vendedores
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>O módulo <strong>Atribuições</strong> permite distribuir cartelas entre os vendedores da equipe.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Acesse a aba <strong>Atribuições</strong> com um sorteio ativo.</li>
                        <li>Selecione um vendedor e a quantidade de cartelas a atribuir.</li>
                        <li>As cartelas atribuídas ficam vinculadas ao vendedor selecionado.</li>
                        <li>O vendedor pode então vendê-las através do seu link exclusivo.</li>
                        <li>Acompanhe quais cartelas foram atribuídas e quais ainda estão disponíveis.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Vendas */}
                  <AccordionItem value="vendas" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <ShoppingCart className="h-4 w-4 text-primary" />
                        8. Vendas — Registro de Vendas
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>O módulo <strong>Vendas</strong> registra e exibe todas as transações do sorteio ativo.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Acesse a aba <strong>Vendas</strong> com um sorteio ativo.</li>
                        <li>Visualize todas as vendas realizadas com dados do comprador e cartelas adquiridas.</li>
                        <li>Filtre por vendedor, data ou status de pagamento.</li>
                        <li>Confirme pagamentos pendentes manualmente quando necessário.</li>
                        <li>Exporte o relatório de vendas em Excel ou PDF.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Relatórios */}
                  <AccordionItem value="relatorios" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <PieChart className="h-4 w-4 text-primary" />
                        9. Relatórios — Análise de Resultados
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>O módulo <strong>Relatórios</strong> oferece análises detalhadas sobre o desempenho do sorteio.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Acesse a aba <strong>Relatórios</strong> com um sorteio ativo.</li>
                        <li>Visualize gráficos de vendas por período, vendedor e status.</li>
                        <li>Acompanhe o funil de conversão: cartelas geradas → atribuídas → vendidas.</li>
                        <li>Exporte os dados em formato Excel para análise externa.</li>
                        <li>Use os relatórios para planejar os próximos eventos com base em dados reais.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Loja Pública */}
                  <AccordionItem value="loja" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <Store className="h-4 w-4 text-primary" />
                        10. Loja Pública — Venda Online de Cartelas
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>A <strong>Loja Pública</strong> é a página onde os participantes podem comprar cartelas diretamente pela internet.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>O link da loja é gerado automaticamente ao criar um sorteio (ex.: <code className="bg-muted px-1 rounded">/loja/seu-usuario</code>).</li>
                        <li>Compartilhe o link com os participantes por WhatsApp, redes sociais ou e-mail.</li>
                        <li>O comprador escolhe a quantidade de cartelas, informa seus dados e realiza o pagamento.</li>
                        <li>O pagamento é processado pelo <strong>Gateway de Pagamento</strong> configurado no seu perfil.</li>
                        <li>Após a confirmação, as cartelas são enviadas automaticamente ao comprador.</li>
                        <li>Durante o sorteio ao vivo, os participantes podem acompanhar os números sorteados na mesma página da loja.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Perfil */}
                  <AccordionItem value="perfil" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <User className="h-4 w-4 text-primary" />
                        11. Perfil — Configurações da Conta
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>A página de <strong>Perfil</strong> reúne todas as configurações da sua conta e da plataforma.</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Dados Pessoais:</strong> atualize seu nome, e-mail, foto de perfil e o título exibido na loja.</li>
                        <li><strong>Senha:</strong> altere sua senha de acesso a qualquer momento.</li>
                        <li><strong>Minha Assinatura:</strong> visualize seu plano atual, recursos disponíveis e faça upgrade.</li>
                        <li><strong>Gateway de Pagamento:</strong> configure as credenciais do seu processador de pagamento (ex.: Mercado Pago, Stripe) para receber pagamentos na loja.</li>
                        <li><strong>Clientes da Loja:</strong> gerencie o cadastro dos compradores da sua loja, adicione, edite ou remova clientes.</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Assinatura */}
                  <AccordionItem value="assinatura-ajuda" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 font-semibold">
                        <CreditCard className="h-4 w-4 text-primary" />
                        12. Planos e Assinatura
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
                      <p>O sistema oferece diferentes <strong>planos de assinatura</strong> com limites e recursos variados.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Acesse <strong>Perfil → Minha Assinatura</strong> para ver os planos disponíveis.</li>
                        <li>Cada plano define o número máximo de sorteios, cartelas e vendedores permitidos.</li>
                        <li>Clique em <strong>Assinar</strong> no plano desejado e siga as instruções de pagamento.</li>
                        <li>Após a confirmação, o plano é ativado automaticamente na sua conta.</li>
                        <li>Você pode fazer upgrade a qualquer momento para um plano superior.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Add/Edit Customer Dialog */}
      <Dialog open={showCompradorDialog} onOpenChange={setShowCompradorDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingComprador ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            <DialogDescription>
              {editingComprador ? 'Atualize os dados do cliente.' : 'Preencha os dados para cadastrar um novo cliente.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="c_nome">Nome *</Label>
              <Input id="c_nome" value={compradorForm.nome} onChange={(e) => setCompradorForm(prev => ({ ...prev, nome: e.target.value }))} placeholder="Nome completo" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c_email">E-mail *</Label>
              <Input id="c_email" type="email" value={compradorForm.email} onChange={(e) => setCompradorForm(prev => ({ ...prev, email: e.target.value }))} placeholder="email@exemplo.com" disabled={!!editingComprador} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c_cpf">CPF</Label>
              <Input id="c_cpf" value={compradorForm.cpf} onChange={(e) => setCompradorForm(prev => ({ ...prev, cpf: e.target.value }))} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c_telefone">Telefone</Label>
              <Input id="c_telefone" value={compradorForm.telefone} onChange={(e) => setCompradorForm(prev => ({ ...prev, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c_cidade">Cidade</Label>
              <Input id="c_cidade" value={compradorForm.cidade} onChange={(e) => setCompradorForm(prev => ({ ...prev, cidade: e.target.value }))} placeholder="Cidade" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c_endereco">Endereço</Label>
              <Input id="c_endereco" value={compradorForm.endereco} onChange={(e) => setCompradorForm(prev => ({ ...prev, endereco: e.target.value }))} placeholder="Rua, número, bairro" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompradorDialog(false)} disabled={isSavingComprador}>Cancelar</Button>
            <Button onClick={handleSaveComprador} disabled={isSavingComprador}>
              {isSavingComprador ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {editingComprador ? 'Salvar Alterações' : 'Cadastrar Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingComprador} onOpenChange={(open) => { if (!open) setDeletingComprador(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover Cliente</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{deletingComprador?.nome}</strong> ({deletingComprador?.email}) da sua lista de clientes? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingComprador(null)} disabled={isDeletingComprador}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteComprador} disabled={isDeletingComprador}>
              {isDeletingComprador ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cartelas do Comprador Dialog */}
      <Dialog open={!!viewingCompradorEmail} onOpenChange={(open) => { if (!open) setViewingCompradorEmail(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Cartelas de {viewingCompradorEmail}
            </DialogTitle>
            <DialogDescription>
              Todas as cartelas adquiridas por este cliente na sua loja.
            </DialogDescription>
          </DialogHeader>
          {isLoadingCartelasComprador ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : compradorCartelas.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              Nenhuma cartela encontrada para este cliente.
            </p>
          ) : (
            <div className="space-y-4">
              {(() => {
                const grouped = compradorCartelas.reduce<Record<string, LojaCartela[]>>((acc, c) => {
                  const key = c.sorteio_nome || 'Sorteio';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(c);
                  return acc;
                }, {});
                return Object.entries(grouped).map(([sorteioNome, cartelas]) => (
                  <div key={sorteioNome}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-sm text-foreground">{sorteioNome}</h3>
                      {cartelas[0]?.data_sorteio && (
                        <span className="text-xs text-muted-foreground">
                          — {new Date(cartelas[0].data_sorteio).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      <Badge variant="secondary" className="ml-auto">{cartelas.length} cartela{cartelas.length !== 1 ? 's' : ''}</Badge>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {cartelas.map((c) => (
                        <div key={c.id} className="flex flex-col items-center justify-center rounded-lg border bg-primary/5 border-primary/20 px-3 py-2">
                          <span className="text-lg font-bold text-primary">{String(c.numero_cartela).padStart(3, '0')}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.updated_at ? new Date(c.updated_at).toLocaleDateString('pt-BR') : '—'}
                          </span>
                          {c.preco > 0 && (
                            <span className="text-xs font-medium text-green-600 mt-0.5">
                              R$ {Number(c.preco).toFixed(2)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingCompradorEmail(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
