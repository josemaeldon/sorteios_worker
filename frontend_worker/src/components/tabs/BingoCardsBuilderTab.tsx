import React, { useState, useEffect, useRef, useCallback } from 'react';
import JsBarcode from 'jsbarcode';
import {
  LayoutGrid, Plus, Trash2, Download, RefreshCw, ChevronLeft, ChevronRight,
  Image, Type, AlignLeft, AlignCenter, AlignRight, Bold, Loader2, FileText,
  Save, List, X, Edit2, Barcode, Copy, ShoppingCart, Store, Link, DollarSign, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { useBingo } from '@/contexts/BingoContext';
import {
  CanvasElement, CanvasLayout, BingoCardGrid,
  DEFAULT_LAYOUT, BINGO_COLS, A4_W_MM, A4_H_MM,
  generateAllBingoCards, exportBingoCardsPDF,
  BUYER_ELEMENT_LABELS,
} from '@/lib/utils/bingoCardUtils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CartelaLayout, LojaCartela } from '@/types/bingo';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ─── Canvas constants ─────────────────────────────────────────────────────────
/** px per mm — keeps A4 canvas at ~595×841 px (72 dpi equivalent) */
const SCALE = 595 / 210;

const mm = (v: number) => v * SCALE;   // mm → px
const px = (v: number) => v / SCALE;   // px → mm
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const BUYER_FIELDS_ORDER: Array<'buyer_name' | 'buyer_address' | 'buyer_city' | 'buyer_phone'> = [
  'buyer_name',
  'buyer_address',
  'buyer_city',
  'buyer_phone',
];

const getElementMinSize = (type: CanvasElement['type']) => {
  if (type === 'bingo_grid') return { width: 20, height: 20 };
  if (type === 'barcode') return { width: 20, height: 8 };
  return { width: 5, height: 4 };
};

const normalizeElementBounds = (el: CanvasElement, paperW: number, paperH: number): CanvasElement => {
  const min = getElementMinSize(el.type);
  const width = clamp(el.width, min.width, paperW);
  const height = clamp(el.height, min.height, paperH);
  const x = clamp(el.x, 0, Math.max(0, paperW - width));
  const y = clamp(el.y, 0, Math.max(0, paperH - height));
  return { ...el, x, y, width, height };
};

const buildBuyerElement = (
  type: 'buyer_name' | 'buyer_address' | 'buyer_city' | 'buyer_phone',
  paperW: number,
  paperH: number,
): CanvasElement => {
  const margin = 10;
  const rowHeight = 8;
  const rowGap = 2;
  const blockHeight = BUYER_FIELDS_ORDER.length * rowHeight + (BUYER_FIELDS_ORDER.length - 1) * rowGap;
  const startY = clamp(paperH - margin - blockHeight, 0, Math.max(0, paperH - rowHeight));
  const typeIndex = BUYER_FIELDS_ORDER.indexOf(type);

  const el: CanvasElement = {
    id: `${type}_${Date.now()}`,
    type,
    x: margin,
    y: startY + Math.max(0, typeIndex) * (rowHeight + rowGap),
    width: Math.max(40, paperW - margin * 2),
    height: rowHeight,
    fontSize: 11,
    fontWeight: 'normal',
    color: '#111827',
    backgroundColor: 'transparent',
    textAlign: 'left',
  };

  return normalizeElementBounds(el, paperW, paperH);
};

// ─── Drag / resize state ──────────────────────────────────────────────────────
interface DragState {
  id: string;
  startX: number; startY: number; // client px
  origX: number; origY: number;   // mm
}
interface ResizeState {
  id: string;
  handle: 'nw' | 'ne' | 'sw' | 'se';
  startX: number; startY: number;
  origX: number; origY: number; origW: number; origH: number;
}

// ─── Canvas element renderer ──────────────────────────────────────────────────
const BingoGridPreview: React.FC<{
  el: CanvasElement;
  card: BingoCardGrid | null;
  scale: number;
  numeroPremios: number;
  gridCols?: number;
  gridRows?: number;
}> = ({ el, card, scale, numeroPremios, gridCols = 5, gridRows = 5 }) => {
  const showHeader = el.showHeader ?? false;
  const showFreeText = el.showFreeText ?? false;
  const cellFontPx = (el.fontSize ?? 12) * (scale / SCALE);
  const headerFontPx = (el.headerFontSize ?? 14) * (scale / SCALE);
  const bw = (el.borderWidth ?? 0.5) * scale;

  const renderGrid = (grid: number[][], premioIndex: number) => (
    <div
      key={premioIndex}
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridTemplateRows: showHeader ? `1fr repeat(${gridRows}, 1fr)` : `repeat(${gridRows}, 1fr)`,
        overflow: 'hidden',
      }}
    >
      {/* Header row (optional) */}
      {showHeader && (
        gridCols === 5
          ? BINGO_COLS.map((col) => (
            <div
              key={col}
              style={{
                background: el.headerColor ?? '#1e3a8a',
                color: el.headerTextColor ?? '#ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: headerFontPx,
                fontWeight: 'bold',
                border: `${bw}px solid ${el.borderColor ?? '#1e3a8a'}`,
                boxSizing: 'border-box',
              }}
            >
              {col}
            </div>
          ))
          : Array.from({ length: gridCols }, (_, i) => (
            <div
              key={i}
              style={{
                background: el.headerColor ?? '#1e3a8a',
                color: el.headerTextColor ?? '#ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: headerFontPx,
                fontWeight: 'bold',
                border: `${bw}px solid ${el.borderColor ?? '#1e3a8a'}`,
                boxSizing: 'border-box',
              }}
            >
              {i + 1}
            </div>
          ))
      )}
      {/* Numbers */}
      {grid.flatMap((row, ri) =>
        row.map((num, ci) => {
          const free = num === 0;
          const bg = free
            ? (el.freeCellColor && el.freeCellColor !== 'transparent' ? el.freeCellColor : undefined)
            : (el.cellBgColor && el.cellBgColor !== 'transparent' ? el.cellBgColor : undefined);
          return (
            <div
              key={`${ri}-${ci}`}
              style={{
                background: bg,
                color: el.color ?? '#111827',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: cellFontPx,
                fontWeight: free ? 'bold' : 'normal',
                border: `${bw}px solid ${el.borderColor ?? '#1e3a8a'}`,
                boxSizing: 'border-box',
              }}
            >
              {free ? (showFreeText ? 'FREE' : '') : num}
            </div>
          );
        })
      )}
    </div>
  );

  const allGrids = card?.grids ?? Array.from({ length: numeroPremios }, () =>
    Array.from({ length: gridRows }, () => Array(gridCols).fill(0))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
      {allGrids.map((grid, p) => renderGrid(grid, p))}
    </div>
  );
};

// ─── Barcode preview ──────────────────────────────────────────────────────────
const BarcodePreview: React.FC<{
  el: CanvasElement;
  cartelaNumero: number;
}> = ({ el, cartelaNumero }) => {
  const barcodeValue = cartelaNumero.toString().padStart(6, '0');
  const format = el.barcodeFormat ?? 'CODE128';
  const showText = el.showBarcodeText !== false;

  const dataUrl = React.useMemo(() => {
    try {
      const barcodeCanvas = document.createElement('canvas');
      JsBarcode(barcodeCanvas, barcodeValue, {
        format,
        displayValue: showText,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return barcodeCanvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }, [barcodeValue, format, showText]);

  if (!dataUrl) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#666' }}>
        Código de Barras
      </div>
    );
  }
  return (
    <img src={dataUrl} alt={`Barcode ${barcodeValue}`} style={{ width: '100%', height: '100%', objectFit: 'fill' }} />
  );
};

// ─── Resize handles ───────────────────────────────────────────────────────────
const HANDLE_POSITIONS: Record<string, React.CSSProperties> = {
  nw: { top: -5, left: -5, cursor: 'nw-resize' },
  ne: { top: -5, right: -5, cursor: 'ne-resize' },
  sw: { bottom: -5, left: -5, cursor: 'sw-resize' },
  se: { bottom: -5, right: -5, cursor: 'se-resize' },
};

const ResizeHandles: React.FC<{
  onPointerDown: (e: React.PointerEvent, h: ResizeState['handle']) => void;
}> = ({ onPointerDown }) => (
  <>
    {(Object.keys(HANDLE_POSITIONS) as ResizeState['handle'][]).map((h) => (
      <div
        key={h}
        style={{
          position: 'absolute',
          width: 10, height: 10,
          background: '#3b82f6',
          border: '2px solid white',
          borderRadius: 2,
          zIndex: 10,
          ...HANDLE_POSITIONS[h],
        }}
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, h); }}
      />
    ))}
  </>
);

// ─── Property panel helpers ───────────────────────────────────────────────────
const PropRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);

const ColorInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  label: string;
}> = ({ value, onChange, label }) => (
  <PropRow label={label}>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value?.startsWith('#') ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border border-border"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs font-mono"
      />
    </div>
  </PropRow>
);

const NumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}> = ({ label, value, onChange, min = 0, max = 999, step = 1 }) => (
  <PropRow label={label}>
    <Input
      type="number"
      min={min} max={max} step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="h-7 text-xs"
    />
  </PropRow>
);

// ─── Main component ───────────────────────────────────────────────────────────
const BingoCardsBuilderTab: React.FC = () => {
  const {
    sorteioAtivo, cartelas, salvarNumerosCartelas,
    vendedores,
    cartelaLayouts, loadCartelaLayouts, saveCartelaLayout, updateCartelaLayout, deleteCartelaLayout,
    lojaCartelas, loadMinhaLoja, adicionarCartelaLoja, removerCartelaLoja, removerMultiplasCartelasLoja, atualizarPrecoLojaCartela,
    cartelasValidadas,
  } = useBingo();
  const { user } = useAuth();
  const { toast } = useToast();

  // ─── Paper / grid dimensions derived from active sorteio ─────────────────
  const paperW = sorteioAtivo?.papel_largura ?? A4_W_MM;
  const paperH = sorteioAtivo?.papel_altura ?? A4_H_MM;
  const canvasW = Math.round(paperW * SCALE);
  const canvasH = Math.round(paperH * SCALE);
  const gridCols = sorteioAtivo?.grade_colunas ?? 5;
  const gridRows = sorteioAtivo?.grade_linhas ?? 5;
  const rifaOnly = sorteioAtivo?.apenas_numero_rifa ?? false;

  // Layout
  const [layout, setLayout] = useState<CanvasLayout>(() =>
    JSON.parse(JSON.stringify(DEFAULT_LAYOUT)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Cards
  const [cards, setCards] = useState<BingoCardGrid[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const numeroPremios = 1;
  const hasValidatedCards = cartelasValidadas.length > 0;
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);

  // Loja state
  const [showVenderModal, setShowVenderModal] = useState(false);
  const [vendaPreco, setVendaPreco] = useState('');
  const [isVendendo, setIsVendendo] = useState(false);
  const [showMinhaLojaDialog, setShowMinhaLojaDialog] = useState(false);
  const [editingPrecoId, setEditingPrecoId] = useState<string | null>(null);
  const [editingPrecoValor, setEditingPrecoValor] = useState('');
  const [selectedLojaIds, setSelectedLojaIds] = useState<Set<string>>(new Set());
  const [isDeletingLoja, setIsDeletingLoja] = useState(false);

  // Export range state
  const [showExportRangeModal, setShowExportRangeModal] = useState(false);
  const [exportRangeFrom, setExportRangeFrom] = useState(1);
  const [exportRangeTo, setExportRangeTo] = useState(1);
  const [isExportingRange, setIsExportingRange] = useState(false);
  const [exportRangeA4, setExportRangeA4] = useState(false);

  // Bulk publish state
  const [showBulkVenderModal, setShowBulkVenderModal] = useState(false);
  const [bulkFrom, setBulkFrom] = useState(1);
  const [bulkTo, setBulkTo] = useState(1);
  const [bulkPreco, setBulkPreco] = useState('');
  const [isBulkVendendo, setIsBulkVendendo] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  // Vendor publish state
  const [showVendedorLojaModal, setShowVendedorLojaModal] = useState(false);
  const [vendedorLojaId, setVendedorLojaId] = useState('');
  const [vendedorLojaPreco, setVendedorLojaPreco] = useState('');
  const [isVendedorLojaVendendo, setIsVendedorLojaVendendo] = useState(false);
  const [vendedorLojaProgress, setVendedorLojaProgress] = useState(0);

  // Reset builder state when sorteio changes so the correct layout auto-loads
  useEffect(() => {
    setActiveLayoutId(null);
    setCards([]);
    setPreviewIndex(0);
    hasRestoredRef.current = false;
  }, [sorteioAtivo?.id]);

  // Named layout management
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLayoutName, setSaveLayoutName] = useState('');
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [showLayoutsList, setShowLayoutsList] = useState(false);
  const [deletingLayoutId, setDeletingLayoutId] = useState<string | null>(null);

  // Drag / resize (use refs to avoid stale closure in global listeners)
  const draggingRef = useRef<DragState | null>(null);
  const resizingRef = useRef<ResizeState | null>(null);
  const layoutRef = useRef(layout);
  useEffect(() => { layoutRef.current = layout; }, [layout]);
  const paperDimsRef = useRef({ paperW, paperH });
  useEffect(() => { paperDimsRef.current = { paperW, paperH }; }, [paperW, paperH]);

  // Tracks whether the one-time DB restore has already run for the current sorteio
  const hasRestoredRef = useRef(false);

  // Background image input ref
  const bgInputRef = useRef<HTMLInputElement>(null);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const selectedEl = layout.elements.find((e) => e.id === selectedId) ?? null;
  const previewCard = cards[previewIndex] ?? null;
  const totalCards = sorteioAtivo?.quantidade_cartelas ?? cartelas.length ?? 10;

  // ─── Restore saved cards from DB on mount ─────────────────────────────────
  useEffect(() => {
    if (hasRestoredRef.current) return;
    const saved = cartelas
      .filter(c => c.numeros_grade && c.numeros_grade.length > 0)
      .sort((a, b) => a.numero - b.numero);
    if (saved.length === 0) return;
    hasRestoredRef.current = true;
    const expectedCells = gridCols * gridRows;
    setCards(
      saved
        .filter(c => c.numeros_grade!.every(flat => flat.length === expectedCells))
        .map(c => {
          // numeros_grade stores flat arrays per prize; reshape each to a gridRows×gridCols grid
          const grids = c.numeros_grade!.map(flat =>
            Array.from({ length: gridRows }, (_, row) => flat.slice(row * gridCols, row * gridCols + gridCols))
          );
          return { cartelaNumero: c.numero, grids };
        }),
    );
  }, [cartelas, gridCols, gridRows]);

  // ─── Auto-load the existing layout for the current sorteio (Req 4) ─────────
  useEffect(() => {
    if (cartelaLayouts.length === 0) return;
    // Only auto-load layouts that belong to the currently active sorteio
    const item = sorteioAtivo
      ? cartelaLayouts.find(l => l.sorteio_id === sorteioAtivo.id) ?? cartelaLayouts[0]
      : cartelaLayouts[0];
    if (!item) return;
    try {
      const parsedLayout: CanvasLayout = JSON.parse(item.layout_data);
      const parsedCards: BingoCardGrid[] = JSON.parse(item.cards_data);
      setLayout(parsedLayout);
      setCards(parsedCards);
      setPreviewIndex(0);
      setActiveLayoutId(item.id);
      hasRestoredRef.current = true;
    } catch {
      // ignore parse errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartelaLayouts]);

  // ─── Layout helpers ────────────────────────────────────────────────────────
  const updateElement = useCallback((id: string, patch: Partial<CanvasElement>) => {
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => el.id === id
        ? normalizeElementBounds({ ...el, ...patch }, paperW, paperH)
        : el),
    }));
  }, [paperW, paperH]);

  useEffect(() => {
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => normalizeElementBounds(el, paperW, paperH)),
    }));
  }, [paperW, paperH]);

  const updateBackground = useCallback((patch: Partial<CanvasLayout['background']>) => {
    setLayout((prev) => ({ ...prev, background: { ...prev.background, ...patch } }));
  }, []);

  const addTextElement = () => {
    const id = `text_${Date.now()}`;
    const el: CanvasElement = {
      id, type: 'text',
      x: 20, y: 20, width: 170, height: 14,
      content: 'Texto personalizado',
      fontSize: 12, fontWeight: 'normal',
      color: '#111827', backgroundColor: 'transparent',
      textAlign: 'center',
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(id);
  };

  const addBingoGridElement = () => {
    const id = `bingo_grid_${Date.now()}`;
    const existing = layout.elements.filter(e => e.type === 'bingo_grid');
    const defaultGrid = DEFAULT_LAYOUT.elements.find(e => e.type === 'bingo_grid');
    const ref = existing[existing.length - 1] ?? defaultGrid;
    if (!ref) return;
    const el: CanvasElement = {
      ...ref,
      id,
      x: ref.x + 5,
      y: ref.y + 5,
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(id);
  };

  const addBarcodeElement = () => {
    const id = `barcode_${Date.now()}`;
    const el: CanvasElement = {
      id, type: 'barcode',
      x: 30, y: 4, width: 150, height: 20,
      barcodeFormat: 'CODE128',
      showBarcodeText: true,
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(id);
  };

  const addBuyerElement = (type: 'buyer_name' | 'buyer_address' | 'buyer_city' | 'buyer_phone') => {
    const el = buildBuyerElement(type, paperW, paperH);
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
  };

  const duplicateCardNumber = (sourceId: string) => {
    const source = layout.elements.find(e => e.id === sourceId);
    if (!source) return;
    const id = `card_number_${Date.now()}`;
    const el: CanvasElement = {
      ...source,
      id,
      x: source.x + 5,
      y: source.y + 5,
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(id);
  };

  const deleteElement = (id: string) => {
    if (id === 'card_number') return;
    // Prevent deleting the last bingo_grid element
    if (layout.elements.find(e => e.id === id)?.type === 'bingo_grid' &&
        layout.elements.filter(e => e.type === 'bingo_grid').length <= 1) return;
    setLayout((prev) => ({ ...prev, elements: prev.elements.filter((e) => e.id !== id) }));
    setSelectedId(null);
  };

  const resetLayout = () => {
    setLayout(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)));
    setSelectedId(null);
  };

  // ─── Global pointer events (drag & resize) ─────────────────────────────────
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (draggingRef.current) {
        const d = draggingRef.current;
        const dx = px(e.clientX - d.startX);
        const dy = px(e.clientY - d.startY);
        setLayout((prev) => {
          const el = prev.elements.find((el) => el.id === d.id);
          if (!el) return prev;
          return {
            ...prev,
            elements: prev.elements.map((el) =>
              el.id === d.id
                ? {
                  ...el,
                  x: clamp(d.origX + dx, 0, Math.max(0, paperDimsRef.current.paperW - el.width)),
                  y: clamp(d.origY + dy, 0, Math.max(0, paperDimsRef.current.paperH - el.height)),
                }
                : el,
            ),
          };
        });
      } else if (resizingRef.current) {
        const r = resizingRef.current;
        const dx = px(e.clientX - r.startX);
        const dy = px(e.clientY - r.startY);
        setLayout((prev) => {
          const target = prev.elements.find((el) => el.id === r.id);
          if (!target) return prev;
          const min = getElementMinSize(target.type);

          let { origX: newX, origY: newY, origW: newW, origH: newH } = r;
          if (r.handle.includes('e')) newW = Math.max(min.width, r.origW + dx);
          if (r.handle.includes('w')) { newW = Math.max(min.width, r.origW - dx); newX = r.origX + (r.origW - newW); }
          if (r.handle.includes('s')) newH = Math.max(min.height, r.origH + dy);
          if (r.handle.includes('n')) { newH = Math.max(min.height, r.origH - dy); newY = r.origY + (r.origH - newH); }

          const normalized = normalizeElementBounds(
            { ...target, x: newX, y: newY, width: newW, height: newH },
            paperDimsRef.current.paperW,
            paperDimsRef.current.paperH,
          );

          return {
            ...prev,
            elements: prev.elements.map((el) => (el.id === r.id ? normalized : el)),
          };
        });
      }
    };

    const handleUp = () => {
      draggingRef.current = null;
      resizingRef.current = null;
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, []);

  // ─── Element pointer handlers ──────────────────────────────────────────────
  const handleElementPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const el = layoutRef.current.elements.find((el) => el.id === id);
    if (!el) return;
    draggingRef.current = { id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y };
    setSelectedId(id);
  };

  const handleResizePointerDown = (e: React.PointerEvent, id: string, handle: ResizeState['handle']) => {
    e.stopPropagation();
    e.preventDefault();
    const el = layoutRef.current.elements.find((el) => el.id === id);
    if (!el) return;
    resizingRef.current = {
      id, handle,
      startX: e.clientX, startY: e.clientY,
      origX: el.x, origY: el.y, origW: el.width, origH: el.height,
    };
  };

  // ─── Background image upload ───────────────────────────────────────────────
  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateBackground({ imageData: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  // ─── Generate cards ────────────────────────────────────────────────────────
  const doGenerate = async () => {
    const count = totalCards;
    const generated = generateAllBingoCards(count, numeroPremios, gridCols, gridRows);
    setCards(generated);
    setPreviewIndex(0);
    // Save all prize grids to each cartela in the DB
    setIsSaving(true);
    try {
      await salvarNumerosCartelas(
        generated.map((c) => ({
          numero: c.cartelaNumero,
          // Each prize has its own independent grid; save all as number[][]
          numeros_grade: c.grids.map(g => g.flat()),
        }))
      );
      toast({ title: `${count} cartelas geradas e salvas com sucesso!` });
    } catch {
      toast({ title: `${count} cartelas geradas. Erro ao salvar no banco.`, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (cards.length > 0) {
      setShowGenerateConfirm(true);
    } else {
      await doGenerate();
    }
  };

  const [exportMode, setExportMode] = useState<'padrao' | 'a4' | null>(null);

  // ─── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    // In rifaOnly mode cards are just numbers — generate them on-the-fly if needed
    const exportCards = (rifaOnly && cards.length === 0)
      ? Array.from<BingoCardGrid>({ length: totalCards }, (_, i) => ({ cartelaNumero: i + 1, grids: [] }))
      : cards;

    if (exportCards.length === 0) {
      toast({ title: 'Gere as cartelas primeiro', variant: 'destructive' });
      return;
    }
    setIsExporting(true);
    setExportMode('padrao');
    setExportProgress({ done: 0, total: exportCards.length });
    try {
      await exportBingoCardsPDF(
        exportCards, layout, sorteioAtivo?.nome ?? 'bingo', undefined,
        paperW, paperH, gridCols, gridRows, rifaOnly, false,
        (done, total) => setExportProgress({ done, total }),
      );
      toast({ title: 'PDF exportado com sucesso!' });
    } catch {
      toast({ title: 'Erro ao exportar PDF', variant: 'destructive' });
    } finally {
      setIsExporting(false);
      setExportMode(null);
      setExportProgress(null);
    }
  };

  // ─── Export PDF A4 multi-per-page ─────────────────────────────────────────
  const [isExportingA4, setIsExportingA4] = useState(false);
  // Show option when ticket is not A4 and fits within A4 dimensions
  const isA4MultiAvailable = (paperW !== A4_W_MM || paperH !== A4_H_MM) && paperW <= A4_W_MM && paperH <= A4_H_MM;

  const handleExportA4MultiPDF = async () => {
    const exportCards = (rifaOnly && cards.length === 0)
      ? Array.from<BingoCardGrid>({ length: totalCards }, (_, i) => ({ cartelaNumero: i + 1, grids: [] }))
      : cards;

    if (exportCards.length === 0) {
      toast({ title: 'Gere as cartelas primeiro', variant: 'destructive' });
      return;
    }
    setIsExportingA4(true);
    setExportMode('a4');
    setExportProgress({ done: 0, total: exportCards.length });
    try {
      await exportBingoCardsPDF(
        exportCards, layout, sorteioAtivo?.nome ?? 'bingo', undefined,
        paperW, paperH, gridCols, gridRows, rifaOnly, true,
        (done, total) => setExportProgress({ done, total }),
      );
      toast({ title: 'PDF A4 exportado com sucesso!' });
    } catch {
      toast({ title: 'Erro ao exportar PDF', variant: 'destructive' });
    } finally {
      setIsExportingA4(false);
      setExportMode(null);
      setExportProgress(null);
    }
  };

  // ─── Export PDF range ─────────────────────────────────────────────────────
  const handleOpenExportRangeModal = () => {
    const maxCard = cards.length > 0 ? cards[cards.length - 1].cartelaNumero : totalCards;
    setExportRangeFrom(1);
    setExportRangeTo(maxCard);
    setExportRangeA4(false);
    setShowExportRangeModal(true);
  };

  const handleExportRange = async () => {
    const from = Math.max(1, Math.round(exportRangeFrom));
    const maxCard = cards.length > 0 ? cards[cards.length - 1].cartelaNumero : totalCards;
    const to = Math.min(maxCard, Math.round(exportRangeTo));
    if (from > to) {
      toast({ title: 'Intervalo inválido', variant: 'destructive' });
      return;
    }
    let exportCards: BingoCardGrid[];
    if (rifaOnly && cards.length === 0) {
      exportCards = Array.from({ length: to - from + 1 }, (_, i) => ({ cartelaNumero: from + i, grids: [] }));
    } else {
      exportCards = cards.filter(c => c.cartelaNumero >= from && c.cartelaNumero <= to);
    }
    if (exportCards.length === 0) {
      toast({ title: 'Nenhuma cartela encontrada no intervalo', variant: 'destructive' });
      return;
    }
    setIsExportingRange(true);
    setExportProgress({ done: 0, total: exportCards.length });
    try {
      await exportBingoCardsPDF(
        exportCards, layout, sorteioAtivo?.nome ?? 'bingo', undefined,
        paperW, paperH, gridCols, gridRows, rifaOnly, exportRangeA4,
        (done, total) => setExportProgress({ done, total }),
      );
      const n = exportCards.length;
      toast({ title: `PDF exportado com sucesso! (${n} cartela${n !== 1 ? 's' : ''})` });
      setShowExportRangeModal(false);
    } catch {
      toast({ title: 'Erro ao exportar PDF', variant: 'destructive' });
    } finally {
      setIsExportingRange(false);
      setExportProgress(null);
    }
  };

  const handleOpenSaveDialog = () => {
    const active = cartelaLayouts.find(l => l.id === activeLayoutId);
    setSaveLayoutName(active?.nome ?? '');
    setShowSaveDialog(true);
  };

  const handleSaveLayout = async () => {
    if (!saveLayoutName.trim()) {
      toast({ title: 'Informe um nome para a cartela', variant: 'destructive' });
      return;
    }
    if (cards.length === 0) {
      toast({ title: 'Gere as cartelas primeiro', variant: 'destructive' });
      return;
    }
    setIsSavingLayout(true);
    try {
      const layoutJson = JSON.stringify(layout);
      const cardsJson = JSON.stringify(cards);
      if (activeLayoutId) {
        await updateCartelaLayout(activeLayoutId, saveLayoutName.trim(), layoutJson, cardsJson);
        toast({ title: 'Cartela atualizada!' });
      } else {
        const saved = await saveCartelaLayout(saveLayoutName.trim(), layoutJson, cardsJson);
        setActiveLayoutId(saved.id);
        toast({ title: 'Cartela salva!' });
      }
      setShowSaveDialog(false);
    } catch {
      toast({ title: 'Erro ao salvar cartela', variant: 'destructive' });
    } finally {
      setIsSavingLayout(false);
    }
  };

  const handleLoadLayout = (item: CartelaLayout) => {
    try {
      const parsedLayout: CanvasLayout = JSON.parse(item.layout_data);
      const parsedCards: BingoCardGrid[] = JSON.parse(item.cards_data);
      setLayout(parsedLayout);
      setCards(parsedCards);
      setPreviewIndex(0);
      setActiveLayoutId(item.id);
      setShowLayoutsList(false);
      toast({ title: `Cartela "${item.nome}" carregada!` });
    } catch {
      toast({ title: 'Erro ao carregar cartela', variant: 'destructive' });
    }
  };

  const handleNewLayout = () => {
    setLayout(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)));
    setCards([]);
    setPreviewIndex(0);
    setActiveLayoutId(null);
    setShowLayoutsList(false);
  };

  // ─── Loja handlers ─────────────────────────────────────────────────────────
  const handleOpenVenderModal = () => {
    setVendaPreco(String(sorteioAtivo?.valor_cartela ?? ''));
    setShowVenderModal(true);
  };

  const handleConfirmarVenda = async () => {
    if (!activeLayoutId || !previewCard) return;
    // Accept both "1.99" and "1,99". For Brazilian format "1.234,56" → "1234.56"
    const normalised = vendaPreco.trim().includes(',')
      ? vendaPreco.trim().replace(/\./g, '').replace(',', '.')   // BR: remove thousands dots, swap decimal comma
      : vendaPreco.trim();                                         // already dot-decimal
    const preco = parseFloat(normalised);
    if (isNaN(preco) || preco < 0) {
      toast({ title: 'Preço inválido', variant: 'destructive' });
      return;
    }
    // Find the vendor assigned to this card
    const cartelaInfo = cartelas.find(c => c.numero === previewCard.cartelaNumero);
    const vendedorId = cartelaInfo?.vendedor_id;
    setIsVendendo(true);
    try {
      await adicionarCartelaLoja(activeLayoutId, previewCard.cartelaNumero, preco, JSON.stringify(previewCard), JSON.stringify(layout), vendedorId);
      toast({ title: `Cartela ${previewCard.cartelaNumero.toString().padStart(3, '0')} disponibilizada para venda!` });
      setShowVenderModal(false);
    } catch (err: unknown) {
      toast({ title: (err instanceof Error ? err.message : 'Erro inesperado') || 'Erro ao disponibilizar cartela', variant: 'destructive' });
    } finally {
      setIsVendendo(false);
    }
  };

  const handleOpenMinhaLoja = async () => {
    await loadMinhaLoja();
    setShowMinhaLojaDialog(true);
  };

  const handleOpenBulkVender = () => {
    setBulkFrom(1);
    setBulkTo(cards.length);
    setBulkPreco(String(sorteioAtivo?.valor_cartela ?? ''));
    setBulkProgress(0);
    setShowBulkVenderModal(true);
  };

  const handleBulkVender = async () => {
    if (!activeLayoutId) return;
    const normalised = bulkPreco.trim().includes(',')
      ? bulkPreco.trim().replace(/\./g, '').replace(',', '.')
      : bulkPreco.trim();
    const preco = parseFloat(normalised);
    if (isNaN(preco) || preco < 0) {
      toast({ title: 'Preço inválido', variant: 'destructive' });
      return;
    }
    const fromNum = Math.max(1, Math.round(bulkFrom));
    const toNum = Math.min(cards.length, Math.round(bulkTo));
    if (fromNum > toNum) {
      toast({ title: 'Intervalo inválido', variant: 'destructive' });
      return;
    }
    const targetCards = cards.filter(c => c.cartelaNumero >= fromNum && c.cartelaNumero <= toNum);
    if (targetCards.length === 0) {
      toast({ title: 'Nenhuma cartela encontrada no intervalo', variant: 'destructive' });
      return;
    }
    setIsBulkVendendo(true);
    setBulkProgress(0);
    let added = 0;
    let skipped = 0;
    try {
      for (const card of targetCards) {
        // Find the vendor assigned to this card
        const cartelaInfo = cartelas.find(c => c.numero === card.cartelaNumero);
        const cardVendedorId = cartelaInfo?.vendedor_id;
        try {
          await adicionarCartelaLoja(activeLayoutId, card.cartelaNumero, preco, JSON.stringify(card), JSON.stringify(layout), cardVendedorId);
          added++;
        } catch (cardErr: unknown) {
          if (cardErr && typeof cardErr === 'object' && 'code' in cardErr && (cardErr as { code?: string }).code === 'DUPLICATE_CARTELA') {
            skipped++;
          } else {
            throw cardErr;
          }
        }
        setBulkProgress(Math.round((added + skipped) / targetCards.length * 100));
      }
      const msg = skipped > 0
        ? `${added} cartela${added !== 1 ? 's' : ''} adicionada${added !== 1 ? 's' : ''}, ${skipped} já estava${skipped !== 1 ? 'm' : ''} na loja.`
        : `${added} cartela${added !== 1 ? 's' : ''} disponibilizada${added !== 1 ? 's' : ''} para venda!`;
      toast({ title: msg });
      setShowBulkVenderModal(false);
    } catch (err: unknown) {
      toast({ title: (err instanceof Error ? err.message : 'Erro inesperado') || 'Erro ao disponibilizar cartelas', variant: 'destructive' });
    } finally {
      setIsBulkVendendo(false);
    }
  };

  const handleOpenVendedorLojaModal = () => {
    setVendedorLojaId('');
    setVendedorLojaPreco(String(sorteioAtivo?.valor_cartela ?? ''));
    setVendedorLojaProgress(0);
    setShowVendedorLojaModal(true);
  };

  const handleVendedorLoja = async () => {
    if (!activeLayoutId || !vendedorLojaId) return;
    const normalised = vendedorLojaPreco.trim().includes(',')
      ? vendedorLojaPreco.trim().replace(/\./g, '').replace(',', '.')
      : vendedorLojaPreco.trim();
    const preco = parseFloat(normalised);
    if (isNaN(preco) || preco < 0) {
      toast({ title: 'Preço inválido', variant: 'destructive' });
      return;
    }
    // Get cards assigned to this vendor that have grid data
    const vendorCartelas = cartelas.filter(
      c => c.vendedor_id === vendedorLojaId && c.numeros_grade && c.numeros_grade.length > 0
    );
    if (vendorCartelas.length === 0) {
      toast({ title: 'Nenhuma cartela com números gerados para este vendedor. Gere os números antes de disponibilizar.', variant: 'destructive' });
      return;
    }
    setIsVendedorLojaVendendo(true);
    setVendedorLojaProgress(0);
    let added = 0;
    let skipped = 0;
    try {
      for (const c of vendorCartelas) {
        // Convert numeros_grade (flat arrays per prize) to BingoCardGrid.grids
        const expectedCells = gridCols * gridRows;
        const grids = c.numeros_grade!.map(flat =>
          flat.length === expectedCells
            ? Array.from({ length: gridRows }, (_, row) => flat.slice(row * gridCols, row * gridCols + gridCols))
            : Array.from({ length: gridRows }, () => Array(gridCols).fill(0))
        );
        const cardGrid: BingoCardGrid = { cartelaNumero: c.numero, grids };
        try {
          await adicionarCartelaLoja(activeLayoutId, c.numero, preco, JSON.stringify(cardGrid), JSON.stringify(layout), vendedorLojaId);
          added++;
        } catch (cardErr: unknown) {
          if (cardErr && typeof cardErr === 'object' && 'code' in cardErr && (cardErr as { code?: string }).code === 'DUPLICATE_CARTELA') {
            skipped++;
          } else {
            throw cardErr;
          }
        }
        setVendedorLojaProgress(Math.round((added + skipped) / vendorCartelas.length * 100));
      }
      const msg = skipped > 0
        ? `${added} cartela${added !== 1 ? 's' : ''} do vendedor adicionada${added !== 1 ? 's' : ''}, ${skipped} já estava${skipped !== 1 ? 'm' : ''} na loja.`
        : `${added} cartela${added !== 1 ? 's' : ''} do vendedor disponibilizada${added !== 1 ? 's' : ''} para venda!`;
      toast({ title: msg });
      setShowVendedorLojaModal(false);
    } catch (err: unknown) {
      toast({ title: (err instanceof Error ? err.message : 'Erro inesperado') || 'Erro ao disponibilizar cartelas', variant: 'destructive' });
    } finally {
      setIsVendedorLojaVendendo(false);
    }
  };

  const handleSalvarPrecoEdicao = async (id: string) => {
    const normalised = editingPrecoValor.trim().includes(',')
      ? editingPrecoValor.trim().replace(/\./g, '').replace(',', '.')
      : editingPrecoValor.trim();
    const preco = parseFloat(normalised);
    if (isNaN(preco) || preco < 0) {
      toast({ title: 'Preço inválido', variant: 'destructive' });
      return;
    }
    try {
      await atualizarPrecoLojaCartela(id, preco);
      setEditingPrecoId(null);
    } catch {
      toast({ title: 'Erro ao atualizar preço', variant: 'destructive' });
    }
  };

  const handleExcluirSelecionadas = async () => {
    const ids = Array.from(selectedLojaIds);
    if (ids.length === 0) return;
    setIsDeletingLoja(true);
    try {
      await removerMultiplasCartelasLoja(ids);
      setSelectedLojaIds(new Set());
      toast({ title: `${ids.length} cartela${ids.length !== 1 ? 's' : ''} removida${ids.length !== 1 ? 's' : ''} da loja.` });
    } catch (err: unknown) {
      toast({ title: (err instanceof Error ? err.message : 'Erro inesperado') || 'Erro ao remover cartelas', variant: 'destructive' });
    } finally {
      setIsDeletingLoja(false);
    }
  };

  // Generate the public store URL for the current sorteio
  const publicUrl = React.useMemo(() => {
    if (!sorteioAtivo?.short_id) {
      // Use the sorteio owner's user_id if available (e.g. when admin views another user's sorteio)
      const ownerId = sorteioAtivo?.user_id || user?.id;
      return ownerId ? `${window.location.origin}/loja/${ownerId}` : '';
    }
    const slug = sorteioAtivo.nome
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${window.location.origin}/loja/${slug}/${sorteioAtivo.short_id}`;
  }, [sorteioAtivo?.short_id, sorteioAtivo?.nome, sorteioAtivo?.user_id, user]);

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!sorteioAtivo) {
    return (
      <div className="text-center py-16">
        <LayoutGrid className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Construtor de Cartelas</h2>
        <p className="text-muted-foreground">Selecione um sorteio para construir as cartelas</p>
      </div>
    );
  }

  return (
    <>
    <div className="animate-fade-in flex flex-col gap-3 h-full">

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <LayoutGrid className="w-6 h-6" />
            Construtor de Cartelas
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {sorteioAtivo.nome} • {totalCards} cartelas
            {(() => {
              const activeLayout = activeLayoutId ? cartelaLayouts.find(l => l.id === activeLayoutId) : null;
              return activeLayout ? (
                <span className="ml-2 text-primary font-medium">— {activeLayout.nome}</span>
              ) : null;
            })()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { loadCartelaLayouts(); setShowLayoutsList(true); }}>
            <List className="w-4 h-4" />
            Minhas Cartelas {cartelaLayouts.length > 0 && `(${cartelaLayouts.length})`}
          </Button>
          <Button onClick={handleGenerate} variant="outline" className="gap-2" disabled={isSaving || hasValidatedCards}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Gerar
          </Button>
          <Button onClick={handleOpenSaveDialog} variant="outline" className="gap-2" disabled={cards.length === 0}>
            <Save className="w-4 h-4" />
            {activeLayoutId ? 'Atualizar' : 'Salvar Como...'}
          </Button>
          <Button onClick={handleExportPDF} disabled={isExporting || (!rifaOnly && cards.length === 0)} className="gap-2">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar PDF {cards.length > 0 && `(${cards.length})`}
          </Button>
          <Button variant="outline" onClick={handleOpenExportRangeModal} disabled={!rifaOnly && cards.length === 0} className="gap-2">
            <Download className="w-4 h-4" />
            Exportar Faixa…
          </Button>
          {isA4MultiAvailable && (
            <Button variant="outline" onClick={handleExportA4MultiPDF} disabled={isExportingA4 || (!rifaOnly && cards.length === 0)} className="gap-2">
              {isExportingA4 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exportar A4 (múltiplas por página)
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={handleOpenMinhaLoja}>
            <Store className="w-4 h-4" />
            Minha Loja {lojaCartelas.length > 0 && `(${lojaCartelas.length})`}
          </Button>
        </div>
      </div>

      {hasValidatedCards && (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-sm">
          <X className="w-5 h-5 text-destructive flex-shrink-0" />
          <span className="text-destructive">
            Existem <strong>{cartelasValidadas.length}</strong> cartela(s) validada(s). Novos números só podem ser gerados após a exclusão das cartelas validadas.
          </span>
        </div>
      )}

      {(isExporting || isExportingA4 || isExportingRange) && (
        <div className="flex items-start gap-3 p-4 bg-primary/10 border border-primary/30 rounded-xl text-sm">
          <Loader2 className="w-5 h-5 text-primary flex-shrink-0 animate-spin mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-primary font-semibold">
              Preparando PDF para download…
              {' '}
              {exportMode === 'a4'
                ? 'Montando o formato A4 com múltiplas cartelas por página.'
                : 'Renderizando as cartelas. Isso pode levar alguns minutos para grandes volumes.'}
            </p>
            {exportProgress && (() => {
                const remaining = exportProgress.total - exportProgress.done;
                return (
                  <div className="mt-2">
                    <p className="text-primary text-xs mb-1">
                      {exportProgress.done} de {exportProgress.total} cartelas geradas
                      {remaining > 0 ? ` — ${remaining} restantes` : ' — Finalizando download…'}
                    </p>
                    <div className="h-2.5 bg-primary/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 rounded-full"
                        style={{ width: `${exportProgress.total > 0 ? (exportProgress.done / exportProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
          </div>
        </div>
      )}

      {!hasValidatedCards && cards.length === 0 && (
        <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm">
          <FileText className="w-5 h-5 text-primary flex-shrink-0" />
          {rifaOnly
            ? <span>Modo <strong>Apenas número da rifa</strong>: clique em <strong>Exportar PDF</strong> para gerar {totalCards} rifas numeradas diretamente, ou em <strong>Gerar</strong> para pré-visualizar primeiro.</span>
            : <span>Clique em <strong>Gerar</strong> para criar {totalCards} cartelas únicas com números de 1 a {gridCols === 5 && gridRows === 5 ? '75' : `${gridCols * gridRows * 3}`} e grades independentes por prêmio, depois <strong>Salvar Como...</strong> para nomear e salvar.</span>
          }
        </div>
      )}

      {/* ── Main editor area ── */}
      <div className="flex gap-3 flex-1 min-h-0" style={{ height: 'calc(100vh - 220px)' }}>

        {/* ─ Left panel ─ */}
        <div className="w-56 flex flex-col gap-3 overflow-y-auto flex-shrink-0">

          {/* Elements */}
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Elementos</p>
            {layout.elements
              .filter((e) => e.type === 'card_number')
              .map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${selectedId === e.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  <Type className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">Número da Cartela{i > 0 ? ` ${i + 1}` : ''}</span>
                </button>
              ))}
            {!rifaOnly && layout.elements
              .filter((e) => e.type === 'bingo_grid')
              .map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${selectedId === e.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Grade Bingo {i + 1}
                </button>
              ))}
            {!rifaOnly && (
              <Button size="sm" variant="outline" onClick={addBingoGridElement} className="w-full gap-1 h-7 text-xs">
                <Plus className="w-3 h-3" /> Adicionar Grade Bingo
              </Button>
            )}
            {layout.elements
              .filter((e) => e.type === 'text')
              .map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${selectedId === e.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  <Type className="w-3.5 h-3.5" />
                  <span className="truncate">{e.content ?? 'Texto'}</span>
                </button>
              ))}
            <Button size="sm" variant="outline" onClick={addTextElement} className="w-full gap-1 h-7 text-xs">
              <Plus className="w-3 h-3" /> Adicionar Texto
            </Button>
            {layout.elements
              .filter((e) => e.type === 'barcode')
              .map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${selectedId === e.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  <Barcode className="w-3.5 h-3.5" />
                  <span className="truncate">Código de Barras</span>
                </button>
              ))}
            <Button size="sm" variant="outline" onClick={addBarcodeElement} className="w-full gap-1 h-7 text-xs">
              <Plus className="w-3 h-3" /> Adicionar Código de Barras
            </Button>
          </div>

          {/* Buyer fields */}
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Comprador</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Campos preenchidos pelo comprador no momento da compra online.</p>
            {(['buyer_name', 'buyer_address', 'buyer_city', 'buyer_phone'] as const).map((type) => (
              layout.elements.filter(e => e.type === type).map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${selectedId === e.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  <User className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{BUYER_ELEMENT_LABELS[type]}</span>
                </button>
              ))
            ))}
            <div className="grid grid-cols-2 gap-1">
              {([
                ['buyer_name', 'Nome'],
                ['buyer_address', 'Endereço'],
                ['buyer_city', 'Cidade'],
                ['buyer_phone', 'Telefone'],
              ] as const).map(([type, label]) => (
                !layout.elements.some(e => e.type === type) && (
                  <Button key={type} size="sm" variant="outline" onClick={() => addBuyerElement(type)} className="gap-1 h-7 text-xs">
                    <Plus className="w-3 h-3" /> {label}
                  </Button>
                )
              ))}
            </div>
          </div>

          {/* Background */}
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plano de Fundo</p>
            <PropRow label="Cor de fundo">
              <input
                type="color"
                value={layout.background.color}
                onChange={(e) => updateBackground({ color: e.target.value })}
                className="w-full h-8 rounded cursor-pointer border border-border"
              />
            </PropRow>
            <PropRow label="Imagem de fundo">
              <Button size="sm" variant="outline" onClick={() => bgInputRef.current?.click()} className="w-full gap-1 h-7 text-xs">
                <Image className="w-3 h-3" />
                {layout.background.imageData ? 'Trocar imagem' : 'Carregar imagem'}
              </Button>
              {layout.background.imageData && (
                <Button size="sm" variant="ghost" onClick={() => updateBackground({ imageData: undefined })} className="w-full gap-1 h-7 text-xs text-destructive">
                  <Trash2 className="w-3 h-3" /> Remover imagem
                </Button>
              )}
            </PropRow>
            {layout.background.imageData && (
              <PropRow label={`Opacidade: ${Math.round((layout.background.imageOpacity ?? 1) * 100)}%`}>
                <Slider
                  min={0} max={100} step={1}
                  value={[Math.round((layout.background.imageOpacity ?? 1) * 100)]}
                  onValueChange={([v]) => updateBackground({ imageOpacity: v / 100 })}
                />
              </PropRow>
            )}
            <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgImageUpload} />
          </div>

          {/* Card preview navigator */}
          {cards.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prévia</p>
              <div className="flex items-center justify-between gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))} disabled={previewIndex === 0}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground text-center">
                  {(previewIndex + 1).toString().padStart(3, '0')} / {cards.length.toString().padStart(3, '0')}
                </span>
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => setPreviewIndex((i) => Math.min(cards.length - 1, i + 1))} disabled={previewIndex === cards.length - 1}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              {activeLayoutId && previewCard && (
                <Button
                  size="sm"
                  variant={lojaCartelas.some(c => c.card_set_id === activeLayoutId && c.numero_cartela === previewCard.cartelaNumero) ? 'default' : 'outline'}
                  className="w-full gap-1 h-7 text-xs"
                  onClick={handleOpenVenderModal}
                >
                  <ShoppingCart className="w-3 h-3" />
                  {lojaCartelas.some(c => c.card_set_id === activeLayoutId && c.numero_cartela === previewCard.cartelaNumero)
                    ? 'Na loja ✓'
                    : 'Disponibilizar para Venda'}
                </Button>
              )}
              {activeLayoutId && cards.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1 h-7 text-xs"
                  onClick={handleOpenBulkVender}
                >
                  <Store className="w-3 h-3" />
                  Disponibilizar Várias em Prévia
                </Button>
              )}
              {activeLayoutId && vendedores.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1 h-7 text-xs"
                  onClick={handleOpenVendedorLojaModal}
                >
                  <User className="w-3 h-3" />
                  Disponibilizar por Vendedor
                </Button>
              )}
            </div>
          )}

          {/* Reset */}
          <Button size="sm" variant="ghost" onClick={resetLayout} className="w-full gap-1 h-7 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3" /> Restaurar layout padrão
          </Button>
        </div>

        {/* ─ Canvas ─ */}
        <div className="flex-1 bg-muted overflow-auto flex items-start justify-center p-6 min-w-0">
          <div
            style={{
              width: canvasW,
              height: canvasH,
              position: 'relative',
              flexShrink: 0,
              backgroundColor: layout.background.color,
              backgroundImage: layout.background.imageData
                ? `url(${layout.background.imageData})`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
              userSelect: 'none',
            }}
            onClick={() => setSelectedId(null)}
          >
            {/* Background image opacity overlay */}
            {layout.background.imageData && layout.background.imageOpacity !== undefined && layout.background.imageOpacity < 1 && (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  background: layout.background.color,
                  opacity: 1 - (layout.background.imageOpacity ?? 1),
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Canvas elements */}
            {layout.elements.filter(el => !(rifaOnly && el.type === 'bingo_grid')).map((el) => {
              const isSelected = selectedId === el.id;
              return (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: mm(el.x),
                    top: mm(el.y),
                    width: mm(el.width),
                    height: mm(el.height),
                    cursor: 'move',
                    outline: isSelected ? '2px solid #3b82f6' : undefined,
                    outlineOffset: 1,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    backgroundColor: el.backgroundColor && el.backgroundColor !== 'transparent'
                      ? el.backgroundColor : undefined,
                  }}
                  onPointerDown={(e) => handleElementPointerDown(e, el.id)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Content */}
                  {el.type === 'card_number' && (
                    <div
                      style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center',
                        justifyContent: el.textAlign === 'center' ? 'center'
                          : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
                        fontSize: el.fontSize,
                        fontWeight: el.fontWeight === 'bold' ? 'bold' : 'normal',
                        color: el.color ?? '#1e3a8a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                      }}
                    >
                      {el.prefix ?? 'Cartela '}
                      {previewCard
                        ? previewCard.cartelaNumero.toString().padStart(3, '0')
                        : '001'}
                    </div>
                  )}

                  {el.type === 'bingo_grid' && !rifaOnly && (
                    <BingoGridPreview el={el} card={previewCard} scale={SCALE} numeroPremios={numeroPremios} gridCols={gridCols} gridRows={gridRows} />
                  )}

                  {el.type === 'text' && (
                    <div
                      style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center',
                        justifyContent: el.textAlign === 'center' ? 'center'
                          : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
                        fontSize: el.fontSize,
                        fontWeight: el.fontWeight === 'bold' ? 'bold' : 'normal',
                        color: el.color ?? '#111827',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                      }}
                    >
                      {el.content}
                    </div>
                  )}

                  {el.type === 'barcode' && (
                    <BarcodePreview el={el} cartelaNumero={previewCard?.cartelaNumero ?? 1} />
                  )}

                  {(el.type === 'buyer_name' || el.type === 'buyer_address' || el.type === 'buyer_city' || el.type === 'buyer_phone') && (
                    <div
                      style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center',
                        justifyContent: el.textAlign === 'center' ? 'center'
                          : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
                        fontSize: el.fontSize,
                        fontWeight: el.fontWeight === 'bold' ? 'bold' : 'normal',
                        color: el.color ?? '#9ca3af',
                        fontStyle: 'italic',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        borderBottom: '1px dashed #9ca3af',
                      }}
                    >
                      {BUYER_ELEMENT_LABELS[el.type]}
                    </div>
                  )}

                  {/* Resize handles (only on selected) */}
                  {isSelected && (
                    <ResizeHandles
                      onPointerDown={(e, h) => handleResizePointerDown(e, el.id, h)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─ Properties panel ─ */}
        <div className="w-64 flex flex-col gap-3 overflow-y-auto flex-shrink-0">
          {!selectedEl ? (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Clique num elemento para editar
              </p>
              <p className="text-xs text-muted-foreground">
                Arraste elementos no canvas para reposicioná-los. Use as alças de canto para redimensionar.
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {selectedEl.type === 'card_number' && (() => {
                    const idx = layout.elements.filter(e => e.type === 'card_number').findIndex(e => e.id === selectedEl.id);
                    return idx > 0 ? `Número da Cartela ${idx + 1}` : 'Número da Cartela';
                  })()}
                  {selectedEl.type === 'bingo_grid' && (() => {
                    const idx = layout.elements.filter(e => e.type === 'bingo_grid').findIndex(e => e.id === selectedEl.id);
                    return `Grade Bingo ${idx + 1}`;
                  })()}
                  {selectedEl.type === 'text' && 'Texto'}
                  {selectedEl.type === 'barcode' && 'Código de Barras'}
                  {(selectedEl.type === 'buyer_name' || selectedEl.type === 'buyer_address' || selectedEl.type === 'buyer_city' || selectedEl.type === 'buyer_phone') && BUYER_ELEMENT_LABELS[selectedEl.type]}
                </p>
                <div className="flex items-center gap-1">
                  {selectedEl.type === 'card_number' && (
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground"
                      title="Duplicar"
                      onClick={() => duplicateCardNumber(selectedEl.id)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {(selectedEl.type === 'text' || selectedEl.type === 'barcode' ||
                    selectedEl.type === 'buyer_name' || selectedEl.type === 'buyer_address' ||
                    selectedEl.type === 'buyer_city' || selectedEl.type === 'buyer_phone' ||
                    (selectedEl.type === 'card_number' && selectedEl.id !== 'card_number') ||
                    (selectedEl.type === 'bingo_grid' && layout.elements.filter(e => e.type === 'bingo_grid').length > 1)) && (
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                      onClick={() => deleteElement(selectedEl.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Position & size */}
              <div className="grid grid-cols-2 gap-2">
                <NumberInput label="X (mm)" value={Math.round(selectedEl.x * 10) / 10}
                  onChange={(v) => updateElement(selectedEl.id, { x: v })} min={0} max={paperW} step={0.5} />
                <NumberInput label="Y (mm)" value={Math.round(selectedEl.y * 10) / 10}
                  onChange={(v) => updateElement(selectedEl.id, { y: v })} min={0} max={paperH} step={0.5} />
                <NumberInput label="Largura (mm)" value={Math.round(selectedEl.width * 10) / 10}
                  onChange={(v) => updateElement(selectedEl.id, { width: v })} min={5} max={paperW} step={0.5} />
                <NumberInput label="Altura (mm)" value={Math.round(selectedEl.height * 10) / 10}
                  onChange={(v) => updateElement(selectedEl.id, { height: v })} min={4} max={paperH} step={0.5} />
              </div>

              {/* Text content (text element only) */}
              {selectedEl.type === 'text' && (
                <PropRow label="Conteúdo">
                  <Input
                    value={selectedEl.content ?? ''}
                    onChange={(e) => updateElement(selectedEl.id, { content: e.target.value })}
                    className="h-7 text-xs"
                  />
                </PropRow>
              )}

              {/* Prefix (card_number only) */}
              {selectedEl.type === 'card_number' && (
                <PropRow label="Prefixo">
                  <Input
                    value={selectedEl.prefix ?? 'Cartela '}
                    onChange={(e) => updateElement(selectedEl.id, { prefix: e.target.value })}
                    className="h-7 text-xs"
                    placeholder="ex: Cartela "
                  />
                </PropRow>
              )}

              {/* Font (card_number / text / buyer fields) */}
              {(selectedEl.type === 'card_number' || selectedEl.type === 'text' ||
                selectedEl.type === 'buyer_name' || selectedEl.type === 'buyer_address' ||
                selectedEl.type === 'buyer_city' || selectedEl.type === 'buyer_phone') && (
                <>
                  <NumberInput label="Tamanho (pt)" value={selectedEl.fontSize ?? 14}
                    onChange={(v) => updateElement(selectedEl.id, { fontSize: v })} min={6} max={72} />
                  <PropRow label="Estilo">
                    <div className="flex gap-1">
                      <Button size="sm" variant={selectedEl.fontWeight === 'bold' ? 'default' : 'outline'}
                        className="h-7 w-8 p-0"
                        onClick={() => updateElement(selectedEl.id, { fontWeight: selectedEl.fontWeight === 'bold' ? 'normal' : 'bold' })}>
                        <Bold className="w-3.5 h-3.5" />
                      </Button>
                      {(['left', 'center', 'right'] as const).map((align) => {
                        const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                        return (
                          <Button key={align} size="sm"
                            variant={selectedEl.textAlign === align ? 'default' : 'outline'}
                            className="h-7 w-8 p-0"
                            onClick={() => updateElement(selectedEl.id, { textAlign: align })}>
                            <Icon className="w-3.5 h-3.5" />
                          </Button>
                        );
                      })}
                    </div>
                  </PropRow>
                  <ColorInput label="Cor do texto" value={selectedEl.color ?? '#000000'}
                    onChange={(v) => updateElement(selectedEl.id, { color: v })} />
                  <ColorInput label="Cor de fundo" value={selectedEl.backgroundColor ?? '#ffffff'}
                    onChange={(v) => updateElement(selectedEl.id, { backgroundColor: v })} />
                </>
              )}

              {/* Bingo grid properties */}
              {selectedEl.type === 'bingo_grid' && (
                <>
                  <div className="border-t border-border pt-2">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Opções</p>
                    <div className="space-y-2">
                      <PropRow label="">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedEl.showHeader === true}
                            onChange={(e) => updateElement(selectedEl.id, { showHeader: e.target.checked })}
                            className="w-3.5 h-3.5"
                          />
                          <span className="text-xs">Mostrar cabeçalho (B I N G O)</span>
                        </label>
                      </PropRow>
                      <PropRow label="">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedEl.showFreeText === true}
                            onChange={(e) => updateElement(selectedEl.id, { showFreeText: e.target.checked })}
                            className="w-3.5 h-3.5"
                          />
                          <span className="text-xs">Mostrar texto FREE na célula central</span>
                        </label>
                      </PropRow>
                    </div>
                  </div>
                  <div className="border-t border-border pt-2">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Cabeçalho (B I N G O)</p>
                    <div className="space-y-2">
                      <NumberInput label="Tamanho fonte (pt)" value={selectedEl.headerFontSize ?? 14}
                        onChange={(v) => updateElement(selectedEl.id, { headerFontSize: v })} min={6} max={48} />
                      <ColorInput label="Cor de fundo" value={selectedEl.headerColor ?? '#1e3a8a'}
                        onChange={(v) => updateElement(selectedEl.id, { headerColor: v })} />
                      <ColorInput label="Cor do texto" value={selectedEl.headerTextColor ?? '#ffffff'}
                        onChange={(v) => updateElement(selectedEl.id, { headerTextColor: v })} />
                    </div>
                  </div>
                  <div className="border-t border-border pt-2">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Células de números</p>
                    <div className="space-y-2">
                      <NumberInput label="Tamanho fonte (pt)" value={selectedEl.fontSize ?? 12}
                        onChange={(v) => updateElement(selectedEl.id, { fontSize: v })} min={6} max={48} />
                      <ColorInput label="Cor dos números" value={selectedEl.color ?? '#111827'}
                        onChange={(v) => updateElement(selectedEl.id, { color: v })} />
                      <ColorInput label="Fundo da célula" value={selectedEl.cellBgColor ?? 'transparent'}
                        onChange={(v) => updateElement(selectedEl.id, { cellBgColor: v })} />
                      <ColorInput label="Célula central" value={selectedEl.freeCellColor ?? 'transparent'}
                        onChange={(v) => updateElement(selectedEl.id, { freeCellColor: v })} />
                    </div>
                  </div>
                  <div className="border-t border-border pt-2">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Bordas</p>
                    <div className="space-y-2">
                      <ColorInput label="Cor da borda" value={selectedEl.borderColor ?? '#1e3a8a'}
                        onChange={(v) => updateElement(selectedEl.id, { borderColor: v })} />
                      <PropRow label={`Espessura: ${selectedEl.borderWidth ?? 0.5} mm`}>
                        <Slider
                          min={0} max={20} step={1}
                          value={[Math.round((selectedEl.borderWidth ?? 0.5) * 10)]}
                          onValueChange={([v]) => updateElement(selectedEl.id, { borderWidth: v / 10 })}
                        />
                      </PropRow>
                    </div>
                  </div>
                </>
              )}

              {/* Barcode properties */}
              {selectedEl.type === 'barcode' && (
                <div className="border-t border-border pt-2 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Código de Barras</p>
                  <PropRow label="Formato">
                    <select
                      value={selectedEl.barcodeFormat ?? 'CODE128'}
                      onChange={(e) => updateElement(selectedEl.id, { barcodeFormat: e.target.value })}
                      className="h-7 text-xs w-full rounded border border-border bg-background px-2"
                    >
                      <option value="CODE128">CODE128</option>
                      <option value="CODE39">CODE39</option>
                      <option value="EAN13">EAN-13</option>
                      <option value="EAN8">EAN-8</option>
                    </select>
                  </PropRow>
                  <PropRow label="">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEl.showBarcodeText !== false}
                        onChange={(e) => updateElement(selectedEl.id, { showBarcodeText: e.target.checked })}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-xs">Mostrar número abaixo do código</span>
                    </label>
                  </PropRow>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* ── Save Layout Dialog ── */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{activeLayoutId ? 'Atualizar Cartela' : 'Salvar Cartela Como...'}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-sm font-medium">Nome da Cartela</Label>
            <Input
              className="mt-1"
              placeholder="Ex: Cartela Natal 2025"
              value={saveLayoutName}
              onChange={(e) => setSaveLayoutName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveLayout()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)} disabled={isSavingLayout}>
              Cancelar
            </Button>
            <Button onClick={handleSaveLayout} disabled={isSavingLayout} className="gap-2">
              {isSavingLayout ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {activeLayoutId ? 'Atualizar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Layouts List Dialog ── */}
      <Dialog open={showLayoutsList} onOpenChange={setShowLayoutsList}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <List className="w-5 h-5" />
              Cartelas de Bingo Salvas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto py-1">
            {cartelaLayouts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma cartela salva ainda. Gere e salve uma cartela primeiro.
              </p>
            ) : (
              cartelaLayouts.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at!).toLocaleDateString('pt-BR')}
                      {item.id === activeLayoutId && (
                        <span className="ml-2 text-primary font-medium">• Ativa</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button
                      size="sm" variant="outline" className="gap-1 h-7 text-xs"
                      onClick={() => handleLoadLayout(item)}
                    >
                      <Edit2 className="w-3 h-3" /> Carregar
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                      onClick={() => setDeletingLayoutId(item.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="flex-row justify-between">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleNewLayout}>
              <Plus className="w-4 h-4" /> Nova Cartela
            </Button>
            <Button variant="outline" onClick={() => setShowLayoutsList(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Layout Confirmation ── */}
      <AlertDialog open={!!deletingLayoutId} onOpenChange={(open) => { if (!open) setDeletingLayoutId(null); }}>        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartela?</AlertDialogTitle>
            <AlertDialogDescription>
              A cartela "{cartelaLayouts.find(l => l.id === deletingLayoutId)?.nome}" será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deletingLayoutId) return;
                try {
                  await deleteCartelaLayout(deletingLayoutId);
                  if (activeLayoutId === deletingLayoutId) setActiveLayoutId(null);
                  toast({ title: 'Cartela excluída!' });
                } catch {
                  toast({ title: 'Erro ao excluir', variant: 'destructive' });
                } finally {
                  setDeletingLayoutId(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Regenerate Cards Confirmation ── */}
      <AlertDialog open={showGenerateConfirm} onOpenChange={(open) => { if (!open) setShowGenerateConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar novas cartelas?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os números das cartelas atuais serão perdidos e novas cartelas serão geradas. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { setShowGenerateConfirm(false); await doGenerate(); }}
            >
              Gerar novas cartelas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Disponibilizar para Venda modal ── */}
      <Dialog open={showVenderModal} onOpenChange={setShowVenderModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Disponibilizar para Venda
            </DialogTitle>
          </DialogHeader>
          {previewCard && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cartela <strong>{previewCard.cartelaNumero.toString().padStart(3, '0')}</strong> será disponibilizada na sua loja pública.
              </p>
              <div className="space-y-1.5">
                <Label className="text-sm">Preço (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={vendaPreco}
                  onChange={(e) => setVendaPreco(e.target.value)}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVenderModal(false)}>Cancelar</Button>
            <Button onClick={handleConfirmarVenda} disabled={isVendendo} className="gap-2">
              {isVendendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
              Disponibilizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Minha Loja dialog ── */}
      <Dialog open={showMinhaLojaDialog} onOpenChange={(open) => { setShowMinhaLojaDialog(open); if (!open) setSelectedLojaIds(new Set()); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="w-5 h-5" />
              Minha Loja
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1">
            {/* Public link */}
            <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <Link className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-xs text-muted-foreground flex-1 truncate">{publicUrl}</span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-shrink-0"
                onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: 'Link copiado!' }); }}>
                <Copy className="w-3 h-3" /> Copiar
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-shrink-0"
                onClick={() => window.open(publicUrl, '_blank')}>
                Abrir
              </Button>
            </div>

            {lojaCartelas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhuma cartela na loja. Acesse a Prévia e clique em "Disponibilizar para Venda".
              </div>
            ) : (
              <>
                {/* Bulk actions toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => setSelectedLojaIds(new Set(lojaCartelas.map(c => c.id)))}
                  >
                    Selecionar todas
                  </button>
                  <span className="text-xs text-muted-foreground">|</span>
                  <button
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => setSelectedLojaIds(new Set())}
                  >
                    Desmarcar todas
                  </button>
                  {selectedLojaIds.size > 0 && (
                    <Button
                      size="sm" variant="destructive" className="h-7 text-xs gap-1 ml-auto"
                      onClick={handleExcluirSelecionadas}
                      disabled={isDeletingLoja}
                    >
                      {isDeletingLoja ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Excluir selecionadas ({selectedLojaIds.size})
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {lojaCartelas.map((lc) => (
                    <div key={lc.id} className={`flex items-center gap-3 p-3 border rounded-lg bg-card ${selectedLojaIds.has(lc.id) ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary flex-shrink-0"
                        checked={selectedLojaIds.has(lc.id)}
                        onChange={(e) => {
                          setSelectedLojaIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(lc.id); else next.delete(lc.id);
                            return next;
                          });
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Cartela {lc.numero_cartela.toString().padStart(3, '0')}</p>
                        {lc.card_set_nome && <p className="text-xs text-muted-foreground truncate">{lc.card_set_nome}</p>}
                        {lc.status === 'vendida' && lc.comprador_nome && (
                          <p className="text-xs text-green-600 font-medium">Vendida para: {lc.comprador_nome}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {lc.status === 'disponivel' ? (
                          editingPrecoId === lc.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number" min="0" step="0.01"
                                value={editingPrecoValor}
                                onChange={(e) => setEditingPrecoValor(e.target.value)}
                                className="h-7 w-24 text-xs"
                              />
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleSalvarPrecoEdicao(lc.id)}>OK</Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingPrecoId(null)} aria-label="Cancelar edição"><X className="w-3 h-3" /></Button>
                            </div>
                          ) : (
                            <button
                              className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                              onClick={() => { setEditingPrecoId(lc.id); setEditingPrecoValor(String(lc.preco)); }}
                            >
                              <DollarSign className="w-3 h-3" />
                              R$ {Number(lc.preco).toFixed(2).replace('.', ',')}
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )
                        ) : (
                          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">Vendida</span>
                        )}
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                          onClick={() => removerCartelaLoja(lc.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Disponibilizar Várias em Prévia dialog ── */}
      <Dialog open={showBulkVenderModal} onOpenChange={(open) => { if (!open && !isBulkVendendo) setShowBulkVenderModal(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="w-5 h-5" />
              Disponibilizar Várias em Prévia
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione o intervalo de cartelas para disponibilizar na loja. As cartelas já existentes serão atualizadas com o novo preço.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Da cartela</Label>
                <Input
                  type="number"
                  min={1}
                  max={cards.length}
                  value={bulkFrom}
                  onChange={(e) => setBulkFrom(Number(e.target.value))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Até a cartela</Label>
                <Input
                  type="number"
                  min={1}
                  max={cards.length}
                  value={bulkTo}
                  onChange={(e) => setBulkTo(Number(e.target.value))}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Preço (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={bulkPreco}
                onChange={(e) => setBulkPreco(e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            {isBulkVendendo && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Publicando cartelas…</span>
                  <span>{bulkProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${bulkProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkVenderModal(false)} disabled={isBulkVendendo}>Cancelar</Button>
            <Button onClick={handleBulkVender} disabled={isBulkVendendo} className="gap-2">
              {isBulkVendendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
              Disponibilizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Exportar Faixa dialog ── */}
      <Dialog open={showExportRangeModal} onOpenChange={(open) => { if (!open && !isExportingRange) setShowExportRangeModal(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Exportar Faixa de Cartelas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Informe o intervalo de cartelas que deseja exportar. Para uma única cartela, preencha o mesmo número nos dois campos.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Da cartela</Label>
                <Input
                  type="number"
                  min={1}
                  max={cards.length > 0 ? cards[cards.length - 1].cartelaNumero : totalCards}
                  value={exportRangeFrom}
                  onChange={(e) => setExportRangeFrom(Number(e.target.value))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Até a cartela</Label>
                <Input
                  type="number"
                  min={1}
                  max={cards.length > 0 ? cards[cards.length - 1].cartelaNumero : totalCards}
                  value={exportRangeTo}
                  onChange={(e) => setExportRangeTo(Number(e.target.value))}
                  className="h-9"
                />
              </div>
            </div>
            {isA4MultiAvailable && (
              <div className="space-y-1.5">
                <Label className="text-sm">Formato</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={!exportRangeA4 ? 'default' : 'outline'}
                    className="flex-1 text-xs"
                    onClick={() => setExportRangeA4(false)}
                  >
                    Uma por página
                  </Button>
                  <Button
                    size="sm"
                    variant={exportRangeA4 ? 'default' : 'outline'}
                    className="flex-1 text-xs"
                    onClick={() => setExportRangeA4(true)}
                  >
                    Múltiplas por página (A4)
                  </Button>
                </div>
              </div>
            )}
            {isExportingRange && exportProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Exportando cartelas…</span>
                  <span>{exportProgress.done} / {exportProgress.total}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${exportProgress.total > 0 ? (exportProgress.done / exportProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportRangeModal(false)} disabled={isExportingRange}>Cancelar</Button>
            <Button onClick={handleExportRange} disabled={isExportingRange} className="gap-2">
              {isExportingRange ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exportar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Disponibilizar por Vendedor dialog ── */}
      <Dialog open={showVendedorLojaModal} onOpenChange={(open) => { if (!open && !isVendedorLojaVendendo) setShowVendedorLojaModal(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Disponibilizar por Vendedor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione um vendedor para disponibilizar na loja todas as cartelas atribuídas a ele que possuam números gerados.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm">Vendedor</Label>
              <Select value={vendedorLojaId} onValueChange={setVendedorLojaId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione um vendedor…" />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.filter(v => v.ativo).map(v => {
                    const count = cartelas.filter(c => c.vendedor_id === v.id && c.numeros_grade && c.numeros_grade.length > 0).length;
                    return (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nome} ({count} cartela{count !== 1 ? 's' : ''} com números)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Preço (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={vendedorLojaPreco}
                onChange={(e) => setVendedorLojaPreco(e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            {isVendedorLojaVendendo && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Publicando cartelas…</span>
                  <span>{vendedorLojaProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${vendedorLojaProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVendedorLojaModal(false)} disabled={isVendedorLojaVendendo}>Cancelar</Button>
            <Button onClick={handleVendedorLoja} disabled={isVendedorLojaVendendo || !vendedorLojaId} className="gap-2">
              {isVendedorLojaVendendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
              Disponibilizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BingoCardsBuilderTab;
