type JsPdfCtor = (typeof import('jspdf'))['default'];
type JsBarcodeFn = (typeof import('jsbarcode'))['default'];
type JsPdfInstance = InstanceType<JsPdfCtor>;

let jsPdfCtorPromise: Promise<JsPdfCtor> | null = null;
let jsBarcodeFnPromise: Promise<JsBarcodeFn> | null = null;

const loadJsPdfCtor = async (): Promise<JsPdfCtor> => {
  if (!jsPdfCtorPromise) {
    jsPdfCtorPromise = import('jspdf').then((module) => module.default);
  }
  return jsPdfCtorPromise;
};

const loadJsBarcodeFn = async (): Promise<JsBarcodeFn> => {
  if (!jsBarcodeFnPromise) {
    jsBarcodeFnPromise = import('jsbarcode').then((module) => module.default);
  }
  return jsBarcodeFnPromise;
};

export const BINGO_COLS = ['B', 'I', 'N', 'G', 'O'] as const;
export const A4_W_MM = 210;
export const A4_H_MM = 297;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BingoCardGrid {
  cartelaNumero: number;
  /** grids[premioIndex][row][col] */
  grids: number[][][];
}

export interface CanvasElement {
  id: string;
  type: 'card_number' | 'bingo_grid' | 'text' | 'barcode' | 'buyer_name' | 'buyer_address' | 'buyer_city' | 'buyer_phone';
  x: number;       // mm from left
  y: number;       // mm from top
  width: number;   // mm
  height: number;  // mm
  // Common style
  fontSize?: number;          // pt
  fontWeight?: 'normal' | 'bold';
  color?: string;             // hex
  backgroundColor?: string;  // hex or 'transparent'
  borderColor?: string;
  borderWidth?: number;       // mm
  textAlign?: 'left' | 'center' | 'right';
  // card_number specific
  prefix?: string;
  // bingo_grid specific
  headerColor?: string;
  headerTextColor?: string;
  headerFontSize?: number;    // pt
  cellBgColor?: string;
  freeCellColor?: string;
  showHeader?: boolean;       // show B I N G O header row (default false)
  showFreeText?: boolean;     // show FREE text in center cell (default false)
  // text specific
  content?: string;
  // barcode specific
  barcodeFormat?: string;     // default 'CODE128'
  showBarcodeText?: boolean;  // show text below barcode (default true)
}

export interface CanvasBackground {
  color: string;
  imageData?: string;    // base64 data-URL
  imageOpacity?: number; // 0–1
}

export interface CanvasLayout {
  background: CanvasBackground;
  elements: CanvasElement[];
}

// ─── Buyer data ───────────────────────────────────────────────────────────────

export interface BuyerData {
  nome?: string;
  endereco?: string;
  cidade?: string;
  telefone?: string;
}

/** Placeholder labels shown in the builder canvas for buyer fields */
export const BUYER_ELEMENT_LABELS: Record<string, string> = {
  buyer_name:    '[ Nome ]',
  buyer_address: '[ Endereço ]',
  buyer_city:    '[ Cidade ]',
  buyer_phone:   '[ Telefone ]',
};

// ─── Default layout ───────────────────────────────────────────────────────────

export const DEFAULT_LAYOUT: CanvasLayout = {
  background: { color: '#ffffff', imageOpacity: 1 },
  elements: [
    {
      id: 'card_number',
      type: 'card_number',
      x: 10, y: 8, width: 190, height: 22,
      fontSize: 22, fontWeight: 'bold',
      color: '#1e3a8a', backgroundColor: 'transparent',
      textAlign: 'center', prefix: 'Cartela ',
    },
    {
      id: 'bingo_grid',
      type: 'bingo_grid',
      x: 10, y: 36, width: 190, height: 248,
      fontSize: 14, color: '#111827',
      backgroundColor: 'transparent',
      borderColor: '#1e3a8a', borderWidth: 0.5,
      headerColor: '#1e3a8a', headerTextColor: '#ffffff', headerFontSize: 16,
      cellBgColor: 'transparent', freeCellColor: 'transparent',
      showHeader: false, showFreeText: false,
    },
  ],
};

// ─── Card generation ──────────────────────────────────────────────────────────

function pickRandom(min: number, max: number, count: number): number[] {
  const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const res: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    res.push(pool.splice(idx, 1)[0]);
  }
  return res.sort((a, b) => a - b);
}

/**
 * Returns the highest number that can appear on a bingo card for the given grid
 * dimensions. This matches the number pool used by generateBingoGrid:
 * - Standard 5×5: 75 (classic B-I-N-G-O distribution)
 * - Custom sizes: cols × rows × 3
 */
export function getBingoMaxNumber(cols: number = 5, rows: number = 5): number {
  return cols === 5 && rows === 5 ? 75 : cols * rows * 3;
}

export function generateBingoGrid(cols: number = 5, rows: number = 5): number[][] {
  if (cols === 5 && rows === 5) {
    // Standard BINGO distribution (B:1-15, I:16-30, N:31-45, G:46-60, O:61-75)
    const b = pickRandom(1, 15, 5);
    const iNums = pickRandom(16, 30, 5);
    const n = pickRandom(31, 45, 5);
    const g = pickRandom(46, 60, 5);
    const o = pickRandom(61, 75, 5);
    return Array.from({ length: 5 }, (_, row) => [b[row], iNums[row], n[row], g[row], o[row]]);
  }
  // For custom grid sizes: pick unique numbers from 1 to cols*rows*3
  const total = cols * rows;
  const maxNum = total * 3;
  const nums = pickRandom(1, maxNum, total);
  return Array.from({ length: rows }, (_, row) => nums.slice(row * cols, (row + 1) * cols));
}

export function generateAllBingoCards(
  quantidade: number,
  numeroPremios: number = 1,
  cols: number = 5,
  rows: number = 5,
): BingoCardGrid[] {
  const premios = Math.max(1, Math.round(numeroPremios));
  const cards: BingoCardGrid[] = [];
  // Track seen grids to avoid duplicate cards
  const seenGrids = new Set<string>();
  for (let i = 1; i <= quantidade; i++) {
    // Generate ONE unique grid per card; all prizes share the same numbers
    let baseGrid: number[][] = [];
    let tries = 0;
    do {
      baseGrid = generateBingoGrid(cols, rows);
      tries++;
    } while (seenGrids.has(baseGrid.flat().join(',')) && tries < 500);
    seenGrids.add(baseGrid.flat().join(','));
    // Replicate the same grid for every prize (deep-copy each row so rendering
    // or game logic cannot accidentally mutate another prize's grid reference)
    const grids = Array.from({ length: premios }, () => baseGrid.map(row => [...row]));
    cards.push({ cartelaNumero: i, grids });
  }
  return cards;
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#000000');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

/** Render a barcode for `value` to a PNG data-URL using JsBarcode on a canvas */
function renderBarcodeToDataUrl(
  value: string,
  format: string,
  showText: boolean,
  jsBarcode: JsBarcodeFn,
): string | null {
  try {
    const canvas = document.createElement('canvas');
    jsBarcode(canvas, value, {
      format: format,
      displayValue: showText,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Render all elements of one card onto the doc at an (offsetX, offsetY) position (in mm). */
async function renderCardToPdf(
  doc: JsPdfInstance,
  card: BingoCardGrid,
  layout: CanvasLayout,
  offsetX: number,
  offsetY: number,
  ticketW: number,
  ticketH: number,
  gridCols: number,
  gridRows: number,
  rifaOnly: boolean,
  jsBarcode: JsBarcodeFn,
  buyerData?: BuyerData,
) {
  const numeroPremios = card.grids.length;

  // Background colour (clipped to ticket area)
  doc.setFillColor(...hexToRgb(layout.background.color));
  doc.rect(offsetX, offsetY, ticketW, ticketH, 'F');

  // Background image
  if (layout.background.imageData) {
    try {
      const fmt = layout.background.imageData.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(layout.background.imageData, fmt, offsetX, offsetY, ticketW, ticketH);
    } catch { /* ignore unsupported images */ }
  }

  for (const el of layout.elements) {
    if (rifaOnly && el.type === 'bingo_grid') continue;

    // Shift element coordinates by the canvas offset
    const oel: CanvasElement = { ...el, x: el.x + offsetX, y: el.y + offsetY };

    if (oel.type === 'card_number') {
      const num = card.cartelaNumero.toString().padStart(3, '0');
      const text = `${oel.prefix ?? 'Cartela '}${num}`;
      doc.setTextColor(...hexToRgb(oel.color ?? '#000000'));
      doc.setFontSize(oel.fontSize ?? 18);
      doc.setFont('helvetica', oel.fontWeight === 'bold' ? 'bold' : 'normal');
      const align = (oel.textAlign ?? 'center') as 'left' | 'center' | 'right';
      const tx = align === 'center' ? oel.x + oel.width / 2
        : align === 'right' ? oel.x + oel.width : oel.x;
      doc.text(text, tx, oel.y + oel.height * 0.72, { align });
    } else if (oel.type === 'bingo_grid') {
      const gridHeight = oel.height / numeroPremios;
      const gridEl = { ...oel, height: gridHeight };
      for (let p = 0; p < numeroPremios; p++) {
        const relativeGridOffsetY = p * gridHeight;
        if (numeroPremios > 1) {
          doc.setTextColor(...hexToRgb(oel.color ?? '#111827'));
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(`Prêmio ${p + 1}`, oel.x, oel.y + relativeGridOffsetY - 1);
        }
        drawGridPdf(doc, gridEl, card.grids[p], relativeGridOffsetY, gridCols, gridRows);
      }
    } else if (oel.type === 'text') {
      doc.setTextColor(...hexToRgb(oel.color ?? '#000000'));
      doc.setFontSize(oel.fontSize ?? 12);
      doc.setFont('helvetica', oel.fontWeight === 'bold' ? 'bold' : 'normal');
      const align = (oel.textAlign ?? 'left') as 'left' | 'center' | 'right';
      const tx = align === 'center' ? oel.x + oel.width / 2
        : align === 'right' ? oel.x + oel.width : oel.x;
      doc.text(oel.content ?? '', tx, oel.y + oel.height * 0.72, { align });
    } else if (oel.type === 'barcode') {
      const barcodeValue = card.cartelaNumero.toString().padStart(6, '0');
      const format = oel.barcodeFormat ?? 'CODE128';
      const showText = oel.showBarcodeText !== false;
      const dataUrl = renderBarcodeToDataUrl(barcodeValue, format, showText, jsBarcode);
      if (dataUrl) {
        doc.addImage(dataUrl, 'PNG', oel.x, oel.y, oel.width, oel.height);
      }
    } else if (oel.type === 'buyer_name' || oel.type === 'buyer_address' || oel.type === 'buyer_city' || oel.type === 'buyer_phone') {
      const fieldMap: Record<string, keyof BuyerData> = {
        buyer_name: 'nome', buyer_address: 'endereco', buyer_city: 'cidade', buyer_phone: 'telefone',
      };
      const value = buyerData?.[fieldMap[oel.type]] ?? '';
      if (value) {
        doc.setTextColor(...hexToRgb(oel.color ?? '#000000'));
        doc.setFontSize(oel.fontSize ?? 11);
        doc.setFont('helvetica', oel.fontWeight === 'bold' ? 'bold' : 'normal');
        const align = (oel.textAlign ?? 'left') as 'left' | 'center' | 'right';
        const tx = align === 'center' ? oel.x + oel.width / 2
          : align === 'right' ? oel.x + oel.width : oel.x;
        doc.text(value, tx, oel.y + oel.height * 0.72, { align });
      }
    }
  }
}

function drawGridPdf(
  doc: JsPdfInstance,
  el: CanvasElement,
  grid: number[][],
  offsetY: number = 0,
  cols: number = 5,
  rows: number = 5,
) {
  const showHeader = el.showHeader ?? false;
  const showFreeText = el.showFreeText ?? false;
  const hh = showHeader ? el.height / (rows + 1) : 0;
  const ch = (el.height - hh) / rows;
  const cw = el.width / cols;
  const bw = el.borderWidth ?? 0.5;
  const noBorder = !el.borderColor || el.borderColor === 'transparent' || bw <= 0;
  const gridY = el.y + offsetY;

  const [bR, bG, bB] = hexToRgb(el.borderColor ?? '#1e3a8a');
  const [hR, hG, hB] = hexToRgb(el.headerColor ?? '#1e3a8a');
  const [htR, htG, htB] = hexToRgb(el.headerTextColor ?? '#ffffff');
  const [nR, nG, nB] = hexToRgb(el.color ?? '#111827');
  const cellBg = el.cellBgColor;
  const freeBg = el.freeCellColor;
  const transparent = !cellBg || cellBg === 'transparent';
  const freeTransparent = !freeBg || freeBg === 'transparent';

  // Header row (optional) — shows B I N G O for 5 cols, numbers otherwise
  if (showHeader) {
    const headerLabels = cols === 5
      ? [...BINGO_COLS]
      : Array.from({ length: cols }, (_, i) => (i + 1).toString());
    for (let col = 0; col < cols; col++) {
      const cx = el.x + col * cw;
      doc.setFillColor(hR, hG, hB);
      doc.rect(cx, gridY, cw, hh, 'F');
      if (!noBorder) {
        doc.setDrawColor(bR, bG, bB);
        doc.setLineWidth(bw);
        doc.rect(cx, gridY, cw, hh, 'S');
      }
      doc.setTextColor(htR, htG, htB);
      doc.setFontSize(el.headerFontSize ?? 14);
      doc.setFont('helvetica', 'bold');
      doc.text(headerLabels[col], cx + cw / 2, gridY + hh * 0.72, { align: 'center' });
    }
  }

  // Number cells
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = el.x + col * cw;
      const cy = gridY + hh + row * ch;
      const num = grid[row]?.[col] ?? 0;
      const free = num === 0;
      if (free ? !freeTransparent : !transparent) {
        const [r, g, b] = free ? hexToRgb(freeBg!) : hexToRgb(cellBg!);
        doc.setFillColor(r, g, b);
        doc.rect(cx, cy, cw, ch, 'F');
      }
      if (!noBorder) {
        doc.setDrawColor(bR, bG, bB);
        doc.setLineWidth(bw);
        doc.rect(cx, cy, cw, ch, 'S');
      }
      if (!free || showFreeText) {
        doc.setTextColor(nR, nG, nB);
        doc.setFontSize(el.fontSize ?? 12);
        doc.setFont('helvetica', free ? 'bold' : 'normal');
        doc.text(free ? 'FREE' : num.toString(), cx + cw / 2, cy + ch * 0.68, { align: 'center' });
      }
    }
  }
}

export async function exportBingoCardsPDF(
  cards: BingoCardGrid[],
  layout: CanvasLayout,
  sorteioNome: string,
  buyerData?: BuyerData,
  paperWidthMm: number = A4_W_MM,
  paperHeightMm: number = A4_H_MM,
  gridCols: number = 5,
  gridRows: number = 5,
  rifaOnly: boolean = false,
  a4MultiPerPage: boolean = false,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const [jsPDF, jsBarcode] = await Promise.all([loadJsPdfCtor(), loadJsBarcodeFn()]);
  const ticketW = Number(paperWidthMm);
  const ticketH = Number(paperHeightMm);
  const BATCH_SIZE = 100; // yield to the browser every N cards

  if (a4MultiPerPage) {
    // ── A4 multi-per-page mode ────────────────────────────────────────────────
    // Fit as many tickets as possible onto each A4 portrait page.
    const GAP = 3; // mm between tickets
    const cols = Math.max(1, Math.floor((A4_W_MM + GAP) / (ticketW + GAP)));
    const rows = Math.max(1, Math.floor((A4_H_MM + GAP) / (ticketH + GAP)));
    const cardsPerPage = cols * rows;
    // Center the grid of tickets on the A4 page
    const gridW = cols * ticketW + (cols - 1) * GAP;
    const gridH = rows * ticketH + (rows - 1) * GAP;
    const startX = (A4_W_MM - gridW) / 2;
    const startY = (A4_H_MM - gridH) / 2;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [A4_W_MM, A4_H_MM], compress: true });

    for (let i = 0; i < cards.length; i++) {
      const posInPage = i % cardsPerPage;
      if (posInPage === 0 && i > 0) doc.addPage();

      const col = posInPage % cols;
      const row = Math.floor(posInPage / cols);
      const offsetX = startX + col * (ticketW + GAP);
      const offsetY = startY + row * (ticketH + GAP);

      await renderCardToPdf(
        doc,
        cards[i],
        layout,
        offsetX,
        offsetY,
        ticketW,
        ticketH,
        gridCols,
        gridRows,
        rifaOnly,
        jsBarcode,
        buyerData,
      );

      // Yield to the browser periodically to avoid freezing
      if ((i + 1) % BATCH_SIZE === 0 || i === cards.length - 1) {
        onProgress?.(i + 1, cards.length);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    doc.save(
      `cartelas-bingo-a4-${sorteioNome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
    );
    return doc.output('blob');
  }

  // ── Single-ticket-per-page mode (original behaviour) ─────────────────────
  const pageWidth = ticketW;
  const pageHeight = ticketH;
  const orientation = pageWidth > pageHeight ? 'landscape' : 'portrait';

  const doc = new jsPDF({ orientation, unit: 'mm', format: [pageWidth, pageHeight], compress: true });

  for (let i = 0; i < cards.length; i++) {
    if (i > 0) doc.addPage();
    await renderCardToPdf(
      doc,
      cards[i],
      layout,
      0,
      0,
      pageWidth,
      pageHeight,
      gridCols,
      gridRows,
      rifaOnly,
      jsBarcode,
      buyerData,
    );

    // Yield to the browser periodically to avoid freezing
    if ((i + 1) % BATCH_SIZE === 0 || i === cards.length - 1) {
      onProgress?.(i + 1, cards.length);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  doc.save(
    `cartelas-bingo-${sorteioNome.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
  );
  return doc.output('blob');
}
