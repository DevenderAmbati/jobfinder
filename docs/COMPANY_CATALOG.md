# Company catalog (Tier 1–4 + extended)

Personal target list for the Job Intelligence Platform.

**Providers:** Greenhouse · Lever · Workday · Microsoft · Ashby · SmartRecruiters · SuccessFactors (CSB) · Oracle · Eightfold · Avature · SAP · Goldman · Custom

## Seeded (~55)

| Provider | Companies |
|----------|-----------|
| greenhouse | Razorpay, PhonePe, Postman, InMobi, Observe.AI, Groww, Figma, Discord, Dropbox, Datadog*, Stripe*, Airbnb*, Coinbase*, Cloudflare*, Twilio*, Robinhood* |
| ashby | Sarvam AI, Notion, Ramp, Linear, OpenAI* |
| lever | **Paytm** |
| workday | Adobe…Mastercard, NVIDIA, Intel, Autodesk*, Broadcom*, BlackRock*, Wells Fargo*, Morgan Stanley* |
| oracle | Oracle OCI, Texas Instruments, **JP Morgan*** |
| eightfold | Amex, Eightfold AI*, **Qualcomm*** |
| goldman | **Goldman Sachs*** |
| smartrecruiters | Freshworks, Bosch* |
| custom | Zoho, Zerodha, Philips, Gnani, BrowserStack, Chargebee, ServiceNow*, Ford |
| other | Microsoft, Siemens, SAP Labs |

\*Large boards are enabled by default — Fetch on Companies when ready (can take minutes).

## Still unsupported

Intuit, Darwinbox, HighLevel, Whatfix, Unacademy, CleverTap, Krutrim, Yellow.ai, Kore.ai, Pixis, GE Healthcare, Schneider, Honeywell, Uber, LinkedIn, PayPal, Spotify, **McKinsey** (Avature apply portal; public search WAF/timeout).

## Re-seed

```bash
cd backend
npm run prisma:seed
```

Then **Companies → Enable → Fetch now**. Large boards can take minutes.
