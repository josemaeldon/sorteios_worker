import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Loader2, Trophy } from 'lucide-react';
import { callApi } from '@/lib/apiClient';

type PublicRodada = {
  id: string;
  nome: string;
  sorteio_nome: string;
  range_start: number;
  range_end: number;
  status: string;
  tipo?: string;
  tipo_vitoria?: 'bingo' | 'quina';
  grade_colunas?: number;
  grade_linhas?: number;
};

type HistoricoItem = {
  numero_sorteado: number;
  ordem: number;
};

type GroupedTopEntry = {
  score: number;
  cartelas: number[];
  count: number;
};

type TopCartelaEntry = {
  numero: number;
  nome?: string;
  score: number;
};

const StreamingDraw: React.FC = () => {
  const { rodadaId } = useParams();
  const [rodada, setRodada] = useState<PublicRodada | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [top10, setTop10] = useState<TopCartelaEntry[]>([]);
  const [top10GroupedFromApi, setTop10GroupedFromApi] = useState<GroupedTopEntry[]>([]);
  const [vencedoras, setVencedoras] = useState<{ numero: number; nome?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const lastCountRef = useRef(0);
  const ganhadoresPopShownRef = useRef<Set<number>>(new Set());

  const loadData = async (silent = false) => {
    if (!rodadaId) return;
    if (!silent) setIsLoading(true);
    try {
      const result = await callApi('getPublicRodadaSorteio', { rodada_id: rodadaId });
      const data = (result as { data?: { rodada?: PublicRodada; historico?: HistoricoItem[]; top10?: GroupedTopEntry[]; top10_cartelas?: TopCartelaEntry[]; vencedoras?: { numero: number; nome?: string }[] } }).data;
      if (data?.rodada?.id && data.rodada.id !== rodadaId) return;
      setRodada(data?.rodada ?? null);
      setHistorico(data?.historico ?? []);
      setTop10(data?.top10_cartelas ?? []);
      setTop10GroupedFromApi(data?.top10 ?? []);
      setVencedoras(data?.vencedoras ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar sorteio.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    setRodada(null);
    setHistorico([]);
    setTop10([]);
    setTop10GroupedFromApi([]);
    setVencedoras([]);
    ganhadoresPopShownRef.current.clear();
    lastCountRef.current = 0;
    loadData();
    const interval = window.setInterval(() => loadData(true), 2500);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodadaId]);

  const sortedHistorico = useMemo(
    () => [...historico].sort((a, b) => a.ordem - b.ordem),
    [historico],
  );
  const currentNumber = sortedHistorico.length > 0
    ? sortedHistorico[sortedHistorico.length - 1].numero_sorteado
    : null;
  const isNewNumber = sortedHistorico.length !== lastCountRef.current;
  const rodadaTitle = `${rodada?.nome ?? ''}${rodada?.tipo_vitoria ? ` - ${rodada.tipo_vitoria === 'quina' ? 'Quina' : 'Cartela cheia'}` : ''}`;

  const groupedTop10 = useMemo(() => {
    if (top10GroupedFromApi.length > 0) {
      return top10GroupedFromApi
        .map(group => ({
          score: group.score,
          count: group.count,
          cartelas: (group.cartelas || [])
            .slice()
            .sort((a, b) => a - b)
            .map(numero => ({ numero, score: group.score })),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }

    const groups = top10.reduce((acc, entry) => {
      const key = String(entry.score);
      if (!acc[key]) acc[key] = { score: entry.score, count: 0, cartelas: [] as TopCartelaEntry[] };
      acc[key].count += 1;
      acc[key].cartelas.push(entry);
      return acc;
    }, {} as Record<string, { score: number; count: number; cartelas: TopCartelaEntry[] }>);

    return Object.values(groups)
      .map(group => ({
        score: group.score,
        count: group.count,
        cartelas: group.cartelas.sort((a, b) => a.numero - b.numero),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [top10, top10GroupedFromApi]);

  useEffect(() => {
    lastCountRef.current = sortedHistorico.length;
  }, [sortedHistorico.length]);

  useEffect(() => {
    if (!rodada) return;
    if (rodada.id !== rodadaId) return;

    if (vencedoras.length === 0) return;

    const newWinners = vencedoras.filter(entry => !ganhadoresPopShownRef.current.has(entry.numero));
    if (newWinners.length === 0) return;

    newWinners.forEach(entry => ganhadoresPopShownRef.current.add(entry.numero));
  }, [vencedoras, rodada]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-black text-white flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (error || !rodada) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-black text-white flex items-center justify-center p-6 text-center">
        <p className="text-2xl font-semibold">{error || 'Rodada não encontrada.'}</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 to-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-4 md:px-8 py-4 md:py-5 border-b border-white/10 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-white/60 text-xs md:text-sm uppercase tracking-wide truncate">{rodada.sorteio_nome}</p>
          <h1 className="text-xl md:text-3xl font-bold truncate">{rodadaTitle}</h1>
        </div>
        <div className="text-right text-white/70 text-xs md:text-sm flex-shrink-0 space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] md:text-xs font-semibold text-white">
            <span className={rodada.tipo_vitoria === 'quina' ? 'text-emerald-300' : 'text-sky-300'}>
              {rodada.tipo_vitoria === 'quina' ? 'Quina' : 'Cartela cheia'}
            </span>
          </div>
          <p className="whitespace-nowrap text-[11px] md:text-xs text-white/55">
            Regra: {rodada.tipo_vitoria === 'quina' ? `Quina ${rodada.grade_colunas ?? 5}x${rodada.grade_linhas ?? 5}` : `Cartela cheia ${rodada.grade_colunas ?? 5}x${rodada.grade_linhas ?? 5}`}
          </p>
          <p className="whitespace-nowrap">{rodada.range_start} a {rodada.range_end}</p>
          <p className="whitespace-nowrap">{sortedHistorico.length} sorteado{sortedHistorico.length !== 1 ? 's' : ''}</p>
        </div>
      </header>

      {/* Main Content - Responsive Layout */}
      <main className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 md:gap-5 p-3 md:p-6 overflow-hidden">
        {/* Left Section: Number + Historico */}
        <div className="flex-1 min-h-0 flex flex-col min-w-0">
          {/* Large Current Number */}
          <p className="text-white/50 text-lg md:text-2xl mb-1 md:mb-2 text-center">Número Sorteado</p>
          <div
            className={`font-black leading-none tabular-nums text-center flex-1 min-h-0 flex items-center justify-center mb-1 md:mb-2 ${
              isNewNumber ? 'animate-bingo-globe-emerge' : ''
            }`}
            style={{ fontSize: "clamp(4rem, 18vw, 18rem)" }}
          >
            {currentNumber ?? '-'}
          </div>

          {/* Historico Footer */}
          <div className="w-full flex-shrink-0 max-h-[28vh] md:max-h-[32vh] overflow-y-auto pr-1">
            <p className="text-white/50 text-xs md:text-sm mb-1.5">Números Sorteados</p>
            <div className="flex flex-wrap gap-1.5 pb-2">
              {sortedHistorico.map((item) => (
                <span
                  key={`${item.ordem}-${item.numero_sorteado}`}
                  className="min-w-10 md:min-w-12 rounded-lg border border-white/15 bg-white/10 px-2 md:px-3 py-1 md:py-1.5 text-center text-sm md:text-xl font-bold"
                >
                  {item.numero_sorteado}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Section: Top 10 - Sidebar on Desktop, Below on Mobile */}
        {groupedTop10.length > 0 && (
          <div className="w-full md:w-[22rem] md:flex-shrink-0 bg-white/5 border border-white/10 rounded-lg p-3 md:p-4 flex flex-col min-h-[220px] max-h-[42vh] md:max-h-full md:h-full overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 md:w-6 md:h-6 text-yellow-400 flex-shrink-0" />
              <h2 className="text-lg md:text-xl font-bold">Top 10 Cartelas</h2>
            </div>
            <div className="divide-y divide-white/10 overflow-y-auto flex-1 min-h-0 pr-1">
              {groupedTop10.map((group, idx) => (
                <div key={group.score} className="py-2 md:py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1.5 text-xs md:text-sm">
                    <span className="font-bold text-yellow-400 w-6">{idx + 1}º</span>
                    <span className="font-semibold text-yellow-300">{group.score} pts</span>
                    <span className="text-white/70">{group.count} {group.count === 1 ? 'cartela' : 'cartelas'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.cartelas.map((entry) => (
                      <span key={entry.numero} className="inline-flex px-2 py-1 rounded text-xs font-mono bg-white/10 border border-white/15 text-white/90 truncate" title={entry.nome ? `${entry.numero} - ${entry.nome}` : entry.numero.toString()}>
                        {entry.numero.toString().padStart(3, '0')}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {vencedoras.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
          <div className="bg-card rounded-2xl p-10 text-center shadow-2xl max-w-lg w-full mx-4 border-4 border-yellow-400">
            <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-4xl font-black mb-2 text-foreground">Temos um Ganhador! 🎉</h2>
            <p className="text-muted-foreground mb-6">{rodada?.tipo_vitoria === 'quina' ? 'Cartela(s) com quina' : 'Cartela(s) com cartela cheia'}</p>
            <div className="space-y-2 mb-8">
              {vencedoras.map(({ numero, nome }) => (
                <div key={numero} className="text-2xl font-bold text-primary">
                  Cartela {numero.toString().padStart(3, '0')}{nome ? ` - ${nome}` : ''}
                </div>
              ))}
            </div>
            <button
              onClick={() => setVencedoras([])}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              <CheckCircle className="w-5 h-5" />
              Fechar
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default StreamingDraw;
