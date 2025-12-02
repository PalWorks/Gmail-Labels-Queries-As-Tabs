import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Inbox, Users, Tag, Filter, Plus, CheckCircle, Pencil, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { Button } from '../components/Button';
import { FEATURES, TESTIMONIALS_COL_1, TESTIMONIALS_COL_2, TESTIMONIALS_COL_3 } from '../constants';

interface Review {
  quote: string;
  author: string;
  role: string;
  avatar: string;
}

interface CarouselItem {
  type: 'image' | 'video';
  src: string;
  alt?: string;
  poster?: string;
}

const DEMO_ITEMS: CarouselItem[] = [
  {
    type: 'image',
    src: '/Gmail-Labels-Queries-As-Tabs/banner-05.png',
    alt: 'Dark Mode Support'
  },
  {
    type: 'image',
    src: '/Gmail-Labels-Queries-As-Tabs/banner-03.png',
    alt: 'Pin Search Queries'
  },
  {
    type: 'image',
    src: '/Gmail-Labels-Queries-As-Tabs/banner-01.png',
    alt: 'Drag & Drop Organization'
  },
  {
    type: 'image',
    src: '/Gmail-Labels-Queries-As-Tabs/banner-02.png',
    alt: 'Rename & Customize Tabs'
  },
  {
    type: 'image',
    src: '/Gmail-Labels-Queries-As-Tabs/banner-04.png',
    alt: 'Edit Tab Details'
  }
];

const DemoCarousel: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % DEMO_ITEMS.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + DEMO_ITEMS.length) % DEMO_ITEMS.length);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  // Pause video when sliding away
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, [currentIndex]);

  return (
    <div className="relative group w-full h-full bg-black">
      <div className="overflow-hidden w-full h-full">
        <div
          className="flex transition-transform duration-500 ease-in-out h-full"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {DEMO_ITEMS.map((item, index) => (
            <div key={index} className="min-w-full h-full flex items-center justify-center bg-[#F6F8FC] relative">
              {item.type === 'image' ? (
                <img
                  src={item.src}
                  alt={item.alt}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full bg-black flex items-center justify-center">
                  <video
                    ref={index === currentIndex ? videoRef : null}
                    src={item.src}
                    poster={item.poster}
                    controls
                    className="max-w-full max-h-full"
                    playsInline
                  />
                </div>
              )}

              {/* Overlay Caption (Optional) */}
              {item.type === 'image' && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-8 text-white">
                  <p className="font-medium text-lg">{item.alt}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-[#1F1F1F] shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none z-10"
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <button
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-[#1F1F1F] shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none z-10"
        aria-label="Next slide"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2 z-10">
        {DEMO_ITEMS.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${index === currentIndex
              ? 'bg-white w-6'
              : 'bg-white/50 hover:bg-white/80'
              }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

const ReviewCard: React.FC<{ review: Review }> = ({ review }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#E1E3E1] mb-6 mx-2 break-inside-avoid">
    <div className="flex items-center mb-4">
      <img src={review.avatar} alt={review.author} className="w-10 h-10 rounded-full mr-3" />
      <div>
        <div className="font-medium text-[#1F1F1F] text-sm">{review.author}</div>
        <div className="text-[#444746] text-xs">{review.role}</div>
      </div>
    </div>
    <p className="text-[#444746] text-sm leading-relaxed">"{review.quote}"</p>
  </div>
);

export const Home: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    // Handle hash scrolling on initial load or route change
    if (location.hash) {
      const element = document.getElementById(location.hash.replace('#', ''));
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }

    // Load Tally embed script
    const scriptSrc = "https://tally.so/widgets/embed.js";
    const loadTally = () => {
      // @ts-ignore
      if (typeof Tally !== 'undefined') {
        // @ts-ignore
        Tally.loadEmbeds();
      } else {
        document.querySelectorAll("iframe[data-tally-src]:not([src])").forEach((e) => {
          // @ts-ignore
          e.src = e.dataset.tallySrc;
        });
      }
    };

    if (typeof window !== 'undefined') {
      if (document.querySelector(`script[src="${scriptSrc}"]`)) {
        loadTally();
      } else {
        const script = document.createElement("script");
        script.src = scriptSrc;
        script.onload = loadTally;
        script.onerror = loadTally;
        document.body.appendChild(script);
      }
    }
  }, [location]);

  return (
    <div className="flex flex-col min-h-screen bg-[#F6F8FC]">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        {/* Subtle background blurs */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-[#D3E3FD] rounded-full blur-3xl opacity-60 z-0"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-[#F2F2F2] rounded-full blur-3xl opacity-60 z-0"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center px-4 py-1 rounded-full bg-white border border-[#E1E3E1] text-[#0B57D0] text-xs font-medium mb-6 uppercase tracking-wider shadow-sm">
            Now available for Chrome
          </div>
          <h1 className="text-4xl md:text-6xl font-normal text-[#1F1F1F] tracking-tight mb-6 leading-tight">
            Organize your inbox with <br />
            <span className="font-medium text-[#0B57D0]">Custom Tabs</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-[#444746] mb-10">
            Pin any Label or Search Query as a native tab alongside Primary, Social, and Promotions. Seamlessly integrated into Gmail.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button size="lg" className="shadow-md">
              Add to Chrome - It's Free
            </Button>
          </div>
        </div>
      </section>

      {/* Visual Demo Section (Carousel) */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-[#F6F8FC] rounded-2xl shadow-xl border border-[#E1E3E1] overflow-hidden p-2">

            {/* Browser Frame */}
            <div className="bg-white rounded-xl flex flex-col h-[500px] md:h-[600px] overflow-hidden">

              {/* Fake Browser Header */}
              <div className="h-12 bg-[#F6F8FC] flex items-center px-4 border-b border-[#E1E3E1] space-x-2">
                <div className="flex space-x-2 mr-4">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"></div>
                </div>
                <div className="flex-1 bg-white h-8 rounded-md border border-[#E1E3E1] flex items-center px-3 text-xs text-[#444746]">
                  <span className="opacity-50">https://mail.google.com/mail/u/0/#inbox</span>
                </div>
              </div>

              {/* Carousel Content */}
              <div className="flex-1 bg-white relative">
                <DemoCarousel />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-sm text-[#0B57D0] font-bold tracking-wide uppercase">Features</h2>
            <p className="mt-2 text-3xl leading-8 font-normal text-[#1F1F1F] sm:text-4xl">
              Better than filters. Faster than search.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {FEATURES.map((feature, idx) => (
              <div key={idx} className="bg-[#F6F8FC] p-8 rounded-2xl border border-transparent hover:border-[#E1E3E1] transition-all duration-300">
                <div className="w-12 h-12 bg-[#D3E3FD] rounded-full flex items-center justify-center mb-6">
                  <feature.icon className="w-6 h-6 text-[#0B57D0]" />
                </div>
                <h3 className="text-xl font-medium text-[#1F1F1F] mb-3">{feature.title}</h3>
                <p className="text-[#444746] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-[#F6F8FC] scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-normal text-[#1F1F1F]">How it works</h2>
            <p className="mt-4 text-lg text-[#444746]">Three simple steps to inbox zen.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white border border-[#E1E3E1] text-[#1F1F1F] font-bold text-2xl mb-6 shadow-sm">1</div>
              <h3 className="text-lg font-medium mb-2 text-[#1F1F1F]">Perform a Search</h3>
              <p className="text-[#444746]">Type any query in Gmail search bar. Complex operators supported.</p>
            </div>
            <div>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white border border-[#E1E3E1] text-[#1F1F1F] font-bold text-2xl mb-6 shadow-sm">2</div>
              <h3 className="text-lg font-medium mb-2 text-[#1F1F1F]">Click "Pin as Tab"</h3>
              <p className="text-[#444746]">Our extension adds a small pin button next to the search results.</p>
            </div>
            <div>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#0B57D0] text-white font-bold text-2xl mb-6 shadow-md">3</div>
              <h3 className="text-lg font-medium mb-2 text-[#1F1F1F]">Access Instantly</h3>
              <p className="text-[#444746]">Your new tab appears immediately. Click it anytime to run that search live.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-normal text-[#1F1F1F]">Simple, Transparent Pricing</h2>
            <p className="mt-4 text-lg text-[#444746]">No hidden fees. Free for everyone.</p>
          </div>

          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-3xl shadow-lg border border-[#E1E3E1] overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">
              <div className="p-8 text-center bg-[#F6F8FC] border-b border-[#E1E3E1]">
                <h3 className="text-xl font-medium text-[#1F1F1F] mb-2">Standard Plan</h3>
                <div className="flex items-center justify-center">
                  <span className="text-5xl font-normal text-[#1F1F1F]">Free</span>
                  <span className="ml-2 text-xl text-[#444746]">/ forever</span>
                </div>
                <p className="mt-4 text-[#444746]">Everything you need to organize your Gmail.</p>
              </div>
              <div className="p-8">
                <ul className="space-y-4">
                  {[
                    "Unlimited Pinned Tabs",
                    "Pin Label Views",
                    "Pin Custom Search Queries",
                    "Native Gmail Integration",
                    "Privacy Focused (No Data Tracking)",
                    "Community Support"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start">
                      <CheckCircle className="h-6 w-6 text-[#188038] flex-shrink-0 mr-3" /> {/* Google Green */}
                      <span className="text-[#1F1F1F]">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Button fullWidth size="lg">Get Started Now</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Wall of Love Reviews - Infinite Scroll */}
      <section className="py-24 bg-[#F6F8FC] overflow-hidden">
        <div className="text-center mb-16 px-4">
          <div className="inline-flex items-center px-4 py-1 rounded-full bg-white border border-[#E1E3E1] text-[#1F1F1F] text-xs font-medium mb-4 shadow-sm">
            <Users className="w-3 h-3 mr-2 text-[#0B57D0]" /> Reviews
          </div>
          <h2 className="text-3xl md:text-5xl font-normal text-[#1F1F1F]">Customers love our app</h2>
          <p className="mt-4 text-lg text-[#444746]">Leaders using our extension save 10+ hours every week.</p>
        </div>

        <div className="max-w-7xl mx-auto px-4 h-[600px] relative">
          <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-b from-[#F6F8FC] via-transparent to-[#F6F8FC] h-full"></div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full overflow-hidden mask-image-gradient">

            {/* Column 1: Up */}
            <div className="flex flex-col space-y-6 animate-marquee-up group">
              {[...TESTIMONIALS_COL_1, ...TESTIMONIALS_COL_1].map((review, i) => (
                <ReviewCard key={`col1-${i}`} review={review} />
              ))}
            </div>

            {/* Column 2: Down */}
            <div className="flex flex-col space-y-6 animate-marquee-down group">
              {[...TESTIMONIALS_COL_2, ...TESTIMONIALS_COL_2].map((review, i) => (
                <ReviewCard key={`col2-${i}`} review={review} />
              ))}
            </div>

            {/* Column 3: Up */}
            <div className="flex flex-col space-y-6 animate-marquee-up group hidden md:flex">
              {[...TESTIMONIALS_COL_3, ...TESTIMONIALS_COL_3].map((review, i) => (
                <ReviewCard key={`col3-${i}`} review={review} />
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* Tally Embed Section */}
      <section id="contact" className="py-20 bg-white scroll-mt-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-normal text-[#1F1F1F]">Get in Touch</h2>
          </div>
          <iframe
            data-tally-src="https://tally.so/embed/Me17aA?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1"
            loading="lazy"
            width="100%"
            height="596"
            frameBorder="0"
            title="Get in Touch"
            className="w-full"
          ></iframe>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-[#F6F8FC] text-center border-t border-[#E1E3E1]">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-normal text-[#1F1F1F] mb-6">Ready to upgrade your inbox?</h2>
          <p className="text-xl text-[#444746] mb-10">Join thousands of users who have reclaimed their email sanity.</p>
          <div className="flex flex-col items-center">
            <Button size="lg" className="shadow-lg transform hover:scale-105 transition-transform duration-200">
              Add to Chrome for Free
            </Button>
            <p className="mt-4 text-sm text-[#444746] opacity-70">Requires Chrome browser • No credit card needed</p>
          </div>
        </div>
      </section>
    </div>
  );
};