import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { callApi } from '@/lib/apiClient';

type PublicRodada = {
  id: string;
  nome: string;
  sorteio_nome: string;
  range_start: number;
  range_end: number;
  status: string;
};

type HistoricoItem = {
  numero_sorteado: number;
  ordem: number;
};

const StreamingDraw: React.FC = () => {
  const { rodadaId } = useParams();
  const [rodada, setRodada] = useState<PublicRodada | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const lastCountRef = useRef(0);

  const loadData = async (silent = false) => {
    if (!rodadaId) return;
    if (!silent) setIsLoading(true);
    try {
      const result = await callApi('getPublicRodadaSorteio', { rodada_id: rodadaId });
      const data = (result as { data?: { rodada?: PublicRodada; historico?: HistoricoItem[] } }).data;
      setRodada(data?.rodada ?? null);
      setHistorico(data?.historico ?? []);
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
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (error || !rodada) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6 text-center">
        <p className="text-2xl font-semibold">{error || 'Rodada não encontrada.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-hidden">
      <header className="px-8 py-5 border-b border-white/10 flex items-center justify-between gap-4">
        <div>
          <p className="text-white/60 text-sm uppercase tracking-wide">{rodada.sorteio_nome}</p>
          <h1 className="text-3xl font-bold">{rodada.nome}</h1>
        </div>
        <div className="text-right text-white/70">
          <p>{rodada.range_start} a {rodada.range_end}</p>
          <p>{sortedHistorico.length} sorteado{sortedHistorico.length !== 1 ? 's' : ''}</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <p className="text-white/50 text-2xl mb-8">Número sorteado</p>
        <div
          className={`font-black leading-none tabular-nums text-center ${isNewNumber ? 'animate-bingo-globe-emerge' : ''}`}
          style={{ fontSize: 'clamp(9rem, 32vw, 34rem)' }}
        >
          {currentNumber ?? '-'}
        </div>
      </main>

      <footer className="px-8 py-5 border-t border-white/10">
        <div className="flex gap-3 overflow-hidden">
          {sortedHistorico.slice(-18).map((item) => (
            <span
              key={`${item.ordem}-${item.numero_sorteado}`}
              className="min-w-14 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-center text-2xl font-bold"
            >
              {item.numero_sorteado}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default StreamingDraw;
