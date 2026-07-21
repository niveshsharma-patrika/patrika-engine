/**
 * UI translation dictionary. Add new keys here.
 * Content (headlines, angles) is translated dynamically via AI — see lib/ai/translate.ts.
 */

export type Lang = "en" | "hi";

export const DICT = {
  // Masthead
  brandSub:           { en: "Editorial Command",           hi: "संपादकीय कमांड" },
  allSourcesLive:     { en: "All sources live",            hi: "सभी स्रोत लाइव" },
  searchPlaceholder:  { en: "Search topics, people, sources…", hi: "विषय, लोग, स्रोत खोजें…" },

  // Nav
  navDashboard:       { en: "Dashboard",      hi: "डैशबोर्ड" },
  navToday:           { en: "Trends today",   hi: "आज के ट्रेंड" },
  navAllStories:      { en: "All Stories",    hi: "सभी ख़बरें" },
  navGenerated:       { en: "My Articles",    hi: "मेरे लेख" },
  navSuggestions:     { en: "Suggestions",    hi: "सुझाव" },
  navSources:         { en: "Sources",        hi: "स्रोत" },
  navLastRun:         { en: "Today's news",   hi: "आज की ख़बरें" },
  navStats:           { en: "Stats",          hi: "आँकड़े" },
  navStyle:           { en: "Style module",   hi: "शैली मॉड्यूल" },
  navDirectives:      { en: "Writing Directives", hi: "लेखन निर्देश" },
  navMagazines:       { en: "Patrika+ Special Content", hi: "पत्रिका+ विशेष कंटेंट" },
  navTwitter:         { en: "Twitter",        hi: "ट्विटर" },
  navFeedback:        { en: "Feedback",       hi: "फ़ीडबैक" },
  navAdmin:           { en: "Admin",          hi: "एडमिन" },
  navUsers:           { en: "Users",          hi: "यूज़र्स" },

  // Sidebar sections
  system:             { en: "System",        hi: "सिस्टम" },

  // Section column heads
  trendingNow:        { en: "Trending now",  hi: "अभी ट्रेंडिंग" },
  live:               { en: "Live",          hi: "लाइव" },
  mock:               { en: "Mock data",     hi: "नमूना डेटा" },
  topics:             { en: "topics",        hi: "विषय" },

  // Filters — scope
  scopeNational:      { en: "National",      hi: "राष्ट्रीय" },
  scopeLocal:         { en: "Local",         hi: "स्थानीय" },

  // Filters — categories
  filterAll:          { en: "All",           hi: "सभी" },
  filterCity:         { en: "City",          hi: "शहर" },
  filterBusiness:     { en: "Business",      hi: "व्यापार" },
  filterSports:       { en: "Sports",        hi: "खेल" },
  filterPolitics:     { en: "Politics",      hi: "राजनीति" },
  filterWeather:      { en: "Weather",       hi: "मौसम" },
  filterTech:         { en: "Tech",          hi: "टेक" },
  filterEnter:        { en: "Entertainment", hi: "मनोरंजन" },
  filterNational:     { en: "National",      hi: "राष्ट्रीय" },

  // Filters — cities (used in Local scope)
  cityMumbai:         { en: "Mumbai",        hi: "मुंबई" },
  cityDelhi:          { en: "Delhi",         hi: "दिल्ली" },
  cityJaipur:         { en: "Jaipur",        hi: "जयपुर" },
  cityKolkata:        { en: "Kolkata",       hi: "कोलकाता" },
  cityBengaluru:      { en: "Bengaluru",     hi: "बेंगलुरु" },
  cityChennai:        { en: "Chennai",       hi: "चेन्नई" },
  cityHyderabad:      { en: "Hyderabad",     hi: "हैदराबाद" },
  cityPune:           { en: "Pune",          hi: "पुणे" },
  cityAhmedabad:      { en: "Ahmedabad",     hi: "अहमदाबाद" },
  cityLucknow:        { en: "Lucknow",       hi: "लखनऊ" },
  cityBhopal:         { en: "Bhopal",        hi: "भोपाल" },
  cityChandigarh:     { en: "Chandigarh",    hi: "चंडीगढ़" },
  cityPatna:          { en: "Patna",         hi: "पटना" },
  cityKochi:          { en: "Kochi",         hi: "कोच्चि" },

  // FAB / actions
  writeOnTopic:       { en: "Write on a topic", hi: "विषय पर लिखें" },
  generateDraft:      { en: "Generate draft",   hi: "ड्राफ़्ट बनाएँ" },
  generating:         { en: "Generating…",      hi: "बना रहे हैं…" },
  snooze:             { en: "Snooze",           hi: "स्थगित करें" },
  saveDraft:          { en: "Save as draft",    hi: "ड्राफ़्ट सहेजें" },
  submitReview:       { en: "Submit for review", hi: "समीक्षा हेतु भेजें" },
  back:               { en: "Back",             hi: "वापस" },
  refresh:            { en: "Refresh",          hi: "रिफ़्रेश" },
  add:                { en: "Add",              hi: "जोड़ें" },

  // Page titles
  pageSuggestions:     { en: "Editorial Suggestions", hi: "संपादकीय सुझाव" },
  pageSources:         { en: "Sources",               hi: "स्रोत" },
  pageStyle:           { en: "Style Module",          hi: "शैली मॉड्यूल" },
  pageAdmin:           { en: "Admin",                 hi: "एडमिन" },

  // Trends Today page
  pageTodayTitle:      { en: "Trends today",         hi: "आज के ट्रेंड" },
  pageTodaySub:        {
    en: "Stories that drove the day — ranked by signal volume across all outlets. Dimmed cards are no longer live.",
    hi: "आज की प्रमुख ख़बरें — सभी स्रोतों के सिग्नल वॉल्यूम के अनुसार। मद्धम कार्ड अब सक्रिय नहीं हैं।",
  },
  noLongerLive:        { en: "no longer live",       hi: "अब सक्रिय नहीं" },
  todayEmpty:          {
    en: "Nothing trended today yet. Check back after the next ingest run.",
    hi: "आज अभी तक कुछ ट्रेंड नहीं हुआ। अगले इनजेस्ट के बाद देखें।",
  },

  // Today's news page (was "Last run" — repurposed to show all of today)
  pageLastRunTitle:    { en: "Today's news",         hi: "आज की ख़बरें" },
  pageLastRunSub:      {
    en: "Every article published today (from midnight IST), grouped by source. Updates as the cron fetches new items.",
    hi: "आज (आधी रात IST से) प्रकाशित सभी लेख, स्रोत के अनुसार। नई ख़बरें आते ही जुड़ती रहती हैं।",
  },
  colSource:           { en: "Source",               hi: "स्रोत" },
  colFetched:          { en: "Fetched",              hi: "लाया गया" },
  colNew:              { en: "New",                  hi: "नए" },
  colDuplicate:        { en: "Duplicate",            hi: "डुप्लिकेट" },
  colError:            { en: "Error",                hi: "त्रुटि" },
  colHeadline:         { en: "Headline",             hi: "शीर्षक" },
  colTime:             { en: "Time",                 hi: "समय" },
  lastRunStarted:      { en: "Started",              hi: "शुरू हुआ" },
  lastRunCompleted:    { en: "Completed",            hi: "पूरा हुआ" },
  lastRunStatus:       { en: "Status",               hi: "स्थिति" },
  lastRunNoData:       {
    en: "No ingest run found yet. The first run will happen automatically.",
    hi: "अभी कोई इनजेस्ट रन नहीं हुआ। पहला रन अपने आप होगा।",
  },

  // Editor
  editorTitle:        { en: "Article editor",     hi: "लेख एडिटर" },
  topicContext:       { en: "Topic context",      hi: "विषय संदर्भ" },
  stats:              { en: "Stats",              hi: "आँकड़े" },
  words:              { en: "Words",              hi: "शब्द" },
  readingTime:        { en: "Reading time",       hi: "पढ़ने का समय" },
  noTrendSelected:    {
    en: "No trend selected. Write from scratch, or open from a trend card to import context.",
    hi: "कोई ट्रेंड चयनित नहीं। शून्य से लिखें, या संदर्भ आयात करने के लिए ट्रेंड कार्ड खोलें।",
  },

  // Common
  loading:            { en: "Loading…",            hi: "लोड हो रहा है…" },
  empty:              { en: "Nothing here yet",   hi: "अभी यहाँ कुछ नहीं" },
  comingSoon:         { en: "Coming soon",        hi: "जल्द आ रहा है" },
} as const;

export type DictKey = keyof typeof DICT;

export function t(key: DictKey, lang: Lang): string {
  const entry = DICT[key];
  return entry?.[lang] ?? entry?.en ?? key;
}
