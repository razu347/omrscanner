import {
  AnswerKeyMap,
  StudentResponsesMap,
  SetCodeChoice,
  getThreeColumnRanges,
  normalizeRollId,
} from './omrLogic';

export type OMRColorTheme = 'magenta' | 'emerald' | 'royal';

const THEME_PALETTES: Record<
  OMRColorTheme,
  { primary: string; tintBg: string; border: string; headerBg: string }
> = {
  magenta: {
    primary: '#BE185D',
    tintBg: '#FDF2F8',
    border: '#F472B6',
    headerBg: '#9D174D',
  },
  emerald: {
    primary: '#047857',
    tintBg: '#ECFDF5',
    border: '#34D399',
    headerBg: '#065F46',
  },
  royal: {
    primary: '#1D4ED8',
    tintBg: '#EFF6FF',
    border: '#60A5FA',
    headerBg: '#1E40AF',
  },
};

export interface ClientOpticalScanResult {
  isDigitalBarcode: boolean;
  confidence: 'high' | 'medium' | 'low';
  roll: string;
  setCode: SetCodeChoice;
  studentName: string;
  className: string;
  schoolName: string;
  answers: StudentResponsesMap;
}

const BARCODE_MAGIC = 'BBOMR6:';

/**
 * Encodes a UTF-8 string into the bottom row (y = canvas.height - 1) of pixels
 * so any PNG exported from the OMR Designer can be decoded with 100% precision.
 */
function encodeOpticalMetadataRow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  payloadObj: object
) {
  try {
    const jsonStr = BARCODE_MAGIC + encodeURIComponent(JSON.stringify(payloadObj));
    const bytes: number[] = [];
    for (let i = 0; i < jsonStr.length; i++) {
      bytes.push(jsonStr.charCodeAt(i) & 0xff);
    }
    if (bytes.length + 4 >= width) return;

    const imgData = ctx.getImageData(0, height - 1, width, 1);
    const data = imgData.data;

    const len = bytes.length;
    data[0] = 250;
    data[1] = 251;
    data[2] = 252;
    data[3] = 255;

    data[4] = (len >> 8) & 0xff;
    data[5] = len & 0xff;
    data[6] = 253;
    data[7] = 255;

    for (let i = 0; i < len; i++) {
      const idx = (i + 2) * 4;
      data[idx] = bytes[i];
      data[idx + 1] = 254;
      data[idx + 2] = 254;
      data[idx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, height - 1);
  } catch {
    // Ignore metadata encoding errors
  }
}

function decodeOpticalMetadataRow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): any | null {
  try {
    const imgData = ctx.getImageData(0, height - 1, width, 1);
    const data = imgData.data;
    if (data[0] !== 250 || data[1] !== 251 || data[2] !== 252) {
      return null;
    }
    const len = (data[4] << 8) | data[5];
    if (len <= 0 || len + 4 >= width) return null;

    let chars = '';
    for (let i = 0; i < len; i++) {
      const idx = (i + 2) * 4;
      chars += String.fromCharCode(data[idx]);
    }
    if (!chars.startsWith(BARCODE_MAGIC)) return null;
    const decoded = decodeURIComponent(chars.slice(BARCODE_MAGIC.length));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function drawCornerFiducialTarget(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x + 5, y + 5, size - 10, size - 10);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(x + 9, y + 9, size - 18, size - 18);
}

/**
 * Renders an authentic, colorful A4 "বাংলা বিদ্যাপীঠ" OMR Sheet onto an HTML5 Canvas and returns a PNG data URL.
 * Includes:
 * - 4 Bullseye Corner optical registration marks
 * - Heading "বাংলা বিদ্যাপীঠ"
 * - নাম:, শ্রেণি:, স্কুল: boxes
 * - পূর্ণমান (Full Marks) & প্রাপ্ত নম্বর (Obtained Marks) boxes
 * - রোল / আইডি নম্বর (6-digit high-clarity bubble grid with alternating row bands & left/right 0-9 row guides)
 * - সেট কোড (Set Code A, B, C, D bubble grid)
 * - 3-Column dynamic MCQ bubble grid with 5-question horizontal alignment dividers
 */
export function renderSyntheticOMRSheetDataUrl(params: {
  headingTitle?: string;
  examSubtitle?: string;
  roll: string; // 6-digit string or 6-char slot string
  setCode?: SetCodeChoice | '';
  studentName: string;
  className?: string;
  schoolName: string;
  totalQuestions?: number;
  fullMarks?: number | string;
  obtainedMarks?: number | string;
  responses: StudentResponsesMap;
  answerKey?: AnswerKeyMap;
  showGradingOverlay?: boolean;
  colorTheme?: OMRColorTheme;
}): string {
  const totalQ = Math.max(3, Math.min(100, params.totalQuestions || 50));
  const colRanges = getThreeColumnRanges(totalQ);
  const maxRowsInCol = Math.max(
    colRanges[0].end - colRanges[0].start + 1,
    colRanges[1].end - colRanges[1].start + 1,
    colRanges[2].end - colRanges[2].start + 1
  );

  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = Math.max(1340, 520 + maxRowsInCol * 38 + 60);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const palette = THEME_PALETTES[params.colorTheme || 'magenta'];

  // Crisp White Paper Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer Decorative & Optical Border
  ctx.strokeStyle = palette.primary;
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 36, canvas.width - 96, canvas.height - 72);

  // 4 High-Contrast Bullseye Corner Fiducial Marks (for Mobile Camera Scanner)
  const markSize = 28;
  drawCornerFiducialTarget(ctx, 16, 16, markSize);
  drawCornerFiducialTarget(ctx, canvas.width - 16 - markSize, 16, markSize);
  drawCornerFiducialTarget(ctx, 16, canvas.height - 16 - markSize, markSize);
  drawCornerFiducialTarget(
    ctx,
    canvas.width - 16 - markSize,
    canvas.height - 16 - markSize,
    markSize
  );

  // Top Banner Header ("বাংলা বিদ্যাপীঠ")
  ctx.fillStyle = palette.headerBg;
  ctx.fillRect(64, 52, canvas.width - 128, 70);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    params.headingTitle || 'বাংলা বিদ্যাপীঠ',
    canvas.width / 2,
    91
  );

  ctx.font = '500 14px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FCE7F3';
  ctx.fillText(
    params.examSubtitle || 'OMR উত্তরপত্র (Optical Mark Recognition Answer Sheet)',
    canvas.width / 2,
    113
  );

  // Top Section Height = 276px (y = 136 to 412)
  const topBoxY = 136;
  const topBoxH = 276;

  // Section 1: Left Box — নাম:, শ্রেণি:, স্কুল: + পূর্ণমান & প্রাপ্ত নম্বর
  ctx.fillStyle = palette.tintBg;
  ctx.fillRect(64, topBoxY, 396, topBoxH);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(64, topBoxY, 396, topBoxH);

  ctx.textAlign = 'left';
  ctx.fillStyle = palette.primary;
  ctx.font = 'bold 14px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('শিক্ষার্থীর তথ্য (Candidate Details)', 78, topBoxY + 24);

  // নাম:
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px "Hind Siliguri", sans-serif';
  ctx.fillText('নাম:', 78, topBoxY + 60);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(128, topBoxY + 38, 318, 32);
  ctx.strokeStyle = palette.border;
  ctx.strokeRect(128, topBoxY + 38, 318, 32);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 15px "Hind Siliguri", sans-serif';
  ctx.fillText(params.studentName || '', 136, topBoxY + 60);

  // শ্রেণি:
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px "Hind Siliguri", sans-serif';
  ctx.fillText('শ্রেণি:', 78, topBoxY + 104);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(128, topBoxY + 82, 318, 32);
  ctx.strokeStyle = palette.border;
  ctx.strokeRect(128, topBoxY + 82, 318, 32);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 15px "Hind Siliguri", sans-serif';
  ctx.fillText(params.className || '', 136, topBoxY + 104);

  // স্কুল:
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px "Hind Siliguri", sans-serif';
  ctx.fillText('স্কুল:', 78, topBoxY + 148);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(128, topBoxY + 126, 318, 32);
  ctx.strokeStyle = palette.border;
  ctx.strokeRect(128, topBoxY + 126, 318, 32);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 15px "Hind Siliguri", sans-serif';
  ctx.fillText(params.schoolName || '', 136, topBoxY + 148);

  // পূর্ণমান (Full Marks) & প্রাপ্ত নম্বর (Obtained Marks) Boxes
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(78, topBoxY + 180, 176, 78);
  ctx.strokeStyle = palette.primary;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(78, topBoxY + 180, 176, 78);
  ctx.fillStyle = palette.primary;
  ctx.font = 'bold 13px "Hind Siliguri", sans-serif';
  ctx.fillText('পূর্ণমান (Full Marks):', 88, topBoxY + 204);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillText(String(params.fullMarks ?? totalQ), 88, topBoxY + 240);

  // প্রাপ্ত নম্বর Box
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(270, topBoxY + 180, 176, 78);
  ctx.strokeStyle = palette.primary;
  ctx.strokeRect(270, topBoxY + 180, 176, 78);
  ctx.fillStyle = palette.primary;
  ctx.font = 'bold 13px "Hind Siliguri", sans-serif';
  ctx.fillText('প্রাপ্ত নম্বর (Obtained):', 280, topBoxY + 204);
  ctx.fillStyle = '#047857';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillText(
    params.obtainedMarks !== undefined && params.obtainedMarks !== ''
      ? String(params.obtainedMarks)
      : '',
    280,
    topBoxY + 240
  );

  // Section 2: Middle Box — ৬-ডিজিট রোল / আইডি নম্বর (6-Digit High-Clarity Bubble Grid)
  const idBoxX = 472;
  const idBoxW = 286;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(idBoxX, topBoxY, idBoxW, topBoxH);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(idBoxX, topBoxY, idBoxW, topBoxH);

  // Header bar inside ID Box
  ctx.fillStyle = palette.tintBg;
  ctx.fillRect(idBoxX + 1, topBoxY + 1, idBoxW - 2, 22);
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.primary;
  ctx.font = 'bold 13px "Hind Siliguri", sans-serif';
  ctx.fillText('রোল / আইডি নম্বর (৬ ডিজিট · 6-Digit ID)', idBoxX + idBoxW / 2, topBoxY + 16);

  // Parse 6 digit slots accurately without shifting partial slots
  const rawRollStr = params.roll || '';
  const cleanDigitsOnly = normalizeRollId(rawRollStr);
  const rollDigits: string[] = ['', '', '', '', '', ''];
  if (rawRollStr.length === 6) {
    for (let i = 0; i < 6; i++) {
      const ch = rawRollStr[i];
      rollDigits[i] = /[0-9]/.test(ch) ? ch : '';
    }
  } else if (cleanDigitsOnly.length > 0) {
    const padded = cleanDigitsOnly.slice(0, 6);
    for (let i = 0; i < padded.length; i++) {
      rollDigits[i] = padded[i];
    }
  }

  // Alternating horizontal row bands across all 6 columns + Left & Right row guide numbers (0-9)
  for (let d = 0; d <= 9; d++) {
    const cy = topBoxY + 72 + d * 21;
    if (d % 2 === 1) {
      ctx.fillStyle = palette.tintBg;
      ctx.fillRect(idBoxX + 4, cy - 10, idBoxW - 8, 20);
    }
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(d), idBoxX + 20, cy + 3.5);
    ctx.textAlign = 'left';
    ctx.fillText(String(d), idBoxX + idBoxW - 18, cy + 3.5);
  }

  ctx.textAlign = 'center';
  for (let col = 0; col < 6; col++) {
    const cx = idBoxX + 42 + col * 40;

    // Large, clear digit box at top of column
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - 16, topBoxY + 26, 32, 28);
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(cx - 16, topBoxY + 26, 32, 28);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 18px "JetBrains Mono", monospace';
    ctx.fillText(rollDigits[col] || '', cx, topBoxY + 46);

    // 10 bubbles (0-9) in vertical column
    for (let d = 0; d <= 9; d++) {
      const cy = topBoxY + 72 + d * 21;
      const isFilled = rollDigits[col] !== '' && Number(rollDigits[col]) === d;
      ctx.beginPath();
      ctx.arc(cx, cy, 8.2, 0, Math.PI * 2);
      if (isFilled) {
        ctx.fillStyle = '#0F172A';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(String(d), cx, cy + 3.5);
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = palette.primary;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = palette.primary;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(String(d), cx, cy + 3.5);
      }
    }
  }

  // Section 3: Right Box — সেট কোড (Set Code A, B, C, D)
  const setBoxX = 770;
  const setBoxW = 126;
  ctx.fillStyle = palette.tintBg;
  ctx.fillRect(setBoxX, topBoxY, setBoxW, topBoxH);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(setBoxX, topBoxY, setBoxW, topBoxH);

  ctx.textAlign = 'center';
  ctx.fillStyle = palette.primary;
  ctx.font = 'bold 14px "Hind Siliguri", sans-serif';
  ctx.fillText('সেট কোড (Set)', setBoxX + setBoxW / 2, topBoxY + 20);

  const activeSet = params.setCode || '';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(setBoxX + 35, topBoxY + 28, 56, 32);
  ctx.strokeStyle = palette.primary;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(setBoxX + 35, topBoxY + 28, 56, 32);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText(activeSet, setBoxX + setBoxW / 2, topBoxY + 50);

  const setOptions: SetCodeChoice[] = ['A', 'B', 'C', 'D'];
  setOptions.forEach((sOpt, idx) => {
    const sy = topBoxY + 94 + idx * 44;
    const isSetSelected = activeSet === sOpt;
    ctx.beginPath();
    ctx.arc(setBoxX + setBoxW / 2, sy, 13, 0, Math.PI * 2);
    if (isSetSelected) {
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.fillText(sOpt, setBoxX + setBoxW / 2, sy + 4.5);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = palette.primary;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = palette.primary;
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.fillText(sOpt, setBoxX + setBoxW / 2, sy + 4.5);
    }
  });

  // Section 4: 3-Column MCQ Bubble Grid
  const gridStartY = 428;
  const colStarts = [64, 348, 632];
  const colWidth = 264;
  const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

  colRanges.forEach((range, colIdx) => {
    const xBase = colStarts[colIdx];
    const rowCount = range.end - range.start + 1;
    const boxHeight = rowCount * 36 + 44;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(xBase, gridStartY, colWidth, boxHeight);
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(xBase, gridStartY, colWidth, boxHeight);

    // Column Header Bar
    ctx.fillStyle = palette.tintBg;
    ctx.fillRect(xBase + 1, gridStartY + 1, colWidth - 2, 30);
    ctx.fillStyle = palette.primary;
    ctx.font = 'bold 12px "Hind Siliguri", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`প্রশ্ন ${range.start} – ${range.end}`, xBase + 14, gridStartY + 21);
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText('A   B   C   D', xBase + colWidth - 18, gridStartY + 21);

    for (let q = range.start; q <= range.end; q++) {
      const rowIdx = q - range.start;
      const yBase = gridStartY + 52 + rowIdx * 36;

      if (rowIdx % 2 === 1) {
        ctx.fillStyle = palette.tintBg;
        ctx.fillRect(xBase + 2, yBase - 16, colWidth - 4, 32);
      }

      // Every 5th question horizontal guide line to prevent row-drift
      if (q % 5 === 0 && q < range.end) {
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xBase + 4, yBase + 18);
        ctx.lineTo(xBase + colWidth - 4, yBase + 18);
        ctx.stroke();
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = palette.primary;
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.fillText(String(q).padStart(2, '0') + '.', xBase + 38, yBase + 4);

      const selected = params.responses[q] || '';
      const correct = params.answerKey ? params.answerKey[q] : undefined;

      for (let optIdx = 0; optIdx < 4; optIdx++) {
        const opt = options[optIdx];
        const bx = xBase + 78 + optIdx * 48;
        const by = yBase;

        const isBubbled = selected === opt;

        ctx.beginPath();
        ctx.arc(bx, by, 11.5, 0, Math.PI * 2);

        if (isBubbled) {
          if (params.showGradingOverlay && correct) {
            ctx.fillStyle = selected === correct ? '#16A34A' : '#DC2626';
          } else {
            ctx.fillStyle = '#0F172A';
          }
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.fillText(opt, bx, by + 4);
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.strokeStyle =
            params.showGradingOverlay && correct === opt
              ? '#16A34A'
              : palette.primary;
          ctx.lineWidth =
            params.showGradingOverlay && correct === opt ? 2.5 : 1.3;
          ctx.stroke();

          ctx.fillStyle =
            params.showGradingOverlay && correct === opt
              ? '#16A34A'
              : palette.primary;
          ctx.textAlign = 'center';
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.fillText(opt, bx, by + 4);
        }
      }
    }
  });

  // Encode lossless optical metadata strip on the bottom pixel row for 100% deterministic decoding
  encodeOpticalMetadataRow(ctx, canvas.width, canvas.height, {
    roll: rollDigits.join(''),
    setCode: activeSet || 'A',
    studentName: params.studentName || '',
    className: params.className || '',
    schoolName: params.schoolName || '',
    responses: params.responses || {},
  });

  return canvas.toDataURL('image/png');
}

/**
 * Applies adaptive contrast stretching to a canvas so uneven camera lighting/shadows
 * on paper become crisp white and pen/pencil marks become high-contrast dark pixels.
 */
function enhanceCanvasContrastForOMR(ctx: CanvasRenderingContext2D, width: number, height: number) {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Compute luminance histogram percentiles (p5 dark, p85 paper background)
    const hist = new Uint32Array(256);
    const totalPixels = width * height;
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      hist[lum]++;
    }

    let cum = 0;
    let low = 20;
    let high = 235;
    for (let v = 0; v < 256; v++) {
      cum += hist[v];
      if (cum <= totalPixels * 0.02) low = v;
      if (cum <= totalPixels * 0.85) high = v;
    }

    const range = Math.max(40, high - low);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const norm = Math.max(0, Math.min(1, (data[i + c] - low) / range));
        // Slight gamma curve to push paper background to clean white and dark marks to crisp black
        const curved = norm > 0.78 ? 1 : Math.pow(norm, 1.15);
        data[i + c] = Math.round(curved * 255);
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Ignore contrast enhancement errors
  }
}

/**
 * Prepares 3 high-clarity images from a raw camera photo or uploaded OMR image for Gemini Vision:
 * 1. fullEnhancedDataUrl: Contrast-normalized full OMR sheet
 * 2. idCropDataUrl: 2x high-resolution crop of the top Candidate Details + 6-Digit Roll/ID Grid + Set Code
 * 3. mcqCropDataUrl: High-resolution crop of the bottom 3-column MCQ Bubble Grid
 */
export async function prepareOMRImagesForVision(imageDataUrl: string): Promise<{
  fullEnhancedDataUrl: string;
  idCropDataUrl: string;
  mcqCropDataUrl: string;
}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // 1. Full contrast-enhanced image
        const fullCanvas = document.createElement('canvas');
        const scale = Math.min(1.5, 1400 / Math.max(1, img.width));
        fullCanvas.width = Math.round(img.width * scale);
        fullCanvas.height = Math.round(img.height * scale);
        const fullCtx = fullCanvas.getContext('2d');
        if (!fullCtx) {
          resolve({
            fullEnhancedDataUrl: imageDataUrl,
            idCropDataUrl: '',
            mcqCropDataUrl: '',
          });
          return;
        }
        fullCtx.fillStyle = '#FFFFFF';
        fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
        fullCtx.drawImage(img, 0, 0, fullCanvas.width, fullCanvas.height);
        enhanceCanvasContrastForOMR(fullCtx, fullCanvas.width, fullCanvas.height);
        const fullEnhancedDataUrl = fullCanvas.toDataURL('image/jpeg', 0.92);

        // 2. Top 44% Crop (Candidate Info + 6-Digit ID Grid + Set Code) at high resolution
        const idCanvas = document.createElement('canvas');
        const topSrcH = Math.max(80, Math.floor(img.height * 0.44));
        idCanvas.width = Math.min(1600, Math.round(img.width * 1.5));
        idCanvas.height = Math.min(1000, Math.round(topSrcH * 1.5));
        const idCtx = idCanvas.getContext('2d');
        let idCropDataUrl = '';
        if (idCtx) {
          idCtx.fillStyle = '#FFFFFF';
          idCtx.fillRect(0, 0, idCanvas.width, idCanvas.height);
          idCtx.drawImage(img, 0, 0, img.width, topSrcH, 0, 0, idCanvas.width, idCanvas.height);
          enhanceCanvasContrastForOMR(idCtx, idCanvas.width, idCanvas.height);
          idCropDataUrl = idCanvas.toDataURL('image/jpeg', 0.94);
        }

        // 3. Bottom 72% Crop (3-Column MCQ Bubble Grid)
        const mcqCanvas = document.createElement('canvas');
        const mcqSrcY = Math.floor(img.height * 0.28);
        const mcqSrcH = Math.max(100, img.height - mcqSrcY);
        mcqCanvas.width = Math.min(1600, Math.round(img.width * 1.35));
        mcqCanvas.height = Math.min(1600, Math.round(mcqSrcH * 1.35));
        const mcqCtx = mcqCanvas.getContext('2d');
        let mcqCropDataUrl = '';
        if (mcqCtx) {
          mcqCtx.fillStyle = '#FFFFFF';
          mcqCtx.fillRect(0, 0, mcqCanvas.width, mcqCanvas.height);
          mcqCtx.drawImage(
            img,
            0,
            mcqSrcY,
            img.width,
            mcqSrcH,
            0,
            0,
            mcqCanvas.width,
            mcqCanvas.height
          );
          enhanceCanvasContrastForOMR(mcqCtx, mcqCanvas.width, mcqCanvas.height);
          mcqCropDataUrl = mcqCanvas.toDataURL('image/jpeg', 0.92);
        }

        resolve({
          fullEnhancedDataUrl,
          idCropDataUrl,
          mcqCropDataUrl,
        });
      } catch {
        resolve({
          fullEnhancedDataUrl: imageDataUrl,
          idCropDataUrl: '',
          mcqCropDataUrl: '',
        });
      }
    };
    img.onerror = () =>
      resolve({
        fullEnhancedDataUrl: imageDataUrl,
        idCropDataUrl: '',
        mcqCropDataUrl: '',
      });
    img.src = imageDataUrl;
  });
}

/**
 * Measures average pixel darkness (0 = pure white, 1 = pure black) inside a circular region.
 */
function sampleCircleDarkness(
  imgData: ImageData,
  cx: number,
  cy: number,
  radius: number
): number {
  const { width, height, data } = imgData;
  const rSq = radius * radius;
  let sumDarkness = 0;
  let count = 0;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rSq) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        sumDarkness += (255 - lum) / 255;
        count++;
      }
    }
  }

  return count > 0 ? sumDarkness / count : 0;
}

/**
 * Client-Side Optical OMR Scanner:
 * - Returns `isDigitalBarcode: true` ONLY when the lossless optical barcode row (`BBOMR6:`) is present
 *   (which happens on digital sheets exported from OMR Designer, giving 100.0% exact decoding).
 * - For camera photos/uploads without the digital barcode, returns `isDigitalBarcode: false` so the
 *   caller ALWAYS runs the 3-crop Gemini Vision pipeline and uses pixel sampling only as a fallback.
 */
export async function analyzeOMRImageOpticalClientSide(
  imageDataUrl: string,
  totalQuestions = 50
): Promise<ClientOpticalScanResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const totalQ = Math.max(3, Math.min(100, totalQuestions || 50));
        const colRanges = getThreeColumnRanges(totalQ);
        const maxRowsInCol = Math.max(
          colRanges[0].end - colRanges[0].start + 1,
          colRanges[1].end - colRanges[1].start + 1,
          colRanges[2].end - colRanges[2].start + 1
        );
        const canonicalW = 960;
        const canonicalH = Math.max(1340, 520 + maxRowsInCol * 38 + 60);

        const rawCanvas = document.createElement('canvas');
        rawCanvas.width = img.width;
        rawCanvas.height = img.height;
        const rawCtx = rawCanvas.getContext('2d');
        if (rawCtx) {
          rawCtx.drawImage(img, 0, 0);
          const meta = decodeOpticalMetadataRow(rawCtx, img.width, img.height);
          if (meta && (meta.roll !== undefined || meta.responses !== undefined)) {
            resolve({
              isDigitalBarcode: true,
              confidence: 'high',
              roll: normalizeRollId(meta.roll || ''),
              setCode: (['A', 'B', 'C', 'D'].includes(meta.setCode)
                ? meta.setCode
                : 'A') as SetCodeChoice,
              studentName: meta.studentName || '',
              className: meta.className || '',
              schoolName: meta.schoolName || '',
              answers: meta.responses || {},
            });
            return;
          }
        }

        // Secondary pixel fallback for offline/non-barcode images
        const normCanvas = document.createElement('canvas');
        normCanvas.width = canonicalW;
        normCanvas.height = canonicalH;
        const normCtx = normCanvas.getContext('2d');
        if (!normCtx) {
          resolve({
            isDigitalBarcode: false,
            confidence: 'low',
            roll: '',
            setCode: 'A',
            studentName: '',
            className: '',
            schoolName: '',
            answers: {},
          });
          return;
        }

        normCtx.drawImage(img, 0, 0, canonicalW, canonicalH);
        const normData = normCtx.getImageData(0, 0, canonicalW, canonicalH);

        const topBoxY = 136;
        const idBoxX = 472;
        const detectedDigits: string[] = [];

        for (let col = 0; col < 6; col++) {
          const cx = idBoxX + 42 + col * 40;
          let maxDark = 0;
          let secondDark = 0;
          let bestDigit = -1;

          for (let d = 0; d <= 9; d++) {
            const cy = topBoxY + 72 + d * 21;
            const darkness = sampleCircleDarkness(normData, cx, cy, 6.5);
            if (darkness > maxDark) {
              secondDark = maxDark;
              maxDark = darkness;
              bestDigit = d;
            } else if (darkness > secondDark) {
              secondDark = darkness;
            }
          }

          if (bestDigit >= 0 && maxDark > 0.42 && maxDark - secondDark > 0.16) {
            detectedDigits.push(String(bestDigit));
          } else {
            detectedDigits.push('');
          }
        }

        const gridStartY = 428;
        const colStarts = [64, 348, 632];
        const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
        const answers: StudentResponsesMap = {};

        colRanges.forEach((range, colIdx) => {
          const xBase = colStarts[colIdx];
          for (let q = range.start; q <= range.end; q++) {
            const rowIdx = q - range.start;
            const yBase = gridStartY + 52 + rowIdx * 36;

            const darkScores: { opt: 'A' | 'B' | 'C' | 'D'; score: number }[] = [];
            for (let optIdx = 0; optIdx < 4; optIdx++) {
              const opt = options[optIdx];
              const bx = xBase + 78 + optIdx * 48;
              const score = sampleCircleDarkness(normData, bx, yBase, 8.5);
              darkScores.push({ opt, score });
            }

            darkScores.sort((a, b) => b.score - a.score);
            if (darkScores[0].score > 0.42 && darkScores[0].score - darkScores[1].score > 0.15) {
              answers[q] = darkScores[0].opt;
            } else {
              answers[q] = '';
            }
          }
        });

        resolve({
          isDigitalBarcode: false,
          confidence: 'medium',
          roll: detectedDigits.join(''),
          setCode: 'A',
          studentName: '',
          className: '',
          schoolName: '',
          answers,
        });
      } catch {
        resolve({
          isDigitalBarcode: false,
          confidence: 'low',
          roll: '',
          setCode: 'A',
          studentName: '',
          className: '',
          schoolName: '',
          answers: {},
        });
      }
    };
    img.onerror = () =>
      resolve({
        isDigitalBarcode: false,
        confidence: 'low',
        roll: '',
        setCode: 'A',
        studentName: '',
        className: '',
        schoolName: '',
        answers: {},
      });
    img.src = imageDataUrl;
  });
}
