export const formatarData = (data: string | undefined): string => {
  if (!data) return 'Não definida';
  const date = new Date(data);
  if (isNaN(date.getTime())) return data;
  return date.toLocaleDateString('pt-BR');
};

export const formatarDataHora = (data: string | undefined): string => {
  if (!data) return 'Não definida';
  const date = new Date(data);
  if (isNaN(date.getTime())) return data;
  return date.toLocaleString('pt-BR');
};

export const formatarMoeda = (valor: number | undefined): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor || 0);
};

export const gerarId = (): string => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export const formatarNumeroCartela = (numero: number): string => {
  return numero.toString().padStart(3, '0');
};

export const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'agendado': 'Agendado',
    'em_andamento': 'Em Andamento',
    'concluido': 'Concluído',
    'ativo': 'Ativo',
    'inativo': 'Inativo',
    'pago': 'Pago',
    'pendente': 'Pendente',
    'disponivel': 'Disponível',
    'ativa': 'Atribuída',
    'vendida': 'Vendida',
    'devolvida': 'Devolvida',
    'extraviada': 'Extraviada',
    'concluida': 'Concluída'
  };
  return labels[status] || status;
};

export const getStatusClass = (status: string): string => {
  return `status-${status.replace('_', '-')}`;
};

export const validarCPF = (cpf: string): boolean => {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;
  
  return true;
};

export const formatarCPF = (cpf: string): string => {
  cpf = cpf.replace(/[^\d]/g, '');
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

export const formatarTelefone = (telefone: string): string => {
  telefone = telefone.replace(/[^\d]/g, '');
  if (telefone.length === 11) {
    return telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  return telefone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
};
