export interface Sorteio {
  id: string;
  nome: string;
  data_sorteio: string;
  premio: string;
  premios?: string[];
  valor_cartela: number;
  quantidade_cartelas: number;
  status: 'agendado' | 'em_andamento' | 'concluido';
  tipo?: 'bingo' | 'rifa';
  short_id?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  owner_nome?: string;
  owner_email?: string;
  vendas?: {
    cartelas_vendidas: number;
    total_arrecadado: number;
  };
  // Paper size settings
  papel_largura?: number;       // mm, default 210 (A4)
  papel_altura?: number;        // mm, default 297 (A4)
  // Grid size settings
  grade_colunas?: number;       // default 5
  grade_linhas?: number;        // default 5
  apenas_numero_rifa?: boolean; // if true, no number grid (rifa only)
  // Batch size for validated cartelas grouping
  tamanho_lote?: number;        // default 50
}

export interface RodadaSorteio {
  id: string;
  sorteio_id: string;
  nome: string;
  range_start: number;
  range_end: number;
  status: 'ativo' | 'concluido' | 'cancelado';
  data_inicio?: string;
  data_fim?: string;
  created_at?: string;
  updated_at?: string;
  numeros_sorteados?: number;
}

export interface Vendedor {
  id: string;
  sorteio_id: string;
  nome: string;
  telefone?: string;
  email?: string;
  cpf?: string;
  endereco?: string;
  ativo: boolean;
  cartelas_atribuidas?: number;
  cartelas_vendidas?: number;
  valor_arrecadado?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Cartela {
  numero: number;
  status: 'disponivel' | 'ativa' | 'vendida' | 'devolvida' | 'extraviada';
  vendedor_id?: string;
  vendedor_nome?: string;
  comprador_nome?: string;
  numeros_grade?: number[][]; // per-prize flat 25-number grids (0 = blank center); index = premio index
}

export interface LojaCartela {
  id: string;
  user_id?: string;
  card_set_id: string;
  card_set_nome?: string;
  numero_cartela: number;
  preco: number;
  status: 'disponivel' | 'vendida';
  vendedor_id?: string;
  comprador_nome?: string;
  comprador_email?: string;
  comprador_endereco?: string;
  comprador_cidade?: string;
  comprador_telefone?: string;
  card_data: string; // JSON of BingoCardGrid
  layout_data: string; // JSON of CanvasLayout
  sorteio_id?: string;
  sorteio_nome?: string;
  data_sorteio?: string;
  papel_largura?: number;
  papel_altura?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CartelaAtribuida {
  numero: number;
  status: 'ativa' | 'vendida' | 'devolvida' | 'extraviada';
  data_atribuicao: string;
  data_devolucao?: string;
  venda_id?: string;
}

export interface Atribuicao {
  id: string;
  sorteio_id: string;
  vendedor_id: string;
  vendedor_nome?: string;
  cartelas: CartelaAtribuida[];
  created_at?: string;
  updated_at?: string;
}

export interface PagamentoVenda {
  forma_pagamento: 'dinheiro' | 'pix' | 'cartao' | 'transferencia';
  valor: number;
}

export interface Venda {
  id: string;
  sorteio_id: string;
  vendedor_id: string;
  vendedor_nome?: string;
  cliente_nome: string;
  cliente_telefone?: string;
  numeros_cartelas: string;
  valor_total: number;
  valor_pago: number;
  total_pago?: number;
  pagamentos?: PagamentoVenda[];
  status: 'pendente' | 'concluida';
  data_venda: string;
  created_at?: string;
  updated_at?: string;
}

export interface Pagamento {
  id: string;
  venda_id: string;
  valor: number;
  forma_pagamento: string;
  observacao?: string;
  data_pagamento: string;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardData {
  estatisticas: {
    total_arrecadado: number;
    cartelas_vendidas: number;
    total_vendas: number;
    total_vendedores: number;
  };
  ranking_vendedores: Array<{
    id: string;
    nome: string;
    cartelas_vendidas: number;
    valor_arrecadado: number;
  }>;
  ultimas_vendas: Venda[];
}

export interface FiltrosVendedores {
  busca: string;
  status: 'todos' | 'ativo' | 'inativo';
}

export interface FiltrosCartelas {
  busca: string;
  status: 'todos' | 'disponivel' | 'ativa' | 'vendida' | 'devolvida' | 'extraviada';
  vendedor: string;
}

export interface FiltrosAtribuicoes {
  busca: string;
  status: 'todos' | 'ativa' | 'vendida' | 'devolvida' | 'extraviada';
  vendedor: string;
}

export interface FiltrosVendas {
  busca: string;
  status: 'todos' | 'pendente' | 'concluida';
  vendedor: string;
  periodo: 'todos' | 'hoje' | 'semana' | 'mes';
}

export interface CartelaValidada {
  id: string;
  numero: number;
  comprador_nome?: string;
  created_at: string;
}

export interface CartelaLayout {
  id: string;
  sorteio_id: string;
  nome: string;
  layout_data: string;  // JSON of CanvasLayout
  cards_data: string;   // JSON of BingoCardGrid[]
  created_at?: string;
  updated_at?: string;
}

export type TabType = 'sorteios' | 'dashboard' | 'rodadas' | 'vendedores' | 'cartelas' | 'atribuicoes' | 'vendas' | 'relatorios' | 'sorteio' | 'cartelas-bingo';
