import LandingPage from "@/components/landing/LandingPage";

// Server-rendered so crawlers see it without executing the client bundle —
// LandingPage itself is "use client" and can't export this alongside JSX.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ForgeKeep",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Guild command center for competitive MMORPG teams — live boss spawn timers, verified raid attendance, guild points, and an audited treasury.",
  url: "https://forgekeep.io",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "PHP",
    category: "Freemium",
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingPage />
    </>
  );
}
