import { GoogleGenAI, Type } from '@google/genai';

const BENGALI_TO_ENGLISH_MAP: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

function normalizeDigitsServer(raw: string): string {
  if (!raw) return '';
  let out = '';
  for (const ch of String(raw)) {
    if (BENGALI_TO_ENGLISH_MAP[ch] !== undefined) {
      out += BENGALI_TO_ENGLISH_MAP[ch];
    } else if (/[0-9]/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const {
      imageBase64,
      idCropBase64,
      mcqCropBase64,
      mimeType = 'image/jpeg',
      totalQuestions = 50,
    } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const cleanBase64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');
    const cleanIdCrop = idCropBase64
      ? String(idCropBase64).replace(/^data:image\/\w+;base64,/, '')
      : '';
    const cleanMcqCrop = mcqCropBase64
      ? String(mcqCropBase64).replace(/^data:image\/\w+;base64,/, '')
      : '';

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const total = Math.max(3, Math.min(100, Math.round(Number(totalQuestions) || 50)));
    const base = Math.floor(total / 3);
    const rem = total % 3;
    const col1End = base + (rem >= 1 ? 1 : 0);
    const col2End = col1End + base + (rem >= 2 ? 1 : 0);

    const prompt = `You are an ultra-accurate Optical Mark Recognition (OMR) grader for the "বাংলা বিদ্যাপীঠ" A4 Answer Sheet.
We have provided high-contrast images of the sheet:
- Image 1: Full OMR Answer Sheet.
${cleanIdCrop ? '- Image 2: High-resolution close-up of the top Candidate Details, 6-Digit Roll/ID Grid ("রোল / আইডি নম্বর · 6-Digit ID"), and Set Code ("সেট কোড").' : ''}
${cleanMcqCrop ? `- Image 3: High-resolution close-up of the 3-Column MCQ Bubble Grid (Column 1: Q1–${col1End}, Column 2: Q${col1End + 1}–${col2End}, Column 3: Q${col2End + 1}–${total}).` : ''}

STEP 1 — COLUMN-BY-COLUMN 6-DIGIT ID EXTRACTION ("রোল / আইডি নম্বর"):
- Look carefully at the middle top section ("রোল / আইডি নম্বর · 6-Digit ID").
- There are 6 vertical columns from left to right (Column 1 to Column 6).
- Each column has a rectangular box at the top and 10 vertical circles below it labeled 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 from top to bottom (with row guide numbers 0–9 on both the left and right edges).
- For EACH of the 6 columns (colIndex 1 to 6), read "writtenBoxDigit", "darkenedBubbleDigit", and "finalDigit".
- Concatenate all 6 "finalDigit" values in order (Column 1 to Column 6) to form "roll" (e.g., "240105").

STEP 2 — SET CODE & CANDIDATE INFO:
- "setCode": Read from the right box ("সেট কোড"): "A", "B", "C", or "D".
- "studentName", "className", "schoolName": Read from the left box if visible.

STEP 3 — ROW-BY-ROW ${total} MCQ BUBBLE EXTRACTION:
- Left Column: Questions 1 to ${col1End}
- Middle Column: Questions ${col1End + 1} to ${col2End}
- Right Column: Questions ${col2End + 1} to ${total}
- For EVERY question from 1 to ${total}, return "A", "B", "C", "D", "" (if empty), or "MULTIPLE".`;

    const parts: any[] = [
      {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      },
    ];

    if (cleanIdCrop) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanIdCrop,
        },
      });
    }

    if (cleanMcqCrop) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanMcqCrop,
        },
      });
    }

    parts.push({ text: prompt });

    const schemaConfig = {
      temperature: 0.0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          idColumns: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                colIndex: { type: Type.INTEGER },
                writtenBoxDigit: { type: Type.STRING },
                darkenedBubbleDigit: { type: Type.STRING },
                finalDigit: { type: Type.STRING },
              },
              required: ['colIndex', 'writtenBoxDigit', 'darkenedBubbleDigit', 'finalDigit'],
            },
          },
          roll: { type: Type.STRING },
          setCode: { type: Type.STRING },
          studentName: { type: Type.STRING },
          className: { type: Type.STRING },
          schoolName: { type: Type.STRING },
          answers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.INTEGER },
                selected: { type: Type.STRING },
              },
              required: ['question', 'selected'],
            },
          },
        },
        required: ['idColumns', 'roll', 'answers'],
      },
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: schemaConfig,
      });
    } catch {
      response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: { parts },
        config: schemaConfig,
      });
    }

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    let fromColumns = '';
    if (Array.isArray(parsed.idColumns)) {
      const sorted = [...parsed.idColumns].sort(
        (a, b) => (Number(a.colIndex) || 0) - (Number(b.colIndex) || 0)
      );
      for (const col of sorted) {
        const d =
          normalizeDigitsServer(col.finalDigit) ||
          normalizeDigitsServer(col.darkenedBubbleDigit) ||
          normalizeDigitsServer(col.writtenBoxDigit);
        if (d) {
          fromColumns += d.slice(0, 1);
        }
      }
    }

    const fromString = normalizeDigitsServer(parsed.roll || '');
    parsed.roll =
      fromColumns.length === 6
        ? fromColumns
        : fromString.length >= fromColumns.length
        ? fromString.slice(0, 6)
        : fromColumns.slice(0, 6);

    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error('Vercel OMR Vision API error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to analyze OMR image via Gemini Vision',
    });
  }
}
