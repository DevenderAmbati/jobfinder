# Company catalog (Tier 1–4 + extended)

Personal target list for the Job Intelligence Platform.

**Providers:** Greenhouse · Lever · Workday · Microsoft · Ashby · SmartRecruiters · SuccessFactors (CSB) · Oracle · Eightfold · Avature · SAP · Goldman · Google · Amazon · Apple · Custom

## Seeded (~125)

| Provider | Companies |
|----------|-----------|
| greenhouse | Razorpay, PhonePe, Postman, InMobi, Observe.AI, Groww, Figma, Discord, Dropbox, Datadog*, Stripe*, Airbnb*, Coinbase*, Cloudflare*, Twilio*, Robinhood*, Anthropic, Databricks, MongoDB, Okta, Brex, Elastic, Pinterest, Scale AI, Affirm, Block, GitLab, Lyft, Reddit, Asana, Klaviyo, Instacart, Gusto, Vercel, Duolingo, Chime, Mercury, Webflow |
| ashby | Sarvam AI, Notion, Ramp, Linear, OpenAI*, Harvey, ElevenLabs, Sierra, Cursor, Perplexity, Replit, Cognition, Browserbase, **Snowflake**, **Confluent**, **Plaid**, **Checkout.com**, **UiPath** |
| lever | Paytm, Meesho, CRED, OLX (EU), **Palantir** |
| workday | Adobe…Mastercard, NVIDIA, Intel, Autodesk*, Broadcom*, BlackRock*, Wells Fargo*, Morgan Stanley*, Accenture*, **CrowdStrike***, **Target***, **Workday***, **Walmart Global Tech*** |
| oracle | Oracle OCI, Texas Instruments, JP Morgan* |
| eightfold | Amex, Eightfold AI*, Qualcomm* |
| goldman | Goldman Sachs* |
| smartrecruiters | Freshworks, Bosch*, Swiggy, Qrata, **Canva***, **Turnitin*** |
| google | **Google*** (India-filtered) |
| amazon | **Amazon*** (India software-development JSON) |
| apple | **Apple*** (India Playwright) |
| custom | Zoho, Zerodha, Philips, Gnani, BrowserStack, Chargebee, ServiceNow*, Ford, Fireflies.ai, Zepto, Xoxoday, Zomato, Flipkart, Myntra, Navi, Juspay, ShareChat, MakeMyTrip, Reliance Jio, **Atlassian**, **Intuit**, **AMD**, **Nutanix**, **HSBC**, **Thoughtworks**, **Publicis Sapient**, **EPAM Systems** |
| other | Microsoft, Siemens, SAP Labs |

\*Large boards — Fetch on Companies when ready (can take minutes).

## Instagram 30+ LPA coverage

Already monitored from that list: Postman, Razorpay, Groww, Databricks, Twilio, Okta, Elastic, Figma, Brex, Stripe, Coinbase, PhonePe, Airbnb, Dropbox, CRED, Paytm, Meesho, Salesforce, Adobe, NVIDIA, Intel, BlackRock, Morgan Stanley, Microsoft, Goldman Sachs, JP Morgan, American Express, Qualcomm, SAP Labs, Swiggy, BrowserStack, Chargebee, Juspay, ServiceNow, Flipkart, Zepto, Zomato, plus the newly seeded names above.

**Skipped / covered elsewhere:** VMware → use existing Broadcom board (acquisition; avoid duplicate jobs).

## Still unsupported

Blinkit, Dunzo, Uber, Darwinbox, HighLevel, Whatfix, Unacademy, CleverTap, Krutrim, Yellow.ai, Kore.ai, Pixis, GE Healthcare, Schneider, Honeywell, LinkedIn, PayPal, Spotify, McKinsey, TagMango, Rooh, SuperKalam, The Product Highway, Mattersec, Dream11, Udaan, Tata Digital, Tata Technologies, TCS, Infosys, Wipro, Deloitte, Capgemini, Cognizant, LTIMindtree.

Most enterprise India portals (TCS/Infosys/Wipro/Deloitte/…) use proprietary or SuccessFactors hosts our adapter cannot scrape yet. Blinkit/Dunzo have no public ATS board.

## Re-seed

```bash
cd backend
npm run prisma:seed
```

Then **Companies → Fetch now**. Large boards can take minutes.
