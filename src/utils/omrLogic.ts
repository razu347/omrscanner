export type OptionChoice = 'A' | 'B' | 'C' | 'D' | '' | 'MULTIPLE';

export type SetCodeChoice = 'A' | 'B' | 'C' | 'D';

export type AnswerKeyMap = Record<number, 'A' | 'B' | 'C' | 'D'>;

export type StudentResponsesMap = Record<number, OptionChoice>;

export interface ScoringRules {
  totalQuestions: number; // default 50 (customizable e.g. 20, 30, 40, 50, 60, 100)
  marksPerRight: number;  // default 1
  negativeMarkPerWrong: number; // default 0 or 0.25
}

export interface QuestionEvaluation {
  question: number;
  selected: OptionChoice;
  correctOption: 'A' | 'B' | 'C' | 'D';
  status: 'RIGHT' | 'WRONG' | 'EMPTY';
}

export interface OMRGradingResult {
  right: number;
  wrong: number;
  empty: number;
  total: number;
  fullMarks: number;
  accuracyPercent: number;
  details: QuestionEvaluation[];
}

export interface SheetStudentRecord {
  rowIndex?: number; // 1-indexed row in Google Sheet
  id: string;        // 6-digit আইডি / OMR Roll (e.g. "100101")
  name: string;      // নাম
  className?: string; // শ্রেণি
  school: string;    // স্কুল
  mobile: string;    // মোবাইল
  setCode?: SetCodeChoice; // সেট কোড
  right: number | null;
  wrong: number | null;
  empty: number | null;
  total: number | null;
  lastUpdated?: string;
}

/**
 * Normalizes a 6-digit OMR Roll or Student ID string for accurate matching.
 * Strips leading/trailing whitespace and converts Bengali numerals (০-৯) to English numerals (0-9).
 */
export function normalizeRollId(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return '';
  const str = String(raw).trim();
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  let result = '';
  for (const ch of str) {
    const idx = bengaliDigits.indexOf(ch);
    if (idx !== -1) {
      result += String(idx);
    } else {
      result += ch;
    }
  }
  return result.replace(/\s+/g, '');
}

/**
 * Formats an ID to a 6-digit string for the 6-column OMR Roll/ID bubble matrix.
 */
export function formatSixDigitId(raw: string | number | undefined | null): string {
  const cleaned = normalizeRollId(raw).replace(/[^0-9]/g, '');
  if (!cleaned) return '000000';
  return cleaned.padStart(6, '0').slice(-6);
}

/**
 * Finds a student in the Google Sheet roster matching the scanned 6-digit ID.
 * Supports exact normalized match as well as numeric equivalence (e.g., "001005" matches "1005" or "001005").
 */
export function findStudentByScannedId(
  records: SheetStudentRecord[],
  scannedId: string
): SheetStudentRecord | undefined {
  const normScanned = normalizeRollId(scannedId);
  if (!normScanned) return undefined;

  // 1. Direct normalized string match
  const exact = records.find((r) => normalizeRollId(r.id) === normScanned);
  if (exact) return exact;

  // 2. 6-digit padded equivalence match (if both are numeric)
  const paddedScanned = formatSixDigitId(normScanned);
  return records.find((r) => {
    const rNorm = normalizeRollId(r.id);
    return rNorm && formatSixDigitId(rNorm) === paddedScanned;
  });
}

/**
 * Splits `totalQuestions` into 3 balanced columns for an A4 OMR layout.
 * Example for 50: [{start: 1, end: 17}, {start: 18, end: 34}, {start: 35, end: 50}]
 */
export function getThreeColumnRanges(totalQuestions: number): { start: number; end: number }[] {
  const total = Math.max(3, Math.min(100, Math.round(totalQuestions || 50)));
  const base = Math.floor(total / 3);
  const rem = total % 3;

  const col1Count = base + (rem >= 1 ? 1 : 0);
  const col2Count = base + (rem >= 2 ? 1 : 0);

  const col1End = col1Count;
  const col2End = col1End + col2Count;

  return [
    { start: 1, end: col1End },
    { start: col1End + 1, end: col2End },
    { start: col2End + 1, end: total },
  ];
}

/**
 * Evaluates an OMR response map against a pre-configured Answer Key for `rules.totalQuestions` MCQs.
 * Handles Right, Wrong (including MULTIPLE bubbled), Empty, Full Marks, and Total score with 2-decimal precision.
 */
export function gradeOMRSheet(
  answerKey: AnswerKeyMap,
  responses: StudentResponsesMap,
  rules: ScoringRules = { totalQuestions: 50, marksPerRight: 1, negativeMarkPerWrong: 0 }
): OMRGradingResult {
  let right = 0;
  let wrong = 0;
  let empty = 0;
  const details: QuestionEvaluation[] = [];

  const totalQ = Math.max(1, Math.min(100, Math.round(rules.totalQuestions || 50)));

  for (let q = 1; q <= totalQ; q++) {
    const correctOption = answerKey[q] || 'A';
    const rawSelected = responses[q] || '';
    const selected = rawSelected.trim().toUpperCase() as OptionChoice;

    if (!selected) {
      empty++;
      details.push({
        question: q,
        selected: '',
        correctOption,
        status: 'EMPTY',
      });
    } else if (selected === correctOption) {
      right++;
      details.push({
        question: q,
        selected,
        correctOption,
        status: 'RIGHT',
      });
    } else {
      wrong++;
      details.push({
        question: q,
        selected,
        correctOption,
        status: 'WRONG',
      });
    }
  }

  const rawTotal = right * rules.marksPerRight - wrong * rules.negativeMarkPerWrong;
  const total = Math.round(rawTotal * 100) / 100;
  const fullMarks = Math.round(totalQ * rules.marksPerRight * 100) / 100;
  const accuracyPercent = totalQ > 0 ? Math.round((right / totalQ) * 1000) / 10 : 0;

  return {
    right,
    wrong,
    empty,
    total,
    fullMarks,
    accuracyPercent,
    details,
  };
}

/**
 * Formats a Student Record into the exact 8-column Google Sheet row order requested by the user:
 * [আইডি (ID), নাম (Name), স্কুল (School), মোবাইল (Mobile), Right, Wrong, Empty, Total]
 */
export function formatStudentRowForSheet(record: SheetStudentRecord): (string | number)[] {
  return [
    normalizeRollId(record.id),
    record.name.trim(),
    record.school.trim(),
    record.mobile.trim(),
    record.right ?? '',
    record.wrong ?? '',
    record.empty ?? '',
    record.total ?? '',
  ];
}

/**
 * Parses raw 2D array values from Google Sheets into typed SheetStudentRecord objects.
 * Automatically skips the header row if column 0 is "আইডি" or "ID" (case-insensitive).
 */
export function parseSheetRowsToRecords(rows: (string | number)[][]): SheetStudentRecord[] {
  if (!rows || rows.length === 0) return [];

  const records: SheetStudentRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] ?? '').trim();
    if (
      i === 0 &&
      (firstCell.toLowerCase() === 'id' ||
        firstCell.includes('আইডি') ||
        firstCell.toLowerCase() === 'roll' ||
        firstCell.includes('রোল'))
    ) {
      continue;
    }

    if (!firstCell && !row[1]) continue;

    const parseNum = (val: unknown): number | null => {
      if (val === undefined || val === null || String(val).trim() === '') return null;
      const n = Number(val);
      return Number.isNaN(n) ? null : n;
    };

    records.push({
      rowIndex: i + 1,
      id: normalizeRollId(firstCell),
      name: String(row[1] ?? '').trim(),
      school: String(row[2] ?? '').trim(),
      mobile: String(row[3] ?? '').trim(),
      right: parseNum(row[4]),
      wrong: parseNum(row[5]),
      empty: parseNum(row[6]),
      total: parseNum(row[7]),
    });
  }

  return records;
}

/**
 * Merges a newly scanned OMR result into the existing list of student records by matching the 6-digit ID.
 * If a student with matching 6-digit Roll/ID exists, updates their Right, Wrong, Empty, Total directly.
 * If no matching student exists, appends a new student row with the scanned 6-digit ID.
 */
export function upsertScannedResultIntoRecords(
  existingRecords: SheetStudentRecord[],
  scanned: {
    roll: string;
    name?: string;
    className?: string;
    school?: string;
    mobile?: string;
    setCode?: SetCodeChoice;
    grading: OMRGradingResult;
  }
): {
  updatedRecords: SheetStudentRecord[];
  matchedRecord: SheetStudentRecord;
  isExistingUpdate: boolean;
} {
  const normRoll = normalizeRollId(scanned.roll);
  const matchedExisting = findStudentByScannedId(existingRecords, normRoll);
  const idx = matchedExisting
    ? existingRecords.findIndex((r) => r.id === matchedExisting.id)
    : -1;
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (idx !== -1) {
    const current = existingRecords[idx];
    const updated: SheetStudentRecord = {
      ...current,
      name: current.name || scanned.name?.trim() || '',
      className: scanned.className?.trim() || current.className || '',
      school: current.school || scanned.school?.trim() || '',
      mobile: current.mobile || scanned.mobile?.trim() || '',
      setCode: scanned.setCode || current.setCode || 'A',
      right: scanned.grading.right,
      wrong: scanned.grading.wrong,
      empty: scanned.grading.empty,
      total: scanned.grading.total,
      lastUpdated: timestamp,
    };
    const nextList = [...existingRecords];
    nextList[idx] = updated;
    return {
      updatedRecords: nextList,
      matchedRecord: updated,
      isExistingUpdate: true,
    };
  } else {
    const newRecord: SheetStudentRecord = {
      rowIndex: existingRecords.length + 2,
      id: normRoll,
      name: scanned.name?.trim() || '',
      className: scanned.className?.trim() || '',
      school: scanned.school?.trim() || '',
      mobile: scanned.mobile?.trim() || '',
      setCode: scanned.setCode || 'A',
      right: scanned.grading.right,
      wrong: scanned.grading.wrong,
      empty: scanned.grading.empty,
      total: scanned.grading.total,
      lastUpdated: timestamp,
    };
    return {
      updatedRecords: [...existingRecords, newRecord],
      matchedRecord: newRecord,
      isExistingUpdate: false,
    };
  }
}

/**
 * Generates a default Answer Key (all set to 'A' initially so the teacher can configure it).
 */
export function createDefaultAnswerKey(maxQuestions = 100): AnswerKeyMap {
  const pattern: AnswerKeyMap = {};
  for (let q = 1; q <= maxQuestions; q++) {
    pattern[q] = 'A';
  }
  return pattern;
}

/**
 * Extracts Google Spreadsheet ID from either a full Google Sheets URL or a direct ID string.
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}
