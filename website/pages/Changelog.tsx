import React from 'react';
import { History } from 'lucide-react';

export const Changelog: React.FC = () => {
  return (
    <div className="bg-[#F6F8FC] min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl shadow-sm p-8 md:p-12 border border-[#E1E3E1]">
          <div className="flex items-center space-x-3 mb-8">
            <div className="p-3 bg-[#E8F0FE] rounded-full">
              <History className="w-6 h-6 text-[#1A73E8]" />
            </div>
            <h1 className="text-3xl font-normal text-[#1F1F1F]">Changelog</h1>
          </div>
          
          <div className="space-y-12">
            <div className="relative border-l-2 border-[#E1E3E1] pl-8 pb-4">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-[#0B57D0] border-4 border-white shadow-sm"></div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-2xl font-medium text-[#1F1F1F]">v1.0.0</h2>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#E8F0FE] text-[#1967D2] mt-2 sm:mt-0">
                  Initial Release
                </span>
              </div>
              <div className="prose prose-slate prose-lg text-[#444746]">
                <p>
                  We are excited to launch the first version of PinTabs! This basic version brings the core functionality to help you organize your Gmail inbox.
                </p>
                <ul className="list-disc pl-5 mt-4 space-y-2">
                  <li><strong>Pin Gmail Labels:</strong> Easily pin any label (e.g., "Invoices", "Clients") as a native-looking tab.</li>
                  <li><strong>Pin Search Queries:</strong> Run a search and pin the results (e.g., "from:boss") for one-click access.</li>
                  <li><strong>Native Integration:</strong> Seamlessly blends with Gmail's existing interface.</li>
                  <li><strong>Local Storage:</strong> All your configurations are stored locally on your browser for maximum privacy.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};