"use client";

import Header from "./Header";
import Hero from "./Hero";
import Stats from "./Stats";
import Features from "./Features";
import InteractivePreview from "./InteractivePreview";
import HowItWorks from "./HowItWorks";
import Pricing from "./Pricing";
import CTA from "./CTA";
import Footer from "./Footer";
import { ScrollProgress } from "./LandingHelpers";
import SceneBackground from "@/components/common/SceneBackground";

export default function LandingPage() {
  return (
    <div className="relative w-full">
      <SceneBackground />
      <ScrollProgress />

      <Header />
      <Hero />
      <Stats />
      <Features />
      <InteractivePreview />
      <HowItWorks />
      <Pricing />
      <CTA />
      <Footer />
    </div>
  );
}
