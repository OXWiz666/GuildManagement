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
import { ScrollProgress, SectionReveal } from "./LandingHelpers";
import SceneBackground from "@/components/common/SceneBackground";

export default function LandingPage() {
  return (
    <div className="relative w-full">
      <SceneBackground />
      <ScrollProgress />

      <Header />

      {/* Hero owns its own on-load choreography; the rest reveal as you scroll. */}
      <Hero />

      <SectionReveal>
        <Stats />
      </SectionReveal>
      <SectionReveal distance={52}>
        <Features />
      </SectionReveal>
      <SectionReveal distance={52}>
        <InteractivePreview />
      </SectionReveal>
      <SectionReveal distance={52}>
        <HowItWorks />
      </SectionReveal>
      <SectionReveal distance={52}>
        <Pricing />
      </SectionReveal>
      <SectionReveal distance={52}>
        <CTA />
      </SectionReveal>
      <SectionReveal distance={36}>
        <Footer />
      </SectionReveal>
    </div>
  );
}
