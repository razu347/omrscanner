import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRollId,
  formatSixDigitId,
  findStudentByScannedId,
  getThreeColumnRanges,
  gradeOMRSheet,
  formatStudentRowForSheet,
  parseSheetRowsToRecords,
  upsertScannedResultIntoRecords,
  createDefaultAnswerKey,
  extractSpreadsheetId,
  AnswerKeyMap,
  StudentResponsesMap,
} from './omrLogic';

test('normalizeRollId and formatSixDigitId handle 6-digit Bengali and English IDs', () => {
  assert.equal(normalizeRollId(' ১০০১০৫ '), '100105');
  assert.equal(normalizeRollId('২০২৬০১'), '202601');
  assert.equal(formatSixDigitId('123456'), '123456');
  assert.equal(formatSixDigitId('105'), '000105');
});

test('findStudentByScannedId matches 6-digit student IDs accurately', () => {
  const roster = [
    {
      id: '100201',
      name: 'আরিফ হোসেন',
      school: 'বাংলা বিদ্যাপীঠ',
      mobile: '01711000000',
      right: null,
      wrong: null,
      empty: null,
      total: null,
    },
  ];
  const found = findStudentByScannedId(roster, '১০০২০১');
  assert.ok(found);
  assert.equal(found.name, 'আরিফ হোসেন');
});

test('getThreeColumnRanges splits dynamic MCQ counts evenly across 3 columns', () => {
  assert.deepEqual(getThreeColumnRanges(50), [
    { start: 1, end: 17 },
    { start: 18, end: 34 },
    { start: 35, end: 50 },
  ]);
  assert.deepEqual(getThreeColumnRanges(30), [
    { start: 1, end: 10 },
    { start: 11, end: 20 },
    { start: 21, end: 30 },
  ]);
});

test('gradeOMRSheet calculates Right, Wrong, Empty, FullMarks, and Total accurately', () => {
  const key: AnswerKeyMap = {};
  const responses: StudentResponsesMap = {};

  for (let q = 1; q <= 50; q++) {
    key[q] = 'A';
    if (q <= 35) {
      responses[q] = 'A'; // 35 Right
    } else if (q <= 43) {
      responses[q] = 'B'; // 8 Wrong
    } else {
      responses[q] = ''; // 7 Empty
    }
  }

  const resStandard = gradeOMRSheet(key, responses, {
    totalQuestions: 50,
    marksPerRight: 1,
    negativeMarkPerWrong: 0,
  });

  assert.equal(resStandard.right, 35);
  assert.equal(resStandard.wrong, 8);
  assert.equal(resStandard.empty, 7);
  assert.equal(resStandard.total, 35);
  assert.equal(resStandard.fullMarks, 50);
  assert.equal(resStandard.accuracyPercent, 70);
});

test('formatStudentRowForSheet maps 6-digit ID and columns accurately', () => {
  const row = formatStudentRowForSheet({
    id: '১০০২০৫',
    name: 'তানভীর আহমেদ',
    school: 'ঢাকা কলেজিয়েট স্কুল',
    mobile: '01711-223344',
    right: 42,
    wrong: 5,
    empty: 3,
    total: 42,
  });

  assert.deepEqual(row, [
    '100205',
    'তানভীর আহমেদ',
    'ঢাকা কলেজিয়েট স্কুল',
    '01711-223344',
    42,
    5,
    3,
    42,
  ]);
});

test('parseSheetRowsToRecords skips header and parses 8 columns accurately', () => {
  const rawRows = [
    ['আইডি', 'নাম', 'স্কুল', 'মোবাইল', 'Right', 'Wrong', 'Empty', 'Total'],
    ['100101', 'সাদিয়া ইসলাম', 'ভিকারুননিসা নূন স্কুল', '01712-112233', '46', '3', '1', '46'],
    ['100102', 'রাফি হাসান', 'জিলা স্কুল', '01819-445566', '', '', '', ''],
  ];

  const parsed = parseSheetRowsToRecords(rawRows);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, '100101');
  assert.equal(parsed[0].right, 46);
  assert.equal(parsed[0].total, 46);
  assert.equal(parsed[1].id, '100102');
  assert.equal(parsed[1].right, null);
});

test('upsertScannedResultIntoRecords routes scanned score directly to matched 6-digit ID student', () => {
  const initial = [
    {
      rowIndex: 2,
      id: '240105',
      name: 'সাদিয়া ইসলাম',
      school: 'ভিকারুননিসা নূন স্কুল',
      mobile: '01712-112233',
      right: null,
      wrong: null,
      empty: null,
      total: null,
    },
  ];

  const key = createDefaultAnswerKey();
  const responses: StudentResponsesMap = {};
  for (let q = 1; q <= 50; q++) {
    responses[q] = key[q];
  }
  const perfectGrading = gradeOMRSheet(key, responses);

  const updateRes = upsertScannedResultIntoRecords(initial, {
    roll: '২৪০১০৫',
    setCode: 'B',
    className: 'দশম',
    grading: perfectGrading,
  });

  assert.equal(updateRes.isExistingUpdate, true);
  assert.equal(updateRes.matchedRecord.id, '240105');
  assert.equal(updateRes.matchedRecord.right, 50);
  assert.equal(updateRes.matchedRecord.total, 50);
  assert.equal(updateRes.matchedRecord.name, 'সাদিয়া ইসলাম');
});

test('extractSpreadsheetId parses URLs and raw IDs', () => {
  const url = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
  assert.equal(extractSpreadsheetId(url), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
});
