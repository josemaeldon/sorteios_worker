import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Trophy } from 'lucide-react';
import { callApi } from '@/lib/apiClient';

type PublicRodada = {
  id: string;
  nome: string;
  sorteio_nome: string;
  range_start: number;
  range_end: number;
  status: string;
  tipo?: string;
};

type HistoricoItem = {
  numero_sorteado: number;
  ordem: number;
};

type RankingCartela = {
  numero: number;
  nome?: string;
  score: number;
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const lastCountRef = useRef(0);

  const loadData = async (silent = false) => {
    if (!rodadaId) return;
    if (!silent) setIsLoading(true);
    try {
      const result = await callApi('getPublicRodadaSorteio', { rodada_id: rodadaId });
      const data = (result as { data?: { rodada?: PublicRodada; historico?: HistoricoItem[]; top10?: GroupedTopEntry[]; top10_cartelas?: TopCartelaEntry[] } }).data;
      setRodada(data?.rodada ?? null);
      setHistorico(data?.historico ?? []);
      setTop10(data?.top10_cartelas ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar sorteio.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
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

  useEffect(() => {
    lastCountRef.current = sortedHistorico.length;
  }, [sortedHistorico.length]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-4 md:px-8 py-4 md:py-5 border-b border-white/10 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-white/60 text-xs md:text-sm uppercase tracking-wide truncate">{rodada.sorteio_nome}</p>
          <h1 className="text-xl md:text-3xl font-bold truncate">{rodada.nome}</h1>
        </div>
        <div className="text-right text-white/70 text-xs md:text-sm flex-shrink-0">
          <p className="whitespace-nowrap">{rodada.range_start} a {rodada.range_end}</p>
          <p className="whitespace-nowrap">{sortedHistorico.length} sorteado{sortedHistorico.length !== 1 ? 's' : ''}</p>
        </div>
      </header>

      {/* Main Content - Responsive Layout */}
      <main className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6 p-4 md:p-8 overflow-hidden">
        {/* Left Section: Number + Historico */}
        <div className="flex-1 flex flex-col min-w-0 items-center justify-center">
          {/* Large Current Number */}
          <p className="text-white/50 text-lg md:text-2xl mb-2 md:mb-4">Número Sorteado</p>
          <div
            className={`font-black leading-none tabular-nums text-center mb-6 md:mb-8 ${
              isNewNumber ? 'animate-bingo-globe-emerge' : ''
            }`}
            style={{ fontSize: 'clamp(3rem, 20vw, 20rem)' }}
          >
            {currentNumber ?? '-'}
          </div>

          {/* Historico Footer */}
          <div className="w-full">
            <p className="text-white/50 text-xs md:text-sm mb-2">Números Sorteados</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {sortedHistorico.slice(-18).map((item) => (
                <span
                  key={`${item.ordem}-${item.numero_sorteado}`}
                  className="min-w-12 md:min-w-14 rounded-lg border border-white/15 bg-white/10 px-2 md:px-4 py-1 md:py-2 text-center text-lg md:text-2xl font-bold flex-shrink-0"
                >
                  {item.numero_sorteado}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Section: Top 10 - Sidebar on Desktop, Below on Mobile */}
        {top10.length > 0 && (
          <div className="w-full md:w-80 md:flex-shrink-0 bg-white/5 border border-white/10 rounded-lg p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 md:w-6 md:h-6 text-yellow-400 flex-shrink-0" />
              <h2 className="text-lg md:text-xl font-bold">Top 10 Cartelas</h2>
            </div>
            <div className="divide-y divide-white/10 max-h-96 overflow-y-auto">
              {top10.slice(0, 10).map((entry, idx) => (
                <div key={entry.numero} className="py-2 md:py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1.5 text-xs md:text-sm">
                    <span className="font-bold text-yellow-400 w-6">{idx + 1}º</span>
                    <span className="font-semibold text-yellow-300">{entry.score} pts</span>
                  </div>
                  <span className="inline-flex px-2 py-1 rounded text-xs font-mono bg-white/10 border border-white/15 text-white/90 truncate" title={entry.nome ? `${entry.numero} - ${entry.nome}` : entry.numero.toString()}>
                    {entry.numero.toString().padStart(3, '0')}{entry.nome ? ` - ${entry.nome}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StreamingDraw;
