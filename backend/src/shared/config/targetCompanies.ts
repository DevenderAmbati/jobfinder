/**
 * Personal target-company catalog (Tier 1–4).
 *
 * Only companies with a verified career URL that a registered provider can
 * parse are seedable. Everything else stays under UNSUPPORTED_TARGET_COMPANIES.
 */

import { FALLBACK_CRON_EXPRESSION } from './defaults.js';

export type SupportedProvider =
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'microsoft'
  | 'ashby'
  | 'smartrecruiters'
  | 'successfactors'
  | 'oracle'
  | 'eightfold'
  | 'avature'
  | 'sap'
  | 'goldman'
  | 'custom';

export type CompanyTier = 1 | 2 | 3 | 4;

export interface TargetCompany {
  name: string;
  tier: CompanyTier;
  provider: SupportedProvider;
  /** Exact careers URL the provider adapter can parse. */
  careerUrl: string;
  /**
   * Large global Workday boards start disabled so a fresh install does not
   * immediately pull thousands of out-of-market postings. Enable + fetch
   * from the Companies page when ready.
   */
  enabled: boolean;
  frequency: string;
}

export interface UnsupportedTargetCompany {
  name: string;
  tier: CompanyTier;
  reason: string;
}

/** Fixed schedule for every monitored company — not editable in the UI. */
const DEFAULT_COMPANY_FREQUENCY = FALLBACK_CRON_EXPRESSION;

/**
 * Verified live against the public ATS APIs on 2026-08-05.
 * Do not invent Workday site paths — a wrong path returns HTTP 422.
 */
export const TARGET_COMPANIES: TargetCompany[] = [
  // ── Tier 1 ──────────────────────────────────────────────────────────────
  {
    name: 'Microsoft',
    tier: 1,
    provider: 'microsoft',
    careerUrl:
      'https://jobs.careers.microsoft.com/global/en/search?q=software%20engineer&lc=India&l=en_us&pg=1&pgSz=20&o=Relevance&flt=true',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Adobe',
    tier: 1,
    provider: 'workday',
    careerUrl: 'https://adobe.wd5.myworkdayjobs.com/external_experienced',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Salesforce',
    tier: 1,
    provider: 'workday',
    careerUrl:
      'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Cisco',
    tier: 1,
    provider: 'workday',
    careerUrl: 'https://cisco.wd5.myworkdayjobs.com/Cisco_Careers',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Dell Technologies',
    tier: 1,
    provider: 'workday',
    careerUrl: 'https://dell.wd1.myworkdayjobs.com/External',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Visa',
    tier: 1,
    provider: 'workday',
    careerUrl: 'https://visa.wd5.myworkdayjobs.com/Visa',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Mastercard',
    tier: 1,
    provider: 'workday',
    careerUrl: 'https://mastercard.wd1.myworkdayjobs.com/CorporateCareers',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'American Express',
    tier: 1,
    provider: 'eightfold',
    careerUrl:
      'https://aexp.eightfold.ai/careers?domain=aexp.com&location=India',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Oracle OCI',
    tier: 1,
    provider: 'oracle',
    careerUrl:
      'https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1?country=IN&locationId=300000000106581&keyword=Software',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },

  // ── Tier 2 ──────────────────────────────────────────────────────────────
  {
    name: 'Razorpay',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/razorpaysoftwareprivatelimited',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'PhonePe',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/phonepe',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Postman',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/postman',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'InMobi',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/inmobi',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Freshworks',
    tier: 2,
    provider: 'smartrecruiters',
    careerUrl: 'https://careers.smartrecruiters.com/Freshworks?country=in',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Zoho',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://www.zoho.com/careers/',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Zerodha',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://careers.zerodha.com',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },

  // ── Tier 3 ──────────────────────────────────────────────────────────────
  {
    name: 'Observe.AI',
    tier: 3,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/observeai',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Sarvam AI',
    tier: 3,
    provider: 'ashby',
    careerUrl: 'https://jobs.ashbyhq.com/sarvam',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Eightfold AI',
    tier: 3,
    provider: 'eightfold',
    careerUrl:
      'https://app.eightfold.ai/careers?domain=eightfold.ai',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Gnani.ai',
    tier: 3,
    provider: 'custom',
    careerUrl: 'https://careers.gnani.ai',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },

  // ── Tier 4 ──────────────────────────────────────────────────────────────
  {
    name: 'NVIDIA',
    tier: 4,
    provider: 'workday',
    careerUrl:
      'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Intel',
    tier: 4,
    provider: 'workday',
    careerUrl: 'https://intel.wd1.myworkdayjobs.com/External',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    // Large India board (~560). Starts disabled — enable + Fetch when ready.
    name: 'Bosch',
    tier: 4,
    provider: 'smartrecruiters',
    careerUrl: 'https://careers.smartrecruiters.com/BoschGroup?country=in',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Siemens',
    tier: 4,
    provider: 'avature',
    careerUrl:
      'https://jobs.siemens.com/en_US/externaljobs/SearchJobs/?keywords=India',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'SAP Labs',
    tier: 4,
    provider: 'sap',
    careerUrl: 'https://jobs.sap.com/search/?locationsearch=India',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Philips',
    tier: 4,
    provider: 'custom',
    careerUrl:
      'https://www.careers.philips.com/global/en/search-results?keywords=&location=India',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'ServiceNow',
    tier: 1,
    provider: 'custom',
    careerUrl: 'https://careers.servicenow.com/jobs/',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },

  // ── Extended (verified boards on existing providers) ─────────────────────
  {
    name: 'Datadog',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/datadog',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Figma',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/figma',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Discord',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/discord',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Stripe',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/stripe',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Airbnb',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/airbnb',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Groww',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/groww',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Coinbase',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/coinbase',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Cloudflare',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/cloudflare',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Twilio',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/twilio',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Dropbox',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/dropbox',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Robinhood',
    tier: 2,
    provider: 'greenhouse',
    careerUrl: 'https://boards.greenhouse.io/robinhood',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Notion',
    tier: 2,
    provider: 'ashby',
    careerUrl: 'https://jobs.ashbyhq.com/notion',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Ramp',
    tier: 2,
    provider: 'ashby',
    careerUrl: 'https://jobs.ashbyhq.com/ramp',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Linear',
    tier: 2,
    provider: 'ashby',
    careerUrl: 'https://jobs.ashbyhq.com/linear',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'OpenAI',
    tier: 3,
    provider: 'ashby',
    careerUrl: 'https://jobs.ashbyhq.com/openai',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Autodesk',
    tier: 4,
    provider: 'workday',
    careerUrl: 'https://autodesk.wd1.myworkdayjobs.com/Ext',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Broadcom',
    tier: 4,
    provider: 'workday',
    careerUrl: 'https://broadcom.wd1.myworkdayjobs.com/External_Career',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'BrowserStack',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://www.browserstack.com/careers',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Chargebee',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://www.chargebee.com/careers/',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'BlackRock',
    tier: 1,
    provider: 'workday',
    careerUrl:
      'https://blackrock.wd1.myworkdayjobs.com/BlackRock_Professional',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Wells Fargo',
    tier: 1,
    provider: 'workday',
    careerUrl: 'https://wf.wd1.myworkdayjobs.com/WellsFargoJobs',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Morgan Stanley',
    tier: 1,
    provider: 'workday',
    careerUrl: 'https://ms.wd5.myworkdayjobs.com/External',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Texas Instruments',
    tier: 4,
    provider: 'oracle',
    careerUrl:
      'https://edbz.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX?country=IN',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Ford',
    tier: 4,
    provider: 'custom',
    careerUrl: 'https://www.careers.ford.com/search-jobs',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Paytm',
    tier: 2,
    provider: 'lever',
    careerUrl: 'https://jobs.lever.co/paytm',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'JP Morgan',
    tier: 1,
    provider: 'oracle',
    careerUrl:
      'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001?country=IN&keyword=Software',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Qualcomm',
    tier: 4,
    provider: 'eightfold',
    careerUrl:
      'https://careers.qualcomm.com/careers?domain=qualcomm.com&location=India',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Goldman Sachs',
    tier: 1,
    provider: 'goldman',
    careerUrl: 'https://higher.gs.com/?query=software&location=India',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },

  // ── India Tier 1 (aggressive) — verified boards / custom careers ────────
  {
    name: 'Fireflies.ai',
    tier: 1,
    provider: 'custom',
    careerUrl: 'https://fireflies.freshteam.com/jobs',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'OLX',
    tier: 1,
    provider: 'lever',
    careerUrl: 'https://jobs.eu.lever.co/olx',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Qrata',
    tier: 1,
    provider: 'smartrecruiters',
    careerUrl: 'https://careers.smartrecruiters.com/Qrata',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Zepto',
    tier: 1,
    provider: 'custom',
    careerUrl: 'https://www.zeptonow.com/careers',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Xoxoday',
    tier: 1,
    provider: 'custom',
    careerUrl: 'https://www.xoxoday.com/careers',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },

  // ── India Tier 2 — verified boards / custom careers ─────────────────────
  {
    name: 'Meesho',
    tier: 2,
    provider: 'lever',
    careerUrl: 'https://jobs.lever.co/meesho',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Swiggy',
    tier: 2,
    provider: 'smartrecruiters',
    careerUrl: 'https://careers.smartrecruiters.com/Swiggy',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Zomato',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://www.eternal.com/careers/',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Flipkart',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://www.flipkartcareers.com/',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Myntra',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://careers.myntra.com/',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'CRED',
    tier: 2,
    provider: 'lever',
    careerUrl: 'https://jobs.lever.co/cred',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Navi',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://navi.com/careers',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Juspay',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://juspay.io/careers',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'ShareChat',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://sharechat.com/careers',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'MakeMyTrip',
    tier: 2,
    provider: 'custom',
    careerUrl: 'https://careers.makemytrip.com/',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },

  // ── India Tier 3 — enterprise ───────────────────────────────────────────
  {
    name: 'Reliance Jio',
    tier: 3,
    provider: 'custom',
    careerUrl: 'https://careers.jio.com',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
  {
    name: 'Accenture',
    tier: 3,
    provider: 'workday',
    careerUrl: 'https://accenture.wd103.myworkdayjobs.com/AccentureCareers',
    enabled: true,
    frequency: DEFAULT_COMPANY_FREQUENCY,
  },
];

/** Still on your list, but blocked until we verify a board URL or harden a scraper. */
export const UNSUPPORTED_TARGET_COMPANIES: UnsupportedTargetCompany[] = [
  {
    name: 'Intuit',
    tier: 1,
    reason: 'Workday site path not verified (common paths return HTTP 422)',
  },
  {
    name: 'Darwinbox',
    tier: 2,
    reason: 'Greenhouse board token no longer public (self-hosted Darwinbox ATS)',
  },
  {
    name: 'HighLevel',
    tier: 2,
    reason: 'No public Greenhouse/Lever/Workday board found',
  },
  {
    name: 'Whatfix',
    tier: 2,
    reason: 'Greenhouse board token no longer public',
  },
  {
    name: 'Unacademy',
    tier: 2,
    reason: 'Greenhouse board token no longer public',
  },
  {
    name: 'CleverTap',
    tier: 2,
    reason: 'Greenhouse board token no longer public (now Kula careers; custom 403)',
  },
  {
    name: 'Krutrim',
    tier: 3,
    reason:
      'No live public Ashby/Greenhouse/Lever board found (careers page moved)',
  },
  {
    name: 'Yellow.ai',
    tier: 3,
    reason:
      'Careers page no longer exposes a public Ashby board slug (API 404)',
  },
  {
    name: 'Kore.ai',
    tier: 3,
    reason: 'No public Greenhouse/Lever/Workday/Ashby board found',
  },
  {
    name: 'Pixis',
    tier: 3,
    reason: 'No public Greenhouse/Lever/Workday/Ashby board found',
  },
  {
    name: 'GE Healthcare',
    tier: 4,
    reason: 'Workday path unverified (common paths return HTTP 422)',
  },
  {
    name: 'Schneider Electric',
    tier: 4,
    reason: 'Workday path unverified (common paths return HTTP 422)',
  },
  {
    name: 'Honeywell',
    tier: 4,
    reason: 'Workday site path unverified',
  },
  {
    name: 'Uber',
    tier: 2,
    reason: 'Workday site path unverified (common paths return HTTP 422)',
  },
  {
    name: 'LinkedIn',
    tier: 2,
    reason: 'Workday board requires auth / path unverified (HTTP 401)',
  },
  {
    name: 'PayPal',
    tier: 2,
    reason: 'Workday site path unverified',
  },
  {
    name: 'Spotify',
    tier: 2,
    reason: 'Workday site path unverified',
  },
  {
    name: 'McKinsey',
    tier: 1,
    reason:
      'Avature apply portal only — public search (mckinsey.com/careers/search-jobs) times out and jobs.mckinsey.com/SearchJobs is WAF-blocked',
  },
  {
    name: 'TagMango',
    tier: 1,
    reason: 'No public Greenhouse/Lever/Ashby/Workday/SmartRecruiters board',
  },
  {
    name: 'Rooh',
    tier: 1,
    reason: 'No public target-ATS board found',
  },
  {
    name: 'SuperKalam',
    tier: 1,
    reason: 'Hiring via forms / LinkedIn — no public ATS board',
  },
  {
    name: 'The Product Highway',
    tier: 1,
    reason: 'Custom / LinkedIn only — no public ATS board',
  },
  {
    name: 'Mattersec',
    tier: 1,
    reason: 'No public careers ATS board found',
  },
  {
    name: 'Dream11',
    tier: 2,
    reason: 'Former Lever board (dreamsports) is dead (API 404); no replacement board',
  },
  {
    name: 'Udaan',
    tier: 2,
    reason: 'Careers page times out / no public target-ATS board',
  },
  {
    name: 'Tata Digital',
    tier: 3,
    reason: 'Custom Tata Neu careers — no public target-ATS board',
  },
  {
    name: 'Tata Technologies',
    tier: 3,
    reason: 'Custom careers portal — no public target-ATS board',
  },
  {
    name: 'TCS',
    tier: 3,
    reason: 'iBegin / proprietary portal — not a supported provider',
  },
  {
    name: 'Infosys',
    tier: 3,
    reason: 'Proprietary Infosys careers portal — not a supported provider',
  },
  {
    name: 'Wipro',
    tier: 3,
    reason:
      'SuccessFactors host is not Career Site Builder (*.jobs.hr.cloud.sap)',
  },
  {
    name: 'Deloitte',
    tier: 3,
    reason:
      'India uses SuccessFactors (southasiacareers.deloitte.com); not CSB-compatible',
  },
  {
    name: 'Capgemini',
    tier: 3,
    reason: 'SuccessFactors portal — not CSB-compatible with current adapter',
  },
  {
    name: 'Cognizant',
    tier: 3,
    reason: 'Phenom careers portal — provider not implemented',
  },
  {
    name: 'LTIMindtree',
    tier: 3,
    reason: 'Custom careers portal — no public target-ATS board',
  },
];

/** Old demo boards — deleted on every seed. */
export const DEMO_COMPANIES_TO_REMOVE = [
  'Stripe (Greenhouse demo)',
  'Lever Demo',
] as const;
