import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

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

    const prompt = `You are a precision Optical Mark Recognition (OMR) reader for the "বাংলা বিদ্যাপীঠ" A4 Answer Sheet.
${
  cleanIdCrop
    ? 'Image 1 is the full OMR sheet. Image 2 is a zoomed close-up of the top Candidate Details, 6-Digit Roll/ID Grid ("রোল / আইডি নম্বর · 6-Digit ID"), and Set Code ("সেট কোড").'
    : 'Analyze the provided OMR Answer Sheet image.'
}

1. EXTRACT 6-DIGIT ROLL / ID ("রোল / আইডি নম্বর"):
   - Located in the top middle box ("রোল / আইডি নম্বর · 6-Digit ID").
   - Has 6 vertical columns from left to right (Column 1 to Column 6).
   - Each column has a top box (where a digit 0–9 or বাংলা ০–৯ may be written) and 10 circles below it (0 to 9 from top to bottom, with row numbers 0–9 on both left and right sides).
   - For each of the 6 columns from left to right, read the digit (either written in the top box or darkened in the 0–9 circle column).
   - Return "idDigits" as an array of 6 strings (e.g. ["2","4","0","1","0","5"]) and "roll" as the 6-digit string (e.g. "240105").

2. EXTRACT SET CODE & STUDENT INFO:
   - "setCode": "A", "B", "C", or "D" from the top right box ("সেট কোড").
   - "studentName": Name next to "নাম:" (or "").
   - "className": Class next to "শ্রেণি:" (or "").
   - "schoolName": School next to "স্কুল:" (or "").

3. EXTRACT DARKENED MCQ BUBBLES (Questions 1 to ${total}):
   - The MCQ grid has 3 columns:
     * Column 1: Questions 1 to ${col1End}
     * Column 2: Questions ${col1End + 1} to ${col2End}
     * Column 3: Questions ${col2End + 1} to ${total}
   - Each question has 4 circles: A, B, C, D.
   - Return in "answeredQuestions" ONLY the questions where at least one circle (A, B, C, or D) is visibly darkened/filled in!
   - Do NOT include unbubbled/blank questions in "answeredQuestions".
   - If a question has 1 darkened circle, set "selected" to "A", "B", "C", or "D". If 2+ circles are darkened in the same row, set "selected" to "MULTIPLE".`;

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

    parts.push({ text: prompt });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        idDigits: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        roll: { type: Type.STRING },
        setCode: { type: Type.STRING },
        studentName: { type: Type.STRING },
        className: { type: Type.STRING },
        schoolName: { type: Type.STRING },
        answeredQuestions: {
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
      required: ['idDigits', 'roll', 'answeredQuestions'],
    };

    const candidateModels: Array<{ model: string; useLowThinking?: boolean }> = [
      { model: 'gemini-3.1-flash-lite' },
      { model: 'gemini-3.8-flash', useLowThinking: true },
      { model: 'gemini-flash-latest' },
    ];

    let response: any = null;
    let lastError: any = null;
    for (const candidate of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: candidate.model,
          contents: { parts },
          config: {
            temperature: 0.0,
            ...(candidate.useLowThinking
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema,
          },
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Candidate model ${candidate.model} failed:`, err?.message || err);
      }
    }

    if (!response || !response.text) {
      const isQuota =
        lastError?.message?.includes('429') ||
        lastError?.message?.includes('quota') ||
        lastError?.status === 'RESOURCE_EXHAUSTED';
      return res.status(200).json({
        fallbackToClientOptical: true,
        quotaExhausted: Boolean(isQuota),
        warning: isQuota
          ? 'Gemini Vision free-tier quota limit reached. Falling back to local optical recognition.'
          : 'Vision models unavailable. Falling back to local optical recognition.',
      });
    }

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    const fromArray = Array.isArray(parsed.idDigits)
      ? normalizeDigitsServer(parsed.idDigits.join(''))
      : '';
    const fromString = normalizeDigitsServer(parsed.roll || '');

    const finalRoll =
      fromArray.length === 6
        ? fromArray
        : fromString.length >= fromArray.length
        ? fromString.slice(0, 6)
        : fromArray.slice(0, 6);

    const answeredMap = new Map<number, string>();
    const rawList = Array.isArray(parsed.answeredQuestions)
      ? parsed.answeredQuestions
      : Array.isArray(parsed.answers)
      ? parsed.answers
      : [];

    for (const item of rawList) {
      const qNum = Number(item.question);
      const sel = String(item.selected || '').trim().toUpperCase();
      if (qNum >= 1 && qNum <= total && ['A', 'B', 'C', 'D', 'MULTIPLE'].includes(sel)) {
        answeredMap.set(qNum, sel);
      }
    }

    const fullAnswers = [];
    for (let q = 1; q <= total; q++) {
      fullAnswers.push({
        question: q,
        selected: answeredMap.get(q) || '',
      });
    }

    return res.status(200).json({
      roll: finalRoll,
      setCode: parsed.setCode || 'A',
      studentName: parsed.studentName || '',
      className: parsed.className || '',
      schoolName: parsed.schoolName || '',
      answers: fullAnswers,
    });
  } catch {
    return res.status(200).json({
      fallbackToClientOptical: true,
    });
  }
}
