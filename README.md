# Veil

**The AI that reads your blood report without learning your name.**

Veil explains a lab report in plain language. Gemini Nano, running inside Chrome, reads the report and seals everything that says who you are. Cloud Gemini only ever receives anonymous numbers, and you watch the exact packet before it leaves.

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) with **Firebase AI Logic hybrid inference** (Web / Chrome, Gemini Nano).

## Why

A lab report is the most common medical document people are handed and the least explained. So people paste it into a chatbot, with their name, phone number, address and patient ID still on the page. The choice today is "private but shallow" (a small local model) or "good but exposed" (a cloud model). Hybrid inference removes that choice: the private part of the job runs on the device, and only the part that is safe to share goes to the cloud.

## How it works

```
 report (text or photo)                         ON THIS DEVICE
        │
        ▼
 1. Seal      deterministic rules replace names, IDs, phones, emails, addresses, dates
        │
        ▼
 2. Read      Firebase AI Logic · ONLY_ON_DEVICE (strict) or PREFER_ON_DEVICE (hybrid)
        │     Gemini Nano → structured JSON: analytes + any identifiers the rules missed
        ▼
 3. Airlock   packet rebuilt from values only, re-checked by rules, shown to the user
 ═══════╪══════════════════════════════════════ the only crossing, opened by the user
        ▼                                       CLOUD
 4. Explain   Firebase AI Logic · PREFER_IN_CLOUD (falls back to Nano when offline)
        │     Gemini → structured explanation in the user's language
        ▼
 5. Ask       Firebase AI Logic · PREFER_ON_DEVICE, streamed follow-up answers
```

Every call is written to an in-memory **privacy ledger** with the inference mode Veil asked for, the `inferenceSource` the SDK reported back, the latency and the exact payload. The "Privacy receipt" on the result screen is built from that ledger, not from a promise.

### Where Firebase AI Logic is called

All model calls are in [`src/lib/ai.ts`](src/lib/ai.ts):

| Stage | Call | Mode | Why |
| --- | --- | --- | --- |
| Model warm-up | `initializeDeviceModel()` | – | Starts the Gemini Nano download from a user gesture and shows progress |
| Read | `generateContent()` with text or an inline image | `ONLY_ON_DEVICE` / `PREFER_ON_DEVICE` | The only stage that can see identity. Strict mode fails closed instead of falling back |
| Explain | `generateContent()` with a response schema | `PREFER_IN_CLOUD` / `ONLY_ON_DEVICE` | Needs medical depth and languages; safe because the packet is anonymous. Works offline on Nano |
| Ask | `generateContentStream()` | `PREFER_ON_DEVICE` | Short answers, instant and private |

Structured output is enforced on both sides: `responseSchema` in the cloud and `responseConstraint` on-device. `response.inferenceSource` drives the on-device / cloud badges in the UI.

### The boundary does not trust a model

- Rules in [`src/lib/scrub.ts`](src/lib/scrub.ts) run before any model sees the text.
- The on-device model adds identifiers the rules missed.
- The outbound packet is rebuilt from analyte fields only. Each field is re-checked; anything that matches a known identifier, an email, or unexpected characters is dropped and reported.
- Exact age becomes an age band.
- A photo cannot be rule-scrubbed, so it never goes to the cloud without an explicit yes in a consent dialog that says what would be exposed.

### Other Firebase products

- **App Check** (reCAPTCHA) protects the AI Logic endpoint.
- **Remote Config** sets the cloud model and the explanation tone without a redeploy.
- **Anonymous Auth + Firestore** keep a private history of anonymous values only. `firestore.rules` rejects any other field.
- **Hosting** serves the app; it is a PWA, so the on-device path works offline.

## Try it

1. Open the demo in Chrome desktop 139 or newer. The pill in the header shows the state of the on-device model; click it to download Gemini Nano if needed.
2. Pick one of the invented sample reports (or the sample photo) and press **Read it privately**.
3. Watch the identifiers get sealed, inspect the packet in the airlock, then open it.
4. Open the **Privacy ledger** (shield icon) to see every call, its mode, where it ran and its payload.
5. Turn Wi-Fi off and run it again: everything, including the explanation, runs on the device.

In a browser without Gemini Nano, Veil asks before sending rule-scrubbed text to the cloud, so the whole flow still works.

## Run locally

```bash
npm install
cp .env.example .env.local   # paste your Firebase web app config
npm run dev
```

Firebase setup: create a project, add a web app, enable **AI Logic** (Gemini Developer API), **Anonymous** sign-in, **Firestore** (deploy `firestore.rules`), and optionally App Check and Remote Config (`cloud_model`, `explain_tone`).

```bash
npm test         # privacy boundary tests
npm run lint
npm run build    # then: firebase deploy
```

## Stack

React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion, Web Audio (all sound is synthesised, no audio files), Firebase JS SDK 13 (`firebase/ai`, App Check, Auth, Firestore, Remote Config), Firebase Hosting.

## Limits

Veil explains results; it does not diagnose or prescribe. The sample reports and every person in them are invented. On-device inference needs Chrome desktop with Gemini Nano; PDFs must be screenshotted because on-device input is text and JPEG/PNG.

## License

[Apache 2.0](LICENSE)
