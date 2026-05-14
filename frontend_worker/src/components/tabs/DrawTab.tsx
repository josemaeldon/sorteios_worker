import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { getOfflineAppState, getOfflineQueue, isOfflineModeEnabled, patchOfflineAppState } from '@/lib/offlineMode';
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

const chunkFlatGrid = (flat: number[], columns: number): number[][] => {
  if (!Array.isArray(flat) || flat.length === 0 || columns <= 0) return [];
  const rows: number[][] = [];
  for (let i = 0; i < flat.length; i += columns) {
    rows.push(flat.slice(i, i + columns));
  }
  return rows.filter((row) => row.length > 0);
};

const extractGradeMatrices = (raw: unknown, columns = 5, rows = 5): number[][][] => {
  if (!raw) return [];
  const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
  if (!Array.isArray(parsed) || parsed.length === 0) return [];
  const toNumbers = (value: unknown): number[] => Array.isArray(value)
    ? value.map((n) => Number(n)).filter((n) => !Number.isNaN(n))
    : [];

  const parsedArray = parsed as unknown[];
  if (!Array.isArray(parsedArray[0])) {
    const flat = parsedArray.map((n) => Number(n)).filter((n) => !Number.isNaN(n));
    return flat.length > 0 ? [chunkFlatGrid(flat, columns || rows || 5)] : [];
  }

  const looksLikeMatrix = parsedArray.length === rows && parsedArray.every((row) => Array.isArray(row) && toNumbers(row).length <= columns);
  if (looksLikeMatrix) {
    const matrix = parsedArray.map((row) => toNumbers(row)).filter((row) => row.length > 0);
    return matrix.length > 0 ? [matrix] : [];
  }

  return parsedArray
    .map((grid) => {
      const numbers = toNumbers(grid);
      if (numbers.length === 0) return [];
      if (numbers.length === rows * columns) return chunkFlatGrid(numbers, columns);
      if (numbers.length <= columns) return [numbers];
      return chunkFlatGrid(numbers, columns);
    })
    .filter((grid) => Array.isArray(grid) && grid.length > 0) as number[][][];
};

const isQuinaWinner = (grade: number[][], drawnSet: Set<number>, expectedRows: number, expectedCols: number): boolean => {
  if (!Array.isArray(grade) || grade.length === 0) return false;
  const rows = grade.filter(Array.isArray) as number[][];
  if (rows.length === 0) return false;
  const maxCols = Math.max(...rows.map((row) => row.length), 0);
  if (maxCols === 0) return false;

  for (const row of rows) {
    const filled = row.filter((n) => Number(n) > 0);
    if (rows.length === expectedRows && filled.length === expectedCols && filled.every((n) => drawnSet.has(Number(n)))) {
      return true;
    }
  }

  for (let colIndex = 0; colIndex < maxCols; colIndex++) {
    const column = rows
      .map((row) => row[colIndex])
      .filter((n) => Number(n) > 0);
    if (rows.length === expectedRows && column.length === expectedRows && column.every((n) => drawnSet.has(Number(n)))) {
      return true;
    }
  }

  return false;
};

const isOfflineQueued = (result: unknown): boolean =>
  !!(result && typeof result === 'object' && 'offlineQueued' in result && (result as { offlineQueued?: boolean }).offlineQueued);

const makeTempId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const DrawTab: React.FC = () => {
  const { sorteioAtivo, cartelasValidadas, cartelasComGrade, loadCartelasValidadas } = useBingo();
  const { toast } = useToast();
  const drawTabSnapshot = (getOfflineAppState().bingo?.drawTab || {}) as Record<string, unknown>;
  const shouldHydrateOfflineState = isOfflineModeEnabled() || getOfflineQueue().length > 0;
  const gridColumns = sorteioAtivo?.grade_colunas ?? 5;
  const gridRows = sorteioAtivo?.grade_linhas ?? 5;

  // Rodadas state
  const [rodadas, setRodadas] = useState<RodadaSorteio[]>(shouldHydrateOfflineState ? ((drawTabSnapshot.rodadas as RodadaSorteio[]) || []) : []);
  const [isLoadingRodadas, setIsLoadingRodadas] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRodada, setEditingRodada] = useState<RodadaSorteio | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRodadaId, setDeletingRodadaId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    range_start: '1',
    range_end: '75',
    tipo_vitoria: 'bingo' as 'bingo' | 'quina',
    status: 'ativo' as 'ativo' | 'concluido' | 'cancelado'
  });
  
  // Drawing state
  const [currentNumber, setCurrentNumber] = useState<number | null>(shouldHydrateOfflineState ? ((drawTabSnapshot.currentNumber as number | null) ?? null) : null);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>(shouldHydrateOfflineState ? ((drawTabSnapshot.drawnNumbers as number[]) || []) : []);
  const [isDrawing, setIsDrawing] = useState<boolean>(shouldHydrateOfflineState ? !!drawTabSnapshot.isDrawing : false);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>(shouldHydrateOfflineState ? ((drawTabSnapshot.availableNumbers as number[]) || []) : []);
  const [fontSize, setFontSize] = useState<number>(300);
  const [fullscreenFontSize, setFullscreenFontSize] = useState<number>(FULLSCREEN_FONT_SIZE_DEFAULT);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDrawnHistoryFullscreen, setIsDrawnHistoryFullscreen] = useState(false);
  const [selectedRodada, setSelectedRodada] = useState<RodadaSorteio | null>(shouldHydrateOfflineState ? ((drawTabSnapshot.selectedRodada as RodadaSorteio | null) || null) : null);
  const [showDrawing, setShowDrawing] = useState(shouldHydrateOfflineState ? !!drawTabSnapshot.showDrawing : false);
  const [justDrawn, setJustDrawn] = useState(shouldHydrateOfflineState ? !!drawTabSnapshot.justDrawn : false);
  const [vencedoras, setVencedoras] = useState<number[]>(shouldHydrateOfflineState ? ((drawTabSnapshot.vencedoras as number[]) || []) : []);
  const [isVerifying, setIsVerifying] = useState<boolean>(shouldHydrateOfflineState ? !!drawTabSnapshot.isVerifying : false);
  const [selectedCartelaModal, setSelectedCartelaModal] = useState<{ numero: number; nome?: string; grade: number[][] } | null>(null);
  const [ganhadoresPop, setGanhadoresPop] = useState<{ numero: number; nome?: string; lote?: number }[]>(shouldHydrateOfflineState ? ((drawTabSnapshot.ganhadoresPop as { numero: number; nome?: string; lote?: number }[]) || []) : []);
  const [manualNumberInput, setManualNumberInput] = useState(shouldHydrateOfflineState ? ((drawTabSnapshot.manualNumberInput as string) || '') : '');
  const [cardsWithGrade, setCardsWithGrade] = useState<ValidatedCartelaComGrade[]>(shouldHydrateOfflineState ? ((drawTabSnapshot.cardsWithGrade as ValidatedCartelaComGrade[]) || []) : []);
  const [isQrCodeModalOpen, setIsQrCodeModalOpen] = useState(shouldHydrateOfflineState ? !!drawTabSnapshot.isQrCodeModalOpen : false);

  // Random cartela raffle state
  const [isCartelaSorteioModalOpen, setIsCartelaSorteioModalOpen] = useState(shouldHydrateOfflineState ? !!drawTabSnapshot.isCartelaSorteioModalOpen : false);
  const [cartelasSorteadasHistory, setCartelasSorteadasHistory] = useState<{ numero: number; nome?: string }[]>(shouldHydrateOfflineState ? ((drawTabSnapshot.cartelasSorteadasHistory as { numero: number; nome?: string }[]) || []) : []);
  const [isCartelaSorteioAnimating, setIsCartelaSorteioAnimating] = useState(shouldHydrateOfflineState ? !!drawTabSnapshot.isCartelaSorteioAnimating : false);
  const [cartelaSorteioPreview, setCartelaSorteioPreview] = useState<number | null>(shouldHydrateOfflineState ? ((drawTabSnapshot.cartelaSorteioPreview as number | null) ?? null) : null);
  const cartelaSorteioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const ganhadoresPopShownRef = useRef<Set<number>>(new Set());
  const selectedRodadaRef = useRef<RodadaSorteio | null>(selectedRodada);
  const sorteioAtivoIdRef = useRef<string | null>(sorteioAtivo?.id ?? null);
  const streamingUrl = selectedRodada
    ? `${window.location.origin}/sorteio-live/${selectedRodada.id}`
    : '';

  useEffect(() => {
    selectedRodadaRef.current = selectedRodada;
  }, [selectedRodada]);

  useEffect(() => {
    sorteioAtivoIdRef.current = sorteioAtivo?.id ?? null;
  }, [sorteioAtivo?.id]);

  const persistDrawTabState = useCallback((patch: Record<string, unknown>) => {
    const currentBingo = (getOfflineAppState().bingo || {}) as Record<string, unknown>;
    const currentDrawTab = (currentBingo.drawTab || {}) as Record<string, unknown>;
    patchOfflineAppState({
      bingo: {
        ...currentBingo,
        drawTab: {
          ...currentDrawTab,
          ...patch,
          sorteioId: selectedRodadaRef.current?.sorteio_id || sorteioAtivoIdRef.current || currentDrawTab.sorteioId || null,
        },
      },
    });
  }, []);

  const resetDrawTabState = useCallback(() => {
    setSelectedRodada(null);
    setShowDrawing(false);
    setCurrentNumber(null);
    setDrawnNumbers([]);
    setIsDrawing(false);
    setJustDrawn(false);
    setVencedoras([]);
    setGanhadoresPop([]);
    setManualNumberInput('');
    setCardsWithGrade([]);
    setIsQrCodeModalOpen(false);
    setIsCartelaSorteioModalOpen(false);
    setCartelasSorteadasHistory([]);
    setIsCartelaSorteioAnimating(false);
    setCartelaSorteioPreview(null);
    setAvailableNumbers([]);
    persistDrawTabState({
      selectedRodada: null,
      showDrawing: false,
      currentNumber: null,
      drawnNumbers: [],
      isDrawing: false,
      justDrawn: false,
      vencedoras: [],
      ganhadoresPop: [],
      manualNumberInput: '',
      cardsWithGrade: [],
      isQrCodeModalOpen: false,
      isCartelaSorteioModalOpen: false,
      cartelasSorteadasHistory: [],
      isCartelaSorteioAnimating: false,
      cartelaSorteioPreview: null,
      availableNumbers: [],
      sorteioId: null,
    });
  }, [persistDrawTabState]);

  useEffect(() => {
    const currentBingo = (getOfflineAppState().bingo || {}) as Record<string, unknown>;
    persistDrawTabState({
      rodadas,
      selectedRodada,
      showDrawing,
      currentNumber,
      drawnNumbers,
      isDrawing,
      availableNumbers,
      justDrawn,
      vencedoras,
      isVerifying,
      ganhadoresPop,
      manualNumberInput,
      cardsWithGrade,
      isQrCodeModalOpen,
      isCartelaSorteioModalOpen,
      cartelasSorteadasHistory,
      isCartelaSorteioAnimating,
      cartelaSorteioPreview,
    });
    patchOfflineAppState({
      bingo: {
        ...currentBingo,
        cartelasComGrade: cardsWithGrade,
      },
    });
  }, [
    persistDrawTabState,
    cardsWithGrade,
    rodadas,
    selectedRodada,
    showDrawing,
    currentNumber,
    drawnNumbers,
    isDrawing,
    availableNumbers,
    justDrawn,
    vencedoras,
    isVerifying,
    ganhadoresPop,
    manualNumberInput,
    cardsWithGrade,
    isQrCodeModalOpen,
    isCartelaSorteioModalOpen,
    cartelasSorteadasHistory,
    isCartelaSorteioAnimating,
    cartelaSorteioPreview,
  ]);

  useEffect(() => {
    if (!sorteioAtivo) return;

    const offlineDrawTab = (getOfflineAppState().bingo?.drawTab || {}) as Record<string, unknown>;
    const snapshotSorteioId = offlineDrawTab.sorteioId as string | undefined;
    const matchesSnapshot = shouldHydrateOfflineState && (!snapshotSorteioId || snapshotSorteioId === sorteioAtivo.id);

    if (matchesSnapshot) {
      if (Array.isArray(offlineDrawTab.rodadas)) {
        setRodadas((offlineDrawTab.rodadas as RodadaSorteio[]).filter((rodada) => rodada.sorteio_id === sorteioAtivo.id));
      }
      if (offlineDrawTab.selectedRodada) setSelectedRodada(offlineDrawTab.selectedRodada as RodadaSorteio);
      if (typeof offlineDrawTab.showDrawing === 'boolean') setShowDrawing(offlineDrawTab.showDrawing);
      if (typeof offlineDrawTab.currentNumber === 'number' || offlineDrawTab.currentNumber === null) setCurrentNumber(offlineDrawTab.currentNumber as number | null);
      if (Array.isArray(offlineDrawTab.drawnNumbers)) setDrawnNumbers(offlineDrawTab.drawnNumbers as number[]);
      if (Array.isArray(offlineDrawTab.availableNumbers)) setAvailableNumbers(offlineDrawTab.availableNumbers as number[]);
      if (typeof offlineDrawTab.isDrawing === 'boolean') setIsDrawing(offlineDrawTab.isDrawing);
      if (typeof offlineDrawTab.justDrawn === 'boolean') setJustDrawn(offlineDrawTab.justDrawn);
      if (Array.isArray(offlineDrawTab.vencedoras)) setVencedoras(offlineDrawTab.vencedoras as number[]);
      if (typeof offlineDrawTab.isVerifying === 'boolean') setIsVerifying(offlineDrawTab.isVerifying);
      if (Array.isArray(offlineDrawTab.ganhadoresPop)) setGanhadoresPop(offlineDrawTab.ganhadoresPop as { numero: number; nome?: string; lote?: number }[]);
      if (typeof offlineDrawTab.manualNumberInput === 'string') setManualNumberInput(offlineDrawTab.manualNumberInput);
      if (Array.isArray(offlineDrawTab.cardsWithGrade)) setCardsWithGrade(offlineDrawTab.cardsWithGrade as ValidatedCartelaComGrade[]);
      if (typeof offlineDrawTab.isQrCodeModalOpen === 'boolean') setIsQrCodeModalOpen(offlineDrawTab.isQrCodeModalOpen);
      if (typeof offlineDrawTab.isCartelaSorteioModalOpen === 'boolean') setIsCartelaSorteioModalOpen(offlineDrawTab.isCartelaSorteioModalOpen);
      if (Array.isArray(offlineDrawTab.cartelasSorteadasHistory)) setCartelasSorteadasHistory(offlineDrawTab.cartelasSorteadasHistory as { numero: number; nome?: string }[]);
      if (typeof offlineDrawTab.isCartelaSorteioAnimating === 'boolean') setIsCartelaSorteioAnimating(offlineDrawTab.isCartelaSorteioAnimating);
      if (typeof offlineDrawTab.cartelaSorteioPreview === 'number' || offlineDrawTab.cartelaSorteioPreview === null) setCartelaSorteioPreview(offlineDrawTab.cartelaSorteioPreview as number | null);
    } else {
      resetDrawTabState();
    }

    void loadRodadas();
    void loadCartelasValidadas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorteioAtivo?.id, shouldHydrateOfflineState, resetDrawTabState]);

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
      tipo_vitoria: 'bingo',
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
      tipo_vitoria: (rodada.tipo_vitoria || 'bingo') as 'bingo' | 'quina',
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
      const result = await callApi('deleteRodada', { id: deletingRodadaId });
      if (isOfflineQueued(result)) {
        const nextRodadas = rodadas.filter((rodada) => rodada.id !== deletingRodadaId);
        setRodadas(nextRodadas);
        if (selectedRodada?.id === deletingRodadaId) {
          setShowDrawing(false);
          setSelectedRodada(null);
        }
        persistDrawTabState({
          rodadas: nextRodadas,
          selectedRodada: selectedRodada?.id === deletingRodadaId ? null : selectedRodada,
          showDrawing: selectedRodada?.id === deletingRodadaId ? false : showDrawing,
        });
      }
      toast({
        title: "Rodada excluída",
        description: "A rodada foi excluída com sucesso."
      });
      if (!isOfflineQueued(result)) {
        await loadRodadas();
      }
      
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
      let offlineQueued = false;
      if (editingRodada) {
        const result = await callApi('updateRodada', {
          id: editingRodada.id,
          nome: formData.nome,
          range_start,
          range_end,
          tipo_vitoria: formData.tipo_vitoria,
          status: formData.status
        });
        offlineQueued = isOfflineQueued(result);
        if (offlineQueued) {
          const updatedRodada: RodadaSorteio = {
            ...editingRodada,
            nome: formData.nome,
            range_start,
            range_end,
            tipo_vitoria: formData.tipo_vitoria,
            status: formData.status,
            updated_at: new Date().toISOString(),
          };
          const nextRodadas = rodadas.map((rodada) => rodada.id === editingRodada.id ? updatedRodada : rodada);
          setRodadas(nextRodadas);
          if (selectedRodada?.id === editingRodada.id) {
            setSelectedRodada(updatedRodada);
          }
          persistDrawTabState({
            rodadas: nextRodadas,
            selectedRodada: selectedRodada?.id === editingRodada.id ? updatedRodada : selectedRodada,
          });
        }
        toast({
          title: "Rodada atualizada",
          description: "A rodada foi atualizada com sucesso."
        });
      } else {
        const tempId = makeTempId();
        const result = await callApi('createRodada', {
          sorteio_id: sorteioAtivo.id,
          nome: formData.nome,
          range_start,
          range_end,
          tipo_vitoria: formData.tipo_vitoria,
          status: formData.status,
          client_temp_id: tempId,
        });
        offlineQueued = isOfflineQueued(result);
        if (offlineQueued) {
          const createdRodada: RodadaSorteio = {
            id: tempId,
            sorteio_id: sorteioAtivo.id,
            nome: formData.nome,
            range_start,
            range_end,
            tipo_vitoria: formData.tipo_vitoria,
            status: formData.status,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as RodadaSorteio;
          const nextRodadas = [...rodadas, createdRodada];
          setRodadas(nextRodadas);
          persistDrawTabState({ rodadas: nextRodadas });
        }
        toast({
          title: "Rodada criada",
          description: "A rodada foi criada com sucesso."
        });
      }
      
      setIsModalOpen(false);
      if (!offlineQueued) {
        await loadRodadas();
      }
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
      localStorage.removeItem('selectedRodadaId');

      // Fetch fresh validated cartelas
      let freshValidadas: CartelaValidada[] = cartelasValidadas;
      try {
        const validadasResult = await callApi('getCartelasValidadas', { sorteio_id: sorteioAtivo.id });
        freshValidadas = validadasResult.data || [];
      } catch (err) {
        console.error('Error fetching validated cartelas, using cached data:', err);
      }

      let loadedCardsWithGrade: ValidatedCartelaComGrade[] = [];
      const validatedNumbers = new Set(freshValidadas.map((cv: CartelaValidada) => cv.numero));

      const [validatedWithGradeSettled, allCardsSettled] = await Promise.allSettled([
        callApi('getCartelasValidadasComGrade', { sorteio_id: sorteioAtivo.id }),
        callApi('getCartelas', { sorteio_id: sorteioAtivo.id, include_grades: true }),
      ]);

      const validatedWithGradeData =
        validatedWithGradeSettled.status === 'fulfilled' ? (validatedWithGradeSettled.value.data || []) as ValidatedCartelaComGrade[] : [];
      const allCardsData =
        allCardsSettled.status === 'fulfilled' ? (allCardsSettled.value.data || []) as ValidatedCartelaComGrade[] : [];

      const mergedByNumero = new Map<number, ValidatedCartelaComGrade>();

      for (const card of validatedWithGradeData) {
        const matrices = extractGradeMatrices(card?.numeros_grade, gridColumns, gridRows);
        if (matrices.length > 0) {
          mergedByNumero.set(card.numero, { ...card, numeros_grade: matrices[0] });
        }
      }

      for (const card of allCardsData) {
        if (!validatedNumbers.has(card.numero)) continue;
        if (mergedByNumero.has(card.numero)) continue;
        const matrices = extractGradeMatrices(card?.numeros_grade, gridColumns, gridRows);
        if (matrices.length === 0) continue;
        mergedByNumero.set(card.numero, { ...card, numeros_grade: matrices[0] });
      }

      const missingValidated = freshValidadas.filter((cv) => !mergedByNumero.has(cv.numero));
      for (const cv of missingValidated) {
        try {
          const res = await callApi('getCartelaDetalhe', { sorteio_id: sorteioAtivo.id, numero: cv.numero });
          const matrices = extractGradeMatrices(res?.data?.numeros_grade, gridColumns, gridRows);
          if (matrices.length === 0) continue;
          mergedByNumero.set(cv.numero, {
            numero: cv.numero,
            comprador_nome: cv.comprador_nome || res?.data?.comprador_nome,
            numeros_grade: matrices[0],
          });
        } catch (_err) {
          // ignore individual cartela detail failure
        }
      }

      const persistedGradeCards = (cartelasComGrade as unknown as ValidatedCartelaComGrade[]) || [];
      for (const card of persistedGradeCards) {
        const matrices = extractGradeMatrices(card?.numeros_grade, gridColumns, gridRows);
        if (matrices.length === 0) continue;
        if (!mergedByNumero.has(card.numero)) {
          mergedByNumero.set(card.numero, { ...card, numeros_grade: matrices[0] });
        }
      }

      loadedCardsWithGrade = Array.from(mergedByNumero.values()).map((card) => ({
        ...card,
        comprador_nome: freshValidadas.find((cv: CartelaValidada) => cv.numero === card.numero)?.comprador_nome || card.comprador_nome,
      }));
      setCardsWithGrade(loadedCardsWithGrade);
      const poolNumbers: number[] = [];
      for (let i = rodada.range_start; i <= rodada.range_end; i++) {
        poolNumbers.push(i);
      }
      setAvailableNumbers(poolNumbers);

      // Load history for this rodada (não bloqueia a UI se falhar)
      try {
        const historyResult = await callApi('getRodadaHistorico', { rodada_id: rodada.id });
        if (historyResult.data && historyResult.data.length > 0) {
          const sortedHistory = (historyResult.data as Array<{ ordem: number; numero_sorteado: number }>).sort((a, b) => a.ordem - b.ordem);
          const numbers = sortedHistory.map((item) => item.numero_sorteado);
          setDrawnNumbers(numbers);
          if (numbers.length > 0) setCurrentNumber(numbers[numbers.length - 1]);
        } else {
          setDrawnNumbers([]);
          setCurrentNumber(null);
        }
      } catch {
        setDrawnNumbers([]);
        setCurrentNumber(null);
      }

      try {
        const cartelaHistory = await callApi('getRodadaCartelaHistorico', { rodada_id: rodada.id });
        setCartelasSorteadasHistory((cartelaHistory.data || []).map((item: { numero: number; comprador_nome?: string }) => ({
          numero: item.numero,
          nome: item.comprador_nome,
        })));
      } catch {
        setCartelasSorteadasHistory([]);
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

  useEffect(() => {
    if (!sorteioAtivo || showDrawing || isLoadingRodadas || rodadas.length === 0) return;

    const savedRodadaId = localStorage.getItem('selectedRodadaId');
    if (!savedRodadaId) return;

    const rodada = rodadas.find((r) => r.id === savedRodadaId);
    if (!rodada) return;

    void handleStartDrawing(rodada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodadas, sorteioAtivo?.id, showDrawing, isLoadingRodadas]);

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
        const target = fullscreenRef.current as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
        if (target?.requestFullscreen) {
          await target.requestFullscreen();
        } else if (target?.webkitRequestFullscreen) {
          await target.webkitRequestFullscreen();
        }
      } else {
        const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      }
    } catch (error) {
      console.error('Fullscreen toggle error:', error);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(!!document.fullscreenElement || !!doc.webkitFullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    };
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
        if (selectedRodada) {
          void callApi('saveRodadaCartelaHistorico', {
            rodada_id: selectedRodada.id,
            numero_cartela: finalCartela.numero,
            comprador_nome: finalCartela.comprador_nome || null,
          });
        }
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
        rodada_id: selectedRodada?.id,
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

  const rankingCardsWithGrade = useMemo<ValidatedCartelaComGrade[]>(() => {
    const validatedNumbers = new Set(cartelasValidadas.map((cv) => Number(cv.numero)));
    const source = cartelasComGrade.length > 0
      ? (cartelasComGrade as ValidatedCartelaComGrade[])
      : cardsWithGrade;

    return source
      .filter((card) => validatedNumbers.has(Number(card.numero)))
      .map((card) => {
        const matrices = extractGradeMatrices(card.numeros_grade, gridColumns, gridRows);
        return { ...card, numeros_grade: matrices[0] || [] };
      })
      .filter((card) => card.numeros_grade.length > 0);
  }, [cardsWithGrade, cartelasComGrade, cartelasValidadas, gridColumns, gridRows]);

  const handleCartelaClick = (numero: number, nome?: string) => {
    const cartela = rankingCardsWithGrade.find(c => c.numero === numero);
    if (!cartela || !cartela.numeros_grade || cartela.numeros_grade.length === 0) return;
    setSelectedCartelaModal({ numero, nome, grade: cartela.numeros_grade });
  };

  const getCartelaNome = (numero: number): string | undefined => {
    return rankingCardsWithGrade.find((card) => card.numero === numero)?.comprador_nome
      || cartelasValidadas.find((cv) => cv.numero === numero)?.comprador_nome;
  };

  const goBackToList = () => {
    setShowDrawing(false);
    setSelectedRodada(null);
    setCurrentNumber(null);
    setIsQrCodeModalOpen(false);
  };

  // Compute all scored cartelas; the UI groups them by score and shows the top 10 scores.
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
        .sort((a, b) => a.numero - b.numero);
    }

    const drawnSet = new Set(drawnNumbers);
    if (rankingCardsWithGrade.length === 0) return [];

    const scored: RankingCartela[] = rankingCardsWithGrade.map(c => {
      const grids = extractGradeMatrices(c.numeros_grade, gridColumns, gridRows);
      const allNums = [...new Set(grids.flatMap((grid) => grid.flatMap((row) => Array.isArray(row) ? row : [])).filter((n) => n !== 0))];
      const score = allNums.filter(n => drawnSet.has(n)).length;
      return { numero: c.numero, score, nome: c.comprador_nome };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.numero - b.numero);
  }, [drawnNumbers, rankingCardsWithGrade, cartelasValidadas, sorteioAtivo?.tipo, gridColumns, gridRows]);

  const winnerEntries = useMemo(() => {
    if (drawnNumbers.length === 0) return [];
    if (!selectedRodada) return [];
    const victoryMode = selectedRodada.tipo_vitoria || 'bingo';
    const drawnSet = new Set(drawnNumbers);

    if (sorteioAtivo?.tipo === 'rifa') {
      return cartelasValidadas
        .filter((cv) => drawnSet.has(cv.numero))
        .map((cv) => ({ numero: cv.numero, nome: cv.comprador_nome }));
    }

    return rankingCardsWithGrade
      .filter((card) => {
        const grids = extractGradeMatrices(card.numeros_grade, gridColumns, gridRows);
        if (grids.length === 0) return false;
        if (victoryMode === 'quina') {
          return grids.some((grid) => Array.isArray(grid) && isQuinaWinner(grid, drawnSet, gridRows, gridColumns));
        }
        return grids.some((grid) => {
          if (!Array.isArray(grid)) return false;
          const allNums = [...new Set(grid.filter((n) => Number(n) !== 0))];
          return allNums.length > 0 && allNums.every((n) => drawnSet.has(Number(n)));
        });
      })
      .map((card) => ({ numero: card.numero, nome: card.comprador_nome }));
  }, [drawnNumbers, rankingCardsWithGrade, selectedRodada, cartelasValidadas, sorteioAtivo?.tipo, gridColumns, gridRows]);

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
    if (winnerEntries.length > 0) {
      const newWinners = winnerEntries.filter((c) => !ganhadoresPopShownRef.current.has(c.numero));
      if (newWinners.length > 0) {
        newWinners.forEach((c) => ganhadoresPopShownRef.current.add(c.numero));
        const loteSize = sorteioAtivo?.tamanho_lote ?? LOTE_SIZE;
        setGanhadoresPop(winnerEntries.map((c) => {
          const idx = cartelasValidadas.findIndex((cv) => cv.numero === c.numero);
          return { numero: c.numero, nome: c.nome, lote: idx !== -1 ? Math.floor(idx / loteSize) + 1 : undefined };
        }));
      }
    }
  }, [winnerEntries, cartelasValidadas, sorteioAtivo]);

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
      <div className="space-y-6 w-full">
        <div className="flex items-center justify-between flex-wrap gap-4 w-full">
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
            <Button onClick={() => setIsQrCodeModalOpen(true)} size="lg" variant="outline" className="gap-2">
              <ExternalLink className="w-5 h-5" />
              QrCode
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

        <div className="flex flex-col xl:flex-row gap-6 items-start w-full">
          <div className="flex-1 min-w-0 space-y-6 w-full">
            <div className="grid grid-cols-1 gap-6">
          <div ref={fullscreenRef} className={cn(isFullscreen && "bg-background p-3 md:p-8 min-h-screen flex flex-col")}>
            <Card className="border-2 flex-1 flex flex-col relative z-0">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
                <CardTitle className="text-lg sm:text-xl">Número Sorteado</CardTitle>
                <div className="flex flex-wrap gap-2">
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
                <div className="flex items-center justify-center flex-1 min-h-[220px] sm:min-h-[320px]">
                  {currentNumber !== null ? (
                    <div
                      className={cn(
                        "font-black leading-none transition-all duration-300 text-center break-keep",
                        isDrawing 
                          ? "animate-pulse text-primary" 
                          : justDrawn
                            ? "text-primary animate-bingo-globe-emerge animate-bingo-globe-shine"
                            : "text-primary"
                      )}
                      style={{
                        fontSize: isFullscreen
                          ? `clamp(6rem, calc(20vw + ${fullscreenFontSize - FULLSCREEN_FONT_SIZE_DEFAULT}px), 600px)`
                          : `clamp(4rem, calc(18vw + ${fontSize - 300}px), 500px)`,
                      }}
                    >
                      {currentNumber}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground px-4">
                      <Shuffle className="w-16 h-16 sm:w-24 sm:h-24 mx-auto mb-4 opacity-50" />
                      <p className="text-base sm:text-xl">Clique em "Sortear" para começar</p>
                    </div>
                  )}
                </div>
                
                {isFullscreen && (
                  <div className="mt-8 flex flex-col xl:flex-row gap-6 flex-shrink-0 items-start w-full">
                    <div className="flex-1 space-y-6 w-full">
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
                        <div className="bg-card rounded-lg p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg sm:text-2xl font-bold">Números Sorteados</h3>
                            <span className="text-sm sm:text-lg text-muted-foreground">
                              {drawnNumbers.length} / {availableNumbers.length}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:gap-3 max-h-[200px] overflow-y-auto">
                            {drawnNumbers.map((num, index) => (
                              <div
                                key={num}
                                className={cn(
                                  "relative flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-lg font-bold text-base sm:text-xl md:text-2xl border-2 transition-all duration-300",
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
                    <div className="w-full xl:w-96 flex-shrink-0 bg-card rounded-lg p-4 md:p-6 border-2 border-yellow-400/50">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
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
                          {groupedTop.map((group, idx) => (
                            <div key={group.score} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-2xl font-bold text-muted-foreground/90 w-8">{idx + 1}º</span>
                                  <span className="text-3xl font-bold text-primary leading-none">{group.score} pts</span>
                                </div>
                                <span className="text-lg text-muted-foreground whitespace-nowrap">
                                  {group.count} {group.count === 1 ? 'cartela' : 'cartelas'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {group.cartelas.map((cartela) => (
                                  <button
                                    key={cartela.numero}
                                    onClick={() => handleCartelaClick(cartela.numero, cartela.nome)}
                                    aria-label={`Ver números da cartela ${cartela.numero.toString().padStart(3, '0')}${cartela.nome ? ` - ${cartela.nome}` : ''}`}
                                    className="px-2.5 py-1 rounded-md border border-border/70 bg-muted/70 text-foreground text-xs font-mono tracking-wide hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                                  >
                                    {cartela.numero.toString().padStart(3, '0')}
                                  </button>
                                ))}
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
                      <button
                        key={numero}
                        type="button"
                        onClick={() => handleCartelaClick(numero, nome)}
                        className="block w-full text-2xl font-bold text-primary hover:underline"
                      >
                        Cartela {numero.toString().padStart(3, '0')}{nome ? ` - ${nome}` : ''}{lote !== undefined ? ` · Lote ${lote}` : ''}
                      </button>
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



          {isDrawnHistoryFullscreen && (
            <div className="fixed inset-0 z-[9998] bg-background/95 backdrop-blur-sm p-4 md:p-8 overflow-auto">
              <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-4 md:mb-6">
                  <h3 className="text-2xl md:text-3xl font-bold">Números Sorteados</h3>
                  <Button variant="outline" onClick={() => setIsDrawnHistoryFullscreen(false)} className="gap-2">
                    <Minimize className="w-4 h-4" />
                    Fechar tela cheia
                  </Button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 md:gap-3">
                  {drawnNumbers.map((num, index) => (
                    <div
                      key={`fullscreen-${num}-${index}`}
                      className={cn(
                        "relative flex items-center justify-center h-20 md:h-24 rounded-lg font-bold text-2xl md:text-3xl border-2",
                        num === currentNumber && !isDrawing
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-foreground border-border"
                      )}
                    >
                      <span className="absolute top-1 left-1.5 text-[10px] md:text-xs opacity-60">{index + 1}º</span>
                      {num}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isFullscreen && drawnNumbers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>Números Sorteados</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-normal text-muted-foreground">{drawnNumbers.length}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => setIsDrawnHistoryFullscreen(true)}
                    >
                      <Maximize className="w-4 h-4" />
                    </Button>
                  </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
          <div className="w-full xl:w-80 flex-shrink-0 space-y-4 flex flex-col">
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
                <p className="text-xs text-muted-foreground mt-1">Pontuações em tempo real</p>
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
                    {groupedTop.map((group, idx) => (
                      <div key={group.score} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-muted-foreground/90 w-7">{idx + 1}º</span>
                            <span className="text-2xl font-bold text-primary leading-none">{group.score} pts</span>
                          </div>
                          <span className="text-base text-muted-foreground whitespace-nowrap">
                            {group.count} {group.count === 1 ? 'cartela' : 'cartelas'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.cartelas.map((cartela) => (
                            <button
                              key={cartela.numero}
                              onClick={() => handleCartelaClick(cartela.numero, cartela.nome)}
                              aria-label={`Ver números da cartela ${cartela.numero.toString().padStart(3, '0')}${cartela.nome ? ` - ${cartela.nome}` : ''}`}
                              className="px-2.5 py-1 rounded-md border border-border/70 text-xs font-mono tracking-wide bg-muted/70 hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                              title={cartela.nome ? `${cartela.numero} - ${cartela.nome}` : cartela.numero.toString()}
                            >
                              {cartela.numero.toString().padStart(3, '0')}
                            </button>
                          ))}
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
        <DialogContent className="w-[90vw] h-[90vh] max-w-[90vw] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5" />
              Sortear Cartela Aleatória
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 flex-1 flex flex-col">
            <p className="text-sm text-muted-foreground text-center">
              Serão consideradas apenas as <span className="font-semibold text-foreground">{cartelasValidadas.length}</span> cartela(s) validada(s).
            </p>

            <div className="flex flex-col items-center justify-center h-[80%] min-h-0">
              {cartelaSorteioPreview !== null ? (
                <div className={cn(
                  "font-black text-primary transition-all duration-150 leading-none",
                  isCartelaSorteioAnimating && "animate-pulse"
                )} style={{ fontSize: 'clamp(8rem, 40vh, 40vw)' }}>
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
                  onClick={async () => {
                    if (selectedRodada) await callApi('clearRodadaCartelaHistorico', { rodada_id: selectedRodada.id });
                    setCartelasSorteadasHistory([]);
                    setCartelaSorteioPreview(null);
                  }}
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
            <div className="grid gap-2 mt-2">
              {selectedCartelaModal.grade.map((row, rowIndex) => (
                <div key={rowIndex} className="grid grid-cols-5 gap-2">
                  {row.map((num, colIndex) => (
                    <div
                      key={`${rowIndex}-${colIndex}`}
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
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isQrCodeModalOpen} onOpenChange={setIsQrCodeModalOpen}>
        <DialogContent className="w-[85vw] h-[85vh] max-w-[85vw] p-4">
          <DialogHeader>
            <DialogTitle>QR Code da Transmissão</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=1400x1400&data=${encodeURIComponent(streamingUrl)}`}
              alt="QR Code da transmissão"
              className="w-[90%] h-[90%] object-contain rounded-md bg-white p-2"
            />
          </div>
          <div className="flex justify-center">
            <Button onClick={() => setIsQrCodeModalOpen(false)} size="lg">Fechar</Button>
          </div>
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
                      Abrir Rodada
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

            <div className="space-y-2">
              <Label htmlFor="tipo_vitoria">Tipo de vitória *</Label>
              <Select
                value={formData.tipo_vitoria}
                onValueChange={(value: 'bingo' | 'quina') => setFormData({ ...formData, tipo_vitoria: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bingo">Cartela cheia</SelectItem>
                  <SelectItem value="quina">Quina</SelectItem>
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
        <DialogContent className="w-[90vw] h-[90vh] max-w-[90vw] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5" />
              Sortear Cartela Aleatória
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 flex-1 flex flex-col">
            <p className="text-sm text-muted-foreground text-center">
              Serão consideradas apenas as <span className="font-semibold text-foreground">{cartelasValidadas.length}</span> cartela(s) validada(s).
            </p>

            <div className="flex flex-col items-center justify-center h-[80%] min-h-0">
              {cartelaSorteioPreview !== null ? (
                <div className={cn(
                  "font-black text-primary transition-all duration-150 leading-none",
                  isCartelaSorteioAnimating && "animate-pulse"
                )} style={{ fontSize: 'clamp(8rem, 40vh, 40vw)' }}>
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
                  onClick={async () => {
                    if (selectedRodada) await callApi('clearRodadaCartelaHistorico', { rodada_id: selectedRodada.id });
                    setCartelasSorteadasHistory([]);
                    setCartelaSorteioPreview(null);
                  }}
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
