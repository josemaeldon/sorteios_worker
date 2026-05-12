import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { RodadaSorteio, CartelaValidada } from '@/types/bingo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Shuffle, 
  RotateCcw, 
  Play, 
  Maximize, 
  Minimize, 
  ZoomIn, 
  ZoomOut, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  ArrowLeft,
  Loader2,
  Trophy,
  Ticket,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { callApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { formatarData } from '@/lib/utils/formatters';
import { getBingoMaxNumber } from '@/lib/utils/bingoCardUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Animation constants
const ANIMATION_CYCLES = 20;
const ANIMATION_INTERVAL_MS = 100;
const FULLSCREEN_FONT_SIZE_DEFAULT = 300;
const Z_INDEX_WINNER_POPUP = 9999;
const LOTE_SIZE = 50;

type ValidatedCartelaComGrade = {
  numero: number;
  comprador_nome?: string;
  numeros_grade: number[][];
};

type RankingCartela = {
  numero: number;
  nome?: string;
  score: number;
};

const DrawTab: React.FC = () => {
  const { sorteioAtivo, cartelasValidadas, loadCartelasValidadas } = useBingo();
  const { toast } = useToast();

  // Winning score = total cells in the grid (cols × rows), defaults to 25 (5×5)
  const winningScore = (sorteioAtivo?.grade_colunas ?? 5) * (sorteioAtivo?.grade_linhas ?? 5);
  
  // Rodadas state
  const [rodadas, setRodadas] = useState<RodadaSorteio[]>([]);
  const [isLoadingRodadas, setIsLoadingRodadas] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRodada, setEditingRodada] = useState<RodadaSorteio | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRodadaId, setDeletingRodadaId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    range_start: '1',
    range_end: '75',
    status: 'ativo' as 'ativo' | 'concluido' | 'cancelado'
  });
  
  // Drawing state
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>([]);
  const [fontSize, setFontSize] = useState<number>(300);
  const [fullscreenFontSize, setFullscreenFontSize] = useState<number>(FULLSCREEN_FONT_SIZE_DEFAULT);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedRodada, setSelectedRodada] = useState<RodadaSorteio | null>(null);
  const [showDrawing, setShowDrawing] = useState(false);
  const [justDrawn, setJustDrawn] = useState(false);
  const [vencedoras, setVencedoras] = useState<number[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedCartelaModal, setSelectedCartelaModal] = useState<{ numero: number; nome?: string; grade: number[] } | null>(null);
  const [ganhadoresPop, setGanhadoresPop] = useState<{ numero: number; nome?: string; lote?: number }[]>([]);
  const [manualNumberInput, setManualNumberInput] = useState('');
  const [validatedCardsWithGrade, setValidatedCardsWithGrade] = useState<ValidatedCartelaComGrade[]>([]);

  // Random cartela raffle state
  const [isCartelaSorteioModalOpen, setIsCartelaSorteioModalOpen] = useState(false);
  const [cartelasSorteadasHistory, setCartelasSorteadasHistory] = useState<{ numero: number; nome?: string }[]>([]);
  const [isCartelaSorteioAnimating, setIsCartelaSorteioAnimating] = useState(false);
  const [cartelaSorteioPreview, setCartelaSorteioPreview] = useState<number | null>(null);
  const cartelaSorteioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const ganhadoresPopShownRef = useRef<Set<number>>(new Set());
  const streamingUrl = selectedRodada
    ? `${window.location.origin}/sorteio-live/${selectedRodada.id}`
    : '';

  useEffect(() => {
    if (sorteioAtivo) {
      loadRodadas();
      loadCartelasValidadas();
    }
    setCartelasSorteadasHistory([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorteioAtivo?.id]);

  const loadRodadas = async () => {
    if (!sorteioAtivo) return;
    
    try {
      setIsLoadingRodadas(true);
      const result = await callApi('getRodadas', { sorteio_id: sorteioAtivo.id });
      setRodadas(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading rodadas:', error);
      toast({
        title: "Erro ao carregar rodadas",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    } finally {
      setIsLoadingRodadas(false);
    }
  };

  const handleNewRodada = () => {
    setEditingRodada(null);
    const isRifa = sorteioAtivo?.tipo === 'rifa';
    const cols = sorteioAtivo?.grade_colunas ?? 5;
    const rows = sorteioAtivo?.grade_linhas ?? 5;
    setFormData({
      nome: '',
      range_start: '1',
      range_end: isRifa ? (sorteioAtivo?.quantidade_cartelas?.toString() ?? '75') : getBingoMaxNumber(cols, rows).toString(),
      status: 'ativo'
    });
    setIsModalOpen(true);
  };

  const handleEditRodada = (rodada: RodadaSorteio) => {
    setEditingRodada(rodada);
    setFormData({
      nome: rodada.nome,
      range_start: rodada.range_start.toString(),
      range_end: rodada.range_end.toString(),
      status: rodada.status
    });
    setIsModalOpen(true);
  };

  const handleDeleteRodada = (id: string) => {
    setDeletingRodadaId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingRodadaId) return;
    
    try {
      await callApi('deleteRodada', { id: deletingRodadaId });
      toast({
        title: "Rodada excluída",
        description: "A rodada foi excluída com sucesso."
      });
      await loadRodadas();
      
      // If the deleted rodada was selected, go back to list
      if (selectedRodada?.id === deletingRodadaId) {
        setShowDrawing(false);
        setSelectedRodada(null);
      }
    } catch (error: unknown) {
      toast({
        title: "Erro ao excluir rodada",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingRodadaId(null);
    }
  };

  const handleSubmitRodada = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sorteioAtivo) return;
    
    const range_start = parseInt(formData.range_start);
    const range_end = parseInt(formData.range_end);
    
    if (isNaN(range_start) || isNaN(range_end) || range_start < 1 || range_start >= range_end) {
      toast({
        title: "Erro",
        description: "A faixa de números é inválida. O número inicial deve ser positivo e menor que o número final.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      if (editingRodada) {
        await callApi('updateRodada', {
          id: editingRodada.id,
          nome: formData.nome,
          range_start,
          range_end,
          status: formData.status
        });
        toast({
          title: "Rodada atualizada",
          description: "A rodada foi atualizada com sucesso."
        });
      } else {
        await callApi('createRodada', {
          sorteio_id: sorteioAtivo.id,
          nome: formData.nome,
          range_start,
          range_end,
          status: formData.status
        });
        toast({
          title: "Rodada criada",
          description: "A rodada foi criada com sucesso."
        });
      }
      
      setIsModalOpen(false);
      await loadRodadas();
    } catch (error: unknown) {
      toast({
        title: "Erro ao salvar rodada",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    }
  };

  const handleStartDrawing = async (rodada: RodadaSorteio) => {
    try {
      setSelectedRodada(rodada);
      setShowDrawing(true);
      toast({
        title: 'Link de transmissão criado',
        description: `${window.location.origin}/sorteio-live/${rodada.id}`,
      });

      const isRifa = sorteioAtivo?.tipo === 'rifa';

      // Fetch fresh validated cartelas
      let freshValidadas: CartelaValidada[] = cartelasValidadas;
      try {
        const validadasResult = await callApi('getCartelasValidadas', { sorteio_id: sorteioAtivo.id });
        freshValidadas = validadasResult.data || [];
      } catch (err) {
        console.error('Error fetching validated cartelas, using cached data:', err);
      }

      let cardsWithGrade: ValidatedCartelaComGrade[] = [];
      try {
        const cardsResult = await callApi('getCartelasValidadasComGrade', { sorteio_id: sorteioAtivo.id });
        cardsWithGrade = cardsResult.data || [];
      } catch (err) {
        console.error('Error fetching validated grids:', err);
      }
      setValidatedCardsWithGrade(cardsWithGrade);

      let poolNumbers: number[];
      if (isRifa) {
        // For rifa: pool is the validated cartela numbers (ticket numbers)
        poolNumbers = freshValidadas
          .map((cv: CartelaValidada) => cv.numero)
          .filter(n => n >= rodada.range_start && n <= rodada.range_end)
          .sort((a, b) => a - b);
      } else {
        // Build available numbers from validated cartelas' grids only
        if (cardsWithGrade.length > 0) {
          const allNums = new Set<number>(
            cardsWithGrade.flatMap(c => c.numeros_grade.flatMap(grid => grid.filter(n => n !== 0)))
          );
          poolNumbers = Array.from(allNums).filter(n => n >= rodada.range_start && n <= rodada.range_end).sort((a, b) => a - b);
        } else {
          // Fallback to full range if no validated cartelas with grids found
          poolNumbers = [];
          for (let i = rodada.range_start; i <= rodada.range_end; i++) {
            poolNumbers.push(i);
          }
        }
      }
      setAvailableNumbers(poolNumbers);
      
      // Load history for this rodada
      const historyResult = await callApi('getRodadaHistorico', { rodada_id: rodada.id });
      
      if (historyResult.data && historyResult.data.length > 0) {
        const sortedHistory = (historyResult.data as Array<{ ordem: number; numero_sorteado: number }>).sort((a, b) => a.ordem - b.ordem);
        const numbers = sortedHistory.map((item) => item.numero_sorteado);
        setDrawnNumbers(numbers);
        
        if (numbers.length > 0) {
          setCurrentNumber(numbers[numbers.length - 1]);
        }
      } else {
        setDrawnNumbers([]);
        setCurrentNumber(null);
      }
    } catch (error: unknown) {
      console.error('Error loading rodada:', error);
      toast({
        title: "Erro ao carregar rodada",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    }
  };

  const copyStreamingUrl = async () => {
    if (!streamingUrl) return;
    try {
      await navigator.clipboard.writeText(streamingUrl);
      toast({ title: 'Link copiado' });
    } catch {
      toast({ title: 'Link de transmissão', description: streamingUrl });
    }
  };

  const saveDrawnNumber = async (numero: number, ordem: number) => {
    if (!selectedRodada) return;
    
    try {
      await callApi('saveRodadaNumero', {
        rodada_id: selectedRodada.id,
        numero_sorteado: numero,
        ordem: ordem
      });
    } catch (error: unknown) {
      console.error('Error saving drawn number:', error);
      toast({
        title: "Erro ao salvar número",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    }
  };

  const clearDrawHistory = async () => {
    if (!selectedRodada) return;
    
    try {
      await callApi('clearRodadaHistorico', { rodada_id: selectedRodada.id });
    } catch (error: unknown) {
      console.error('Error clearing draw history:', error);
      toast({
        title: "Erro ao limpar histórico",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
      if (cartelaSorteioIntervalRef.current) {
        clearInterval(cartelaSorteioIntervalRef.current);
      }
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await fullscreenRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen toggle error:', error);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const increaseFontSize = () => {
    if (isFullscreen) {
      setFullscreenFontSize(prev => Math.min(prev + 20, 600));
    } else {
      setFontSize(prev => Math.min(prev + 20, 500));
    }
  };

  const decreaseFontSize = () => {
    if (isFullscreen) {
      setFullscreenFontSize(prev => Math.max(prev - 20, 100));
    } else {
      setFontSize(prev => Math.max(prev - 20, 100));
    }
  };

  const drawNumber = () => {
    if (availableNumbers.length === 0) return;

    const remainingNumbers = availableNumbers.filter(n => !drawnNumbers.includes(n));
    
    if (remainingNumbers.length === 0) return;

    // Clear current number immediately when starting a new draw
    setCurrentNumber(null);
    setIsDrawing(true);
    setJustDrawn(false);

    let counter = 0;
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * remainingNumbers.length);
      setCurrentNumber(remainingNumbers[randomIndex]);
      counter++;

      if (counter > ANIMATION_CYCLES) {
        clearInterval(interval);
        animationIntervalRef.current = null;
        const finalIndex = Math.floor(Math.random() * remainingNumbers.length);
        const finalNumber = remainingNumbers[finalIndex];
        setCurrentNumber(finalNumber);
        
        const newDrawnNumbers = [...drawnNumbers, finalNumber];
        setDrawnNumbers(newDrawnNumbers);
        setIsDrawing(false);
        setJustDrawn(true);
        
        // Reset justDrawn after animation completes
        setTimeout(() => setJustDrawn(false), 1000);
        
        saveDrawnNumber(finalNumber, newDrawnNumbers.length);
      }
    }, ANIMATION_INTERVAL_MS);
    
    animationIntervalRef.current = interval;
  };

  const resetDraw = async () => {
    await clearDrawHistory();
    
    setCurrentNumber(null);
    setDrawnNumbers([]);
    setIsDrawing(false);
    setJustDrawn(false);
    setVencedoras([]);
    setGanhadoresPop([]);
    ganhadoresPopShownRef.current.clear();
    setCartelasSorteadasHistory([]);
  };

  const addManualNumber = async () => {
    const num = parseInt(manualNumberInput, 10);
    if (isNaN(num)) return;
    if (!selectedRodada) return;
    if (num < selectedRodada.range_start || num > selectedRodada.range_end) {
      toast({ title: 'Número fora da faixa', description: `O número deve estar entre ${selectedRodada.range_start} e ${selectedRodada.range_end}.`, variant: 'destructive' });
      return;
    }
    if (drawnNumbers.includes(num)) {
      toast({ title: 'Número já sorteado', description: `O número ${num} já foi chamado.`, variant: 'destructive' });
      return;
    }
    const newDrawnNumbers = [...drawnNumbers, num];
    setDrawnNumbers(newDrawnNumbers);
    setCurrentNumber(num);
    setManualNumberInput('');
    await saveDrawnNumber(num, newDrawnNumbers.length);
  };

  const removeDrawnNumber = async (num: number) => {
    if (!selectedRodada) return;
    try {
      await callApi('deleteRodadaNumero', { rodada_id: selectedRodada.id, numero_sorteado: num });
      const newDrawnNumbers = drawnNumbers.filter(n => n !== num);
      setDrawnNumbers(newDrawnNumbers);
      if (currentNumber === num) {
        setCurrentNumber(newDrawnNumbers.length > 0 ? newDrawnNumbers[newDrawnNumbers.length - 1] : null);
      }
    } catch (error: unknown) {
      toast({ title: 'Erro ao excluir número', description: (error instanceof Error ? error.message : 'Erro inesperado'), variant: 'destructive' });
    }
  };

  const handleSortearCartela = () => {
    if (cartelasValidadas.length === 0) return;
    setIsCartelaSorteioAnimating(true);
    setCartelaSorteioPreview(null);

    let counter = 0;
    cartelaSorteioIntervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * cartelasValidadas.length);
      setCartelaSorteioPreview(cartelasValidadas[randomIndex].numero);
      counter++;

      if (counter > ANIMATION_CYCLES) {
        clearInterval(cartelaSorteioIntervalRef.current!);
        cartelaSorteioIntervalRef.current = null;
        const finalIndex = Math.floor(Math.random() * cartelasValidadas.length);
        const finalCartela = cartelasValidadas[finalIndex];
        setCartelaSorteioPreview(finalCartela.numero);
        setCartelasSorteadasHistory(prev => [{ numero: finalCartela.numero, nome: finalCartela.comprador_nome }, ...prev]);
        setIsCartelaSorteioAnimating(false);
      }
    }, ANIMATION_INTERVAL_MS);
  };

  const handleOpenCartelaSorteioModal = () => {
    setCartelaSorteioPreview(null);
    setIsCartelaSorteioAnimating(false);
    setIsCartelaSorteioModalOpen(true);
  };

  const handleVerificarVencedor = async () => {
    if (!sorteioAtivo || drawnNumbers.length === 0) return;
    setIsVerifying(true);
    try {
      const result = await callApi('verificarVencedor', {
        sorteio_id: sorteioAtivo.id,
        numeros_sorteados: drawnNumbers,
      });
      const winners: number[] = result.data || [];
      setVencedoras(winners);
      if (winners.length === 0) {
        toast({ title: 'Nenhuma cartela completa ainda.' });
      }
    } catch (error: unknown) {
      toast({ title: 'Erro ao verificar vencedor', description: (error instanceof Error ? error.message : 'Erro inesperado'), variant: 'destructive' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCartelaClick = (numero: number, nome?: string) => {
    const cartela = validatedCardsWithGrade.find(c => c.numero === numero);
    if (!cartela || !cartela.numeros_grade || cartela.numeros_grade.length === 0) return;
    setSelectedCartelaModal({ numero, nome, grade: cartela.numeros_grade[0] });
  };

  const goBackToList = () => {
    setShowDrawing(false);
    setSelectedRodada(null);
    setCurrentNumber(null);
    setDrawnNumbers([]);
    setAvailableNumbers([]);
    setJustDrawn(false);
    setVencedoras([]);
    setGanhadoresPop([]);
    ganhadoresPopShownRef.current.clear();
    loadRodadas();
  };

  // Compute top-10 cartelas as an individual score ranking
  const topScoringCartelas = useMemo(() => {
    if (drawnNumbers.length === 0) return [];
    const isRifa = sorteioAtivo?.tipo === 'rifa';

    if (isRifa) {
      // For rifa: rank cartelas that match drawn numbers
      const drawnSet = new Set(drawnNumbers);
      const winners = cartelasValidadas.filter(cv => drawnSet.has(cv.numero));
      if (winners.length === 0) return [];
      return winners
        .map(cv => ({ numero: cv.numero, nome: cv.comprador_nome, score: 1 }))
        .sort((a, b) => a.numero - b.numero)
        .slice(0, 10);
    }

    const drawnSet = new Set(drawnNumbers);
    if (validatedCardsWithGrade.length === 0) return [];

    const scored: RankingCartela[] = validatedCardsWithGrade.map(c => {
      const allNums = c.numeros_grade.flatMap(g => g.filter(n => n !== 0));
      const score = allNums.filter(n => drawnSet.has(n)).length;
      return { numero: c.numero, score, nome: c.comprador_nome };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.numero - b.numero)
      .slice(0, 10);
  }, [drawnNumbers, validatedCardsWithGrade, cartelasValidadas, sorteioAtivo?.tipo]);

  // Group topScoringCartelas by score for display (score, cartelas: [{numero,nome}], count)
  const groupedTop = useMemo(() => {
    const groups = topScoringCartelas.reduce((acc, cur) => {
      const s = String(cur.score);
      if (!acc[s]) acc[s] = { score: cur.score, cartelas: [] };
      acc[s].cartelas.push({ numero: cur.numero, nome: cur.nome });
      return acc;
    }, {} as Record<string, { score: number; cartelas: { numero: number; nome?: string }[] }>);

    return Object.values(groups)
      .map(g => ({ score: g.score, cartelas: g.cartelas.sort((a, b) => a.numero - b.numero), count: g.cartelas.length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [topScoringCartelas]);

  useEffect(() => {
    const winnerEntries = topScoringCartelas.filter(entry => entry.score >= winningScore);
    if (winnerEntries.length > 0) {
      const newWinners = winnerEntries.filter(c => !ganhadoresPopShownRef.current.has(c.numero));
      if (newWinners.length > 0) {
        newWinners.forEach(c => ganhadoresPopShownRef.current.add(c.numero));
        const loteSize = sorteioAtivo?.tamanho_lote ?? LOTE_SIZE;
        setGanhadoresPop(winnerEntries.map(c => {
          const idx = cartelasValidadas.findIndex(cv => cv.numero === c.numero);
          return { numero: c.numero, nome: c.nome, lote: idx !== -1 ? Math.floor(idx / loteSize) + 1 : undefined };
        }));
      }
    }
  }, [topScoringCartelas, cartelasValidadas, winningScore, sorteioAtivo]);

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <Shuffle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Sortear</h2>
        <p className="text-muted-foreground">Selecione um sorteio para iniciar</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ativo':
        return <Play className="w-4 h-4" />;
      case 'concluido':
        return <CheckCircle className="w-4 h-4" />;
      case 'cancelado':
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'bg-blue-500/10 text-blue-500';
      case 'concluido':
        return 'bg-success/10 text-success';
      case 'cancelado':
        return 'bg-destructive/10 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Show drawing interface
  if (showDrawing && selectedRodada) {
    const remainingNumbers = availableNumbers.filter(n => !drawnNumbers.includes(n));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Button
                onClick={goBackToList}
                variant="ghost"
                size="sm"
                className="gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
            </div>
            <h2 className="text-3xl font-bold text-foreground">{selectedRodada.nome}</h2>
            <p className="text-muted-foreground mt-1">
              Faixa: {selectedRodada.range_start} a {selectedRodada.range_end} | Cartelas validadas: {cartelasValidadas.length} | Sorteados: {drawnNumbers.length} | Restantes: {remainingNumbers.length}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={copyStreamingUrl}
              size="lg"
              variant="outline"
              className="gap-2"
            >
              <Copy className="w-5 h-5" />
              Copiar link OBS
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="gap-2"
            >
              <a href={streamingUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="w-5 h-5" />
                Abrir transmissão
              </a>
            </Button>
            <Button
              onClick={drawNumber}
              disabled={isDrawing || remainingNumbers.length === 0}
              size="lg"
              className="gap-2"
            >
              <Shuffle className="w-5 h-5" />
              Sortear
            </Button>
            <Button
              onClick={handleVerificarVencedor}
              disabled={isDrawing || drawnNumbers.length === 0 || isVerifying}
              size="lg"
              variant="outline"
              className="gap-2"
            >
              {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              Verificar Vencedor
            </Button>
            <Button
              onClick={handleOpenCartelaSorteioModal}
              disabled={cartelasValidadas.length === 0}
              size="lg"
              variant="outline"
              className="gap-2"
            >
              <Ticket className="w-5 h-5" />
              Sortear Cartela
            </Button>
            <Button
              onClick={resetDraw}
              disabled={isDrawing || drawnNumbers.length === 0}
              variant="outline"
              size="lg"
              className="gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              Reiniciar
            </Button>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                value={manualNumberInput}
                onChange={(e) => setManualNumberInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addManualNumber(); }}
                placeholder="Nº manual"
                className="w-28 h-11"
                min={selectedRodada.range_start}
                max={selectedRodada.range_end}
                disabled={isDrawing}
              />
              <Button
                onClick={addManualNumber}
                disabled={isDrawing || !manualNumberInput}
                size="lg"
                variant="outline"
                className="gap-2"
                title="Adicionar número manualmente"
              >
                <Plus className="w-5 h-5" />
                Adicionar
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-6">
            <div className="grid grid-cols-1 gap-6">
          <div ref={fullscreenRef} className={cn(isFullscreen && "bg-background p-8 min-h-screen flex flex-col")}>
            <Card className="border-2 flex-1 flex flex-col relative z-0">
              <CardHeader className="flex flex-row items-center justify-between flex-shrink-0">
                <CardTitle>Número Sorteado</CardTitle>
                <div className="flex gap-2">
                  {isFullscreen && (
                    <>
                      <Button onClick={decreaseFontSize} variant="outline" size="icon" title="Diminuir tamanho">
                        <ZoomOut className="w-4 h-4" />
                      </Button>
                      <Button onClick={increaseFontSize} variant="outline" size="icon" title="Aumentar tamanho">
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {!isFullscreen && (
                    <>
                      <Button onClick={decreaseFontSize} variant="outline" size="icon" title="Diminuir tamanho">
                        <ZoomOut className="w-4 h-4" />
                      </Button>
                      <Button onClick={increaseFontSize} variant="outline" size="icon" title="Aumentar tamanho">
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    onClick={toggleFullscreen}
                    variant="outline"
                    size="icon"
                    title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-center flex-1 min-h-[400px]">
                  {currentNumber !== null ? (
                    <div
                      className={cn(
                        "font-black leading-none transition-all duration-300",
                        isDrawing 
                          ? "animate-pulse text-primary" 
                          : justDrawn
                            ? "text-primary animate-bingo-globe-emerge animate-bingo-globe-shine"
                            : "text-primary"
                      )}
                      style={{ fontSize: `${isFullscreen ? fullscreenFontSize + 'px' : fontSize + 'px'}` }}
                    >
                      {currentNumber}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Shuffle className="w-24 h-24 mx-auto mb-4 opacity-50" />
                      <p className="text-xl">Clique em "Sortear" para começar</p>
                    </div>
                  )}
                </div>
                
                {isFullscreen && (
                  <div className="mt-8 flex gap-6 flex-shrink-0 items-start">
                    <div className="flex-1 space-y-6">
                      <div className="flex flex-wrap justify-center gap-4 items-center">
                        <Button
                          onClick={drawNumber}
                          disabled={isDrawing || remainingNumbers.length === 0}
                          size="lg"
                          className="gap-2 text-xl px-12 py-8 h-auto"
                        >
                          <Shuffle className="w-8 h-8" />
                          Sortear Próximo
                        </Button>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number"
                            value={manualNumberInput}
                            onChange={(e) => setManualNumberInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addManualNumber(); }}
                            placeholder="Nº manual"
                            className="w-36 h-16 text-xl text-center"
                            min={selectedRodada.range_start}
                            max={selectedRodada.range_end}
                            disabled={isDrawing}
                          />
                          <Button
                            onClick={addManualNumber}
                            disabled={isDrawing || !manualNumberInput}
                            size="lg"
                            variant="outline"
                            className="gap-2 text-xl px-8 py-8 h-auto"
                            title="Adicionar número manualmente"
                          >
                            <Plus className="w-8 h-8" />
                            Adicionar
                          </Button>
                        </div>
                      </div>
                    
                      {drawnNumbers.length > 0 && (
                        <div className="bg-card rounded-lg p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-2xl font-bold">Números Sorteados</h3>
                            <span className="text-lg text-muted-foreground">
                              {drawnNumbers.length} / {availableNumbers.length}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 max-h-[200px] overflow-y-auto">
                            {drawnNumbers.map((num, index) => (
                              <div
                                key={num}
                                className={cn(
                                  "relative flex items-center justify-center w-20 h-20 rounded-lg font-bold text-2xl border-2 transition-all duration-300",
                                  num === currentNumber && !isDrawing
                                    ? "bg-primary text-primary-foreground border-primary scale-110"
                                    : "bg-muted text-foreground border-border"
                                )}
                              >
                                <span className="absolute top-1 left-1.5 text-[10px] font-normal opacity-50 leading-none">{index + 1}º</span>
                                {num}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Top 10 Sidebar in fullscreen */}
                    <div className="w-96 flex-shrink-0 bg-card rounded-lg p-6 border-2 border-yellow-400/50">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-bold flex items-center gap-2">
                          <Trophy className="w-6 h-6 text-yellow-500" />
                          Top 10 Cartelas
                        </h3>
                      </div>
                      {topScoringCartelas.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-center text-muted-foreground">
                          <div>
                            <Trophy className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>Comece a sortear para ver o ranking</p>
                          </div>
                        </div>
                      ) : (
                        <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                          {groupedTop.map((entry, idx) => (
                            <div key={`${entry.score}-${idx}`} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-lg font-bold text-muted-foreground w-6">{idx + 1}º</span>
                                <span className="text-lg font-semibold text-primary">{entry.score} pts</span>
                                <span className="ml-auto text-sm text-muted-foreground">{entry.count} cartela{entry.count !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {entry.cartelas.slice(0, 18).map((c) => (
                                  <button
                                    key={c.numero}
                                    onClick={() => handleCartelaClick(c.numero, c.nome)}
                                    aria-label={`Ver números da cartela ${c.numero.toString().padStart(3, '0')}${c.nome ? ` - ${c.nome}` : ''}`}
                                    className="px-2 py-1 rounded bg-muted text-foreground text-xs font-mono hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                                  >
                                    {c.numero.toString().padStart(3, '0')}
                                  </button>
                                ))}
                                {entry.count > 18 && <span className="text-xs text-muted-foreground">...</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Winner popup overlay - visible both in fullscreen and normal mode */}
            {ganhadoresPop.length > 0 && (
              <div className="fixed inset-0 flex items-center justify-center bg-black/75" style={{ zIndex: Z_INDEX_WINNER_POPUP }}>
                <div className="bg-card rounded-2xl p-10 text-center shadow-2xl max-w-lg w-full mx-4 border-4 border-yellow-400">
                  <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-4" />
                  <h2 className="text-4xl font-black mb-2">Temos um Ganhador! 🎉</h2>
                  <p className="text-muted-foreground mb-6">Cartela(s) com todos os números sorteados</p>
                  <div className="space-y-2 mb-8">
                    {ganhadoresPop.map(({ numero, nome, lote }) => (
                      <div key={numero} className="text-2xl font-bold text-primary">
                        Cartela {numero.toString().padStart(3, '0')}{nome ? ` - ${nome}` : ''}{lote !== undefined ? ` · Lote ${lote}` : ''}
                      </div>
                    ))}
                  </div>
                  <Button onClick={() => setGanhadoresPop([])} size="lg" className="gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {!isFullscreen && drawnNumbers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Números Sorteados</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {drawnNumbers.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {drawnNumbers.map((num, index) => (
                    <div
                      key={num}
                      className={cn(
                        "relative flex items-center justify-center w-16 h-16 rounded-lg font-bold text-xl border-2 transition-all duration-300 group",
                        num === currentNumber && !isDrawing
                          ? "bg-primary text-primary-foreground border-primary scale-110"
                          : "bg-muted text-foreground border-border"
                      )}
                    >
                      <span className="absolute top-0.5 left-1 text-[9px] font-normal opacity-50 leading-none">{index + 1}º</span>
                      {num}
                      <button
                        onClick={() => removeDrawnNumber(num)}
                        disabled={isDrawing}
                        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] leading-none shadow"
                        title={`Excluir número ${num}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="text-2xl font-bold">{availableNumbers.length}</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Sorteados</CardTitle>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="text-2xl font-bold text-primary">{drawnNumbers.length}</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Restantes</CardTitle>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{remainingNumbers.length}</div>
              </CardContent>
            </Card>
          </div>

          {cartelasSorteadasHistory.length > 0 && (
            <Card className="border-2 border-primary">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Ticket className="w-5 h-5" />
                  Cartelas Sorteadas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {cartelasSorteadasHistory.map((cartela, idx) => (
                    <div key={idx} className={cn("flex items-center gap-2 py-1.5 px-2 rounded", idx === 0 && "bg-primary/10")}>
                      <span className="text-xs text-muted-foreground w-5">{idx + 1}º</span>
                      <span className={cn("font-black text-primary", idx === 0 ? "text-2xl" : "text-base")}>
                        {cartela.numero.toString().padStart(3, '0')}
                      </span>
                      {cartela.nome && (
                        <span className="text-xs text-muted-foreground truncate">{cartela.nome}</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          </div>

          {/* RIGHT SIDEBAR - Top 10 always visible */}
          <div className="w-80 flex-shrink-0 space-y-4 flex flex-col">
            {/* Winner results - alert style */}
            {vencedoras.length > 0 && (
              <Card className="border-2 border-success bg-success/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-success flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Vencedora(s)!
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {vencedoras.map((num) => (
                      <div key={num} className="px-3 py-2 rounded-lg bg-success/10 border border-success text-success font-bold">
                        Cartela {num.toString().padStart(3, '0')}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Top 10 always visible */}
            <Card className="flex-1 flex flex-col border-2 border-yellow-400/50 bg-gradient-to-br from-yellow-50 to-transparent dark:from-yellow-950/20">
              <CardHeader className="pb-3 flex-shrink-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  Top 10 Cartelas
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Maiores pontuações</p>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden flex flex-col">
                {topScoringCartelas.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-center text-muted-foreground">
                    <div>
                      <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Comece a sortear para ver o ranking</p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border overflow-y-auto">
                    {groupedTop.map((entry, idx) => (
                      <div key={`${entry.score}-${idx}`} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-bold bg-primary/10 px-2 py-0.5 rounded text-primary w-6 text-center">{idx + 1}º</span>
                          <span className="text-sm font-semibold text-primary">{entry.score} pts</span>
                          <span className="ml-auto text-sm text-muted-foreground">{entry.count} cartela{entry.count !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {entry.cartelas.slice(0, 18).map(c => (
                            <button
                              key={c.numero}
                              onClick={() => handleCartelaClick(c.numero, c.nome)}
                              aria-label={`Ver números da cartela ${c.numero.toString().padStart(3, '0')}${c.nome ? ` - ${c.nome}` : ''}`}
                              className="px-2 py-1 rounded text-xs font-mono bg-muted hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                            >
                              {c.numero.toString().padStart(3, '0')}
                            </button>
                          ))}
                          {entry.count > 18 && <span className="text-xs text-muted-foreground">...</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

      {/* Sortear Cartela Modal */}
      <Dialog open={isCartelaSorteioModalOpen} onOpenChange={(open) => {
        if (!isCartelaSorteioAnimating) setIsCartelaSorteioModalOpen(open);
      }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5" />
              Sortear Cartela Aleatória
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <p className="text-sm text-muted-foreground text-center">
              Serão consideradas apenas as <span className="font-semibold text-foreground">{cartelasValidadas.length}</span> cartela(s) validada(s).
            </p>

            <div className="flex flex-col items-center justify-center min-h-[140px]">
              {cartelaSorteioPreview !== null ? (
                <div className={cn(
                  "text-7xl font-black text-primary transition-all duration-150",
                  isCartelaSorteioAnimating && "animate-pulse"
                )}>
                  {cartelaSorteioPreview.toString().padStart(3, '0')}
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Ticket className="w-20 h-20 mx-auto mb-3 opacity-40" />
                  <p className="text-base">Clique em "Sortear" para começar</p>
                </div>
              )}
              {!isCartelaSorteioAnimating && cartelaSorteioPreview !== null && (() => {
                const cv = cartelasValidadas.find(c => c.numero === cartelaSorteioPreview);
                return cv?.comprador_nome ? (
                  <p className="mt-2 text-sm text-muted-foreground">{cv.comprador_nome}</p>
                ) : null;
              })()}
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={handleSortearCartela}
                disabled={isCartelaSorteioAnimating || cartelasValidadas.length === 0}
                className="flex-1 gap-2"
              >
                {isCartelaSorteioAnimating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shuffle className="w-4 h-4" />
                )}
                Sortear
              </Button>
              {cartelasSorteadasHistory.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => { setCartelasSorteadasHistory([]); setCartelaSorteioPreview(null); }}
                  disabled={isCartelaSorteioAnimating}
                  className="gap-2"
                  title="Reiniciar histórico para que as mesmas cartelas possam participar novamente"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reiniciar
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setIsCartelaSorteioModalOpen(false)}
                disabled={isCartelaSorteioAnimating}
                className="flex-1"
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cartela numbers modal */}
      <Dialog open={selectedCartelaModal !== null} onOpenChange={() => setSelectedCartelaModal(null)}>
        <DialogContent className="max-w-sm" container={isFullscreen ? fullscreenRef.current : undefined}>
          <DialogHeader>
            <DialogTitle>
              Cartela {selectedCartelaModal?.numero.toString().padStart(3, '0')}
              {selectedCartelaModal?.nome ? ` - ${selectedCartelaModal.nome}` : ''}
            </DialogTitle>
          </DialogHeader>
          {selectedCartelaModal && (
            <div className="grid grid-cols-5 gap-2 mt-2">
              {selectedCartelaModal.grade.map((num, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-center w-full aspect-square rounded font-bold text-sm border-2",
                    num === 0
                      ? "bg-muted/50 text-muted-foreground border-muted"
                      : drawnNumbers.includes(num)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border"
                  )}
                >
                  {num !== 0 ? num : '★'}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    );
  }

  // Show rodadas list
  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shuffle className="w-6 h-6" />
          Sortear - {sorteioAtivo.nome}
        </h2>
        <div className="flex gap-2">
          <Button onClick={handleNewRodada} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Rodada
          </Button>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          {isLoadingRodadas ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Carregando rodadas...</p>
            </div>
          ) : rodadas.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <Shuffle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Nenhuma rodada encontrada
              </h3>
              <p className="text-muted-foreground mb-6">
                Crie sua primeira rodada para começar a sortear
              </p>
              <Button onClick={handleNewRodada} className="gap-2">
                <Plus className="w-4 h-4" />
                Criar Primeira Rodada
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rodadas.map((rodada) => (
                <div
                  key={rodada.id}
                  className="bg-card rounded-xl border border-border p-6 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-foreground mb-1">
                        {rodada.nome}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className={cn('px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1', getStatusColor(rodada.status))}>
                          {getStatusIcon(rodada.status)}
                          {rodada.status === 'ativo' ? 'Ativo' : rodada.status === 'concluido' ? 'Concluído' : 'Cancelado'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Faixa:</span>
                      <span className="font-semibold text-foreground">{rodada.range_start} - {rodada.range_end}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total de números:</span>
                      <span className="font-semibold text-foreground">{rodada.range_end - rodada.range_start + 1}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sorteados:</span>
                      <span className="font-semibold text-primary">{rodada.numeros_sorteados || 0}</span>
                    </div>
                    {rodada.created_at && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Criado em:</span>
                        <span className="text-foreground">{formatarData(rodada.created_at)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleStartDrawing(rodada)}
                      className="flex-1 gap-2"
                      size="sm"
                    >
                      <Play className="w-4 h-4" />
                      Sortear
                    </Button>
                    <Button
                      onClick={() => handleEditRodada(rodada)}
                      variant="outline"
                      size="sm"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => handleDeleteRodada(rodada.id)}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shuffle className="w-5 h-5" />
              {editingRodada ? 'Editar Rodada' : 'Nova Rodada'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmitRodada} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da Rodada *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Rodada 1, Rodada da Noite, etc."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="range_start">Número Inicial *</Label>
                <Input
                  id="range_start"
                  type="number"
                  value={formData.range_start}
                  onChange={(e) => setFormData({ ...formData, range_start: e.target.value })}
                  min="1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="range_end">Número Final *</Label>
                <Input
                  id="range_end"
                  type="number"
                  value={formData.range_end}
                  onChange={(e) => setFormData({ ...formData, range_end: e.target.value })}
                  min="2"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value: 'ativo' | 'concluido' | 'cancelado') => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Total de números: <span className="font-bold text-foreground">
                  {(() => {
                    const start = parseInt(formData.range_start || '0');
                    const end = parseInt(formData.range_end || '0');
                    const total = end - start + 1;
                    return total > 0 ? total : 0;
                  })()}
                </span>
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" className="flex-1">
                {editingRodada ? 'Salvar' : 'Criar'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Rodada</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta rodada? Esta ação não pode ser desfeita.
              Todo o histórico de números sorteados desta rodada será perdido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sortear Cartela Modal */}
      <Dialog open={isCartelaSorteioModalOpen} onOpenChange={(open) => {
        if (!isCartelaSorteioAnimating) setIsCartelaSorteioModalOpen(open);
      }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5" />
              Sortear Cartela Aleatória
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <p className="text-sm text-muted-foreground text-center">
              Serão consideradas apenas as <span className="font-semibold text-foreground">{cartelasValidadas.length}</span> cartela(s) validada(s).
            </p>

            <div className="flex flex-col items-center justify-center min-h-[140px]">
              {cartelaSorteioPreview !== null ? (
                <div className={cn(
                  "text-7xl font-black text-primary transition-all duration-150",
                  isCartelaSorteioAnimating && "animate-pulse"
                )}>
                  {cartelaSorteioPreview.toString().padStart(3, '0')}
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Ticket className="w-20 h-20 mx-auto mb-3 opacity-40" />
                  <p className="text-base">Clique em "Sortear" para começar</p>
                </div>
              )}
              {!isCartelaSorteioAnimating && cartelaSorteioPreview !== null && (() => {
                const cv = cartelasValidadas.find(c => c.numero === cartelaSorteioPreview);
                return cv?.comprador_nome ? (
                  <p className="mt-2 text-sm text-muted-foreground">{cv.comprador_nome}</p>
                ) : null;
              })()}
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={handleSortearCartela}
                disabled={isCartelaSorteioAnimating || cartelasValidadas.length === 0}
                className="flex-1 gap-2"
              >
                {isCartelaSorteioAnimating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shuffle className="w-4 h-4" />
                )}
                Sortear
              </Button>
              {cartelasSorteadasHistory.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => { setCartelasSorteadasHistory([]); setCartelaSorteioPreview(null); }}
                  disabled={isCartelaSorteioAnimating}
                  className="gap-2"
                  title="Reiniciar histórico para que as mesmas cartelas possam participar novamente"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reiniciar
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setIsCartelaSorteioModalOpen(false)}
                disabled={isCartelaSorteioAnimating}
                className="flex-1"
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DrawTab;
