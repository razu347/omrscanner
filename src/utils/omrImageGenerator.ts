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
  isDeterministicMatch: boolean;
  confidence: 'high' | 'medium' | 'low';
  roll: string;
  setCode: SetCodeChoice;
  studentName: string;
  className: string;
  schoolName: string;
  answers: StudentResponsesMap;
}

const BARCODE_MAGIC = 'BBOMR6:';

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

function drawCornerFiducialTarget(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) {
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x + 5, y + 5, size - 10, size - 10);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(x + 9, y + 9, size - 18, size - 18);
}

/**
 * Renders an authentic, colorful A4 "বাংলা বিদ্যাপীঠ" OMR Sheet onto an HTML5 Canvas and returns a PNG data URL.
 */
export function renderSyntheticOMRSheetDataUrl(params: {
  headingTitle?: string;
  examSubtitle?: string;
  roll: string;
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

  // 4 High-Contrast Bullseye Corner Fiducial Marks
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
  ctx.fillText(params.headingTitle || 'বাংলা বিদ্যাপীঠ', canvas.width / 2, 91);

  ctx.font = '500 14px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FCE7F3';
  ctx.fillText(
    params.examSubtitle || 'OMR উত্তরপত্র (Optical Mark Recognition Answer Sheet)',
    canvas.width / 2,
    113
  );

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

  // পূর্ণমান & প্রাপ্ত নম্বর Boxes
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

  // Section 2: Middle Box — ৬-ডিজিট রোল / আইডি নম্বর
  const idBoxX = 472;
  const idBoxW = 286;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(idBoxX, topBoxY, idBoxW, topBoxH);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(idBoxX, topBoxY, idBoxW, topBoxH);

  ctx.fillStyle = palette.tintBg;
  ctx.fillRect(idBoxX + 1, topBoxY + 1, idBoxW - 2, 22);
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.primary;
  ctx.font = 'bold 13px "Hind Siliguri", sans-serif';
  ctx.fillText('রোল / আইডি নম্বর (৬ ডিজিট · 6-Digit ID)', idBoxX + idBoxW / 2, topBoxY + 16);

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

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - 16, topBoxY + 26, 32, 28);
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(cx - 16, topBoxY + 26, 32, 28);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 18px "JetBrains Mono", monospace';
    ctx.fillText(rollDigits[col] || '', cx, topBoxY + 46);

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
 * Prepares compact, un-distorted JPEG images (<250KB total) for fast Gemini Vision upload
 * (well under Vercel's 4.5MB Serverless Function payload limit).
 */
export async function prepareOMRImagesForVision(imageDataUrl: string): Promise<{
  fullCompressedDataUrl: string;
  idCropDataUrl: string;
}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // 1. Cleanly resized full image (max 1150px on longest side, no destructive contrast wash-out)
        const fullCanvas = document.createElement('canvas');
        const maxDim = Math.max(img.width, img.height, 1);
        const scale = Math.min(1, 1150 / maxDim);
        fullCanvas.width = Math.max(1, Math.round(img.width * scale));
        fullCanvas.height = Math.max(1, Math.round(img.height * scale));
        const fullCtx = fullCanvas.getContext('2d');
        if (!fullCtx) {
          resolve({
            fullCompressedDataUrl: imageDataUrl,
            idCropDataUrl: '',
          });
          return;
        }
        fullCtx.fillStyle = '#FFFFFF';
        fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
        fullCtx.drawImage(img, 0, 0, fullCanvas.width, fullCanvas.height);
        const fullCompressedDataUrl = fullCanvas.toDataURL('image/jpeg', 0.85);

        // 2. Top 42% Crop (Candidate Info + 6-Digit ID Grid + Set Code) at crisp resolution
        const idCanvas = document.createElement('canvas');
        const topSrcH = Math.max(80, Math.floor(img.height * 0.42));
        const cropScale = Math.min(1.25, 1100 / Math.max(1, img.width));
        idCanvas.width = Math.max(1, Math.round(img.width * cropScale));
        idCanvas.height = Math.max(1, Math.round(topSrcH * cropScale));
        const idCtx = idCanvas.getContext('2d');
        let idCropDataUrl = '';
        if (idCtx) {
          idCtx.fillStyle = '#FFFFFF';
          idCtx.fillRect(0, 0, idCanvas.width, idCanvas.height);
          idCtx.drawImage(img, 0, 0, img.width, topSrcH, 0, 0, idCanvas.width, idCanvas.height);
          idCropDataUrl = idCanvas.toDataURL('image/jpeg', 0.88);
        }

        resolve({
          fullCompressedDataUrl,
          idCropDataUrl,
        });
      } catch {
        resolve({
          fullCompressedDataUrl: imageDataUrl,
          idCropDataUrl: '',
        });
      }
    };
    img.onerror = () =>
      resolve({
        fullCompressedDataUrl: imageDataUrl,
        idCropDataUrl: '',
      });
    img.src = imageDataUrl;
  });
}

function getPixelLuminance(imgData: ImageData, x: number, y: number): number {
  const cx = Math.max(0, Math.min(imgData.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(imgData.height - 1, Math.round(y)));
  const idx = (cy * imgData.width + cx) * 4;
  return (
    0.299 * imgData.data[idx] +
    0.587 * imgData.data[idx + 1] +
    0.114 * imgData.data[idx + 2]
  );
}

/**
 * Verifies if the normalized 960 x H canvas is an exact flat digital/exported OMR sheet
 * by checking the white outer margin and the 4 corner fiducial marks.
 */
function hasExactCornerFiducials(imgData: ImageData): boolean {
  const { width, height } = imgData;
  // Outer corners (4, 4) and (width-5, 4) must be white paper margin (lum > 220)
  if (
    getPixelLuminance(imgData, 4, 4) < 220 ||
    getPixelLuminance(imgData, width - 5, 4) < 220 ||
    getPixelLuminance(imgData, 4, height - 5) < 220
  ) {
    return false;
  }

  // Center of the 4 corner fiducial marks (30, 30), (width-30, 30), (30, height-30), (width-30, height-30) must be dark (< 80)
  const c1 = getPixelLuminance(imgData, 30, 30) < 80;
  const c2 = getPixelLuminance(imgData, width - 30, 30) < 80;
  const c3 = getPixelLuminance(imgData, 30, height - 30) < 80;
  const c4 = getPixelLuminance(imgData, width - 30, height - 30) < 80;

  return c1 && c2 && c3 && c4;
}

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
        const lum =
          0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        sumDarkness += (255 - lum) / 255;
        count++;
      }
    }
  }

  return count > 0 ? sumDarkness / count : 0;
}

/**
 * Finds the center of a dark bullseye fiducial mark inside a search quadrant of an ImageData buffer.
 */
function findQuadrantFiducialCenter(
  imgData: ImageData,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  preferCornerX: number,
  preferCornerY: number
): { x: number; y: number; found: boolean } {
  const { width, height, data } = imgData;
  const minX = Math.max(8, Math.floor(startX));
  const maxX = Math.min(width - 9, Math.ceil(endX));
  const minY = Math.max(8, Math.floor(startY));
  const maxY = Math.min(height - 9, Math.ceil(endY));

  let bestScore = -Infinity;
  let bestX = preferCornerX;
  let bestY = preferCornerY;
  let found = false;

  const step = Math.max(2, Math.floor(Math.min(width, height) / 240));
  const diag = Math.hypot(width, height) || 1;

  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const idx = (y * width + x) * 4;
      const centerLum =
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (centerLum > 115) continue;

      // Sample 5x5 neighborhood average darkness
      let darkSum = 0;
      for (let dy = -4; dy <= 4; dy += 4) {
        for (let dx = -4; dx <= 4; dx += 4) {
          const nIdx = ((y + dy) * width + (x + dx)) * 4;
          const lum =
            0.299 * data[nIdx] +
            0.587 * data[nIdx + 1] +
            0.114 * data[nIdx + 2];
          darkSum += (255 - lum) / 255;
        }
      }
      const avgDark = darkSum / 9;
      if (avgDark < 0.52) continue;

      const distPenalty = Math.hypot(x - preferCornerX, y - preferCornerY) / diag;
      const score = avgDark - distPenalty * 0.45;
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
        found = true;
      }
    }
  }

  return { x: bestX, y: bestY, found };
}

/**
 * Deterministic & Fiducial-Aligned Client-Side Optical OMR Scanner:
 * 1. Decodes lossless digital barcode row (`BBOMR6:`) if present.
 * 2. Checks `hasExactCornerFiducials` (or aligns via detected quadrant corner fiducials).
 * 3. Uses median-relative column/row darkness comparison so uneven lighting in camera photos doesn't skew bubble reads.
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
              isDeterministicMatch: true,
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

        const normCanvas = document.createElement('canvas');
        normCanvas.width = canonicalW;
        normCanvas.height = canonicalH;
        const normCtx = normCanvas.getContext('2d');
        if (!normCtx) {
          resolve({
            isDeterministicMatch: false,
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
        let normData = normCtx.getImageData(0, 0, canonicalW, canonicalH);
        const isFlatSheet = hasExactCornerFiducials(normData);

        // If not already at exact (30,30) fiducial coordinates, check if the 4 corner fiducials can be auto-aligned
        if (!isFlatSheet) {
          const tl = findQuadrantFiducialCenter(
            normData,
            8,
            canonicalW * 0.28,
            8,
            canonicalH * 0.25,
            30,
            30
          );
          const tr = findQuadrantFiducialCenter(
            normData,
            canonicalW * 0.72,
            canonicalW - 8,
            8,
            canonicalH * 0.25,
            canonicalW - 30,
            30
          );
          const bl = findQuadrantFiducialCenter(
            normData,
            8,
            canonicalW * 0.28,
            canonicalH * 0.75,
            canonicalH - 8,
            30,
            canonicalH - 30
          );
          const br = findQuadrantFiducialCenter(
            normData,
            canonicalW * 0.72,
            canonicalW - 8,
            canonicalH * 0.75,
            canonicalH - 8,
            canonicalW - 30,
            canonicalH - 30
          );

          if (tl.found && tr.found && bl.found && br.found) {
            const avgTopX = (tl.x + bl.x) / 2;
            const avgRightX = (tr.x + br.x) / 2;
            const avgTopY = (tl.y + tr.y) / 2;
            const avgBotY = (bl.y + br.y) / 2;
            const spanW = avgRightX - avgTopX;
            const spanH = avgBotY - avgTopY;

            if (spanW > canonicalW * 0.45 && spanH > canonicalH * 0.45) {
              const targetSpanW = canonicalW - 60;
              const targetSpanH = canonicalH - 60;
              const scaleX = targetSpanW / spanW;
              const scaleY = targetSpanH / spanH;

              const alignedCanvas = document.createElement('canvas');
              alignedCanvas.width = canonicalW;
              alignedCanvas.height = canonicalH;
              const alignedCtx = alignedCanvas.getContext('2d');
              if (alignedCtx) {
                alignedCtx.fillStyle = '#FFFFFF';
                alignedCtx.fillRect(0, 0, canonicalW, canonicalH);
                alignedCtx.setTransform(
                  scaleX,
                  0,
                  0,
                  scaleY,
                  30 - avgTopX * scaleX,
                  30 - avgTopY * scaleY
                );
                alignedCtx.drawImage(normCanvas, 0, 0);
                normData = alignedCtx.getImageData(0, 0, canonicalW, canonicalH);
              }
            }
          }
        }

        const topBoxY = 136;
        const idBoxX = 472;
        const detectedDigits: string[] = [];
        let matchedDigitCols = 0;

        for (let col = 0; col < 6; col++) {
          const cx = idBoxX + 42 + col * 40;
          const colScores: { digit: number; darkness: number }[] = [];

          for (let d = 0; d <= 9; d++) {
            const cy = topBoxY + 72 + d * 21;
            const darkness = sampleCircleDarkness(normData, cx, cy, 6.5);
            colScores.push({ digit: d, darkness });
          }

          colScores.sort((a, b) => b.darkness - a.darkness);
          const maxDark = colScores[0].darkness;
          const secondDark = colScores[1].darkness;
          const medianDark = colScores[5].darkness;

          if (
            maxDark > 0.28 &&
            maxDark - medianDark > 0.11 &&
            maxDark - secondDark > 0.08
          ) {
            detectedDigits.push(String(colScores[0].digit));
            matchedDigitCols++;
          } else {
            detectedDigits.push('');
          }
        }

        // Check Set Code bubbles (A, B, C, D)
        const setBoxX = 770;
        const setBoxW = 126;
        const setOptions: SetCodeChoice[] = ['A', 'B', 'C', 'D'];
        let bestSet: SetCodeChoice = 'A';
        const setScores = setOptions.map((sOpt, idx) => {
          const sy = topBoxY + 94 + idx * 44;
          return {
            opt: sOpt,
            score: sampleCircleDarkness(normData, setBoxX + setBoxW / 2, sy, 9),
          };
        });
        setScores.sort((a, b) => b.score - a.score);
        if (setScores[0].score > 0.3 && setScores[0].score - setScores[1].score > 0.08) {
          bestSet = setScores[0].opt;
        }

        const gridStartY = 428;
        const colStarts = [64, 348, 632];
        const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C' , 'D'];
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
            const best = darkScores[0].score;
            const second = darkScores[1].score;
            const median = (darkScores[2].score + darkScores[3].score) / 2;

            if (best > 0.28 && best - median > 0.11 && best - second > 0.07) {
              answers[q] = darkScores[0].opt;
            } else {
              answers[q] = '';
            }
          }
        });

        resolve({
          isDeterministicMatch: isFlatSheet && matchedDigitCols === 6,
          confidence: isFlatSheet ? 'high' : 'low',
          roll: detectedDigits.join(''),
          setCode: bestSet,
          studentName: '',
          className: '',
          schoolName: '',
          answers,
        });
      } catch {
        resolve({
          isDeterministicMatch: false,
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
        isDeterministicMatch: false,
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
