import React, { useState, useEffect, useRef } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { RodadaSorteio } from '@/types/bingo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shuffle, RotateCcw, Play, Settings, Maximize, Minimize, ZoomIn, ZoomOut, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { callApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

// Animation constants
const ANIMATION_CYCLES = 20;
const ANIMATION_INTERVAL_MS = 100;
const FULLSCREEN_FONT_SIZE_DEFAULT = 300; // Default font size in pixels for fullscreen display

const DrawTab: React.FC = () => {
  const { sorteioAtivo, setCurrentTab } = useBingo();
  const { toast } = useToast();
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>([]);
  const [fontSize, setFontSize] = useState<number>(300);
  const [fullscreenFontSize, setFullscreenFontSize] = useState<number>(FULLSCREEN_FONT_SIZE_DEFAULT);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedRodada, setSelectedRodada] = useState<RodadaSorteio | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  // Load rodada from localStorage or load history
  useEffect(() => {
    if (sorteioAtivo) {
      const savedRodadaId = localStorage.getItem('selectedRodadaId');
      if (savedRodadaId) {
        loadRodada(savedRodadaId);
      } else {
        // Reset state when no rodada is selected
        setSelectedRodada(null);
        setCurrentNumber(null);
        setDrawnNumbers([]);
        setAvailableNumbers([]);
      }
    } else {
      // Reset state when no sorteio is active
      setSelectedRodada(null);
      setCurrentNumber(null);
      setDrawnNumbers([]);
      setAvailableNumbers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorteioAtivo?.id]);

  const loadRodada = async (rodadaId: string) => {
    try {
      setIsLoadingHistory(true);
      
      // Load rodada details
      const rodadasResult = await callApi('getRodadas', { sorteio_id: sorteioAtivo?.id });
      const rodada = rodadasResult.data?.find((r: RodadaSorteio) => r.id === rodadaId);
      
      if (!rodada) {
        toast({
          title: "Rodada não encontrada",
          description: "A rodada selecionada não existe mais.",
          variant: "destructive"
        });
        localStorage.removeItem('selectedRodadaId');
        return;
      }
      
      setSelectedRodada(rodada);
      
      // Generate available numbers from rodada range
      const allNumbers: number[] = [];
      for (let i = rodada.range_start; i <= rodada.range_end; i++) {
        allNumbers.push(i);
      }
      setAvailableNumbers(allNumbers);
      
      // Load history for this rodada
      const historyResult = await callApi('getRodadaHistorico', { rodada_id: rodadaId });
      
      if (historyResult.data && historyResult.data.length > 0) {
        const sortedHistory = (historyResult.data as Array<{ ordem: number; numero_sorteado: number }>).sort((a, b) => a.ordem - b.ordem);
        const numbers = sortedHistory.map((item) => item.numero_sorteado);
        setDrawnNumbers(numbers);
        
        if (numbers.length > 0) {
          setCurrentNumber(numbers[numbers.length - 1]);
        }
      }
    } catch (error: unknown) {
      console.error('Error loading rodada:', error);
      toast({
        title: "Erro ao carregar rodada",
        description: (error instanceof Error ? error.message : 'Erro inesperado'),
        variant: "destructive"
      });
    } finally {
      setIsLoadingHistory(false);
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

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, []);

  // Fullscreen handlers
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

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <Shuffle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Sortear</h2>
        <p className="text-muted-foreground">Selecione um sorteio para iniciar</p>
      </div>
    );
  }

  if (isLoadingHistory) {
    return (
      <div className="text-center py-12">
        <Shuffle className="w-16 h-16 mx-auto text-muted-foreground mb-4 animate-pulse" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Carregando...</h2>
        <p className="text-muted-foreground">Carregando rodada do sorteio</p>
      </div>
    );
  }

  if (!selectedRodada) {
    return (
      <div className="text-center py-12 space-y-6">
        <Shuffle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Nenhuma rodada selecionada</h2>
          <p className="text-muted-foreground mb-4">
            Selecione uma rodada na aba "Rodadas" para começar a sortear
          </p>
        </div>
        <Button onClick={() => setCurrentTab('rodadas')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Ir para Rodadas
        </Button>
      </div>
    );
  }

  const drawNumber = () => {
    if (availableNumbers.length === 0) {
      return;
    }

    const remainingNumbers = availableNumbers.filter(n => !drawnNumbers.includes(n));
    
    if (remainingNumbers.length === 0) {
      return;
    }

    setIsDrawing(true);

    // Animation effect
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
        
        // Update local state
        const newDrawnNumbers = [...drawnNumbers, finalNumber];
        setDrawnNumbers(newDrawnNumbers);
        setIsDrawing(false);
        
        // Save to database
        saveDrawnNumber(finalNumber, newDrawnNumbers.length);
      }
    }, ANIMATION_INTERVAL_MS);
    
    animationIntervalRef.current = interval;
  };

  const resetDraw = async () => {
    // Clear history from database
    await clearDrawHistory();
    
    setCurrentNumber(null);
    setDrawnNumbers([]);
    setIsDrawing(false);
  };

  const goBackToRodadas = () => {
    localStorage.removeItem('selectedRodadaId');
    setCurrentTab('rodadas');
  };

  const remainingNumbers = availableNumbers.filter(n => !drawnNumbers.includes(n));

  // Drawing screen
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Button
              onClick={goBackToRodadas}
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
            Faixa: {selectedRodada.range_start} a {selectedRodada.range_end} | Sorteados: {drawnNumbers.length} | Restantes: {remainingNumbers.length}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
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
            onClick={resetDraw}
            disabled={isDrawing || drawnNumbers.length === 0}
            variant="outline"
            size="lg"
            className="gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            Reiniciar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Current Number Display with Fullscreen */}
        <div ref={fullscreenRef} className={cn(isFullscreen && "bg-background p-8 min-h-screen flex flex-col")}>
          <Card className="border-2 flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between flex-shrink-0">
              <CardTitle>Número Sorteado</CardTitle>
              <div className="flex gap-2">
                {isFullscreen && (
                  <>
                    <Button
                      onClick={decreaseFontSize}
                      variant="outline"
                      size="icon"
                      title="Diminuir tamanho"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={increaseFontSize}
                      variant="outline"
                      size="icon"
                      title="Aumentar tamanho"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                  </>
                )}
                {!isFullscreen && (
                  <>
                    <Button
                      onClick={decreaseFontSize}
                      variant="outline"
                      size="icon"
                      title="Diminuir tamanho"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={increaseFontSize}
                      variant="outline"
                      size="icon"
                      title="Aumentar tamanho"
                    >
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
                      isDrawing ? "animate-pulse text-primary" : "text-primary"
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
              
              {/* Fullscreen controls */}
              {isFullscreen && (
                <div className="mt-8 space-y-6 flex-shrink-0">
                  {/* Draw button in fullscreen */}
                  <div className="flex justify-center gap-4">
                    <Button
                      onClick={drawNumber}
                      disabled={isDrawing || remainingNumbers.length === 0}
                      size="lg"
                      className="gap-2 text-xl px-12 py-8 h-auto"
                    >
                      <Shuffle className="w-8 h-8" />
                      Sortear Próximo
                    </Button>
                  </div>
                  
                  {/* Drawn numbers in fullscreen */}
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
                            key={index}
                            className={cn(
                              "flex items-center justify-center w-20 h-20 rounded-lg font-bold text-2xl border-2",
                              index === drawnNumbers.length - 1
                                ? "bg-primary text-primary-foreground border-primary scale-110"
                                : "bg-muted text-foreground border-border"
                            )}
                          >
                            {num}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Drawn Numbers History - Compact Grid (only show when not fullscreen) */}
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
                    key={index}
                    className={cn(
                      "flex items-center justify-center w-16 h-16 rounded-lg font-bold text-xl border-2 transition-transform",
                      index === drawnNumbers.length - 1
                        ? "bg-primary text-primary-foreground border-primary scale-110"
                        : "bg-muted text-foreground border-border"
                    )}
                  >
                    {num}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Números
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{availableNumbers.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Números na faixa ({selectedRodada.range_start} a {selectedRodada.range_end})</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Já Sorteados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{drawnNumbers.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Números já chamados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Restantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {remainingNumbers.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Números ainda não sorteados</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DrawTab;
