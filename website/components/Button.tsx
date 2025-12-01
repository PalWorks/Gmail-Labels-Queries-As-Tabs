import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  className = '',
  ...props 
}) => {
  // Switched to rounded-full to match Google's Material Design 3 buttons
  const baseStyles = "inline-flex items-center justify-center rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";
  
  const variants = {
    // Google Blue #0B57D0
    primary: "bg-[#0B57D0] text-white hover:bg-[#0842A0] focus:ring-[#0B57D0] shadow-none hover:shadow-md transition-shadow",
    // Secondary often has a light background or border in Google apps
    secondary: "bg-white text-[#0B57D0] hover:bg-[#F0F4F9] border border-[#747775] focus:ring-[#0B57D0]",
    outline: "border border-[#747775] text-[#0B57D0] hover:bg-[#F0F4F9] focus:ring-[#0B57D0]",
    ghost: "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#1f1f1f]/5",
  };

  const sizes = {
    sm: "px-4 py-1.5 text-sm",
    md: "px-6 py-2.5 text-base",
    lg: "px-8 py-3.5 text-lg",
  };

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthStyle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};