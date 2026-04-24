import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Ticket, Loader2, ShieldCheck, LogIn, UserPlus, CheckCircle2, Shuffle } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres').max(100),
});

const setupSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email inválido').max(255),
  senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres').max(100),
  confirmarSenha: z.string(),
  titulo_sistema: z.string().min(1, 'Nome do sistema é obrigatório').max(100),
}).refine((data) => data.senha === data.confirmarSenha, {
  message: "As senhas não coincidem",
  path: ["confirmarSenha"],
});

const registerSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email inválido').max(255),
  senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres').max(100),
  confirmarSenha: z.string(),
}).refine((data) => data.senha === data.confirmarSenha, {
  message: "As senhas não coincidem",
  path: ["confirmarSenha"],
});

const Auth: React.FC = () => {
  const navigate = useNavigate();
  const { login, registerUser, isAuthenticated, isLoading, checkFirstAccess, setupAdmin } = useAuth();
  
  const [isFirstAccess, setIsFirstAccess] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});
  const [registerSuccess, setRegisterSuccess] = useState(false);
  
  // Login form
  const [loginData, setLoginData] = useState({ email: '', senha: '' });
  
  // Setup admin form
  const [setupData, setSetupData] = useState({ nome: '', email: '', senha: '', confirmarSenha: '', titulo_sistema: 'Sorteios' });

  // Register form
  const [registerData, setRegisterData] = useState({ nome: '', email: '', senha: '', confirmarSenha: '' });

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const checkFirst = async () => {
      const isFirst = await checkFirstAccess();
      setIsFirstAccess(isFirst);
    };
    checkFirst();
  }, [checkFirstAccess]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    try {
      loginSchema.parse(loginData);
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
    const result = await login(loginData);
    setIsSubmitting(false);
    
    if (!result.success) {
      setErrors({ form: result.error || 'Erro ao fazer login' });
    }
  };

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    try {
      setupSchema.parse(setupData);
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
    const result = await setupAdmin(setupData.email, setupData.senha, setupData.nome, setupData.titulo_sistema);
    setIsSubmitting(false);
    
    if (!result.success) {
      setErrors({ form: result.error || 'Erro ao criar administrador' });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterErrors({});
    
    try {
      registerSchema.parse(registerData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setRegisterErrors(newErrors);
        return;
      }
    }
    
    setIsSubmitting(true);
    const result = await registerUser({ nome: registerData.nome, email: registerData.email, senha: registerData.senha });
    setIsSubmitting(false);
    
    if (result.success) {
      setRegisterSuccess(true);
    } else {
      setRegisterErrors({ form: result.error || 'Erro ao realizar cadastro' });
    }
  };

  if (isLoading || isFirstAccess === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="gradient-primary p-4 rounded-2xl">
              <Ticket className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
          <div>
             <CardTitle className="text-2xl font-bold">
               {isFirstAccess ? 'Configuração Inicial' : 'Sorteios'}
            </CardTitle>
            <CardDescription className="mt-2">
              {isFirstAccess 
                ? 'Configure o administrador do sistema' 
                : 'Entre com suas credenciais para continuar'
              }
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent>
          {isFirstAccess ? (
            <>
              {errors.form && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                  {errors.form}
                </div>
              )}
              <form onSubmit={handleSetupAdmin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="titulo_sistema">Nome do Sistema</Label>
                  <Input
                    id="titulo_sistema"
                    type="text"
                    placeholder="Ex: Meus Sorteios"
                    value={setupData.titulo_sistema}
                    onChange={(e) => setSetupData({ ...setupData, titulo_sistema: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {errors.titulo_sistema && <p className="text-destructive text-sm">{errors.titulo_sistema}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="nome">Seu Nome</Label>
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Seu nome completo"
                    value={setupData.nome}
                    onChange={(e) => setSetupData({ ...setupData, nome: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {errors.nome && <p className="text-destructive text-sm">{errors.nome}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@exemplo.com"
                    value={setupData.email}
                    onChange={(e) => setSetupData({ ...setupData, email: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={setupData.senha}
                    onChange={(e) => setSetupData({ ...setupData, senha: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {errors.senha && <p className="text-destructive text-sm">{errors.senha}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmarSenha">Confirmar Senha</Label>
                  <Input
                    id="confirmarSenha"
                    type="password"
                    placeholder="Repita a senha"
                    value={setupData.confirmarSenha}
                    onChange={(e) => setSetupData({ ...setupData, confirmarSenha: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {errors.confirmarSenha && <p className="text-destructive text-sm">{errors.confirmarSenha}</p>}
                </div>
                
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-2" />
                  )}
                  Criar Administrador
                </Button>
              </form>
            </>
          ) : (
            <Tabs defaultValue="login">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="login" className="flex-1">
                  <LogIn className="h-4 w-4 mr-2" />
                  Entrar
                </TabsTrigger>
                <TabsTrigger value="cadastro" className="flex-1">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Cadastrar
                </TabsTrigger>
              </TabsList>

              {/* ── LOGIN TAB ── */}
              <TabsContent value="login">
                {errors.form && (
                  <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                    {errors.form}
                  </div>
                )}
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      disabled={isSubmitting}
                    />
                    {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="login-senha">Senha</Label>
                    <Input
                      id="login-senha"
                      type="password"
                      placeholder="Sua senha"
                      value={loginData.senha}
                      onChange={(e) => setLoginData({ ...loginData, senha: e.target.value })}
                      disabled={isSubmitting}
                    />
                    {errors.senha && <p className="text-destructive text-sm">{errors.senha}</p>}
                  </div>
                  
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <LogIn className="h-4 w-4 mr-2" />
                    )}
                    Entrar
                  </Button>

                  <Button asChild variant="outline" className="w-full">
                    <Link to="/sorteador">
                      <Shuffle className="mr-2 h-4 w-4" />
                      Sorteio Rápido
                    </Link>
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">Acesso público, sem precisar entrar na conta.</p>
                </form>
              </TabsContent>

              {/* ── REGISTER TAB ── */}
              <TabsContent value="cadastro">
                {registerSuccess ? (
                  <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                    <div>
                      <p className="font-semibold text-lg">Cadastro realizado com sucesso!</p>
                      <p className="text-muted-foreground text-sm mt-1">
                        Seu cadastro está aguardando aprovação do administrador.<br />
                        Você receberá um e-mail quando for aprovado.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {registerErrors.form && (
                      <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                        {registerErrors.form}
                      </div>
                    )}
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reg-nome">Nome Completo</Label>
                        <Input
                          id="reg-nome"
                          type="text"
                          placeholder="Seu nome completo"
                          value={registerData.nome}
                          onChange={(e) => setRegisterData({ ...registerData, nome: e.target.value })}
                          disabled={isSubmitting}
                        />
                        {registerErrors.nome && <p className="text-destructive text-sm">{registerErrors.nome}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reg-email">Email</Label>
                        <Input
                          id="reg-email"
                          type="email"
                          placeholder="seu@email.com"
                          value={registerData.email}
                          onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                          disabled={isSubmitting}
                        />
                        {registerErrors.email && <p className="text-destructive text-sm">{registerErrors.email}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reg-senha">Senha</Label>
                        <Input
                          id="reg-senha"
                          type="password"
                          placeholder="Mínimo 6 caracteres"
                          value={registerData.senha}
                          onChange={(e) => setRegisterData({ ...registerData, senha: e.target.value })}
                          disabled={isSubmitting}
                        />
                        {registerErrors.senha && <p className="text-destructive text-sm">{registerErrors.senha}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reg-confirmarSenha">Confirmar Senha</Label>
                        <Input
                          id="reg-confirmarSenha"
                          type="password"
                          placeholder="Repita a senha"
                          value={registerData.confirmarSenha}
                          onChange={(e) => setRegisterData({ ...registerData, confirmarSenha: e.target.value })}
                          disabled={isSubmitting}
                        />
                        {registerErrors.confirmarSenha && <p className="text-destructive text-sm">{registerErrors.confirmarSenha}</p>}
                      </div>

                      <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <UserPlus className="h-4 w-4 mr-2" />
                        )}
                        Criar Conta
                      </Button>
                    </form>
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default Auth;
