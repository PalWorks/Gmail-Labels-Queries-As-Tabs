import { Mail, Search, Pin, Layout, Shield, FileText } from 'lucide-react';

export const APP_NAME = "Gmail Labels & Queries as Tabs";
export const APP_DESCRIPTION = "Turn any Gmail label or search into a permanent inbox tab.";

export const NAV_LINKS = [
  { name: 'Features', href: '/#features' },
  { name: 'How it Works', href: '/#how-it-works' },
  { name: 'Pricing', href: '/#pricing' },
];

export const FEATURES = [
  {
    title: "Pin Any Label",
    description: "Keep important folders like 'Invoices', 'Clients', or 'Travel' just one click away, right next to your Primary tab.",
    icon: Pin,
  },
  {
    title: "Save Complex Searches",
    description: "Pin dynamic search results. E.g., \"from:boss has:attachment within:7d\". The tab updates automatically.",
    icon: Search,
  },
  {
    title: "Native Look & Feel",
    description: "Designed to blend seamlessly with Gmail's interface. You won't even realize it's an extension.",
    icon: Layout,
  },
];

// Split testimonials into 3 arrays for the 3 columns
export const TESTIMONIALS_COL_1 = [
  {
    quote: "Actually helps me keep track of invoices. I used to lose them in the main feed or forget to check the sidebar label.",
    author: "Sarah Jenkins",
    role: "Freelance Designer",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop"
  },
  {
    quote: "My manager sends way too many emails. I pinned a search for 'from:dave urgent' and my stress levels honestly went down lol.",
    author: "Mike Ross",
    role: "Software Engineer",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop"
  },
  {
    quote: "Does exactly what it says. Fits right into the UI, doesn't look janky like some other extensions I've tried.",
    author: "Elena Torres",
    role: "Product Designer",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop"
  },
  {
    quote: "I handle 3 different client projects at once. Pinning label views for each client saves me so much clicking around.",
    author: "David Lin",
    role: "Agency Owner",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop"
  }
];

export const TESTIMONIALS_COL_2 = [
  {
    quote: "I just pinned 'label:receipts' and 'from:amazon'. Makes tax season way less annoying when I can just see everything in one tab.",
    author: "James Peterson",
    role: "Contractor",
    avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=200&auto=format&fit=crop"
  },
  {
    quote: "It's a small change but saves me a lot of clicks. I really hate navigating the side menu in Gmail, it's too cluttered.",
    author: "Jessica Miller",
    role: "Marketing Director",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=200&auto=format&fit=crop"
  },
  {
    quote: "Finally found a way to separate newsletter spam from actual work emails without unsubscribing from everything.",
    author: "Tom Harris",
    role: "Startup Founder",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop"
  },
  {
    quote: "Installed it last week. Pretty chill extension, doesn't slow down Gmail which was my main worry.",
    author: "Sophie Kim",
    role: "Content Creator",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop"
  }
];

export const TESTIMONIALS_COL_3 = [
  {
    quote: "I use the 'has:attachment' search pin constantly. Saves me from digging through threads just to find that one PDF.",
    author: "Chris Baker",
    role: "Sales Lead",
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=200&auto=format&fit=crop"
  },
  {
    quote: "Looks like it belongs there. Google should've just built this feature natively honestly.",
    author: "Amanda Wright",
    role: "UX Researcher",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop"
  },
  {
    quote: "My inbox is usually a disaster zone. This helps me cordon off the mess a bit so I don't miss the important stuff.",
    author: "Robert Fox",
    role: "Operations Manager",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=200&auto=format&fit=crop"
  },
  {
    quote: "Simple tool. I like that it doesn't track my data or ask for weird permissions.",
    author: "Linda Garcia",
    role: "Consultant",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop"
  }
];