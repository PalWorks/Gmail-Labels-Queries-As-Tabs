import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { APP_NAME, NAV_LINKS } from '../constants';
import { Button } from './Button';

export const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isHome = location.pathname === '/';

  // Helper to scroll to section if on home, or navigate to home#hash
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('/#')) {
      const targetId = href.replace('/#', '');
      if (isHome) {
        e.preventDefault();
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
          setIsOpen(false);
        }
      }
      // If not home, default behavior (Link to /#hash) works via App.tsx logic or browser default
    }
  };

  return (
    <nav className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#F6F8FC]/95 backdrop-blur-md shadow-sm' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0 flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <img
                src="/logo.png"
                alt="Logo"
                className="h-8 w-8 rounded-lg"
              />
              <span className="font-medium text-lg md:text-xl text-[#1F1F1F] tracking-tight">{APP_NAME}</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="text-[#444746] hover:text-[#0B57D0] font-medium transition-colors text-sm"
              >
                {link.name}
              </Link>
            ))}
            <Button variant="primary" size="sm">
              Add to Chrome
            </Button>
          </div>

          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-[#444746] hover:text-[#1F1F1F] p-2"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-[#E1E3E1]">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-[#444746] hover:text-[#0B57D0] hover:bg-[#F0F4F9]"
              >
                {link.name}
              </Link>
            ))}
            <div className="mt-4 px-3">
              <Button fullWidth onClick={() => setIsOpen(false)}>Add to Chrome</Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};