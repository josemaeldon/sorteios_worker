-- =====================================================
-- BINGO SYSTEM - COMPLETE DATABASE SCHEMA
-- Sistema Completo de Gestão de Bingo
-- =====================================================
-- This file contains the complete database schema including
-- all tables, indexes, functions, and initial data
-- =====================================================

-- =====================================================
-- EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- ENUM TYPES
-- =====================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- =====================================================
-- TABLES
-- =====================================================

-- Tabela de perfis de usuário
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    titulo_sistema TEXT DEFAULT 'Sorteios',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de roles de usuário
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE(user_id, role)
);

-- Tabela de usuários (para autenticação custom)
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    ativo BOOLEAN NOT NULL DEFAULT true,
    avatar_url TEXT,
    titulo_sistema TEXT DEFAULT 'Sorteios',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de sorteios
CREATE TABLE IF NOT EXISTS public.sorteios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    nome TEXT NOT NULL,
    premio TEXT,
    premios JSONB DEFAULT '[]'::jsonb,
    data_sorteio DATE,
    valor_cartela NUMERIC,
    quantidade_cartelas INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ativo',
    papel_largura NUMERIC DEFAULT 210,
    papel_altura NUMERIC DEFAULT 297,
    grade_colunas INTEGER DEFAULT 5,
    grade_linhas INTEGER DEFAULT 5,
    apenas_numero_rifa BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de vendedores
CREATE TABLE IF NOT EXISTS public.vendedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    telefone TEXT,
    email TEXT,
    cpf TEXT,
    endereco TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de cartelas
CREATE TABLE IF NOT EXISTS public.cartelas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
    vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL,
    numero INTEGER NOT NULL,
    status TEXT DEFAULT 'disponivel',
    numeros_grade JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de atribuições
CREATE TABLE IF NOT EXISTS public.atribuicoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
    vendedor_id UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de cartelas atribuídas
CREATE TABLE IF NOT EXISTS public.atribuicao_cartelas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atribuicao_id UUID NOT NULL REFERENCES public.atribuicoes(id) ON DELETE CASCADE,
    numero_cartela INTEGER NOT NULL,
    status TEXT DEFAULT 'ativa',
    data_atribuicao TIMESTAMP WITH TIME ZONE,
    data_devolucao TIMESTAMP WITH TIME ZONE,
    venda_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de vendas
CREATE TABLE IF NOT EXISTS public.vendas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
    vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL,
    cliente_nome TEXT,
    cliente_telefone TEXT,
    numeros_cartelas TEXT,
    valor_total NUMERIC,
    valor_pago NUMERIC DEFAULT 0,
    data_venda TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pendente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de pagamentos
CREATE TABLE IF NOT EXISTS public.pagamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venda_id UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
    valor NUMERIC,
    forma_pagamento TEXT,
    data_pagamento TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de rodadas de sorteio
CREATE TABLE IF NOT EXISTS public.rodadas_sorteio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    range_start INTEGER NOT NULL,
    range_end INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo',
    data_inicio TIMESTAMP WITH TIME ZONE,
    data_fim TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de compartilhamento de sorteios (admin pode atribuir sorteios a usuários)
CREATE TABLE IF NOT EXISTS public.sorteio_compartilhado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE(sorteio_id, user_id)
);

-- Tabela de histórico de sorteios (números sorteados)
CREATE TABLE IF NOT EXISTS public.sorteio_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sorteio_id UUID REFERENCES public.sorteios(id) ON DELETE CASCADE,
    rodada_id UUID REFERENCES public.rodadas_sorteio(id) ON DELETE CASCADE,
    numero_sorteado INTEGER NOT NULL,
    range_start INTEGER NOT NULL,
    range_end INTEGER NOT NULL,
    ordem INTEGER NOT NULL,
    registro VARCHAR(255),
    data_sorteio TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- =====================================================
-- CONSTRAINTS
-- =====================================================
-- Ensure at least one of sorteio_id or rodada_id is provided
ALTER TABLE public.sorteio_historico 
ADD CONSTRAINT check_sorteio_or_rodada 
CHECK (sorteio_id IS NOT NULL OR rodada_id IS NOT NULL);

-- =====================================================
-- ÍNDICES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sorteios_user_id ON public.sorteios(user_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_sorteio_id ON public.vendedores(sorteio_id);
CREATE INDEX IF NOT EXISTS idx_cartelas_sorteio_id ON public.cartelas(sorteio_id);
CREATE INDEX IF NOT EXISTS idx_vendas_sorteio_id ON public.vendas(sorteio_id);
CREATE INDEX IF NOT EXISTS idx_vendas_vendedor_id ON public.vendas(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_rodadas_sorteio_sorteio_id ON public.rodadas_sorteio(sorteio_id);
CREATE INDEX IF NOT EXISTS idx_sorteio_historico_sorteio_id ON public.sorteio_historico(sorteio_id);
CREATE INDEX IF NOT EXISTS idx_sorteio_historico_rodada_id ON public.sorteio_historico(rodada_id);
CREATE INDEX IF NOT EXISTS idx_sorteio_historico_ordem ON public.sorteio_historico(sorteio_id, ordem);
CREATE INDEX IF NOT EXISTS idx_cartelas_sorteio_numero ON public.cartelas(sorteio_id, numero);
CREATE INDEX IF NOT EXISTS idx_cartelas_sorteio_status_vendedor ON public.cartelas(sorteio_id, status, vendedor_id);
CREATE INDEX IF NOT EXISTS idx_sorteio_historico_rodada_ordem ON public.sorteio_historico(rodada_id, ordem);
CREATE INDEX IF NOT EXISTS idx_sorteio_historico_rodada_numero ON public.sorteio_historico(rodada_id, numero_sorteado);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sorteio_historico_rodada_ordem ON public.sorteio_historico(rodada_id, ordem) WHERE rodada_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sorteio_historico_rodada_numero ON public.sorteio_historico(rodada_id, numero_sorteado) WHERE rodada_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sorteio_compartilhado_sorteio_id ON public.sorteio_compartilhado(sorteio_id);
CREATE INDEX IF NOT EXISTS idx_sorteio_compartilhado_user_id ON public.sorteio_compartilhado(user_id);

-- =====================================================
-- FUNÇÕES
-- =====================================================

-- Função para verificar role do usuário
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role = _role
    )
$$;

-- Função para obter role do usuário
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sorteios_updated_at
    BEFORE UPDATE ON public.sorteios
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendedores_updated_at
    BEFORE UPDATE ON public.vendedores
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cartelas_updated_at
    BEFORE UPDATE ON public.cartelas
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_atribuicoes_updated_at
    BEFORE UPDATE ON public.atribuicoes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendas_updated_at
    BEFORE UPDATE ON public.vendas
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_usuarios_updated_at
    BEFORE UPDATE ON public.usuarios
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rodadas_sorteio_updated_at
    BEFORE UPDATE ON public.rodadas_sorteio
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- COMENTÁRIOS DAS TABELAS
-- =====================================================
COMMENT ON TABLE public.usuarios IS 'Usuários do sistema com autenticação';
COMMENT ON TABLE public.sorteios IS 'Sorteios criados pelos usuários';
COMMENT ON TABLE public.vendedores IS 'Vendedores associados aos sorteios';
COMMENT ON TABLE public.cartelas IS 'Cartelas dos sorteios';
COMMENT ON TABLE public.atribuicoes IS 'Atribuições de cartelas para vendedores';
COMMENT ON TABLE public.atribuicao_cartelas IS 'Detalhes das cartelas atribuídas';
COMMENT ON TABLE public.vendas IS 'Vendas realizadas';
COMMENT ON TABLE public.pagamentos IS 'Pagamentos das vendas';
COMMENT ON TABLE public.rodadas_sorteio IS 'Rodadas de sorteio que podem ser gerenciadas independentemente';
COMMENT ON TABLE public.sorteio_historico IS 'Histórico de números sorteados para cada sorteio ou rodada';

-- =====================================================
-- COMENTÁRIOS DAS COLUNAS
-- =====================================================
COMMENT ON COLUMN public.sorteio_historico.sorteio_id IS 'ID do sorteio (nullable quando associado via rodada_id)';
COMMENT ON COLUMN public.sorteio_historico.rodada_id IS 'ID da rodada de sorteio (quando aplicável)';
COMMENT ON COLUMN public.sorteio_historico.numero_sorteado IS 'Número que foi sorteado';
COMMENT ON COLUMN public.sorteio_historico.range_start IS 'Início da faixa configurada para o sorteio';
COMMENT ON COLUMN public.sorteio_historico.range_end IS 'Fim da faixa configurada para o sorteio';
COMMENT ON COLUMN public.sorteio_historico.ordem IS 'Ordem em que o número foi sorteado (1, 2, 3...)';
COMMENT ON COLUMN public.sorteio_historico.registro IS 'Nome/identificador do registro do sorteio (ex: Sorteio 001)';
COMMENT ON COLUMN public.rodadas_sorteio.nome IS 'Nome da rodada (ex: Rodada 1, Rodada 2)';
COMMENT ON COLUMN public.rodadas_sorteio.range_start IS 'Início da faixa de números';
COMMENT ON COLUMN public.rodadas_sorteio.range_end IS 'Fim da faixa de números';
COMMENT ON COLUMN public.rodadas_sorteio.status IS 'Status da rodada (ativo, concluido, cancelado)';

-- =====================================================
-- MENSAGEM DE CONCLUSÃO
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Banco de dados inicializado com sucesso!';
    RAISE NOTICE 'Sistema: Bingo PGM - Gestão Completa de Bingo';
    RAISE NOTICE 'Nenhum administrador padrão foi criado automaticamente.';
    RAISE NOTICE 'No primeiro acesso, use o autoinstalador para cadastrar o administrador.';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Tabelas criadas:';
    RAISE NOTICE '  - usuarios (autenticação)';
    RAISE NOTICE '  - sorteios (gestão de sorteios)';
    RAISE NOTICE '  - rodadas_sorteio (rodadas independentes)';
    RAISE NOTICE '  - sorteio_historico (histórico de números)';
    RAISE NOTICE '  - vendedores (gestão de vendedores)';
    RAISE NOTICE '  - cartelas (controle de cartelas)';
    RAISE NOTICE '  - atribuicoes (atribuição de cartelas)';
    RAISE NOTICE '  - vendas (registro de vendas)';
    RAISE NOTICE '  - pagamentos (controle de pagamentos)';
    RAISE NOTICE '=====================================================';
END $$;
