'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, ArrowRight, Copy, Check, RefreshCw, Loader2, Lightbulb, AlertTriangle, Wrench } from 'lucide-react';
import type { TopologyEdge } from '@/types/topology';
import type { ExplainResult, ExplainError } from '@/types/explain';

interface ExplainModalProps {
  edge: TopologyEdge | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  result: ExplainResult | null;
  error: ExplainError | null;
  onRetry: () => void;
}

export function ExplainModal({
  edge,
  isOpen,
  onClose,
  isLoading,
  result,
  error,
  onRetry,
}: ExplainModalProps) {
  const [copied, setCopied] = useState(false);

  if (!edge) return null;

  const handleCopy = async () => {
    if (!result) return;

    const text = `## What Changed
${result.whatChanged}

## Why Breaking
${result.whyBreaking}

## How to Fix
${result.howToFix}`;

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getErrorMessage = (err: ExplainError): string => {
    switch (err.code) {
      case 'NO_API_KEY':
        return 'Please set GOOGLE_AI_API_KEY in .env.local';
      case 'RATE_LIMIT':
        return 'Too many requests. Please try again later.';
      case 'NETWORK_ERROR':
        return 'Unable to connect to AI service.';
      case 'FILE_NOT_FOUND':
        return err.message;
      default:
        return 'An unexpected error occurred.';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] bg-white border-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <AlertCircle className="w-5 h-5 text-red-500" />
            Broken Dependency Analysis
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-sm text-slate-500 pt-2">
            <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{edge.source}</code>
            <ArrowRight className="w-4 h-4" />
            <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{edge.target}</code>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Analyzing code changes...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4 text-center">
                <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
                <p className="font-medium">{getErrorMessage(error)}</p>
              </div>
              <Button
                onClick={onRetry}
                variant="outline"
                className="border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}

          {result && !isLoading && (
            <div className="space-y-4">
              {/* What Changed */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <h3 className="flex items-center gap-2 font-medium text-slate-700 mb-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  What Changed
                </h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {result.whatChanged}
                </p>
              </div>

              {/* Why Breaking */}
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <h3 className="flex items-center gap-2 font-medium text-red-700 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Why Breaking
                </h3>
                <p className="text-sm text-red-600 whitespace-pre-wrap">
                  {result.whyBreaking}
                </p>
              </div>

              {/* How to Fix */}
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <h3 className="flex items-center gap-2 font-medium text-emerald-700 mb-2">
                  <Wrench className="w-4 h-4 text-emerald-500" />
                  How to Fix
                </h3>
                <p className="text-sm text-emerald-600 whitespace-pre-wrap">
                  {result.howToFix}
                </p>
              </div>

              {/* Copy Button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="sm"
                  className="border-slate-300 text-slate-600 hover:bg-slate-100"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Analysis
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
