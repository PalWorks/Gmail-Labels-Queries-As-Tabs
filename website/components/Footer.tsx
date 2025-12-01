import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { APP_NAME } from '../constants';

export const Footer: React.FC = () => {
  const location = useLocation();
  const isHome = location.pathname === '/';

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('/#')) {
      const targetId = href.replace('/#', '');
      if (isHome) {
        e.preventDefault();
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  };

  return (
    <footer className="bg-[#F2F2F2] border-t border-[#E1E3E1] pt-12 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="col-span-1">
            <Link to="/" className="flex items-center space-x-2 mb-4">
              <img
                src="/logo.png"
                alt="Logo"
                className="h-8 w-8 rounded-lg"
              />
              <span className="font-medium text-lg text-[#1F1F1F]">{APP_NAME}</span>
            </Link>
            <p className="text-[#444746] text-sm leading-relaxed max-w-sm">
              Transforming your inbox into a productivity powerhouse. Organize your email workflow with custom pinned tabs.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-[#1F1F1F] uppercase tracking-wider mb-4">Product</h3>
            <ul className="space-y-3">
              <li><Link to="/#features" className="text-[#444746] hover:text-[#0B57D0] text-sm">Features</Link></li>
              <li><Link to="/#pricing" className="text-[#444746] hover:text-[#0B57D0] text-sm">Pricing</Link></li>
              <li><Link to="/changelog" className="text-[#444746] hover:text-[#0B57D0] text-sm">Changelog</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-[#1F1F1F] uppercase tracking-wider mb-4">Legal & Support</h3>
            <ul className="space-y-3">
              <li><Link to="/privacy" className="text-[#444746] hover:text-[#0B57D0] text-sm">Privacy Policy</Link></li>
              <li><Link to="/terms" className="text-[#444746] hover:text-[#0B57D0] text-sm">Terms & Conditions</Link></li>
              <li><Link to="/#contact" className="text-[#444746] hover:text-[#0B57D0] text-sm">Get in Touch</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#E1E3E1] pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-[#444746] text-sm">
            &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved. Not affiliated with Google or Gmail.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">

          </div>
        </div>
      </div>
    </footer>
  );
};