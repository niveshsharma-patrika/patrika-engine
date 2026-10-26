import { MagazineDeck } from "@/components/magazine-deck";

/** Olloi Content — health/support content for the Saath community app. Same
 * research → verify → trusted-source pipeline as Patrika+, tuned for sensitive
 * medical topics (first desk: Cancer Care). */
export default function OlloiPage() {
  return (
    <MagazineDeck
      group="olloi"
      titleHi="Olloi कंटेंट"
      titleEn="Olloi Content"
      subtitleHi="कैंसर मरीजों, परिजनों और सर्वाइवर्स के लिए भरोसेमंद, विशेषज्ञ-आधारित जानकारी — वही रिसर्च, सोर्स-वेरिफिकेशन और फैक्ट-चेक पाइपलाइन। हर लेख डॉक्टर-समीक्षा के लिए तैयार होता है।"
      subtitleEn="Trusted, expert-grounded content for cancer patients, families and survivors — same research, source-verification and fact-check pipeline. Every article is prepared for doctor review before publishing."
    />
  );
}
