import React, { useState, useRef, useEffect } from 'react';
import {
  AnswerKeyMap,
  StudentResponsesMap,
  ScoringRules,
  OMRGradingResult,
  SheetStudentRecord,
  SetCodeChoice,
  gradeOMRSheet,
  normalizeRollId,
  findStudentByScannedId,
} from '../utils/omrLogic';
import {
  renderSyntheticOMRSheetDataUrl,
  analyzeOMRImageOpticalClientSide,
  prepareOMRImagesForVision,
  OMRColorTheme,
} from '../utils/omrImageGenerator';
import {
  Camera,
  Upload,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Save,
  RefreshCw,
  VideoOff,
  Check,
  AlertCircle,
  UserCheck,
  ScanLine,
  Eye,
  X,
  ArrowRight,
} from 'lucide-react';

interface MobileOMRScannerProps {
  headingTitle: string;
  examSubtitle: string;
  colorTheme: OMRColorTheme;
  answerKey: AnswerKeyMap;
  scoringRules: ScoringRules;
  studentRecords: SheetStudentRecord[];
  onSaveScannedResult: (payload: {
    roll: string;
    setCode: SetCodeChoice;
    name: string;
    className: string;
    school: string;
    mobile: string;
    grading: OMRGradingResult;
    syncToGoogleSheetNow: boolean;
  }) => Promise<{ matchedRecord: SheetStudentRecord; isExistingUpdate: boolean }>;
  isGoogleSheetConnected: boolean;
  initialScanImageDataUrl?: string | null;
  onConsumeInitialScanImage?: () => void;
  onNavigateToGoogleSheets?: () => void;
}

export const MobileOMRScanner: React.FC<MobileOMRScannerProps> = ({
  headingTitle,
  examSubtitle,
  colorTheme,
  answerKey,
  scoringRules,
  studentRecords,
  onSaveScannedResult,
  isGoogleSheetConnected,
  initialScanImageDataUrl,
  onConsumeInitialScanImage,
  onNavigateToGoogleSheets,
}) => {
  const totalQ = scoringRules.totalQuestions || 50;

  // Start completely clean with NO auto-scanned demo data
  const [hasScannedSheet, setHasScannedSheet] = useState(false);
  const [scannedRoll, setScannedRoll] = useState('');
  const [scannedSetCode, setScannedSetCode] = useState<SetCodeChoice>('A');
  const [scannedName, setScannedName] = useState('');
  const [scannedClassName, setScannedClassName] = useState('');
  const [scannedSchool, setScannedSchool] = useState('');
  const [scannedMobile, setScannedMobile] = useState('');
  const [scannedResponses, setScannedResponses] = useState<StudentResponsesMap>({});

  const [capturedRawImage, setCapturedRawImage] = useState<string>('');
  const [idCropPreviewUrl, setIdCropPreviewUrl] = useState<string>('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');
  const [isScanningVision, setIsScanningVision] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccessBanner, setScanSuccessBanner] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Instant Pop-up Modal shown immediately after every scan
  const [scanResultPopupOpen, setScanResultPopupOpen] = useState(false);
  const [popupSavedSuccess, setPopupSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Whenever 6-digit Roll/ID changes, lookup matching student in Google Sheet Roster
  const matchedStudentInRoster = findStudentByScannedId(studentRecords, scannedRoll);

  useEffect(() => {
    if (matchedStudentInRoster) {
      setScannedName(matchedStudentInRoster.name);
      if (matchedStudentInRoster.className) {
        setScannedClassName(matchedStudentInRoster.className);
      }
      setScannedSchool(matchedStudentInRoster.school);
      setScannedMobile(matchedStudentInRoster.mobile);
      if (matchedStudentInRoster.setCode) {
        setScannedSetCode(matchedStudentInRoster.setCode);
      }
    }
  }, [matchedStudentInRoster]);

  const gradingResult = gradeOMRSheet(answerKey, scannedResponses, scoringRules);

  // Generate annotated optical scan preview image ONLY after a sheet is scanned or entered
  useEffect(() => {
    if (!hasScannedSheet) {
      setPreviewImageUrl('');
      return;
    }
    const url = renderSyntheticOMRSheetDataUrl({
      headingTitle: headingTitle || 'বাংলা বিদ্যাপীঠ',
      examSubtitle: examSubtitle || 'অপটিক্যাল OMR স্ক্যানার যাচাইকরণ',
      roll: scannedRoll,
      setCode: scannedSetCode,
      studentName: scannedName,
      className: scannedClassName,
      schoolName: scannedSchool,
      totalQuestions: totalQ,
      fullMarks: gradingResult.fullMarks,
      obtainedMarks: gradingResult.total,
      responses: scannedResponses,
      answerKey,
      showGradingOverlay: true,
      colorTheme,
    });
    setPreviewImageUrl(url);
  }, [
    hasScannedSheet,
    headingTitle,
    examSubtitle,
    colorTheme,
    scannedRoll,
    scannedSetCode,
    scannedName,
    scannedClassName,
    scannedSchool,
    scannedResponses,
    answerKey,
    totalQ,
    gradingResult.fullMarks,
    gradingResult.total,
  ]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const analyzeBase64Image = async (dataUrl: string, mimeType = 'image/png') => {
    setIsScanningVision(true);
    setScanError(null);
    setScanSuccessBanner(null);
    setPopupSavedSuccess(false);
    setCapturedRawImage(dataUrl);

    try {
      // Step 1: Check if the image has a lossless digital barcode from OMR Designer
      const opticalResult = await analyzeOMRImageOpticalClientSide(dataUrl, totalQ);

      let finalRoll = normalizeRollId(opticalResult.roll);
      let finalSet: SetCodeChoice = opticalResult.setCode || 'A';
      let finalName = opticalResult.studentName || '';
      let finalClass = opticalResult.className || '';
      let finalSchool = opticalResult.schoolName || '';
      let finalAnswers: StudentResponsesMap = { ...opticalResult.answers };

      // Step 2: For ALL real camera photos or uploaded images without a lossless digital barcode,
      // run the 3-Crop Contrast-Enhanced Gemini Vision pipeline for maximum accuracy!
      if (!opticalResult.isDigitalBarcode) {
        const prepared = await prepareOMRImagesForVision(dataUrl);
        if (prepared.idCropDataUrl) {
          setIdCropPreviewUrl(prepared.idCropDataUrl);
        }

        const res = await fetch('/api/omr/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: prepared.fullEnhancedDataUrl || dataUrl,
            idCropBase64: prepared.idCropDataUrl,
            mcqCropBase64: prepared.mcqCropDataUrl,
            mimeType: 'image/jpeg',
            totalQuestions: totalQ,
          }),
        });

        if (res.ok) {
          const visionData = await res.json();
          const visionRoll = normalizeRollId(visionData.roll || '');
          if (visionRoll.length > 0) {
            finalRoll = visionRoll.slice(0, 6);
          }

          if (
            visionData.setCode &&
            ['A', 'B', 'C', 'D'].includes(String(visionData.setCode).toUpperCase())
          ) {
            finalSet = String(visionData.setCode).toUpperCase() as SetCodeChoice;
          }

          if (visionData.studentName) finalName = visionData.studentName;
          if (visionData.className) finalClass = visionData.className;
          if (visionData.schoolName) finalSchool = visionData.schoolName;

          if (Array.isArray(visionData.answers) && visionData.answers.length > 0) {
            const visionMap: StudentResponsesMap = {};
            visionData.answers.forEach((item: { question: number; selected: string }) => {
              if (item.question >= 1 && item.question <= totalQ) {
                const sel = (item.selected || '').toUpperCase().trim();
                if (['A', 'B', 'C', 'D', 'MULTIPLE'].includes(sel)) {
                  visionMap[item.question] = sel as any;
                } else {
                  visionMap[item.question] = '';
                }
              }
            });
            finalAnswers = visionMap;
          }
        }
      } else {
        setIdCropPreviewUrl('');
      }

      // Step 3: Match student by extracted 6-digit ID in Google Sheet Roster
      const matched = findStudentByScannedId(studentRecords, finalRoll);
      const resolvedName = matched?.name || finalName || '';
      const resolvedClass = matched?.className || finalClass || '';
      const resolvedSchool = matched?.school || finalSchool || '';
      const resolvedMobile = matched?.mobile || '';

      setScannedRoll(finalRoll);
      setScannedSetCode(finalSet);
      setScannedName(resolvedName);
      setScannedClassName(resolvedClass);
      setScannedSchool(resolvedSchool);
      setScannedMobile(resolvedMobile);
      setScannedResponses(finalAnswers);
      setHasScannedSheet(true);

      const evaluated = gradeOMRSheet(answerKey, finalAnswers, scoringRules);

      // Automatically route score to the matched student row if 6-digit ID is present
      if (finalRoll) {
        const saveRes = await onSaveScannedResult({
          roll: finalRoll,
          setCode: finalSet,
          name: resolvedName,
          className: resolvedClass,
          school: resolvedSchool,
          mobile: resolvedMobile,
          grading: evaluated,
          syncToGoogleSheetNow: isGoogleSheetConnected,
        });
        setPopupSavedSuccess(true);

        if (saveRes.isExistingUpdate) {
          setScanSuccessBanner(
            `স্ক্যান সম্পন্ন! ৬-ডিজিট আইডি #${finalRoll} (${saveRes.matchedRecord.name})-এর নামের পাশে প্রাপ্ত নম্বর ${evaluated.total}/${evaluated.fullMarks} (Right: ${evaluated.right}, Wrong: ${evaluated.wrong}, Empty: ${evaluated.empty}) স্বয়ংক্রিয়ভাবে যুক্ত হয়েছে।`
          );
        } else {
          setScanSuccessBanner(
            `স্ক্যান সম্পন্ন! ৬-ডিজিট আইডি #${finalRoll} শনাক্ত হয়েছে এবং প্রাপ্ত নম্বর ${evaluated.total}/${evaluated.fullMarks} (Right: ${evaluated.right}, Wrong: ${evaluated.wrong}, Empty: ${evaluated.empty}) সীট তালিকায় যুক্ত হয়েছে।`
          );
        }
      }

      // Immediately open the Scan Result Pop-up Modal!
      setScanResultPopupOpen(true);
    } catch (err: any) {
      setHasScannedSheet(true);
      setScanResultPopupOpen(true);
      setScanError(
        err?.message || 'ছবি থেকে স্বয়ংক্রিয়ভাবে OMR পড়া সম্ভব হয়নি। পপ-আপে ৬-ডিজিট আইডি যাচাই করুন।'
      );
    } finally {
      setIsScanningVision(false);
    }
  };

  // Trigger automatic scan if user clicked "Scan This OMR Sheet" from the OMR Sheet Designer tab
  useEffect(() => {
    if (initialScanImageDataUrl) {
      const urlToScan = initialScanImageDataUrl;
      if (onConsumeInitialScanImage) {
        onConsumeInitialScanImage();
      }
      analyzeBase64Image(urlToScan, 'image/png');
    }
  }, [initialScanImageDataUrl]);

  const startMobileCamera = async () => {
    setScanError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1600 }, height: { ideal: 2100 } },
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      setScanError(
        'মোবাইল ক্যামেরা পারমিশন পাওয়া যায়নি। অনুগ্রহ করে "OMR ছবি আপলোড / ক্যামেরা ক্যাপচার" বাটনে ক্লিক করে সরাসরি ছবি তুলুন বা আপলোড করুন।'
      );
      setIsCameraActive(false);
    }
  };

  const stopMobileCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const captureFromCameraFeed = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1200;
    canvas.height = videoRef.current.videoHeight || 1600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    stopMobileCamera();
    await analyzeBase64Image(dataUrl, 'image/jpeg');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const resultStr = String(reader.result || '');
      if (resultStr) {
        await analyzeBase64Image(resultStr, file.type || 'image/png');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleStartManualEntryOrVerification = () => {
    setHasScannedSheet(true);
    setScanError(null);
    setPopupSavedSuccess(false);
    setScanResultPopupOpen(true);
  };

  const handleResetScanner = () => {
    setHasScannedSheet(false);
    setScannedRoll('');
    setScannedName('');
    setScannedClassName('');
    setScannedSchool('');
    setScannedMobile('');
    setScannedResponses({});
    setCapturedRawImage('');
    setIdCropPreviewUrl('');
    setPreviewImageUrl('');
    setScanError(null);
    setScanSuccessBanner(null);
    setScanResultPopupOpen(false);
    setPopupSavedSuccess(false);
  };

  const handleToggleSingleResponse = (q: number, opt: 'A' | 'B' | 'C' | 'D') => {
    setHasScannedSheet(true);
    setPopupSavedSuccess(false);
    setScannedResponses((prev) => ({
      ...prev,
      [q]: prev[q] === opt ? '' : opt,
    }));
  };

  const handleConfirmAndSave = async (syncToGoogle: boolean) => {
    const cleanRoll = normalizeRollId(scannedRoll);
    if (!cleanRoll) {
      setScanError('অনুগ্রহ করে শিক্ষার্থীর ৬-ডিজিট আইডি (Roll/ID) লিখুন বা সিলেক্ট করুন।');
      return;
    }

    setIsSaving(true);
    setScanError(null);
    try {
      const res = await onSaveScannedResult({
        roll: cleanRoll,
        setCode: scannedSetCode,
        name: scannedName,
        className: scannedClassName,
        school: scannedSchool,
        mobile: scannedMobile,
        grading: gradingResult,
        syncToGoogleSheetNow: syncToGoogle,
      });
      setPopupSavedSuccess(true);
      setScanSuccessBanner(
        `আইডি #${res.matchedRecord.id} (${res.matchedRecord.name || 'শিক্ষার্থী'})-এর কাছে নম্বর (Right: ${gradingResult.right}, Wrong: ${gradingResult.wrong}, Empty: ${gradingResult.empty}, Total: ${gradingResult.total}) সফলভাবে সেইভ হয়েছে!`
      );
    } catch (err: any) {
      setScanError(err?.message || 'গুগল সীটে ফলাফল সেইভ করতে সমস্যা হয়েছে।');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Scanner Header & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Mobile OMR Camera Scanner (মোবাইল ক্যামেরা দিয়ে ৬-ডিজিট আইডি ও MCQ স্ক্যান)
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            OMR সীট স্ক্যান করার সাথে সাথে পপ-আপে ৬-ডিজিট আইডি, শিক্ষার্থীর নাম ও প্রাপ্ত নম্বর দেখাবে এবং সরাসরি সীটে সেইভ হবে।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isCameraActive ? (
            <button
              type="button"
              onClick={startMobileCamera}
              className="px-4 py-2 text-xs font-semibold text-white bg-pink-700 hover:bg-pink-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Camera className="w-3.5 h-3.5" />
              মোবাইল ক্যামেরা চালু করুন (Open Camera)
            </button>
          ) : (
            <button
              type="button"
              onClick={stopMobileCamera}
              className="px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <VideoOff className="w-3.5 h-3.5" />
              ক্যামেরা বন্ধ করুন (Close Camera)
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanningVision}
            className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-pink-700" />
            {isScanningVision ? 'স্ক্যান করা হচ্ছে (Scanning...)...' : 'OMR ছবি আপলোড / ক্যামেরা ক্যাপচার'}
          </button>

          {hasScannedSheet && (
            <>
              <button
                type="button"
                onClick={() => setScanResultPopupOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold text-pink-700 bg-pink-50 border border-pink-200 hover:bg-pink-100 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                ফলাফল পপ-আপ দেখুন (Show Result Pop-up)
              </button>

              <button
                type="button"
                onClick={handleResetScanner}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                নতুন স্ক্যান (Reset)
              </button>

              <button
                type="button"
                onClick={() => setScanResultPopupOpen(true)}
                data-testid="save-to-sheet-btn"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                গুগল সীটে নম্বর পাঠান (Save to Sheet)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scanning In-Progress Centered Modal */}
      {isScanningVision && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scanning OMR Sheet"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-pink-50 border border-pink-200 text-pink-700 flex items-center justify-center mx-auto">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                OMR সীট নিখুঁতভাবে স্ক্যান করা হচ্ছে...
              </h3>
              <p className="text-xs text-slate-600">
                হাই-কনট্রাস্ট ৩-অংশ ক্রপিংয়ের মাধ্যমে ৬-ডিজিট আইডি, সেট কোড এবং {totalQ}টি MCQ বৃত্ত বিশ্লেষণ করা হচ্ছে।
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Banners */}
      {scanError && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs font-medium flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{scanError}</span>
          </div>
          <button
            type="button"
            onClick={() => setScanError(null)}
            className="text-amber-700 underline text-xs cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      )}

      {scanSuccessBanner && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-xs font-medium flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{scanSuccessBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setScanSuccessBanner(null)}
            className="text-emerald-700 underline text-xs cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      )}

      {/* Live Camera Viewfinder (When Active) */}
      {isCameraActive && (
        <div className="bg-slate-900 rounded-xl p-4 text-white space-y-3 max-w-xl mx-auto">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">চার কোণার কালো রেজিস্ট্রেশন মার্ক ফ্রেমের ভেতর রাখুন</span>
            <span className="font-mono text-slate-300">৬-ডিজিট আইডি + {totalQ} MCQ</span>
          </div>
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[3/4] max-h-[460px] mx-auto flex items-center justify-center border border-slate-700">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-5 border-2 border-dashed border-emerald-400/80 pointer-events-none rounded-lg" />
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={captureFromCameraFeed}
              className="px-6 py-2.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg transition-colors cursor-pointer"
            >
              ছবি তুলুন ও স্ক্যান করুন (Capture & Scan Now)
            </button>
          </div>
        </div>
      )}

      {/* Empty State when no OMR has been scanned yet */}
      {!hasScannedSheet && !isCameraActive && (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-10 text-center max-w-3xl mx-auto space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-pink-50 border border-pink-200 text-pink-700 flex items-center justify-center mx-auto">
            <ScanLine className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-slate-900">
              স্ক্যান করার জন্য প্রস্তুত (কোনো ডেমো ডাটা লোড করা নেই)
            </h3>
            <p className="text-xs text-slate-600 max-w-xl mx-auto leading-relaxed">
              পরীক্ষা নেওয়া OMR সীটটি স্ক্যান করতে উপরের <strong>“মোবাইল ক্যামেরা চালু করুন”</strong> অথবা <strong>“OMR ছবি আপলোড / ক্যামেরা ক্যাপচার”</strong> বাটনে ক্লিক করুন। স্ক্যান শেষ হওয়ার সাথে সাথে <strong>পপ-আপে (Pop-up)</strong> ৬-ডিজিট আইডি, শিক্ষার্থীর নাম এবং প্রাপ্ত নম্বর দেখাবে।
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={startMobileCamera}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-pink-700 hover:bg-pink-800 rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Camera className="w-4 h-4" />
              মোবাইল ক্যামেরা দিয়ে স্ক্যান করুন
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanningVision}
              className="px-5 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-pink-700" />
              OMR ছবি সিলেক্ট করুন
            </button>

            <button
              type="button"
              onClick={handleStartManualEntryOrVerification}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
            >
              অথবা ম্যানুয়ালি ৬-ডিজিট আইডি ও বৃত্ত যাচাই করুন
            </button>
          </div>
        </div>
      )}

      {/* Results & Verification View (Shown after scanning or opening manual verification) */}
      {hasScannedSheet && (
        <>
          {/* 4-Column Score KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Right Answers (সঠিক উত্তর)</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div
                data-testid="metric-right"
                className="text-3xl font-bold font-mono text-emerald-600 mt-2 tabular-nums"
              >
                {gradingResult.right}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                Out of {totalQ} MCQs · {gradingResult.accuracyPercent}% Accuracy
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Wrong Answers (ভুল উত্তর)</span>
                <XCircle className="w-4 h-4 text-red-600" />
              </div>
              <div
                data-testid="metric-wrong"
                className="text-3xl font-bold font-mono text-red-600 mt-2 tabular-nums"
              >
                {gradingResult.wrong}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                Penalty: -{(gradingResult.wrong * scoringRules.negativeMarkPerWrong).toFixed(2)} marks
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Empty / Blank (ফাঁকা)</span>
                <MinusCircle className="w-4 h-4 text-slate-400" />
              </div>
              <div
                data-testid="metric-empty"
                className="text-3xl font-bold font-mono text-slate-700 mt-2 tabular-nums"
              >
                {gradingResult.empty}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                Unattempted questions
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>প্রাপ্ত নম্বর (Obtained / Total)</span>
                <span className="font-mono text-xs font-bold text-pink-700">
                  পূর্ণমান: {gradingResult.fullMarks}
                </span>
              </div>
              <div
                data-testid="metric-total"
                className="text-3xl font-bold font-mono text-slate-900 mt-2 tabular-nums"
              >
                {gradingResult.total}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                ৬-ডিজিট আইডি: {normalizeRollId(scannedRoll) || '—'} · সেট: {scannedSetCode}
              </div>
            </div>
          </div>

          {/* Student ID Match Status Banner */}
          <div
            className={`rounded-xl px-4 py-3 border text-xs flex flex-wrap items-center justify-between gap-3 ${
              matchedStudentInRoster
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 shrink-0 text-emerald-600" />
              {matchedStudentInRoster ? (
                <span>
                  স্ক্যান হওয়া ৬-ডিজিট আইডি <strong className="font-mono">{matchedStudentInRoster.id}</strong> গুগল সীটের শিক্ষার্থী <strong>“{matchedStudentInRoster.name}”</strong> ({matchedStudentInRoster.school || 'স্কুল'})-এর সাথে মিলেছে! প্রাপ্ত নম্বর <strong>{gradingResult.total}</strong> সরাসরি এই শিক্ষার্থীর রো-তে যুক্ত হবে।
                </span>
              ) : (
                <span>
                  ৬-ডিজিট আইডি দিন (যেমন: <code className="font-mono">100105</code>)। আপনার গুগল সীটে এই আইডির শিক্ষার্থী থাকলে স্বয়ংক্রিয়ভাবে তার নাম, স্কুল ও মোবাইল চলে আসবে এবং তার রো-তেই নম্বর বসবে।
                </span>
              )}
            </div>
          </div>

          {/* Split View: Left Optical Verification Sheet | Right Student Match & Question Audit */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left: Annotated OMR Sheet Optical Overlay */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Optical Detection Overlay (স্ক্যানকৃত OMR যাচাইকরণ)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Green = সঠিক · Red = ভুল · Green Ring = সঠিক উত্তর কী
                    </p>
                  </div>
                </div>

                {capturedRawImage && (
                  <div className="mb-3 border border-slate-200 rounded-lg p-2 bg-slate-50">
                    <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                      ক্যামেরায় তোলা মূল ছবি (Captured Photo):
                    </span>
                    <img
                      src={capturedRawImage}
                      alt="Captured raw OMR sheet"
                      className="w-full max-h-40 object-contain rounded"
                    />
                  </div>
                )}

                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 flex items-center justify-center">
                  {previewImageUrl ? (
                    <img
                      src={previewImageUrl}
                      alt="Scanned OMR Sheet with Optical Grading Overlay"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto max-h-[580px] object-contain"
                    />
                  ) : (
                    <div className="p-12 text-xs text-slate-400 text-center">
                      Generating optical overlay...
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>6-Digit ID Optical Reader</span>
                <span className="font-mono tabular-nums">
                  ID: {normalizeRollId(scannedRoll) || 'Not Set'} · Set {scannedSetCode}
                </span>
              </div>
            </div>

            {/* Right: Matched Student Info (6-Digit ID, Set Code, Name, Class, School, Mobile) + Question Audit */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4">
                  স্ক্যানকৃত ৬-ডিজিট আইডি ও শিক্ষার্থীর তথ্য (Matched Student Row)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
                  <div>
                    <label
                      htmlFor="scan-roll-id"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      ৬-ডিজিট আইডি (6-Digit ID)
                    </label>
                    <input
                      id="scan-roll-id"
                      type="text"
                      maxLength={6}
                      placeholder="যেমন: 100105"
                      value={scannedRoll}
                      onChange={(e) => {
                        setScannedRoll(e.target.value);
                        setPopupSavedSuccess(false);
                      }}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none tabular-nums"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="scan-set-code"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      সেট কোড (Set Code)
                    </label>
                    <select
                      id="scan-set-code"
                      value={scannedSetCode}
                      onChange={(e) => setScannedSetCode(e.target.value as SetCodeChoice)}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
                    >
                      <option value="A">Set A</option>
                      <option value="B">Set B</option>
                      <option value="C">Set C</option>
                      <option value="D">Set D</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="scan-class-name"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      শ্রেণি (Class)
                    </label>
                    <input
                      id="scan-class-name"
                      type="text"
                      placeholder="শ্রেণি"
                      value={scannedClassName}
                      onChange={(e) => setScannedClassName(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="scan-student-name"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      নাম (Student Name)
                    </label>
                    <input
                      id="scan-student-name"
                      type="text"
                      placeholder="শিক্ষার্থীর নাম"
                      value={scannedName}
                      onChange={(e) => setScannedName(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="scan-school-name"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      স্কুল (School)
                    </label>
                    <input
                      id="scan-school-name"
                      type="text"
                      placeholder="স্কুলের নাম"
                      value={scannedSchool}
                      onChange={(e) => setScannedSchool(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="scan-mobile"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      মোবাইল (Mobile)
                    </label>
                    <input
                      id="scan-mobile"
                      type="text"
                      placeholder="মোবাইল নম্বর"
                      value={scannedMobile}
                      onChange={(e) => setScannedMobile(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-pink-600 focus:outline-none tabular-nums"
                    />
                  </div>
                </div>

                {/* Interactive Verification Matrix */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <h4 className="text-xs font-bold text-slate-800">
                    {totalQ}-Question Bubble Verification & Fine-Tuning
                  </h4>
                  <span className="text-xs text-slate-500">
                    বৃত্তে ক্লিক করে যেকোনো উত্তর সংশোধন করা যাবে
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 max-h-[420px] overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    {gradingResult.details.map((item) => {
                      const opts: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
                      return (
                        <div
                          key={item.question}
                          className="flex items-center justify-between py-1.5 px-2 border-b border-slate-100 last:border-b-0 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-700 w-6 tabular-nums">
                              {String(item.question).padStart(2, '0')}.
                            </span>
                            <div className="flex items-center gap-1">
                              {opts.map((opt) => {
                                const isSelected = item.selected === opt;
                                const isCorrectKey = item.correctOption === opt;
                                let btnStyle =
                                  'bg-white text-slate-600 border border-slate-300 hover:border-slate-500';
                                if (isSelected && item.status === 'RIGHT') {
                                  btnStyle =
                                    'bg-emerald-600 text-white border border-emerald-700 font-bold';
                                } else if (isSelected && item.status === 'WRONG') {
                                  btnStyle =
                                    'bg-red-600 text-white border border-red-700 font-bold';
                                } else if (!isSelected && isCorrectKey) {
                                  btnStyle =
                                    'bg-emerald-50 text-emerald-800 border border-emerald-500 font-semibold';
                                }
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() =>
                                      handleToggleSingleResponse(item.question, opt)
                                    }
                                    aria-label={`Verify Question ${item.question} Option ${opt}`}
                                    className={`w-6 h-6 rounded-full font-mono text-[11px] flex items-center justify-center transition-colors cursor-pointer ${btnStyle}`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="font-mono text-[11px] tabular-nums">
                            {item.status === 'RIGHT' && (
                              <span className="text-emerald-700 font-semibold">
                                Right ({item.selected})
                              </span>
                            )}
                            {item.status === 'WRONG' && (
                              <span className="text-red-600 font-semibold">
                                Wrong ({item.selected} → {item.correctOption})
                              </span>
                            )}
                            {item.status === 'EMPTY' && (
                              <span className="text-slate-400">
                                Empty (Key: {item.correctOption})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 font-mono tabular-nums">
                  পূর্ণমান: {gradingResult.fullMarks} · প্রাপ্ত নম্বর: <strong>{gradingResult.total}</strong> (Right: {gradingResult.right} | Wrong: {gradingResult.wrong} | Empty: {gradingResult.empty})
                </div>
                <button
                  type="button"
                  onClick={() => setScanResultPopupOpen(true)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  পপ-আপে ফলাফল ও আইডি সেইভ করুন
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* INSTANT SCAN RESULT POP-UP MODAL (স্ক্যান করার সাথে সাথে পপ-আপ) */}
      {scanResultPopupOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scan-result-popup-title"
          className="fixed inset-0 z-50 bg-slate-900/65 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl my-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3
                    id="scan-result-popup-title"
                    className="text-base sm:text-lg font-bold text-slate-900"
                  >
                    OMR স্ক্যান ফলাফল পপ-আপ (Scan Result & ID Match)
                  </h3>
                  <p className="text-xs text-slate-500">
                    স্ক্যানকৃত ৬-ডিজিট আইডি, শিক্ষার্থীর তথ্য ও উত্তরগুলো নিচে যাচাই করে সীটে সংরক্ষণ করুন।
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScanResultPopupOpen(false)}
                aria-label="Close Scan Result Popup"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 4-Box Score Summary Strip inside Pop-up */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-center">
                <div className="text-[11px] font-semibold text-emerald-800">
                  সঠিক উত্তর (Right)
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-700 mt-1 tabular-nums">
                  {gradingResult.right}
                </div>
              </div>

              <div className="bg-red-50/70 border border-red-200 rounded-xl p-3 text-center">
                <div className="text-[11px] font-semibold text-red-800">
                  ভুল উত্তর (Wrong)
                </div>
                <div className="text-2xl font-bold font-mono text-red-600 mt-1 tabular-nums">
                  {gradingResult.wrong}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <div className="text-[11px] font-semibold text-slate-600">
                  ফাঁকা (Empty)
                </div>
                <div className="text-2xl font-bold font-mono text-slate-700 mt-1 tabular-nums">
                  {gradingResult.empty}
                </div>
              </div>

              <div className="bg-pink-50/80 border border-pink-200 rounded-xl p-3 text-center">
                <div className="text-[11px] font-semibold text-pink-900">
                  প্রাপ্ত নম্বর (Total)
                </div>
                <div className="text-2xl font-bold font-mono text-pink-700 mt-1 tabular-nums">
                  {gradingResult.total}
                  <span className="text-xs font-normal text-pink-800">
                    /{gradingResult.fullMarks}
                  </span>
                </div>
              </div>
            </div>

            {/* Show zoomed ID crop from camera photo if available so user can visually verify the 6-digit ID */}
            {(idCropPreviewUrl || capturedRawImage) && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-3">
                <img
                  src={idCropPreviewUrl || capturedRawImage}
                  alt="Scanned OMR ID region preview"
                  className="h-16 w-auto max-w-[220px] object-contain rounded border border-slate-200 bg-white shrink-0"
                />
                <div className="text-xs text-slate-600 leading-relaxed">
                  <strong className="text-slate-900 block">
                    স্ক্যানকৃত ছবির আইডি অংশ (Scanned Sheet Preview):
                  </strong>
                  ছবির সাথে নিচের ৬-ডিজিট আইডি ও উত্তর মিলিয়ে নিন। প্রয়োজনে বৃত্তে ক্লিক করে সাথে সাথে সংশোধন করা যাবে।
                </div>
              </div>
            )}

            {/* Scanned 6-Digit ID & Student Roster Match Section */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">
                  শনাক্তকৃত ৬-ডিজিট আইডি ও শিক্ষার্থীর তথ্য (Scanned 6-Digit ID & Student)
                </span>
                {matchedStudentInRoster ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                    <Check className="w-3.5 h-3.5" />
                    গুগল সীটের শিক্ষার্থীর সাথে আইডি মিলেছে!
                  </span>
                ) : normalizeRollId(scannedRoll) ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-900">
                    আইডি #{normalizeRollId(scannedRoll)} (নতুন শিক্ষার্থী হিসেবে যুক্ত হবে)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-800">
                    ৬-ডিজিট আইডি নিচে লিখুন অথবা তালিকা থেকে সিলেক্ট করুন
                  </span>
                )}
              </div>

              {/* Quick Roster Student Picker if students exist in Google Sheet */}
              {studentRecords.length > 0 && (
                <div>
                  <label
                    htmlFor="popup-roster-select"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    গুগল সীটের শিক্ষার্থী তালিকা থেকে সিলেক্ট করুন (অথবা নিচে ৬-ডিজিট আইডি দেখুন):
                  </label>
                  <select
                    id="popup-roster-select"
                    value={matchedStudentInRoster?.id || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setScannedRoll(val);
                        setPopupSavedSuccess(false);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:border-pink-600 focus:outline-none"
                  >
                    <option value="">
                      -- তালিকা থেকে শিক্ষার্থী নির্বাচন করুন ({studentRecords.length} জন) --
                    </option>
                    {studentRecords.map((st) => (
                      <option key={st.id} value={st.id}>
                        আইডি: {st.id} — {st.name || 'নাম নেই'} ({st.school || 'স্কুল'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="popup-roll-input"
                    className="block text-xs font-bold text-pink-800 mb-1"
                  >
                    ৬-ডিজিট আইডি (6-Digit ID) *
                  </label>
                  <input
                    id="popup-roll-input"
                    type="text"
                    maxLength={6}
                    placeholder="যেমন: 240105"
                    value={scannedRoll}
                    onChange={(e) => {
                      setScannedRoll(e.target.value);
                      setPopupSavedSuccess(false);
                    }}
                    className="w-full px-3 py-2 text-base font-mono font-bold text-slate-900 bg-white border-2 border-pink-500 rounded-lg focus:border-pink-700 focus:outline-none tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor="popup-student-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    নাম (Student Name)
                  </label>
                  <input
                    id="popup-student-name"
                    type="text"
                    placeholder="শিক্ষার্থীর নাম"
                    value={scannedName}
                    onChange={(e) => setScannedName(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:border-pink-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="popup-school-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    স্কুল (School)
                  </label>
                  <input
                    id="popup-school-name"
                    type="text"
                    placeholder="স্কুলের নাম"
                    value={scannedSchool}
                    onChange={(e) => setScannedSchool(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:border-pink-600 focus:outline-none"
                  />
                </div>
              </div>

              {matchedStudentInRoster && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 text-xs text-emerald-950 flex items-center justify-between gap-2">
                  <div>
                    <strong>শিক্ষার্থী:</strong> {matchedStudentInRoster.name} ·{' '}
                    <strong>আইডি:</strong>{' '}
                    <span className="font-mono font-bold">{matchedStudentInRoster.id}</span> ·{' '}
                    <strong>স্কুল:</strong> {matchedStudentInRoster.school || '—'} ·{' '}
                    <strong>মোবাইল:</strong>{' '}
                    <span className="font-mono">{matchedStudentInRoster.mobile || '—'}</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 shrink-0">
                    Total: {gradingResult.total}/{gradingResult.fullMarks}
                  </span>
                </div>
              )}

              {popupSavedSuccess && normalizeRollId(scannedRoll) && (
                <div className="bg-emerald-600 text-white rounded-lg px-3.5 py-2 text-xs font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    আইডি #{normalizeRollId(scannedRoll)} ({scannedName || 'শিক্ষার্থী'})-এর রো-তে প্রাপ্ত নম্বর ({gradingResult.total}) সংরক্ষিত হয়েছে!
                  </span>
                  {onNavigateToGoogleSheets && (
                    <button
                      type="button"
                      onClick={() => {
                        setScanResultPopupOpen(false);
                        onNavigateToGoogleSheets();
                      }}
                      className="underline font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      গুগল সীট দেখুন <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Compact Interactive Answer Verification Strip inside the Pop-up */}
            <div className="border border-slate-200 rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-800">
                  স্ক্যানকৃত উত্তর যাচাই ও দ্রুত সংশোধন (১ ক্লিকে বৃত্ত পরিবর্তন করুন):
                </span>
                <span className="text-[11px] text-slate-500">
                  সবুজ = সঠিক · লাল = ভুল
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 max-h-36 overflow-y-auto pr-1">
                {gradingResult.details.map((item) => {
                  const opts: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
                  return (
                    <div
                      key={item.question}
                      className="flex items-center justify-between py-1 px-1.5 border-b border-slate-100 text-[11px]"
                    >
                      <span className="font-mono font-bold text-slate-700 w-6 tabular-nums">
                        {String(item.question).padStart(2, '0')}.
                      </span>
                      <div className="flex items-center gap-1">
                        {opts.map((opt) => {
                          const isSelected = item.selected === opt;
                          const isCorrectKey = item.correctOption === opt;
                          let cls =
                            'bg-white text-slate-600 border border-slate-300 hover:border-slate-500';
                          if (isSelected && item.status === 'RIGHT') {
                            cls = 'bg-emerald-600 text-white border border-emerald-700 font-bold';
                          } else if (isSelected && item.status === 'WRONG') {
                            cls = 'bg-red-600 text-white border border-red-700 font-bold';
                          } else if (!isSelected && isCorrectKey) {
                            cls = 'bg-emerald-50 text-emerald-800 border border-emerald-400';
                          }
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleToggleSingleResponse(item.question, opt)}
                              className={`w-5 h-5 rounded-full font-mono text-[10px] flex items-center justify-center cursor-pointer ${cls}`}
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
            </div>

            {/* Pop-up Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScanResultPopupOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  বড় ভিউতে দেখুন (Full View)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setScanResultPopupOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-pink-700 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-lg transition-colors cursor-pointer"
                >
                  পরবর্তী OMR স্ক্যান করুন (Scan Next)
                </button>
              </div>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleConfirmAndSave(true)}
                className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4" />
                {isSaving
                  ? 'সংরক্ষণ হচ্ছে...'
                  : 'Confirm & Save to Student Row (আইডিতে নম্বর সেইভ করুন)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
