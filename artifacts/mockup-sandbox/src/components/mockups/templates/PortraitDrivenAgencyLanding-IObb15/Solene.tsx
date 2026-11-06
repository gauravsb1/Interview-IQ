import './fonts.css';
import asset0 from "./assets/solene-hero.png";
import asset1 from "./assets/solene-portrait1.png";
import asset2 from "./assets/solene-portrait2.png";

import React from 'react';

export default function Solene() {
  return (
    <div className="w-full h-full overflow-hidden relative bg-white flex flex-col font-['Inter'] text-[#111111] box-border antialiased">

      {/* HERO SECTION */}
      <div className="relative w-full h-[520px] overflow-hidden bg-gradient-to-br from-[#2A0F3D] via-[#6B1E8C] to-[#C13D9E]">

        {/* Side-profile face image */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={asset0}
            alt="Profile"
            className="h-[115%] w-auto object-cover object-center opacity-90 mix-blend-luminosity"
          />
        </div>
        {/* Gradient color wash over image */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#2A0F3D]/80 via-[#6B1E8C]/55 to-[#C13D9E]/70 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A0826]/70 via-transparent to-[#1A0826]/30 pointer-events-none"></div>

        {/* Top bar */}
        <div className="absolute top-0 left-0 w-full flex justify-between items-center px-9 pt-7 z-30 text-white">
          {/* Logo */}
          <div className="w-9 h-9 rounded-full border border-white/50 flex items-center justify-center font-['Playfair_Display'] italic text-[18px] leading-none">
            S
          </div>
          {/* Nav */}
          <nav className="flex gap-9 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/85">
            <a href="#" className="hover:text-white transition-colors">Home</a>
            <a href="#" className="hover:text-white transition-colors">About</a>
            <a href="#" className="hover:text-white transition-colors">Projects</a>
            <a href="#" className="hover:text-white transition-colors">Studio</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </nav>
        </div>

        {/* Corner labels */}
        <div className="absolute top-[78px] left-9 z-30 text-white/70 text-[9px] font-semibold uppercase tracking-[0.28em] flex items-center gap-2">
          <span className="w-6 h-px bg-white/40"></span>
          Digital Experience
        </div>
        <div className="absolute top-[78px] right-9 z-30 text-white/70 text-[9px] font-semibold uppercase tracking-[0.28em] flex items-center gap-2">
          Concept Execution
          <span className="w-6 h-px bg-white/40"></span>
        </div>

        {/* MASSIVE WORDMARK */}
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none select-none">
          <h1 className="font-['Playfair_Display'] italic font-medium text-white text-[150px] leading-none tracking-[-0.02em] drop-shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
            Solene
          </h1>
        </div>

        {/* Sub caption under wordmark */}
        <div className="absolute bottom-9 left-1/2 -translate-x-1/2 z-30 text-center text-white/75 text-[11px] tracking-wide max-w-[420px]">
          We shape digital identities that resonate far beyond first impressions.
        </div>

      </div>

      {/* MID WHITE STATEMENT BAND */}
      <div className="flex-1 w-full bg-white px-9 pt-10 flex flex-col">
        <div className="flex items-start justify-between gap-10">
          {/* Statement */}
          <h2 className="font-['Playfair_Display'] text-[#161616] text-[40px] leading-[1.12] tracking-[-0.01em] max-w-[760px]">
            We build brands that don&apos;t blend in&nbsp;&mdash;<br />
            they lead, disrupt, and stay remembered.
          </h2>
          {/* Right index */}
          <div className="text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 mt-3 shrink-0">
            <div>Intro</div>
            <div className="mt-2 text-gray-300">001</div>
          </div>
        </div>

        {/* Supporting paragraphs */}
        <div className="flex justify-between gap-12 mt-8">
          <p className="text-[12px] leading-relaxed text-gray-500 max-w-[300px]">
            Since our earliest days, we have stayed focused on crafting brand
            systems that endure. We partner with each client to deliver work
            built on clarity, care, and intention.
          </p>
          <p className="text-[12px] leading-relaxed text-gray-500 max-w-[300px] text-right">
            Over more than a decade, we have collaborated with founders across
            markets to craft distinctive identities that move audiences and set
            a lasting standard.
          </p>
        </div>

        {/* BOTTOM ROW */}
        <div className="grid grid-cols-2 gap-5 mt-8 flex-1 min-h-0">
          {/* Dark card */}
          <div className="relative bg-[#141414] rounded-[4px] overflow-hidden p-7 flex flex-col justify-between">
            <div className="text-white/50 text-[9px] font-semibold uppercase tracking-[0.24em]">
              Our Craft
            </div>
            <h3 className="font-['Playfair_Display'] text-white text-[34px] leading-tight">
              Expertise, refined.
            </h3>
            <p className="text-white/45 text-[11px] leading-relaxed max-w-[280px]">
              Strategy, identity, and motion — composed into one coherent voice
              for brands ready to be unforgettable.
            </p>
          </div>

          {/* Two photos */}
          <div className="grid grid-cols-2 gap-5">
            <div className="relative rounded-[4px] overflow-hidden">
              <img
                src={asset1}
                alt="Portrait"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 text-white text-[9px] font-semibold uppercase tracking-[0.18em] drop-shadow">
                 Light Study
              </div>
            </div>
            <div className="relative rounded-[4px] overflow-hidden">
              <img
                src={asset2}
                alt="Portrait"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 text-white text-[9px] font-semibold uppercase tracking-[0.18em] drop-shadow">
                Portrait No.04
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
