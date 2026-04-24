import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Plan } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Ticket, Loader2, LogOut, CheckCircle } from 'lucide-react';

const Planos: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getPublicPlanos, logout, user, createStripeCheckout, confirmStripeCheckout } = useAuth();
  const [planos, setPlanos] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const paymentSuccess = searchParams.get('payment') === 'success';
  const sessionId = searchParams.get('session_id');

  // After a successful Stripe payment, confirm the checkout session directly via
  // the Stripe API on the backend so the plan is assigned without depending on
  // the webhook timing. Always stop the spinner when done.
  useEffect(() => {
    if (!paymentSuccess) return;
    setIsLoading(true);
    const confirm = async () => {
      if (sessionId) {
        const result = await confirmStripeCheckout(sessionId);
        if (!result.success) {
          setCheckoutError(result.error || 'Não foi possível confirmar o pagamento. Contate o suporte.');
        }
      } else {
        setCheckoutError('Sessão de pagamento não encontrada. Contate o suporte.');
      }
      setIsLoading(false);
    };
    confirm().catch((err) => {
      console.error('Error confirming checkout:', err);
      setIsLoading(false);
    });
  }, [paymentSuccess, sessionId, confirmStripeCheckout]);

  useEffect(() => {
    // If user already has access, redirect to home
    if (user?.role === 'admin' || user?.gratuidade_vitalicia || user?.plano_id) {
      navigate('/', { replace: true });
      return;
    }
    if (paymentSuccess) {
      // Still waiting for confirmStripeCheckout to finish — keep showing spinner
      return;
    }
    const load = async () => {
      const data = await getPublicPlanos();
      setPlanos(data);
      setIsLoading(false);
    };
    load();
  }, [user, navigate, getPublicPlanos, paymentSuccess]);

  const handleCheckout = async (plano: Plan) => {
    setCheckoutError(null);
    setCheckoutLoadingId(plano.id);
    const result = await createStripeCheckout(plano.id, '/planos?payment=success', '/planos');
    if (result.url) {
      window.location.href = result.url;
    } else {
      setCheckoutError(result.error || 'Erro ao iniciar checkout. Tente novamente.');
      setCheckoutLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="gradient-primary p-4 rounded-2xl">
              <Ticket className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Assinatura de Plano Necessária</h1>
          <p className="text-muted-foreground">
            Olá, <strong>{user?.nome}</strong>! Para utilizar o sistema, você precisa ter um plano ativo.<br />
            Selecione um dos planos abaixo para continuar.
          </p>
        </div>

        {checkoutError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm text-center">
            {checkoutError}
          </div>
        )}

        {isLoading ? (
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
            {planos.map((plano) => (
              <Card key={plano.id} className="border-2 flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{plano.nome}</CardTitle>
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
                    onClick={() => handleCheckout(plano)}
                    disabled={checkoutLoadingId !== null}
                  >
                    {checkoutLoadingId === plano.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {Number(plano.valor) > 0 ? 'Assinar agora' : 'Ativar plano'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="text-center">
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Planos;
