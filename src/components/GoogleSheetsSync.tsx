import React, { useState } from 'react';
import {
  SheetStudentRecord,
  extractSpreadsheetId,
  formatStudentRowForSheet,
} from '../utils/omrLogic';
import {
  SpreadsheetMetadata,
  fetchSpreadsheetMetadata,
  createOMRGoogleSheet,
  readStudentRecordsFromSheet,
  syncAllStudentRecordsToSheet,
} from '../utils/sheetsApi';
import {
  FileSpreadsheet,
  RefreshCw,
  Plus,
  Download,
  UploadCloud,
  ExternalLink,
  Search,
  UserPlus,
  Check,
  AlertCircle,
  Trash2,
} from 'lucide-react';

interface GoogleSheetsSyncProps {
  records: SheetStudentRecord[];
  setRecords: React.Dispatch<React.SetStateAction<SheetStudentRecord[]>>;
  accessToken: string | null;
  userEmail: string | null;
  onRequestGoogleLogin: () => Promise<void>;
  connectedSheet: SpreadsheetMetadata | null;
  setConnectedSheet: React.Dispatch<React.SetStateAction<SpreadsheetMetadata | null>>;
  selectedTab: string;
  setSelectedTab: React.Dispatch<React.SetStateAction<string>>;
}

export const GoogleSheetsSync: React.FC<GoogleSheetsSyncProps> = ({
  records,
  setRecords,
  accessToken,
  userEmail,
  onRequestGoogleLogin,
  connectedSheet,
  setConnectedSheet,
  selectedTab,
  setSelectedTab,
}) => {
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [newSheetTitle, setNewSheetTitle] = useState(
    'বাংলা বিদ্যাপীঠ OMR ফলাফল (আইডি, নাম, স্কুল, মোবাইল, Right, Wrong, Empty, Total)'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmSyncModalOpen, setConfirmSyncModalOpen] = useState(false);

  // Add Student Inline Form (6-digit ID)
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newSchool, setNewSchool] = useState('');
  const [newMobile, setNewMobile] = useState('');

  const handleConnectExistingSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) {
      setErrorMsg('গুগল সীট কানেক্ট করার আগে অনুগ্রহ করে "Sign in with Google" বাটনে ক্লিক করুন।');
      return;
    }
    const id = extractSpreadsheetId(sheetUrlInput);
    if (!id) {
      setErrorMsg('অনুগ্রহ করে সঠিক Google Sheets URL অথবা Spreadsheet ID দিন।');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const meta = await fetchSpreadsheetMetadata(id, accessToken);
      setConnectedSheet(meta);
      const firstTab = meta.sheetNames[0] || 'Sheet1';
      setSelectedTab(firstTab);
      const loaded = await readStudentRecordsFromSheet(id, firstTab, accessToken);
      setRecords(loaded);
      setStatusMsg(
        `"${meta.title}" সীটের সাথে সংযুক্ত হয়েছে এবং ${loaded.length} জন শিক্ষার্থীর তথ্য লোড হয়েছে।`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'গুগল সীটে সংযুক্ত হওয়া যায়নি।');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewSheet = async () => {
    if (!accessToken) {
      setErrorMsg('নতুন গুগল সীট তৈরি করার আগে "Sign in with Google" বাটনে ক্লিক করুন।');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const meta = await createOMRGoogleSheet(
        newSheetTitle || 'বাংলা বিদ্যাপীঠ OMR Results',
        records,
        accessToken
      );
      setConnectedSheet(meta);
      setSelectedTab(meta.sheetNames[0] || 'OMR_Results');
      setSheetUrlInput(meta.spreadsheetUrl);
      setStatusMsg(
        `৮টি কলামসহ (আইডি, নাম, স্কুল, মোবাইল, Right, Wrong, Empty, Total) নতুন গুগল সীট "${meta.title}" তৈরি হয়েছে!`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'নতুন গুগল সীট তৈরি করা যায়নি।');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePullFromSheet = async () => {
    if (!accessToken || !connectedSheet) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const loaded = await readStudentRecordsFromSheet(
        connectedSheet.spreadsheetId,
        selectedTab,
        accessToken
      );
      setRecords(loaded);
      setStatusMsg(`গুগল সীট "${connectedSheet.title}" থেকে ${loaded.length}টি রো লোড হয়েছে।`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'গুগল সীট থেকে তথ্য পড়া যায়নি।');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPushAllToSheet = async () => {
    if (!accessToken || !connectedSheet) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await syncAllStudentRecordsToSheet(
        connectedSheet.spreadsheetId,
        selectedTab,
        records,
        accessToken
      );
      setConfirmSyncModalOpen(false);
      setStatusMsg(
        `সফলভাবে ${records.length} জন শিক্ষার্থীর ফলাফল গুগল সীট "${connectedSheet.title}" (${selectedTab})-এ সেইভ হয়েছে!`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'গুগল সীটে তথ্য আপডেট করা যায়নি।');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddStudentRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId.trim() || !newName.trim()) {
      setErrorMsg('অনুগ্রহ করে শিক্ষার্থীর ৬-ডিজিট আইডি (ID) এবং নাম (Name) লিখুন।');
      return;
    }
    setErrorMsg(null);
    const nextRecord: SheetStudentRecord = {
      rowIndex: records.length + 2,
      id: newId.trim(),
      name: newName.trim(),
      school: newSchool.trim(),
      mobile: newMobile.trim(),
      right: null,
      wrong: null,
      empty: null,
      total: null,
    };
    setRecords((prev) => [...prev, nextRecord]);
    setNewId('');
    setNewName('');
    setNewSchool('');
    setNewMobile('');
    setStatusMsg(`শিক্ষার্থী "${nextRecord.name}" (আইডি: ${nextRecord.id}) তালিকায় যুক্ত হয়েছে। এবার তার আইডি সম্বলিত OMR স্ক্যান করলে সরাসরি তার নামের পাশে নম্বর বসে যাবে।`);
  };

  const handleDeleteRow = (idToDelete: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== idToDelete));
  };

  const handleExportCSV = () => {
    const header = ['আইডি', 'নাম', 'স্কুল', 'মোবাইল', 'Right', 'Wrong', 'Empty', 'Total'];
    const rows = [
      header,
      ...records.map((r) => formatStudentRowForSheet(r)),
    ];
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'Bangla_Bidyapith_OMR_Results.csv');
    link.click();
  };

  const filteredRecords = records.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.id.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.school.toLowerCase().includes(q) ||
      r.mobile.toLowerCase().includes(q)
    );
  });

  const gradedCount = records.filter((r) => r.total !== null).length;

  return (
    <div className="space-y-6">
      {/* Google Sheets Connection & Provisioning Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Google Sheets Live Integration (আইডি, নাম, স্কুল, মোবাইল, Right, Wrong, Empty, Total)
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              আপনার গুগল সীট কানেক্ট করুন অথবা নিচে শিক্ষার্থীদের ৬-ডিজিট আইডি, নাম, স্কুল ও মোবাইল যুক্ত করুন। OMR স্ক্যান করলেই ওই আইডির শিক্ষার্থীর রো-তে নম্বর চলে যাবে।
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!accessToken ? (
              <button
                type="button"
                onClick={onRequestGoogleLogin}
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
              <div className="text-xs text-slate-600 flex items-center gap-2">
                <span>Signed in as <strong className="text-slate-900">{userEmail || 'Google User'}</strong></span>
              </div>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Connect Existing URL or Create New Sheet */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-4 border-t border-slate-100">
          <form
            onSubmit={handleConnectExistingSheet}
            className="lg:col-span-7 space-y-1.5"
          >
            <label
              htmlFor="google-sheet-url-input"
              className="block text-xs font-semibold text-slate-700"
            >
              Connect Existing Google Sheet URL or ID (আপনার গুগল সীটের লিংক দিন)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="google-sheet-url-input"
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrlInput}
                onChange={(e) => setSheetUrlInput(e.target.value)}
                className="flex-1 px-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Connect Sheet
              </button>
            </div>
          </form>

          <div className="lg:col-span-5 space-y-1.5">
            <label
              htmlFor="create-sheet-title"
              className="block text-xs font-semibold text-slate-700"
            >
              Or Create a New 8-Column Google Sheet Automatically
            </label>
            <div className="flex items-center gap-2">
              <input
                id="create-sheet-title"
                type="text"
                value={newSheetTitle}
                onChange={(e) => setNewSheetTitle(e.target.value)}
                className="flex-1 px-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCreateNewSheet}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-pink-700 hover:bg-pink-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Sheet
              </button>
            </div>
          </div>
        </div>

        {/* Connected Sheet Controls */}
        {connectedSheet && (
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-3.5 rounded-lg">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-bold text-slate-900">
                Connected: {connectedSheet.title}
              </span>
              <span aria-hidden="true">·</span>
              <label htmlFor="sheet-tab-select" className="text-slate-600">
                Sheet Tab:
              </label>
              <select
                id="sheet-tab-select"
                value={selectedTab}
                onChange={(e) => setSelectedTab(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded"
              >
                {connectedSheet.sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <a
                href={connectedSheet.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-700 hover:underline inline-flex items-center gap-1 font-medium"
              >
                Open in Google Sheets
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePullFromSheet}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Pull Rows from Sheet
              </button>
              <button
                type="button"
                onClick={() => setConfirmSyncModalOpen(true)}
                disabled={isLoading}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Sync All Rows to Google Sheet
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-900 rounded-lg px-4 py-2.5 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {statusMsg && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-4 py-2.5 text-xs flex items-center gap-2"
          >
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}
      </div>

      {/* Add New Student Row Form (6-Digit ID) */}
      <form
        onSubmit={handleAddStudentRow}
        className="bg-white border border-slate-200 rounded-xl p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900">
            Add Student to Roster (নতুন শিক্ষার্থীর ৬-ডিজিট আইডি, নাম, স্কুল ও মোবাইল যোগ করুন)
          </h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Total Students: {records.length} · Graded: {gradedCount}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label
              htmlFor="add-student-id"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              আইডি (6-Digit ID)
            </label>
            <input
              id="add-student-id"
              type="text"
              maxLength={6}
              placeholder="যেমন: 100101"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none tabular-nums"
            />
          </div>

          <div>
            <label
              htmlFor="add-student-name"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              নাম (Student Name)
            </label>
            <input
              id="add-student-name"
              type="text"
              placeholder="শিক্ষার্থীর নাম"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="add-student-school"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              স্কুল (School Name)
            </label>
            <input
              id="add-student-school"
              type="text"
              placeholder="স্কুলের নাম"
              value={newSchool}
              onChange={(e) => setNewSchool(e.target.value)}
              className="w-full px-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="add-student-mobile"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              মোবাইল (Mobile)
            </label>
            <input
              id="add-student-mobile"
              type="text"
              placeholder="017XXXXXXXX"
              value={newMobile}
              onChange={(e) => setNewMobile(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none tabular-nums"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 h-[38px] cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Student Row
          </button>
        </div>
      </form>

      {/* 8-Column Google Sheet Data Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Google Sheet Columns & Live Scores (আইডি, নাম, স্কুল, মোবাইল, Right, Wrong, Empty, Total)
            </h3>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search students by ID, Name, or School"
              placeholder="Search by 6-Digit ID, Name, School..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">আইডি (6-Digit ID)</th>
                <th className="py-3 px-4">নাম (Name)</th>
                <th className="py-3 px-4">স্কুল (School)</th>
                <th className="py-3 px-4">মোবাইল (Mobile)</th>
                <th className="py-3 px-4 text-right text-emerald-700">Right</th>
                <th className="py-3 px-4 text-right text-red-600">Wrong</th>
                <th className="py-3 px-4 text-right text-slate-600">Empty</th>
                <th className="py-3 px-4 text-right text-slate-900">Total</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 text-center text-xs text-slate-500"
                  >
                    কোনো ডেমো ডাটা নেই। আপনার গুগল সীট কানেক্ট করুন, উপরে নতুন শিক্ষার্থীর ৬-ডিজিট আইডি যুক্ত করুন, অথবা সরাসরি OMR সীট স্ক্যান করুন।
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const isGraded = rec.total !== null;
                  return (
                    <tr
                      key={rec.id}
                      data-testid={`sheet-row-${rec.id}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                        {rec.id}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {rec.name || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {rec.school || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                        {rec.mobile || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {isGraded ? rec.right : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-red-600 tabular-nums">
                        {isGraded ? rec.wrong : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {isGraded ? rec.empty : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {isGraded ? rec.total : 'Pending Scan'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(rec.id)}
                          aria-label={`Delete student ${rec.id}`}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Confirmation Dialog for Bulk Google Sheet Overwrite */}
      {confirmSyncModalOpen && connectedSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-bulk-sync-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg">
            <h3
              id="confirm-bulk-sync-title"
              className="text-base font-bold text-slate-900"
            >
              Update Google Sheet "{connectedSheet.title}"?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will write all <strong>{records.length}</strong> student records (columns: আইডি, নাম, স্কুল, মোবাইল, Right, Wrong, Empty, Total) to tab{' '}
              <strong className="font-mono">{selectedTab}</strong> in your connected Google Sheet.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSyncModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPushAllToSheet}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
              >
                {isLoading ? 'Syncing...' : 'Confirm & Update Google Sheet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
