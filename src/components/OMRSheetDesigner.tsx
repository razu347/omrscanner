import React from 'react';
import {
  AnswerKeyMap,
  StudentResponsesMap,
  OptionChoice,
  SetCodeChoice,
  gradeOMRSheet,
  ScoringRules,
  getThreeColumnRanges,
} from '../utils/omrLogic';
import {
  Printer,
  RotateCcw,
  CheckCircle2,
  FileDown,
  Palette,
  SlidersHorizontal,
} from 'lucide-react';
import {
  renderSyntheticOMRSheetDataUrl,
  OMRColorTheme,
} from '../utils/omrImageGenerator';

interface OMRSheetDesignerProps {
  headingTitle: string;
  setHeadingTitle: (val: string) => void;
  examSubtitle: string;
  setExamSubtitle: (val: string) => void;
  studentName: string;
  setStudentName: (val: string) => void;
  classNameValue: string;
  setClassNameValue: (val: string) => void;
  schoolName: string;
  setSchoolName: (val: string) => void;
  omrRoll: string;
  setOmrRoll: (val: string) => void;
  setCode: SetCodeChoice | '';
  setSetCode: (val: SetCodeChoice | '') => void;
  colorTheme: OMRColorTheme;
  setColorTheme: (val: OMRColorTheme) => void;
  fullMarksValue: string;
  setFullMarksValue: (val: string) => void;
  obtainedMarksValue: string;
  setObtainedMarksValue: (val: string) => void;
  responses: StudentResponsesMap;
  setResponses: React.Dispatch<React.SetStateAction<StudentResponsesMap>>;
  answerKey: AnswerKeyMap;
  scoringRules: ScoringRules;
  setScoringRules: React.Dispatch<React.SetStateAction<ScoringRules>>;
  onSendSheetToScanner: (sheetDataUrl?: string) => void;
}

const THEME_STYLES: Record<
  OMRColorTheme,
  {
    name: string;
    outerBorder: string;
    headerBg: string;
    sectionBorder: string;
    sectionHeaderBg: string;
    sectionTitleText: string;
    tintRowBg: string;
    bubbleIdle: string;
    bubbleActive: string;
  }
> = {
  magenta: {
    name: 'Classic OMR Pink/Magenta (গোলাপি)',
    outerBorder: 'border-pink-700',
    headerBg: 'bg-pink-800 text-white',
    sectionBorder: 'border-pink-300',
    sectionHeaderBg: 'bg-pink-50 border-pink-200',
    sectionTitleText: 'text-pink-900',
    tintRowBg: 'bg-pink-50/45',
    bubbleIdle: 'bg-white text-pink-800 border-pink-400 hover:border-pink-700',
    bubbleActive: 'bg-slate-900 text-white border-slate-900 shadow-xs',
  },
  emerald: {
    name: 'Board Exam Green (সবুজ)',
    outerBorder: 'border-emerald-700',
    headerBg: 'bg-emerald-800 text-white',
    sectionBorder: 'border-emerald-300',
    sectionHeaderBg: 'bg-emerald-50 border-emerald-200',
    sectionTitleText: 'text-emerald-900',
    tintRowBg: 'bg-emerald-50/45',
    bubbleIdle: 'bg-white text-emerald-800 border-emerald-400 hover:border-emerald-700',
    bubbleActive: 'bg-slate-900 text-white border-slate-900 shadow-xs',
  },
  royal: {
    name: 'Royal Academic Blue (নীল)',
    outerBorder: 'border-blue-700',
    headerBg: 'bg-blue-800 text-white',
    sectionBorder: 'border-blue-300',
    sectionHeaderBg: 'bg-blue-50 border-blue-200',
    sectionTitleText: 'text-blue-900',
    tintRowBg: 'bg-blue-50/45',
    bubbleIdle: 'bg-white text-blue-800 border-blue-400 hover:border-blue-700',
    bubbleActive: 'bg-slate-900 text-white border-slate-900 shadow-xs',
  },
};

export const OMRSheetDesigner: React.FC<OMRSheetDesignerProps> = ({
  headingTitle,
  setHeadingTitle,
  examSubtitle,
  setExamSubtitle,
  studentName,
  setStudentName,
  classNameValue,
  setClassNameValue,
  schoolName,
  setSchoolName,
  omrRoll,
  setOmrRoll,
  setCode,
  setSetCode,
  colorTheme,
  setColorTheme,
  fullMarksValue,
  setFullMarksValue,
  obtainedMarksValue,
  setObtainedMarksValue,
  responses,
  setResponses,
  answerKey,
  scoringRules,
  setScoringRules,
  onSendSheetToScanner,
}) => {
  const theme = THEME_STYLES[colorTheme];
  const totalQ = scoringRules.totalQuestions || 50;
  const columnRanges = getThreeColumnRanges(totalQ);

  // Maintain 6-slot array for the 6-digit ID
  const getRollSlots = (): string[] => {
    const slots = ['', '', '', '', '', ''];
    for (let i = 0; i < 6; i++) {
      slots[i] = omrRoll[i] && /[0-9]/.test(omrRoll[i]) ? omrRoll[i] : '';
    }
    return slots;
  };

  const rollSlots = getRollSlots();
  const setOptions: SetCodeChoice[] = ['A', 'B', 'C', 'D'];

  const handleDigitSelect = (colIndex: number, digit: number) => {
    const current = getRollSlots();
    const digitStr = String(digit);
    // Toggle off if already selected, otherwise set digit
    current[colIndex] = current[colIndex] === digitStr ? '' : digitStr;
    // Pad empty leading slots with '0' only when forming string if needed, or store 6 chars
    const nextRoll = current.map((ch) => (ch === '' ? ' ' : ch)).join('');
    setOmrRoll(nextRoll);
  };

  const handleDigitInputBoxChange = (colIndex: number, val: string) => {
    const clean = val.replace(/[^0-9]/g, '').slice(-1);
    const current = getRollSlots();
    current[colIndex] = clean;
    const nextRoll = current.map((ch) => (ch === '' ? ' ' : ch)).join('');
    setOmrRoll(nextRoll);
  };

  const handleBubbleToggle = (q: number, opt: 'A' | 'B' | 'C' | 'D') => {
    setResponses((prev) => ({
      ...prev,
      [q]: prev[q] === opt ? '' : opt,
    }));
  };

  const handleTotalQuestionsChange = (newTotal: number) => {
    const clamped = Math.max(10, Math.min(100, newTotal));
    setScoringRules((prev) => ({
      ...prev,
      totalQuestions: clamped,
    }));
    setFullMarksValue(String(Math.round(clamped * scoringRules.marksPerRight)));
  };

  const handleClearForBlankPrint = () => {
    setStudentName('');
    setClassNameValue('');
    setSchoolName('');
    setOmrRoll('');
    setSetCode('');
    setObtainedMarksValue('');
    setResponses({});
  };

  const cleanRollString = rollSlots.join('').trim();
  const slotRollString = rollSlots.map((ch) => (ch === '' ? ' ' : ch)).join('');

  const buildCurrentSheetDataUrl = () => {
    return renderSyntheticOMRSheetDataUrl({
      headingTitle,
      examSubtitle,
      roll: slotRollString,
      setCode,
      studentName,
      className: classNameValue,
      schoolName,
      totalQuestions: totalQ,
      fullMarks: fullMarksValue || totalQ * scoringRules.marksPerRight,
      obtainedMarks: obtainedMarksValue,
      responses,
      colorTheme,
    });
  };

  const handleDownloadPNG = () => {
    const dataUrl = buildCurrentSheetDataUrl();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `Bangla_Bidyapith_OMR_${totalQ}MCQ_${cleanRollString || 'Blank'}.png`;
    link.href = dataUrl;
    link.click();
  };

  const liveGrading = gradeOMRSheet(answerKey, responses, scoringRules);
  const answeredCount = totalQ - liveGrading.empty;

  const handleSendOrScanCurrentSheet = () => {
    const hasAnyContent =
      Boolean(cleanRollString) ||
      answeredCount > 0 ||
      Boolean(studentName.trim()) ||
      Boolean(setCode);
    if (hasAnyContent) {
      const dataUrl = buildCurrentSheetDataUrl();
      onSendSheetToScanner(dataUrl);
    } else {
      onSendSheetToScanner(undefined);
    }
  };

  const renderQuestionColumn = (startQ: number, endQ: number) => {
    const questions = [];
    for (let q = startQ; q <= endQ; q++) {
      questions.push(q);
    }
    const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

    return (
      <div className="divide-y divide-slate-100">
        {questions.map((q, idx) => {
          const selected: OptionChoice = responses[q] || '';
          const isOdd = idx % 2 === 1;
          return (
            <div
              key={q}
              className={`flex items-center justify-between py-1 px-2.5 transition-colors ${
                isOdd ? theme.tintRowBg : 'bg-white'
              }`}
            >
              <span
                className={`font-mono text-xs font-bold w-7 tabular-nums ${theme.sectionTitleText}`}
              >
                {String(q).padStart(2, '0')}.
              </span>
              <div className="flex items-center gap-2">
                {options.map((opt) => {
                  const isActive = selected === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleBubbleToggle(q, opt)}
                      aria-label={`Question ${q} Option ${opt}`}
                      aria-pressed={isActive}
                      className={`w-6 h-6 rounded-full font-mono text-[11px] font-bold flex items-center justify-center border transition-all cursor-pointer select-none ${
                        isActive ? theme.bubbleActive : theme.bubbleIdle
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Control & Customization Toolbar (Hidden when printing) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              রঙিন প্রিন্টেবল A4 OMR সীট ডিজাইনার (বাংলা বিদ্যাপীঠ · ৬ ডিজিট আইডি)
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              ৬-ডিজিট রোল/আইডি, সেট কোড ও পরিবর্তনযোগ্য MCQ সংখ্যাসহ রঙিন A4 OMR সীট প্রিন্ট করুন অথবা পূরণ করে স্ক্যান করুন।
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleClearForBlankPrint}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              সব পরিষ্কার করুন (Reset Blank Sheet)
            </button>

            <button
              type="button"
              onClick={handleDownloadPNG}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              Download A4 PNG
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Colorful A4 OMR
            </button>

            <button
              type="button"
              onClick={handleSendOrScanCurrentSheet}
              className="px-4 py-2 text-xs font-semibold text-white bg-pink-700 hover:bg-pink-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {cleanRollString || answeredCount > 0
                ? 'এই OMR সীটটি স্ক্যান করুন (Scan This Sheet)'
                : 'মোবাইল স্ক্যানারে যান (Go to Scanner)'}
            </button>
          </div>
        </div>

        {/* Customization Bar: MCQ Count (Changeable), Color Theme */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Dynamic MCQ Count Selector */}
          <div className="md:col-span-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-pink-700" />
              MCQ সংখ্যা (পরিবর্তনযোগ্য):
            </span>
            <div className="flex items-center gap-1">
              {[20, 30, 40, 50, 60, 100].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleTotalQuestionsChange(cnt)}
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                    totalQ === cnt
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cnt}
                </button>
              ))}
              <input
                type="number"
                aria-label="Custom MCQ Count"
                min={10}
                max={100}
                value={totalQ}
                onChange={(e) => handleTotalQuestionsChange(Number(e.target.value) || 50)}
                className="w-16 px-2 py-1 text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:border-pink-600 focus:outline-none tabular-nums"
              />
            </div>
          </div>

          {/* Color Theme Selector */}
          <div className="md:col-span-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-pink-700" />
              OMR রঙ (Color Theme):
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setColorTheme('magenta')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  colorTheme === 'magenta'
                    ? 'bg-pink-700 text-white border-pink-800'
                    : 'bg-pink-50 text-pink-900 border-pink-200 hover:bg-pink-100'
                }`}
              >
                গোলাপি (Pink)
              </button>
              <button
                type="button"
                onClick={() => setColorTheme('emerald')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  colorTheme === 'emerald'
                    ? 'bg-emerald-700 text-white border-emerald-800'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                সবুজ (Green)
              </button>
              <button
                type="button"
                onClick={() => setColorTheme('royal')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  colorTheme === 'royal'
                    ? 'bg-blue-700 text-white border-blue-800'
                    : 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100'
                }`}
              >
                নীল (Blue)
              </button>
            </div>
          </div>

          {/* Live Status Summary */}
          <div className="md:col-span-3 flex items-center justify-end gap-3 text-xs font-mono tabular-nums text-slate-600">
            <span>আইডি: <strong className="text-slate-900">{cleanRollString || 'ফাঁকা'}</strong></span>
            <span>·</span>
            <span>পূরণকৃত MCQ: <strong className="text-slate-900">{answeredCount}/{totalQ}</strong></span>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* COLORFUL PRINTABLE A4 OMR SHEET ('বাংলা বিদ্যাপীঠ')                    */}
      {/* ===================================================================== */}
      <div
        id="omr-printable-sheet"
        className={`bg-white border-4 ${theme.outerBorder} rounded-xl p-6 md:p-8 max-w-[210mm] mx-auto relative shadow-sm`}
      >
        {/* 4 High-Contrast Corner Optical Registration Marks for Camera Scanning */}
        <div
          className="w-6 h-6 bg-slate-950 absolute top-2.5 left-2.5 flex items-center justify-center"
          title="Top-Left Optical Scanner Registration Mark"
          aria-hidden="true"
        >
          <div className="w-2 h-2 bg-white" />
        </div>
        <div
          className="w-6 h-6 bg-slate-950 absolute top-2.5 right-2.5 flex items-center justify-center"
          title="Top-Right Optical Scanner Registration Mark"
          aria-hidden="true"
        >
          <div className="w-2 h-2 bg-white" />
        </div>
        <div
          className="w-6 h-6 bg-slate-950 absolute bottom-2.5 left-2.5 flex items-center justify-center"
          title="Bottom-Left Optical Scanner Registration Mark"
          aria-hidden="true"
        >
          <div className="w-2 h-2 bg-white" />
        </div>
        <div
          className="w-6 h-6 bg-slate-950 absolute bottom-2.5 right-2.5 flex items-center justify-center"
          title="Bottom-Right Optical Scanner Registration Mark"
          aria-hidden="true"
        >
          <div className="w-2 h-2 bg-white" />
        </div>

        {/* Inner Frame Border */}
        <div className={`border-2 ${theme.sectionBorder} rounded-lg p-4 md:p-5 space-y-5`}>
          {/* Heading Banner: 'বাংলা বিদ্যাপীঠ' */}
          <div className={`${theme.headerBg} rounded-lg px-6 py-3.5 text-center shadow-2xs`}>
            <input
              type="text"
              aria-label="Institution Heading"
              value={headingTitle}
              onChange={(e) => setHeadingTitle(e.target.value)}
              className="text-center text-2xl md:text-3xl font-bold tracking-wide text-white w-full bg-transparent border-b border-transparent hover:border-white/40 focus:border-white focus:outline-none"
            />
            <input
              type="text"
              aria-label="Exam Subtitle"
              value={examSubtitle}
              onChange={(e) => setExamSubtitle(e.target.value)}
              className="text-center text-xs md:text-sm font-medium text-white/90 w-full bg-transparent border-b border-transparent hover:border-white/30 focus:border-white focus:outline-none mt-1"
            />
          </div>

          {/* Top Grid: 1) নাম, শ্রেণি, স্কুল, পূর্ণমান ও প্রাপ্ত নম্বর | 2) ৬-ডিজিট রোল/আইডি নম্বর | 3) সেট কোড */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Left Block (5 Cols): নাম:, শ্রেণি:, স্কুল: + পূর্ণমান ও প্রাপ্ত নম্বর */}
            <div className={`lg:col-span-5 border-2 ${theme.sectionBorder} rounded-lg overflow-hidden flex flex-col justify-between`}>
              <div>
                <div className={`${theme.sectionHeaderBg} border-b ${theme.sectionBorder} px-3.5 py-1.5 flex items-center justify-between`}>
                  <span className={`text-xs font-bold ${theme.sectionTitleText}`}>
                    শিক্ষার্থীর তথ্য (Candidate Details)
                  </span>
                  <span className="text-[11px] text-slate-600">
                    কালো বলপয়েন্ট কলম
                  </span>
                </div>

                <div className="p-3.5 space-y-2.5">
                  {/* নাম: */}
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="omr-student-name"
                      className={`text-xs font-bold ${theme.sectionTitleText} w-12 shrink-0`}
                    >
                      নাম:
                    </label>
                    <input
                      id="omr-student-name"
                      type="text"
                      placeholder=""
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className={`flex-1 px-2.5 py-1.5 text-sm font-semibold text-slate-900 bg-white border ${theme.sectionBorder} rounded focus:outline-none`}
                    />
                  </div>

                  {/* শ্রেণি: */}
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="omr-class-name"
                      className={`text-xs font-bold ${theme.sectionTitleText} w-12 shrink-0`}
                    >
                      শ্রেণি:
                    </label>
                    <input
                      id="omr-class-name"
                      type="text"
                      placeholder=""
                      value={classNameValue}
                      onChange={(e) => setClassNameValue(e.target.value)}
                      className={`flex-1 px-2.5 py-1.5 text-sm font-semibold text-slate-900 bg-white border ${theme.sectionBorder} rounded focus:outline-none`}
                    />
                  </div>

                  {/* স্কুল: */}
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="omr-school-name"
                      className={`text-xs font-bold ${theme.sectionTitleText} w-12 shrink-0`}
                    >
                      স্কুল:
                    </label>
                    <input
                      id="omr-school-name"
                      type="text"
                      placeholder=""
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      className={`flex-1 px-2.5 py-1.5 text-sm font-semibold text-slate-900 bg-white border ${theme.sectionBorder} rounded focus:outline-none`}
                    />
                  </div>
                </div>
              </div>

              {/* পূর্ণমান (Full Marks) & প্রাপ্ত নম্বর (Obtained Marks) Dedicated Boxes */}
              <div className={`p-3.5 pt-2 border-t ${theme.sectionBorder} ${theme.tintRowBg} grid grid-cols-2 gap-3`}>
                <div className={`bg-white border-2 ${theme.sectionBorder} rounded-md p-2.5 flex flex-col justify-between`}>
                  <label
                    htmlFor="omr-full-marks"
                    className={`text-xs font-bold ${theme.sectionTitleText}`}
                  >
                    পূর্ণমান:
                  </label>
                  <input
                    id="omr-full-marks"
                    type="text"
                    value={fullMarksValue}
                    onChange={(e) => setFullMarksValue(e.target.value)}
                    className="w-full text-lg font-mono font-bold text-slate-900 bg-transparent focus:outline-none mt-1 tabular-nums"
                  />
                </div>

                <div className={`bg-white border-2 ${theme.sectionBorder} rounded-md p-2.5 flex flex-col justify-between`}>
                  <label
                    htmlFor="omr-obtained-marks"
                    className={`text-xs font-bold ${theme.sectionTitleText}`}
                  >
                    প্রাপ্ত নম্বর:
                  </label>
                  <input
                    id="omr-obtained-marks"
                    type="text"
                    placeholder=""
                    value={obtainedMarksValue}
                    onChange={(e) => setObtainedMarksValue(e.target.value)}
                    className="w-full text-lg font-mono font-bold text-emerald-700 bg-transparent focus:outline-none mt-1 tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Middle Block (5 Cols): ৬-ডিজিট রোল / আইডি নম্বর (6-Digit Roll / ID Number) */}
            <div className={`lg:col-span-5 border-2 ${theme.sectionBorder} rounded-lg overflow-hidden flex flex-col justify-between`}>
              <div className={`${theme.sectionHeaderBg} border-b ${theme.sectionBorder} px-3 py-1.5 text-center`}>
                <span className={`text-xs font-bold ${theme.sectionTitleText}`}>
                  রোল / আইডি নম্বর (৬ ডিজিট · 6-Digit ID)
                </span>
              </div>

              <div className="p-3 flex flex-col items-center justify-center flex-1">
                {/* 6 Digit Input Boxes */}
                <div className="flex items-center gap-1.5 w-full max-w-[300px] mb-2 px-4">
                  {[0, 1, 2, 3, 4, 5].map((colIndex) => (
                    <input
                      key={colIndex}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      aria-label={`ID Digit ${colIndex + 1}`}
                      value={rollSlots[colIndex]}
                      onChange={(e) => handleDigitInputBoxChange(colIndex, e.target.value)}
                      className={`h-8 flex-1 min-w-0 border-2 ${theme.outerBorder} rounded text-center font-mono text-sm font-bold text-slate-900 bg-white focus:outline-none tabular-nums`}
                    />
                  ))}
                </div>

                {/* Row-by-Row 0-9 Bubbles with Alternating Bands & Left/Right Row Guides */}
                <div className="w-full max-w-[300px] divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                    <div
                      key={digit}
                      className={`flex items-center justify-between px-1.5 py-0.5 ${
                        digit % 2 === 1 ? theme.tintRowBg : 'bg-white'
                      }`}
                    >
                      <span className="font-mono text-[10px] font-bold text-slate-500 w-3 text-right select-none">
                        {digit}
                      </span>
                      <div className="grid grid-cols-6 gap-1.5 flex-1 px-1.5 place-items-center">
                        {[0, 1, 2, 3, 4, 5].map((colIndex) => {
                          const isSelected =
                            rollSlots[colIndex] !== '' &&
                            Number(rollSlots[colIndex]) === digit;
                          return (
                            <button
                              key={colIndex}
                              type="button"
                              onClick={() => handleDigitSelect(colIndex, digit)}
                              aria-label={`Roll Digit Column ${colIndex + 1} Value ${digit}`}
                              className={`w-5 h-5 rounded-full font-mono text-[10px] font-bold flex items-center justify-center border transition-colors cursor-pointer ${
                                isSelected ? theme.bubbleActive : theme.bubbleIdle
                              }`}
                            >
                              {digit}
                            </button>
                          );
                        })}
                      </div>
                      <span className="font-mono text-[10px] font-bold text-slate-500 w-3 text-left select-none">
                        {digit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Block (2 Cols): সেট কোড (Set Code A, B, C, D) */}
            <div className={`lg:col-span-2 border-2 ${theme.sectionBorder} rounded-lg overflow-hidden flex flex-col justify-between`}>
              <div className={`${theme.sectionHeaderBg} border-b ${theme.sectionBorder} px-2 py-1.5 text-center`}>
                <span className={`text-xs font-bold ${theme.sectionTitleText}`}>
                  সেট কোড (Set)
                </span>
              </div>

              <div className="p-3 flex flex-col items-center justify-between flex-1">
                {/* Written Set Code Box */}
                <div className="text-center w-full">
                  <span className="block text-[10px] text-slate-500 mb-1">
                    সেট লিখুন
                  </span>
                  <div
                    className={`w-12 h-8 mx-auto border-2 ${theme.outerBorder} rounded flex items-center justify-center font-mono text-base font-bold text-slate-900 bg-white`}
                  >
                    {setCode}
                  </div>
                </div>

                {/* Set Code Bubbles A, B, C, D */}
                <div className="flex flex-col items-center space-y-2.5 my-2">
                  {setOptions.map((sOpt) => {
                    const isSelected = setCode === sOpt;
                    return (
                      <div key={sOpt} className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-bold ${theme.sectionTitleText}`}>
                          {sOpt}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSetCode(setCode === sOpt ? '' : sOpt)}
                          aria-label={`Set Code ${sOpt}`}
                          aria-pressed={isSelected}
                          className={`w-7 h-7 rounded-full font-mono text-xs font-bold flex items-center justify-center border transition-colors cursor-pointer ${
                            isSelected ? theme.bubbleActive : theme.bubbleIdle
                          }`}
                        >
                          {sOpt}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="text-[10px] text-center text-slate-500">
                  সঠিক সেট ভরাট করুন
                </div>
              </div>
            </div>
          </div>

          {/* 3-Column MCQ Bubble Grid (তিনটি কলামে MCQ পূরণ) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h3 className={`text-xs font-bold ${theme.sectionTitleText}`}>
                বহুনির্বাচনি প্রশ্নের উত্তর বৃত্ত (১ থেকে {totalQ} নং প্রশ্ন · তিনটি কলামে সাজানো)
              </h3>
              <span className="text-[11px] text-slate-600">
                সঠিক পদ্ধতি: ● সম্পূর্ণ কালো বলপয়েন্ট কলম দিয়ে বৃত্ত ভরাট করুন
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {columnRanges.map((range, idx) => (
                <div
                  key={idx}
                  className={`border-2 ${theme.sectionBorder} rounded-lg overflow-hidden`}
                >
                  <div
                    className={`${theme.sectionHeaderBg} border-b ${theme.sectionBorder} px-3 py-1.5 flex items-center justify-between text-xs font-bold ${theme.sectionTitleText}`}
                  >
                    <span>প্রশ্ন {String(range.start).padStart(2, '0')} – {String(range.end).padStart(2, '0')}</span>
                    <span className="font-mono tracking-widest pr-1">A B C D</span>
                  </div>
                  {renderQuestionColumn(range.start, range.end)}
                </div>
              ))}
            </div>
          </div>

          {/* Sheet Footer: Candidate & Invigilator Signatures */}
          <div className={`pt-3 border-t ${theme.sectionBorder} flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 px-2`}>
            <div>
              <span>পরীক্ষার্থীর স্বাক্ষর: ___________________________</span>
            </div>
            <div>
              <span>কক্ষ পরিদর্শকের স্বাক্ষর ও তারিখ: ___________________________</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
