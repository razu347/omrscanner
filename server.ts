import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// Initialize server-side Gemini AI client
const getGeminiClient = () => {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

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

// POST /api/omr/analyze
// Server-side Optical Mark Recognition using Gemini Vision with 3-Region High-Contrast Crops
app.post('/api/omr/analyze', async (req, res) => {
  try {
    const {
      imageBase64,
      idCropBase64,
      mcqCropBase64,
      mimeType = 'image/jpeg',
      totalQuestions = 50,
    } = req.body;

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

    const ai = getGeminiClient();

    // Calculate exact 3-column boundaries for `totalQuestions` so the Vision model knows the exact layout
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
- There are 6 vertical columns from left to right (Column 1, Column 2, Column 3, Column 4, Column 5, Column 6).
- Each column has a rectangular box at the top (where a digit 0–9 or বাংলা ০–৯ may be written) and 10 vertical circles below it labeled 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 from top to bottom (with row guide numbers 0–9 on both the left and right edges).
- For EACH of the 6 columns (colIndex 1 to 6):
  1. Read "writtenBoxDigit": the digit written inside the top rectangular box of that column (or "" if blank).
  2. Read "darkenedBubbleDigit": which circle (0, 1, 2, 3, 4, 5, 6, 7, 8, or 9) is darkened/filled in that vertical column (or "" if no circle is darkened in that column). Use the row numbers 0–9 on the left/right edges to verify the exact row!
  3. Set "finalDigit": if both are present and valid, prefer the darkened bubble or clear box digit (single English digit "0"–"9").
- Concatenate all 6 "finalDigit" values in order (Column 1 to Column 6) to form "roll" (e.g., "240105").

STEP 2 — SET CODE & CANDIDATE INFO:
- "setCode": Read from the right box ("সেট কোড"). Check both the top box and which bubble ("A", "B", "C", or "D") is darkened.
- "studentName": Read handwritten/printed name next to "নাম:".
- "className": Read handwritten/printed class next to "শ্রেণি:".
- "schoolName": Read handwritten/printed school next to "স্কুল:".

STEP 3 — ROW-BY-ROW ${total} MCQ BUBBLE EXTRACTION:
- Look at the 3-Column MCQ Grid at the bottom:
  - Left Column: Questions 1 to ${col1End}
  - Middle Column: Questions ${col1End + 1} to ${col2End}
  - Right Column: Questions ${col2End + 1} to ${total}
- Each question row has 4 circles from left to right: "A", "B", "C", "D".
- A circle is ONLY considered selected if it is clearly darkened/filled in (solid black/dark ink or pencil), NOT just an empty circle with a printed letter A/B/C/D inside!
- For EVERY question from 1 to ${total}:
  - If exactly one bubble (A, B, C, or D) is darkened, return that letter ("A", "B", "C", or "D").
  - If NO bubble is darkened in that row (all 4 circles are white/unfilled with visible letters A, B, C, D), you MUST return "" (empty string).
  - If 2 or more bubbles are darkened in the same row, return "MULTIPLE".`;

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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        temperature: 0.0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            idColumns: {
              type: Type.ARRAY,
              description: 'Column-by-column analysis for each of the 6 Roll/ID columns from left (1) to right (6)',
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
            roll: {
              type: Type.STRING,
              description: 'The complete 6-digit OMR Roll / ID number (e.g. "240105")',
            },
            setCode: {
              type: Type.STRING,
              description: 'Set Code A, B, C, or D extracted from the sheet',
            },
            studentName: {
              type: Type.STRING,
              description: 'Student name written on the OMR sheet',
            },
            className: {
              type: Type.STRING,
              description: 'Student class (শ্রেণি) written on the OMR sheet',
            },
            schoolName: {
              type: Type.STRING,
              description: 'School name written on the OMR sheet',
            },
            answers: {
              type: Type.ARRAY,
              description: `MCQ answers from question 1 to ${total}`,
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
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    // Reconstruct 6-digit roll cleanly from idColumns and roll
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

    return res.json(parsed);
  } catch (error: any) {
    console.error('OMR Vision API error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to analyze OMR image via Gemini Vision',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OptiMark OMR Studio server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
