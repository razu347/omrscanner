/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  AnswerKeyMap,
  StudentResponsesMap,
  ScoringRules,
  SheetStudentRecord,
  OMRGradingResult,
  SetCodeChoice,
  createDefaultAnswerKey,
  upsertScannedResultIntoRecords,
} from './utils/omrLogic';
import { OMRColorTheme } from './utils/omrImageGenerator';
import {
  initAuth,
  googleSignIn,
  logout,
} from './utils/googleAuth';
import {
  SpreadsheetMetadata,
  syncAllStudentRecordsToSheet,
} from './utils/sheetsApi';
import { OMRSheetDesigner } from './components/OMRSheetDesigner';
import { AnswerKeySetup } from './components/AnswerKeySetup';
import { MobileOMRScanner } from './components/MobileOMRScanner';
import { GoogleSheetsSync } from './components/GoogleSheetsSync';

type WorkspaceTab = 'omr-sheet' | 'answer-key' | 'scanner' | 'google-sheet';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('omr-sheet');

  // Master Answer Key & Scoring Rules (persisted in localStorage)
  const [answerKey, setAnswerKey] = useState<AnswerKeyMap>(() => {
    try {
      const saved = localStorage.getItem('optimark_answer_key_100');
      if (saved) return JSON.parse(saved);
    } catch {}
    return createDefaultAnswerKey(100);
  });

  const [scoringRules, setScoringRules] = useState<ScoringRules>({
    totalQuestions: 50,
    marksPerRight: 1,
    negativeMarkPerWrong: 0,
  });

  useEffect(() => {
    try {
      localStorage.setItem('optimark_answer_key_100', JSON.stringify(answerKey));
    } catch {}
  }, [answerKey]);

  // Blank Printable OMR Sheet Designer State ('বাংলা বিদ্যাপীঠ' — NO pre-filled demo student data)
  const [headingTitle, setHeadingTitle] = useState('বাংলা বিদ্যাপীঠ');
  const [examSubtitle, setExamSubtitle] = useState(
    'বার্ষিক মেধা যাচাই ও মূল্যায়ন পরীক্ষা · OMR উত্তরপত্র (A4)'
  );
  const [studentName, setStudentName] = useState('');
  const [classNameValue, setClassNameValue] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [omrRoll, setOmrRoll] = useState(''); // 6-digit ID starts blank
  const [setCode, setSetCode] = useState<SetCodeChoice | ''>('');
  const [colorTheme, setColorTheme] = useState<OMRColorTheme>('magenta');
  const [fullMarksValue, setFullMarksValue] = useState('50');
  const [obtainedMarksValue, setObtainedMarksValue] = useState('');
  const [designerResponses, setDesignerResponses] = useState<StudentResponsesMap>({});

  // Google Sheets Student Roster State — Starts completely clean with NO demo records
  const [studentRecords, setStudentRecords] = useState<SheetStudentRecord[]>(() => {
    try {
      const saved = localStorage.getItem('bangla_bidyapith_roster_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('bangla_bidyapith_roster_v2', JSON.stringify(studentRecords));
    } catch {}
  }, [studentRecords]);

  // Google OAuth State
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [connectedSheet, setConnectedSheet] =
    useState<SpreadsheetMetadata | null>(null);
  const [selectedSheetTab, setSelectedSheetTab] = useState<string>('Sheet1');

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setAccessToken(token);
        setUserEmail(user.email);
      },
      () => {
        setAccessToken(null);
        setUserEmail(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setAccessToken(res.accessToken);
        setUserEmail(res.user.email);
      }
    } catch (err) {
      console.error('Google Sign-in failed:', err);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setAccessToken(null);
    setUserEmail(null);
  };

  const [pendingScanImageDataUrl, setPendingScanImageDataUrl] = useState<string | null>(null);

  const handleSendSheetToScanner = (sheetDataUrl?: string) => {
    if (sheetDataUrl) {
      setPendingScanImageDataUrl(sheetDataUrl);
    }
    setActiveTab('scanner');
  };

  const handleSaveScannedResult = async (payload: {
    roll: string;
    setCode: SetCodeChoice;
    name: string;
    className: string;
    school: string;
    mobile: string;
    grading: OMRGradingResult;
    syncToGoogleSheetNow: boolean;
  }): Promise<{ matchedRecord: SheetStudentRecord; isExistingUpdate: boolean }> => {
    const { updatedRecords, matchedRecord, isExistingUpdate } =
      upsertScannedResultIntoRecords(studentRecords, {
        roll: payload.roll,
        setCode: payload.setCode,
        name: payload.name,
        className: payload.className,
        school: payload.school,
        mobile: payload.mobile,
        grading: payload.grading,
      });

    setStudentRecords(updatedRecords);

    if (
      payload.syncToGoogleSheetNow &&
      accessToken &&
      connectedSheet
    ) {
      await syncAllStudentRecordsToSheet(
        connectedSheet.spreadsheetId,
        selectedSheetTab,
        updatedRecords,
        accessToken
      );
    }

    return { matchedRecord, isExistingUpdate };
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-30 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('omr-sheet');
            }}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            বাংলা বিদ্যাপীঠ · OMR Studio
          </a>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav
            aria-label="Primary Workspace Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => setActiveTab('omr-sheet')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'omr-sheet'
                  ? 'border-pink-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              OMR Sheet
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('answer-key')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'answer-key'
                  ? 'border-pink-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Answer Key
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'scanner'
                  ? 'border-pink-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Mobile Scanner
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('google-sheet')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'google-sheet'
                  ? 'border-pink-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Google Sheets
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            {!accessToken ? (
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="gsi-material-button"
              >
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    Sign in with Google
                  </span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleLogout}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign Out ({userEmail?.split('@')[0] || 'Google'})
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Mobile Segmented Workspace Switcher */}
        <div className="flex md:hidden items-center gap-1 p-1 bg-slate-200/70 rounded-lg mb-5 overflow-x-auto print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('omr-sheet')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'omr-sheet'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            OMR Sheet
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('answer-key')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'answer-key'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Answer Key
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scanner')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'scanner'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Scanner
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('google-sheet')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'google-sheet'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Google Sheets
          </button>
        </div>

        {activeTab === 'omr-sheet' && (
          <OMRSheetDesigner
            headingTitle={headingTitle}
            setHeadingTitle={setHeadingTitle}
            examSubtitle={examSubtitle}
            setExamSubtitle={setExamSubtitle}
            studentName={studentName}
            setStudentName={setStudentName}
            classNameValue={classNameValue}
            setClassNameValue={setClassNameValue}
            schoolName={schoolName}
            setSchoolName={setSchoolName}
            omrRoll={omrRoll}
            setOmrRoll={setOmrRoll}
            setCode={setCode}
            setSetCode={setSetCode}
            colorTheme={colorTheme}
            setColorTheme={setColorTheme}
            fullMarksValue={fullMarksValue}
            setFullMarksValue={setFullMarksValue}
            obtainedMarksValue={obtainedMarksValue}
            setObtainedMarksValue={setObtainedMarksValue}
            responses={designerResponses}
            setResponses={setDesignerResponses}
            answerKey={answerKey}
            scoringRules={scoringRules}
            setScoringRules={setScoringRules}
            onSendSheetToScanner={handleSendSheetToScanner}
          />
        )}

        {activeTab === 'answer-key' && (
          <AnswerKeySetup
            answerKey={answerKey}
            setAnswerKey={setAnswerKey}
            scoringRules={scoringRules}
            setScoringRules={setScoringRules}
          />
        )}

        {activeTab === 'scanner' && (
          <MobileOMRScanner
            headingTitle={headingTitle}
            examSubtitle={examSubtitle}
            colorTheme={colorTheme}
            answerKey={answerKey}
            scoringRules={scoringRules}
            studentRecords={studentRecords}
            onSaveScannedResult={handleSaveScannedResult}
            isGoogleSheetConnected={Boolean(accessToken && connectedSheet)}
            initialScanImageDataUrl={pendingScanImageDataUrl}
            onConsumeInitialScanImage={() => setPendingScanImageDataUrl(null)}
            onNavigateToGoogleSheets={() => setActiveTab('google-sheet')}
          />
        )}

        {activeTab === 'google-sheet' && (
          <GoogleSheetsSync
            records={studentRecords}
            setRecords={setStudentRecords}
            accessToken={accessToken}
            userEmail={userEmail}
            onRequestGoogleLogin={handleGoogleLogin}
            connectedSheet={connectedSheet}
            setConnectedSheet={setConnectedSheet}
            selectedTab={selectedSheetTab}
            setSelectedTab={setSelectedSheetTab}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 mt-12 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            বাংলা বিদ্যাপীঠ · রঙিন A4 OMR উত্তরপত্র ও ৬-ডিজিট আইডি স্ক্যানার
          </span>
          <span>
            Columns: আইডি (6-Digit ID) · নাম (Name) · স্কুল (School) · মোবাইল (Mobile) · Right · Wrong · Empty · Total
          </span>
        </div>
      </footer>
    </div>
  );
}
