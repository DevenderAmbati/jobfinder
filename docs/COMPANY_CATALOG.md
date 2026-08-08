# Company catalog (Tier 1–4 + extended)

Personal target list for the Job Intelligence Platform.

**Providers:** Greenhouse · Lever · Workday · Microsoft · Ashby · SmartRecruiters · SuccessFactors (CSB) · Oracle · Eightfold · Avature · SAP · Goldman · Custom

## Seeded (~73)

| Provider | Companies |
|----------|-----------|
| greenhouse | Razorpay, PhonePe, Postman, InMobi, Observe.AI, Groww, Figma, Discord, Dropbox, Datadog*, Stripe*, Airbnb*, Coinbase*, Cloudflare*, Twilio*, Robinhood* |
| ashby | Sarvam AI, Notion, Ramp, Linear, OpenAI* |
| lever | Paytm, **Meesho**, **CRED**, **OLX** (EU) |
| workday | Adobe…Mastercard, NVIDIA, Intel, Autodesk*, Broadcom*, BlackRock*, Wells Fargo*, Morgan Stanley*, **Accenture*** |
| oracle | Oracle OCI, Texas Instruments, JP Morgan* |
| eightfold | Amex, Eightfold AI*, Qualcomm* |
| goldman | Goldman Sachs* |
| smartrecruiters | Freshworks, Bosch*, **Swiggy**, **Qrata** |
| custom | Zoho, Zerodha, Philips, Gnani, BrowserStack, Chargebee, ServiceNow*, Ford, **Fireflies.ai**, **Zepto**, **Xoxoday**, **Zomato**, **Flipkart**, **Myntra**, **Navi**, **Juspay**, **ShareChat**, **MakeMyTrip**, **Reliance Jio** |
| other | Microsoft, Siemens, SAP Labs |

\*Large boards — Fetch on Companies when ready (can take minutes).

## Already monitored (from your Tier 2 list)

Razorpay, PhonePe, Freshworks, Zoho, Groww, BrowserStack, Postman — already seeded.

## Still unsupported

Intuit, Darwinbox, HighLevel, Whatfix, Unacademy, CleverTap, Krutrim, Yellow.ai, Kore.ai, Pixis, GE Healthcare, Schneider, Honeywell, Uber, LinkedIn, PayPal, Spotify, McKinsey, **TagMango**, **Rooh**, **SuperKalam**, **The Product Highway**, **Mattersec**, **Dream11**, **Udaan**, **Tata Digital**, **Tata Technologies**, **TCS**, **Infosys**, **Wipro**, **Deloitte**, **Capgemini**, **Cognizant**, **LTIMindtree**.

Most enterprise India portals (TCS/Infosys/Wipro/Deloitte/…) use proprietary or SuccessFactors hosts our adapter cannot scrape yet.

## Re-seed

```bash
cd backend
npm run prisma:seed
```

Then **Companies → Enable → Fetch now**. Large boards can take minutes.
