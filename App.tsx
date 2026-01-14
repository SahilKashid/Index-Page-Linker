import React, { useState } from 'react';
import PDFViewer from './components/PDFViewer';
import { analyzePageForIndex } from './services/geminiService';
import { exportModifiedPdf } from './services/pdfExportService';
import { getImagesForPages } from './services/pdfImageService';
import { IndexLink } from './types';
import { Upload, FileText, AlertCircle, Wand2, Download, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [pageAnalyses, setPageAnalyses] = useState<Record<number, IndexLink[]>>({});
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      if (files[0].type !== 'application/pdf') {
        setError("Please upload a valid PDF file.");
        return;
      }
      setFile(files[0]);
      setPageAnalyses({});
      setCurrentPage(1);
      setError(null);
      setBatchProgress(null);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleAnalyzePage = async (imageBase64: string) => {
    setAnalyzing(true);
    setError(null);
    try {
      const detectedLinks = await analyzePageForIndex(imageBase64, currentPage);
      setPageAnalyses(prev => ({
        ...prev,
        [currentPage]: detectedLinks
      }));
    } catch (err: any) {
      console.error(err);
      setError("Failed to analyze page. Please check your API key or try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleBatchScan = async (pagesToScan: number[]) => {
    if (!file) return;
    
    setAnalyzing(true);
    setError(null);
    const totalPages = pagesToScan.length;
    setBatchProgress({ current: 0, total: totalPages });

    try {
      // 1. Render all pages to images first (in one go to open PDF once)
      const pageImages = await getImagesForPages(file, pagesToScan);

      // 2. Analyze sequentially to respect rate limits
      let completed = 0;
      for (const pageNum of pagesToScan) {
        const imageBase64 = pageImages.get(pageNum);
        if (imageBase64) {
          try {
             // Update UI to show we are working on this page
             setBatchProgress({ current: completed + 1, total: totalPages });
             
             const detectedLinks = await analyzePageForIndex(imageBase64, pageNum);
             
             setPageAnalyses(prev => ({
                ...prev,
                [pageNum]: detectedLinks
             }));
          } catch (e) {
             console.error(`Error analyzing page ${pageNum}`, e);
             // Continue to next page even if one fails
          }
        }
        completed++;
      }

    } catch (err: any) {
      console.error(err);
      setError("Batch scan encountered an error.");
    } finally {
      setAnalyzing(false);
      setBatchProgress(null);
    }
  };

  const handleExportPdf = async () => {
    if (!file) return;
    
    // Check if we have any analyses
    const hasLinks = Object.values(pageAnalyses).some(links => links.length > 0);
    if (!hasLinks) {
        setError("No links detected yet. Use 'Detect Links' on index pages first.");
        return;
    }

    setExporting(true);
    setError(null);

    try {
      const blob = await exportModifiedPdf(file, pageAnalyses);
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      // Add _indexed suffix to original filename
      const name = file.name.replace(/\.pdf$/i, '') + '_indexed.pdf';
      link.download = name;
      
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const totalLinksDetected = Object.values(pageAnalyses).reduce((acc, links) => acc + links.length, 0);

  return (
    <div className="flex flex-col h-screen bg-black text-white font-sans selection:bg-white/20">
      {/* Header */}
      <header className="flex-none bg-black/50 backdrop-blur-xl border-b border-neutral-800 px-6 py-4 flex items-center justify-between z-20 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Smart Indexer</h1>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">AI-Powered Navigation</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {file && (
             <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-neutral-900/50 rounded-full border border-neutral-800">
                <FileText className="w-4 h-4 text-neutral-500" />
                <span className="text-xs font-medium text-neutral-300 truncate max-w-[200px]">{file.name}</span>
             </div>
          )}
          
          <div className="flex items-center gap-3">
            {file && (
                <button 
                  onClick={handleExportPdf}
                  disabled={exporting || totalLinksDetected === 0}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-300",
                    exporting || totalLinksDetected === 0
                     ? "bg-transparent text-neutral-600 border-neutral-800 cursor-not-allowed"
                     : "bg-transparent text-neutral-300 border-neutral-700 hover:border-neutral-500 hover:text-white hover:bg-neutral-900"
                  )}
                  title={totalLinksDetected === 0 ? "Detect links first to enable export" : "Download PDF with links"}
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Export</span>
                  {totalLinksDetected > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-white text-black font-bold rounded-full">
                        {totalLinksDetected}
                    </span>
                  )}
                </button>
            )}

            <label className="cursor-pointer group">
                <input 
                    type="file" 
                    accept="application/pdf" 
                    className="hidden" 
                    onChange={handleFileChange}
                />
                <div className="flex items-center gap-2 px-5 py-2 bg-white text-black hover:bg-neutral-200 rounded-lg transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm font-bold">{file ? 'New File' : 'Upload PDF'}</span>
                </div>
            </label>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden p-4 md:p-6 max-w-[1600px] mx-auto w-full">
        {error && (
            <div className="mb-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-3 text-red-400 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
                <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-white">×</button>
            </div>
        )}

        {file ? (
          <div className="flex-1 min-h-0 ring-1 ring-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
             <PDFViewer 
                file={file}
                currentPage={currentPage}
                onPageChange={handlePageChange}
                onAnalyzePage={handleAnalyzePage}
                onBatchScan={handleBatchScan}
                isAnalyzing={analyzing}
                batchProgress={batchProgress}
                links={pageAnalyses[currentPage] || []}
             />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20">
            <div className="text-center max-w-md">
                <div className="w-20 h-20 bg-neutral-900 border border-neutral-800 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <Upload className="w-8 h-8 text-neutral-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Upload a Document</h2>
                <p className="text-neutral-500 mb-8 leading-relaxed text-sm">
                    Upload a PDF containing an index or table of contents. Our AI will identify entries and link them to the correct pages.
                </p>
                <label className="cursor-pointer inline-flex items-center gap-2 px-8 py-3 bg-white hover:bg-neutral-200 text-black rounded-xl font-bold shadow-lg transition-all active:scale-95">
                    <input 
                        type="file" 
                        accept="application/pdf" 
                        className="hidden" 
                        onChange={handleFileChange}
                    />
                    <Upload className="w-5 h-5" />
                    <span>Select PDF File</span>
                </label>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;