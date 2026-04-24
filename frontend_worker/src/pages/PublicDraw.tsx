import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Expand, Loader2, Minimize, RotateCcw, Shuffle, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const ANIMATION_INTERVAL_MS = 85;
const ANIMATION_CYCLES = 22;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.25;

const PublicDraw: React.FC = () => {
  const { toast } = useToast();
  const drawAreaRef = useRef<HTMLDivElement>(null);
  const animationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState('100');
  const [quantity, setQuantity] = useState('1');

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState(1);

  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [animatedNumber, setAnimatedNumber] = useState<number | null>(null);

  const availableNumbers = useMemo(() => {
    const start = Number.parseInt(rangeStart, 10);
    const end = Number.parseInt(rangeEnd, 10);

    if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
      return [];
    }

    const usedNumbers = new Set(drawnNumbers);
    const range = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    return range.filter((number) => !usedNumbers.has(number));
  }, [rangeStart, rangeEnd, drawnNumbers]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === drawAreaRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
      }
    };
  }, []);

  const validate = () => {
    const start = Number.parseInt(rangeStart, 10);
    const end = Number.parseInt(rangeEnd, 10);
    const quantityToDraw = Number.parseInt(quantity, 10);

    if ([start, end, quantityToDraw].some(Number.isNaN)) {
      toast({ title: 'Valores inválidos', description: 'Use apenas números inteiros.', variant: 'destructive' });
      return null;
    }

    if (start > end) {
      toast({ title: 'Faixa inválida', description: 'O número inicial deve ser menor ou igual ao final.', variant: 'destructive' });
      return null;
    }

    if (quantityToDraw < 1) {
      toast({ title: 'Quantidade inválida', description: 'A quantidade deve ser no mínimo 1.', variant: 'destructive' });
      return null;
    }

    if (quantityToDraw > availableNumbers.length) {
      toast({
        title: 'Números insuficientes',
        description: `Existem apenas ${availableNumbers.length} números restantes na faixa informada.`,
        variant: 'destructive',
      });
      return null;
    }

    return { quantityToDraw };
  };

  const runAnimation = (pool: number[], finalNumber: number, onComplete?: () => void) => {
    if (animationTimerRef.current) {
      clearInterval(animationTimerRef.current);
    }

    setIsDrawing(true);

    let cycle = 0;
    animationTimerRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * pool.length);
      setAnimatedNumber(pool[randomIndex]);
      cycle += 1;

      if (cycle >= ANIMATION_CYCLES) {
        if (animationTimerRef.current) {
          clearInterval(animationTimerRef.current);
        }

        setAnimatedNumber(finalNumber);
        setCurrentNumber(finalNumber);
        setIsDrawing(false);
        onComplete?.();
      }
    }, ANIMATION_INTERVAL_MS);
  };

  const handleDraw = () => {
    if (isDrawing) return;

    const parsed = validate();
    if (!parsed) return;

    const pool = [...availableNumbers];
    const pickedNumbers: number[] = [];

    for (let i = 0; i < parsed.quantityToDraw; i += 1) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      const [picked] = pool.splice(randomIndex, 1);
      pickedNumbers.push(picked);
    }

    const finalNumber = pickedNumbers[pickedNumbers.length - 1];
    runAnimation(availableNumbers, finalNumber, () => {
      setDrawnNumbers((previous) => [...previous, ...pickedNumbers]);
    });
  };

  const handleReset = () => {
    if (animationTimerRef.current) {
      clearInterval(animationTimerRef.current);
    }

    setIsDrawing(false);
    setCurrentNumber(null);
    setAnimatedNumber(null);
    setDrawnNumbers([]);
  };

  const toggleFullscreen = async () => {
    if (!drawAreaRef.current) return;

    if (document.fullscreenElement === drawAreaRef.current) {
      await document.exitFullscreen();
      return;
    }

    await drawAreaRef.current.requestFullscreen();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Sorteador público</h1>
            <p className="text-muted-foreground">Ferramenta rápida e independente para qualquer usuário.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/auth">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para login
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuração do sorteio</CardTitle>
            <CardDescription>Informe faixa e quantidade de números para sortear.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="range-start">Faixa inicial</Label>
                <Input id="range-start" type="number" min={1} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="range-end">Faixa final</Label>
                <Input id="range-end" type="number" min={1} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantidade a sortear</Label>
                <Input id="quantity" type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div ref={drawAreaRef} className="relative rounded-xl border bg-card p-4 md:p-8">
          <div className="sticky top-0 z-20 mb-6 flex flex-wrap gap-2 bg-card/95 pb-3 backdrop-blur supports-[backdrop-filter]:bg-card/75">
            <Button onClick={handleDraw} size="lg" className="min-w-32" disabled={isDrawing}>
              {isDrawing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shuffle className="mr-2 h-4 w-4" />}
              {isDrawing ? 'Sorteando...' : 'Sortear'}
            </Button>
            <Button onClick={toggleFullscreen} variant="secondary" size="lg" className="min-w-44">
              {isFullscreen ? (
                <>
                  <Minimize className="mr-2 h-4 w-4" />
                  Sair da tela cheia
                </>
              ) : (
                <>
                  <Expand className="mr-2 h-4 w-4" />
                  Entrar em tela cheia
                </>
              )}
            </Button>
            <Button onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))} variant="outline" size="lg" disabled={zoom <= MIN_ZOOM}>
              <ZoomOut className="mr-2 h-4 w-4" />
              Zoom -
            </Button>
            <Button onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))} variant="outline" size="lg" disabled={zoom >= MAX_ZOOM}>
              <ZoomIn className="mr-2 h-4 w-4" />
              Zoom +
            </Button>
            <Button onClick={handleReset} variant="outline" size="lg" disabled={isDrawing}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reiniciar
            </Button>
          </div>

          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 rounded-xl border border-dashed p-4 text-center">
            <p className="text-muted-foreground">Último número sorteado</p>
            <div
              className="font-extrabold leading-none"
              style={{
                fontSize: `${Math.max(4.5, 7 * zoom)}rem`,
                transform: isDrawing ? 'scale(1.04)' : 'scale(1)',
                transition: 'transform 0.08s ease-in-out',
              }}
            >
              {animatedNumber ?? currentNumber ?? '-'}
            </div>
            <p className="text-sm text-muted-foreground">Números restantes: {availableNumbers.length} • Zoom: {Math.round(zoom * 100)}%</p>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
              <CardDescription>Ordem dos números sorteados nesta sessão.</CardDescription>
            </CardHeader>
            <CardContent>
              {drawnNumbers.length === 0 ? (
                <p className="text-muted-foreground">Nenhum número sorteado ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {drawnNumbers.map((number, index) => (
                    <span key={`${number}-${index}`} className="rounded-md border bg-muted px-3 py-1 text-sm font-semibold">
                      {number}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PublicDraw;
