import React from 'react';
import { FileText } from 'lucide-react';

export const Terms: React.FC = () => {
  return (
    <div className="bg-[#F6F8FC] min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl shadow-sm p-8 md:p-12 border border-[#E1E3E1]">
          <div className="flex items-center space-x-3 mb-8">
             <div className="p-3 bg-[#D3E3FD] rounded-full">
              <FileText className="w-6 h-6 text-[#0B57D0]" />
            </div>
            <h1 className="text-3xl font-normal text-[#1F1F1F]">Terms and Conditions</h1>
          </div>
          
          <div className="prose prose-slate prose-lg text-[#444746]">
            <p className="mb-6">Last updated: {new Date().toLocaleDateString()}</p>
            
            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="mb-4">
              By downloading, installing, or using the PinTabs Chrome Extension, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the extension.
            </p>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">2. License</h2>
            <p className="mb-4">
              We grant you a revocable, non-exclusive, non-transferable, limited license to download, install, and use the extension strictly in accordance with these terms.
            </p>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">3. Restrictions</h2>
            <p className="mb-4">
              You agree not to, and you will not permit others to:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Reverse engineer, decompile, or disassemble the extension.</li>
              <li>Modify, make derivative works of, disassemble, or decrypt any part of the extension.</li>
              <li>Use the extension for any illegal purpose or in violation of any local, state, national, or international law.</li>
            </ul>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">4. Disclaimer of Warranties</h2>
            <p className="mb-4">
              The extension is provided "AS IS" and "AS AVAILABLE" with all faults and defects without warranty of any kind. To the maximum extent permitted under applicable law, we expressly disclaim all warranties, whether express, implied, statutory, or otherwise.
            </p>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">5. Limitation of Liability</h2>
            <p className="mb-4">
              In no event shall PinTabs or its developers be liable for any special, incidental, indirect, or consequential damages whatsoever (including, but not limited to, damages for loss of profits, loss of data, or other information) arising out of or in any way related to the use of or inability to use the extension.
            </p>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">6. Changes to Terms</h2>
            <p className="mb-4">
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. By continuing to access or use our extension after those revisions become effective, you agree to be bound by the revised terms.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};