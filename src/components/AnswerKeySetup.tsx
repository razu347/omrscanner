import React, { useState } from 'react';
import {
  AnswerKeyMap,
  ScoringRules,
  createDefaultAnswerKey,
  getThreeColumnRanges,
} from '../utils/omrLogic';
import { Check, Shuffle, Copy, ClipboardPaste } from 'lucide-react';

interface AnswerKeySetupProps {
  answerKey: AnswerKeyMap;
  setAnswerKey: React.Dispatch<React.SetStateAction<AnswerKeyMap>>;
  scoringRules: ScoringRules;
  setScoringRules: React.Dispatch<React.SetStateAction<ScoringRules>>;
}

export const AnswerKeySetup: React.FC<AnswerKeySetupProps> = ({
  answerKey,
  setAnswerKey,
  scoringRules,
  setScoringRules,
}) => {
  const [bulkString, setBulkString] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const totalQ = scoringRules.totalQuestions || 50;
  const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

  const handleSetOption = (q: number, opt: 'A' | 'B' | 'C' | 'D') => {
    setAnswerKey((prev) => ({
      ...prev,
      [q]: opt,
    }));
  };

  const handleSetAllOption = (opt: 'A' | 'B' | 'C' | 'D') => {
    const next: AnswerKeyMap = { ...answerKey };
    for (let q = 1; q <= totalQ; q++) {
      next[q] = opt;
    }
    setAnswerKey(next);
    setStatusMessage(`All ${totalQ} questions set to option ${opt}.`);
  };

  const handleResetStandardPattern = () => {
    setAnswerKey(createDefaultAnswerKey(100));
    setStatusMessage(`Restored balanced ${totalQ}-question master answer key.`);
  };

  const handleApplyBulkString = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = bulkString.toUpperCase().replace(/[^ABCD]/g, '');
    if (!cleaned) {
      setStatusMessage('Please enter valid answer letters (A, B, C, D).');
      return;
    }
    const next: AnswerKeyMap = { ...answerKey };
    const limit = Math.min(totalQ, cleaned.length);
    for (let i = 0; i < limit; i++) {
      next[i + 1] = cleaned[i] as 'A' | 'B' | 'C' | 'D';
    }
    setAnswerKey(next);
    setStatusMessage(`Applied ${limit} answers from quick string.`);
  };

  const handleCopyKeyString = () => {
    let str = '';
    for (let q = 1; q <= totalQ; q++) {
      str += answerKey[q] || 'A';
    }
    navigator.clipboard?.writeText(str);
    setStatusMessage(`Copied ${totalQ}-answer key string: ${str.slice(0, 12)}...`);
  };

  // Count distribution for active totalQuestions
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (let q = 1; q <= totalQ; q++) {
    const k = answerKey[q] || 'A';
    counts[k]++;
  }

  const colRanges = getThreeColumnRanges(totalQ);

  return (
    <div className="space-y-6">
      {/* Header & Scoring Rules Configuration */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Pre-Configured Master Answer Key ({totalQ}টি MCQ-এর সঠিক উত্তর সেটআপ)
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Set the official correct answers for Questions 01 to {totalQ} before scanning student OMR sheets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleSetAllOption(opt)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Set All {opt}
              </button>
            ))}
            <button
              type="button"
              onClick={handleResetStandardPattern}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Balanced Key
            </button>
            <button
              type="button"
              onClick={handleCopyKeyString}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy {totalQ}-Key String
            </button>
          </div>
        </div>

        {/* Total Questions, Marking Rules & Quick String Import */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-4 border-t border-slate-100 items-end">
          <div className="lg:col-span-6 grid grid-cols-3 gap-3 items-end">
            <div>
              <label
                htmlFor="total-questions-input"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                মোট MCQ (Total Qs)
              </label>
              <input
                id="total-questions-input"
                type="number"
                min="10"
                max="100"
                value={scoringRules.totalQuestions}
                onChange={(e) =>
                  setScoringRules((prev) => ({
                    ...prev,
                    totalQuestions: Math.max(10, Math.min(100, Number(e.target.value) || 50)),
                  }))
                }
                className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="marks-per-right"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                সঠিক নম্বর (Per Right)
              </label>
              <input
                id="marks-per-right"
                type="number"
                step="0.25"
                min="0.25"
                max="10"
                value={scoringRules.marksPerRight}
                onChange={(e) =>
                  setScoringRules((prev) => ({
                    ...prev,
                    marksPerRight: Math.max(0.25, Number(e.target.value) || 1),
                  }))
                }
                className="w-full px-3 py-2 text-sm font-mono font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="negative-mark-per-wrong"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                ভুল কাটা (Negative)
              </label>
              <select
                id="negative-mark-per-wrong"
                value={scoringRules.negativeMarkPerWrong}
                onChange={(e) =>
                  setScoringRules((prev) => ({
                    ...prev,
                    negativeMarkPerWrong: Number(e.target.value),
                  }))
                }
                className="w-full px-3 py-2 text-sm font-mono font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none tabular-nums"
              >
                <option value={0}>0.00 (No Penalty)</option>
                <option value={0.25}>-0.25 per Wrong</option>
                <option value={0.5}>-0.50 per Wrong</option>
                <option value={1}>-1.00 per Wrong</option>
              </select>
            </div>
          </div>

          <form
            onSubmit={handleApplyBulkString}
            className="lg:col-span-6 flex flex-col justify-end"
          >
            <label
              htmlFor="bulk-answer-string"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Quick String Import (একসাথে {totalQ}টি উত্তর পেস্ট করুন, যেমন: ABCDABCD...)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="bulk-answer-string"
                type="text"
                placeholder={`Paste up to ${totalQ} answer letters (e.g. ABCDDCBA...)`}
                value={bulkString}
                onChange={(e) => setBulkString(e.target.value)}
                className="flex-1 px-3.5 py-2 text-sm font-mono text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Apply Key String
              </button>
            </div>
          </form>
        </div>

        {/* Distribution Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
          <div className="flex items-center gap-3 font-mono tabular-nums">
            <span className="font-sans font-semibold text-slate-900">Key Distribution ({totalQ} MCQs):</span>
            <span>Option A: <strong>{counts.A}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Option B: <strong>{counts.B}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Option C: <strong>{counts.C}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Option D: <strong>{counts.D}</strong></span>
            <span aria-hidden="true">·</span>
            <span>পূর্ণমান: <strong>{Math.round(totalQ * scoringRules.marksPerRight * 100) / 100}</strong></span>
          </div>
          {statusMessage && (
            <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              {statusMessage}
            </span>
          )}
        </div>
      </div>

      {/* 3-Column Interactive Answer Key Grid matching the OMR Sheet layout */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {colRanges.map((range, colGroup) => {
            const qs = [];
            for (let q = range.start; q <= range.end; q++) qs.push(q);

            return (
              <div
                key={colGroup}
                className="border border-slate-200 rounded-lg p-3.5 space-y-1.5"
              >
                <div className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-2 mb-2 flex justify-between px-1 font-mono tabular-nums">
                  <span>কলাম {colGroup + 1}: প্রশ্ন {String(range.start).padStart(2, '0')}–{String(range.end).padStart(2, '0')}</span>
                  <span>Correct Option</span>
                </div>

                {qs.map((q) => {
                  const activeOpt = answerKey[q] || 'A';
                  return (
                    <div
                      key={q}
                      className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-slate-50"
                    >
                      <span className="font-mono text-xs font-bold text-slate-800 w-8 tabular-nums">
                        {String(q).padStart(2, '0')}.
                      </span>
                      <div className="flex items-center gap-2">
                        {options.map((opt) => {
                          const isSelected = activeOpt === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleSetOption(q, opt)}
                              aria-label={`Answer Key Question ${q} Option ${opt}`}
                              aria-pressed={isSelected}
                              className={`w-6 h-6 rounded-full font-mono text-[11px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border border-emerald-700'
                                  : 'bg-white text-slate-600 border border-slate-300 hover:border-slate-500'
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
          })}
        </div>
      </div>
    </div>
  );
};
