import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import { Loader2, ChevronLeft, ChevronRight, ScanEye, Eye, Layers, X, Check } from 'lucide-react';
import { IndexLink } from '../types';
import clsx from 'clsx';

interface PDFViewerProps {
  file: File;
  currentPage: number;
  onPageChange: (page: number) => void;
  onAnalyzePage: (imageBase64: string) => void;
  onBatchScan?: (pages: number[]) => void;
  isAnalyzing: boolean;
  batchProgress?: { current: number, total: number } | null;
  links: IndexLink[];
}

const PDFViewer: React.FC<PDFViewerProps> = ({
  file,
  currentPage,
  onPageChange,
  onAnalyzePage,
  onBatchScan,
  isAnalyzing,
  batchProgress,
  links
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showOverlays, setShowOverlays] = useState(true);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchInput, setBatchInput] = useState<string>('');
  
  // Progress Bar State
  const [sliderValue, setSliderValue] = useState(currentPage);
  const [isDragging, setIsDragging] = useState(false);

  // Sync slider with currentPage when not dragging
  useEffect(() => {
    if (!isDragging) {
      setSliderValue(currentPage);
    }
  }, [currentPage, isDragging]);

  // Set default batch values when dialog opens
  useEffect(() => {
    if (showBatchDialog && !batchInput) {
        const endPage = Math.min(currentPage + 4, numPages || currentPage);
        setBatchInput(`${currentPage}-${endPage}`);
    }
  }, [showBatchDialog, currentPage, numPages]);

  // Resize observer to handle responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleCaptureAndAnalyze = useCallback(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (canvas) {
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      onAnalyzePage(imageBase64);
    } else {
      console.error("No canvas found to analyze");
    }
  }, [onAnalyzePage]);

  const parsePageSelection = (input: string, max: number) => {
    const pages = new Set<number>();
    const parts = input.split(',');
    for (const part of parts) {
        const range = part.trim().split('-').map(s => parseInt(s.trim()));
        if (range.length === 2) {
            const [start, end] = range;
            if (!isNaN(start) && !isNaN(end)) {
                const s = Math.min(start, end);
                const e = Math.max(start, end);
                for (let i = Math.max(1, s); i <= Math.min(max, e); i++) {
                    pages.add(i);
                }
            }
        } else if (range.length === 1) {
             const p = range[0];
             if (!isNaN(p) && p >= 1 && p <= max) {
                 pages.add(p);
             }
        }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  const handleStartBatchScan = () => {
    if (onBatchScan) {
        const pages = parsePageSelection(batchInput, numPages || 9999);
        if (pages.length > 0) {
            onBatchScan(pages);
            setShowBatchDialog(false);
        }
    }
  };

  // Determine actual width to render
  const pageWidth = containerWidth ? Math.min(containerWidth - 48, 800) : 600;

  // Slider Handlers
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSliderValue(Number(e.target.value));
  };

  const handleSliderCommit = () => {
    setIsDragging(false);
    if (sliderValue !== currentPage) {
      onPageChange(sliderValue);
    }
  };

  const handleSliderStart = () => {
    setIsDragging(true);
  };

  // Calculate progress percentage for visual track fill
  const progressPercent = numPages && numPages > 1 
    ? ((sliderValue - 1) / (numPages - 1)) * 100 
    : 0;

  return (
    <div className="flex flex-col h-full w-full bg-black relative">
      
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-neutral-900/50 border-b border-neutral-800 z-10 backdrop-blur-sm relative">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage <= 1}
            className="p-2 hover:bg-neutral-800 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-mono text-neutral-400 min-w-[80px] text-center">
            {currentPage} / {numPages || '--'}
          </span>
          <button
            onClick={() => onPageChange(Math.min(currentPage + 1, numPages || 1))}
            disabled={!numPages || currentPage >= numPages}
            className="p-2 hover:bg-neutral-800 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-white"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center space-x-3">
             <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-1">
                <button
                  onClick={() => setShowOverlays(!showOverlays)}
                  className={clsx(
                    "flex items-center space-x-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    showOverlays ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"
                  )}
                  title="Toggle visibility of detected links"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showOverlays ? 'Visible' : 'Hidden'}</span>
                </button>
            </div>

            <div className="relative">
                <button
                    onClick={() => setShowBatchDialog(!showBatchDialog)}
                    disabled={isAnalyzing}
                    className={clsx(
                    "p-2.5 rounded-lg border border-neutral-700 transition-all text-neutral-400 hover:text-white hover:bg-neutral-800",
                    isAnalyzing && "opacity-50 cursor-not-allowed"
                    )}
                    title="Scan multiple pages"
                >
                    <Layers className="w-4 h-4" />
                </button>

                {/* Batch Scan Dialog */}
                {showBatchDialog && (
                    <div className="absolute top-full right-0 mt-2 p-3 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-50 w-64 animate-in fade-in zoom-in-95 origin-top-right">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-white">Scan Pages</span>
                            <button onClick={() => setShowBatchDialog(false)} className="text-neutral-500 hover:text-white">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="mb-3">
                            <input 
                                type="text" 
                                value={batchInput}
                                onChange={(e) => setBatchInput(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-white placeholder:text-neutral-600"
                                placeholder="e.g. 1-5, 8, 11-13"
                            />
                            <p className="text-[10px] text-neutral-500 mt-1">Use commas for lists and dashes for ranges.</p>
                        </div>
                        <button 
                            onClick={handleStartBatchScan}
                            className="w-full bg-white text-black hover:bg-neutral-200 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                        >
                            <ScanEye className="w-3 h-3" />
                            Scan Pages
                        </button>
                    </div>
                )}
            </div>

            <button
            onClick={handleCaptureAndAnalyze}
            disabled={isAnalyzing}
            className={clsx(
              "flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all min-w-[140px] justify-center",
              isAnalyzing 
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed" 
                : "bg-white text-black hover:bg-neutral-200 active:scale-95 shadow-[0_0_10px_rgba(255,255,255,0.1)]"
            )}
          >
            {isAnalyzing ? (
               <div className="flex items-center gap-2">
                 <Loader2 className="w-4 h-4 animate-spin" />
                 <span>{batchProgress ? `${batchProgress.current}/${batchProgress.total}` : "Scanning..."}</span>
               </div>
            ) : (
                <>
                <ScanEye className="w-4 h-4" />
                <span>Detect Links</span>
                </>
            )}
          </button>
        </div>
      </div>

      {/* PDF Scroll Area */}
      <div className="flex-1 overflow-auto p-6 flex justify-center relative bg-black" ref={containerRef}>
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          className="shadow-2xl mb-24" // Add margin bottom for the floating bar
          loading={
            <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p>Loading PDF...</p>
            </div>
          }
        >
          <div className="relative group">
            <Page
              pageNumber={currentPage}
              width={pageWidth}
              scale={scale}
              renderTextLayer={false} 
              renderAnnotationLayer={false}
              className="shadow-[0_0_50px_rgba(0,0,0,0.5)]" // Deep shadow for depth
              canvasRef={(ref) => { canvasRef.current = ref; }}
            />
            
            {/* Overlays */}
            {showOverlays && links.map((link) => (
              <div
                key={link.id}
                onClick={() => onPageChange(link.targetPage)}
                title={`Go to page ${link.targetPage}: ${link.label}`}
                className="absolute cursor-pointer transition-all duration-200 border border-transparent hover:border-blue-500 hover:bg-blue-500/10 z-20 group-hover:bg-blue-500/5"
                style={{
                  top: `${link.box.ymin / 10}%`,
                  left: `${link.box.xmin / 10}%`,
                  width: `${(link.box.xmax - link.box.xmin) / 10}%`,
                  height: `${(link.box.ymax - link.box.ymin) / 10}%`,
                }}
              >
                {/* Tooltip-like label appearing on hover */}
                <div className="absolute opacity-0 hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-black text-white text-[10px] rounded border border-neutral-800 whitespace-nowrap pointer-events-none transition-opacity z-30 shadow-xl">
                  Pg {link.targetPage}
                </div>
              </div>
            ))}
            
            {/* Empty state hint if no links but detected */}
             {links.length === 0 && !isAnalyzing && (
                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span className="text-[10px] text-neutral-500 bg-black/90 backdrop-blur px-2 py-1 rounded border border-neutral-800">
                        No links on this page
                    </span>
                </div>
             )}
          </div>
        </Document>
      </div>

      {/* Floating Progress Bar */}
      {numPages && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center z-30 px-4">
          <div className="bg-neutral-900/90 backdrop-blur-xl shadow-2xl border border-neutral-800 rounded-full p-3 px-6 flex items-center gap-5 w-full max-w-lg transition-transform hover:scale-[1.01] group/bar">
            <span className="text-xs font-bold text-neutral-500 min-w-[20px] text-right font-mono">1</span>
            
            <div className="relative flex-1 flex items-center h-8">
                {/* Floating Tooltip */}
                <div 
                  className={clsx(
                    "absolute -top-10 -translate-x-1/2 px-2.5 py-1 bg-white text-black text-[10px] font-bold rounded shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all duration-200 pointer-events-none flex flex-col items-center",
                    (isDragging || false) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 group-hover/bar:opacity-100 group-hover/bar:translate-y-0"
                  )}
                  style={{ left: `${progressPercent}%` }}
                >
                  <span className="whitespace-nowrap">Page {sliderValue}</span>
                  {/* Tiny triangle arrow */}
                  <div className="w-1.5 h-1.5 bg-white rotate-45 absolute -bottom-0.5"></div>
                </div>

                <input
                    type="range"
                    min={1}
                    max={numPages}
                    value={sliderValue}
                    onChange={handleSliderChange}
                    onMouseDown={handleSliderStart}
                    onMouseUp={handleSliderCommit}
                    onTouchStart={handleSliderStart}
                    onTouchEnd={handleSliderCommit}
                    className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-0"
                    style={{
                      background: `linear-gradient(to right, #ffffff ${progressPercent}%, #262626 ${progressPercent}%)`
                    }}
                />
            </div>
            
            <span className="text-xs font-bold text-neutral-500 min-w-[20px] font-mono">{numPages}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFViewer;