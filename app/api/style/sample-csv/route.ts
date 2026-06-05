export const dynamic = "force-dynamic";

/**
 * GET /api/style/sample-csv
 * Returns a template CSV that demonstrates the expected schema for bulk
 * sample-article upload. Three example rows covering different story types.
 *
 * Columns:
 *   title      — required; the article headline
 *   body       — required; the full article body (paragraphs separated by \n)
 *   category   — optional; one of: Breaking news | Analysis | Explainer
 *                | Profile | Service piece | Investigation | Op-ed | Sidebar | Feature
 *   source_url — optional; if pasted from a URL, the original
 *   notes      — optional; editor's note about why this sample matters
 */

function csvEscape(v: string): string {
  // Quote if contains comma, quote, or newline. Escape internal quotes by doubling.
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

const SAMPLE_ROWS: Array<{
  title: string;
  body: string;
  category: string;
  source_url: string;
  notes: string;
}> = [
  {
    title: "Why Mumbai's monsoon prep didn't hold this year",
    body:
      "MUMBAI: For the third year running, the BMC's pre-monsoon pumping infrastructure failed at exactly the spots flagged in its own 2022 audit. " +
      "Three pumping stations in Hindmata and Gandhi Market went offline within 90 minutes of the first heavy spell on Tuesday. " +
      "Civic officials said the contractor — the same one awarded the ₹430 crore tender in 2022 — had not delivered the warranty-period maintenance specified in the contract. " +
      "The ward office filed a notice but did not invoke penalty clauses, raising questions about the BMC's enforcement appetite.\n\n" +
      "What the data shows: of the 287 pumping stations across the city, 41 are now outside their service life and 18 have been awaiting replacement since the 2019 audit. " +
      "The pre-monsoon checklist, leaked to The Indian Express last month, marks the same three stations 'amber' — meaning likely to fail. They did.\n\n" +
      "Who's accountable: Civic chief Iqbal Singh Chahal, asked at a press briefing whether the contractor would be blacklisted, said only that 'penalty proceedings will follow'. " +
      "The state urban development department, which signed off on the 2022 tender, declined to comment.",
    category: "Investigation",
    source_url: "https://example.com/mumbai-monsoon-prep-2026",
    notes: "Good investigation exemplar — tight attribution, named-source structure, sceptical voice.",
  },
  {
    title: "What India's fuel-price freeze actually cost",
    body:
      "NEW DELHI: After nearly four years of election-driven freeze, state oil firms resumed weekly price adjustments on Monday — and the real story isn't the ₹2 hike at the pump, but the cumulative under-recovery the cabinet was managing in the background.\n\n" +
      "Between October 2022 and last week, IOC, BPCL and HPCL absorbed an estimated ₹78,000 crore in under-recoveries that didn't show up in retail prices. " +
      "The Centre offset part of that through excise tweaks and a one-time bond. What the next 12 months bring depends on whether crude stays above $80 — and whether the freeze quietly returns when state elections begin in October.\n\n" +
      "Analysts at JM Financial argue the more important signal is what wasn't said: the petroleum ministry's official statement made no mention of resuming the daily-revision regime that existed before 2022. " +
      "That suggests the political comfort with sustained, transparent pricing has not returned.",
    category: "Analysis",
    source_url: "",
    notes: "Strong sector analysis — leads with the 'so what', anchors to specific numbers, ends on a forward question.",
  },
  {
    title: "How to apply for the new RBI deposit-tracking scheme",
    body:
      "MUMBAI: From May 1, savings-account holders at participating banks can opt in to a unified deposit-tracking dashboard that flags unclaimed-deposit risk across all their accounts. " +
      "Here's how to enrol and what changes.\n\n" +
      "Step 1: Log into your bank's net-banking portal. Look for 'RBI UDGAM Settings' under Profile → Preferences. (At HDFC and ICICI it's under 'Account Services'.)\n\n" +
      "Step 2: Provide your Aadhaar-linked mobile number for OTP verification. The dashboard requires Aadhaar consent under the 2024 DPDP framework.\n\n" +
      "Step 3: Choose alert thresholds — accounts inactive for 180 days, 365 days, or 730 days each trigger a different notification.\n\n" +
      "What to watch out for: The dashboard pulls from the RBI's UDGAM portal but only reflects banks that have completed the 2025 integration. " +
      "Cooperative banks and small finance banks are largely outside this for now.",
    category: "Service piece",
    source_url: "",
    notes: "Clean service-piece pattern — numbered steps, jargon defined, watch-outs at the end.",
  },
];

export async function GET() {
  const headers = ["title", "body", "category", "source_url", "notes"];
  const lines = [headers.join(",")];
  for (const row of SAMPLE_ROWS) {
    lines.push(
      [
        csvEscape(row.title),
        csvEscape(row.body),
        csvEscape(row.category),
        csvEscape(row.source_url),
        csvEscape(row.notes),
      ].join(",")
    );
  }
  const csv = lines.join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="patrika-style-samples-template.csv"',
    },
  });
}
