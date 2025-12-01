import React from 'react';
import { Shield } from 'lucide-react';

export const Privacy: React.FC = () => {
  return (
    <div className="bg-[#F6F8FC] min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl shadow-sm p-8 md:p-12 border border-[#E1E3E1]">
          <div className="flex items-center space-x-3 mb-8">
            <div className="p-3 bg-[#E6F4EA] rounded-full">
              <Shield className="w-6 h-6 text-[#188038]" />
            </div>
            <h1 className="text-3xl font-normal text-[#1F1F1F]">Privacy Policy</h1>
          </div>
          
          <div className="prose prose-slate prose-lg text-[#444746]">
            <p className="mb-6">Last updated: {new Date().toLocaleDateString()}</p>
            
            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">1. Overview</h2>
            <p className="mb-4">
              PinTabs ("we", "us", or "our") respects your privacy. This Privacy Policy describes how we handle information when you use our Chrome Extension. 
              <strong> Crucially, we do not collect, store, or transmit your emails or personal data to any external servers.</strong>
            </p>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">2. Data Collection</h2>
            <p className="mb-4">
              The extension operates entirely locally within your browser. 
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Settings:</strong> Your pinned tabs configurations (label names, search queries) are stored in your browser's local storage (`chrome.storage.local` or `chrome.storage.sync`) so they persist across sessions.</li>
              <li><strong>Email Content:</strong> We DO NOT have access to read your emails content for any purpose other than displaying the list within the Gmail interface as you configured. We do not analyze, scrape, or send this data anywhere.</li>
            </ul>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">3. Permissions</h2>
            <p className="mb-4">
              We require specific permissions to function:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><code>storage</code>: To save your tab preferences.</li>
              <li><code>host_permissions</code> (mail.google.com): To inject the tabs interface into Gmail.</li>
            </ul>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">4. Third-Party Services</h2>
            <p className="mb-4">
              We do not use third-party analytics services (like Google Analytics) inside the extension. 
            </p>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">5. Changes to This Policy</h2>
            <p className="mb-4">
              We may update our Privacy Policy from time to time. Thus, you are advised to review this page periodically for any changes.
            </p>

            <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">Contact Us</h2>
            <p>
              If you have any questions or suggestions about our Privacy Policy, do not hesitate to contact us at support@pintabs.example.com.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};