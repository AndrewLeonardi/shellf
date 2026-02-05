'use client';

import { useState } from 'react';

export default function InlineCopyCommand({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={handleCopy}
      className="flex items-center justify-between bg-[#0D3B3C] rounded-lg px-4 py-3 cursor-pointer hover:bg-[#0A3233] transition-colors group"
    >
      <div className="flex items-center gap-2">
        <span className="text-[#5A9A9A] text-sm select-none">$</span>
        <code className="text-[#E87461] font-mono text-sm">{text}</code>
      </div>
      <button className="flex-shrink-0 text-[#5A9A9A] group-hover:text-[#7AB8B8] transition-colors ml-3">
        {copied ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
          </svg>
        )}
      </button>
    </div>
  );
}
