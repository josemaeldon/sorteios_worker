import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle2, Ticket, BarChart3, ShieldCheck, Smartphone, Clock3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Plan } from '@/types/auth';

const Landing: React.FC = () => {
  const { getPublicPlanos, isAuthenticated } = useAuth();
  const [planos, setPlanos] = useState<Plan[]>([]);

  useEffect(() => {
    getPublicPlanos().then(setPlanos).catch(() => setPlanos([]));
  }, [getPublicPlanos]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      <header className="container mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xl"><Ticket className="w-6 h-6 text-primary" /> Sorteios Pro</div>
        <div className="flex gap-2">
          {isAuthenticated ? (
            <Button asChild><Link to="/">Sorteios</Link></Button>
          ) : (
            <>
              <Button asChild variant="outline"><Link to="/auth">Fazer login</Link></Button>
              <Button asChild><Link to="/auth?tab=register">Criar conta</Link></Button>
            </>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 pb-16 space-y-14">
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-5">
            <h1 className="text-4xl md:text-5xl font-black leading-tight">Venda mais cartelas e gerencie sorteios com confiança.</h1>
            <p className="text-muted-foreground text-lg">Automatize vendas, validações, transmissão em tempo real e relatórios. Tudo em um único sistema profissional para sorteios e rifas.</p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild><Link to="/auth?tab=register">Começar agora</Link></Button>
              <Button size="lg" variant="outline" asChild><Link to="/auth">Ver demonstração</Link></Button>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-background border">✅ Setup rápido</div>
              <div className="p-3 rounded-lg bg-background border">✅ Transmissão ao vivo</div>
              <div className="p-3 rounded-lg bg-background border">✅ Relatórios completos</div>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-lg">
            <img src="/placeholder.svg" alt="Painel da plataforma de sorteios" className="w-full rounded-xl border" />
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          {[
            { icon: BarChart3, title: 'Gestão total', text: 'Controle sorteios, cartelas, vendedores e pagamentos no mesmo painel.' },
            { icon: ShieldCheck, title: 'Segurança e transparência', text: 'Histórico completo, validações e rastreabilidade de cada número sorteado.' },
            { icon: Smartphone, title: 'Funciona em qualquer tela', text: 'Administre do desktop ou celular com layout responsivo e rápido.' },
            { icon: Clock3, title: 'Economia de tempo', text: 'Processos automatizados para você focar em vender mais e crescer.' },
            { icon: Ticket, title: 'Rifas e bingo', text: 'Suporte aos dois formatos com regras, faixas e rodadas configuráveis.' },
            { icon: CheckCircle2, title: 'Escala profissional', text: 'Ideal para quem quer sair do controle manual e profissionalizar operação.' },
          ].map((item) => (
            <Card key={item.title} className="p-2 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/25 hover:border-primary/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl"><item.icon className="w-6 h-6 text-primary" />{item.title}</CardTitle>
              </CardHeader>
              <CardContent><p className="text-base font-medium text-foreground/90">{item.text}</p></CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-3xl font-bold text-center">Planos de assinatura</h2>
          <p className="text-center text-muted-foreground">Os planos abaixo são os mesmos configurados pelo administrador.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {planos.map((plano) => {
              const isAnual = /anual|ano/i.test(`${plano.nome} ${plano.descricao || ''}`);
              return (
              <Card key={plano.id} className={`border-2 transition-all duration-300 hover:scale-[1.04] hover:shadow-2xl ${isAnual ? 'ring-2 ring-primary shadow-xl scale-[1.02]' : ''}`}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">{plano.nome} {isAnual ? <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">Recomendado</span> : null}</CardTitle>
                  {plano.descricao && <CardDescription>{plano.descricao}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-3xl font-black text-primary">{Number(plano.valor) > 0 ? `R$ ${Number(plano.valor).toFixed(2).replace('.', ',')}` : 'Gratuito'}</div>
                  <Button className="w-full" asChild><Link to="/auth">Assinar este plano</Link></Button>
                </CardContent>
              </Card>
            );})}
          </div>
        </section>
      </main>

      <footer className='border-t border-border/60 bg-background/80'>
        <div className='container mx-auto px-4 py-6 text-center text-sm text-muted-foreground'>
          <p className='font-medium text-foreground'>CloudBR - Sistemas e Gerenciamento Web</p>
          <p>Contato: <a className='text-primary underline' href='mailto:admin@cloudbr.app'>admin@cloudbr.app</a></p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
