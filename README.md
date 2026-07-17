# Thank-you Page Attribution

[![Validate pages](https://github.com/dio3212/thankyoupage/actions/workflows/validate.yml/badge.svg)](https://github.com/dio3212/thankyoupage/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A zero-build, dependency-free set of post-purchase pages used in production by
[Dio Academy](https://dioacademy.tw), an independent education business in
Taiwan.

The project addresses a common gap for small course businesses: the hosted
checkout owns the payment flow, while the merchant still needs reliable
purchase attribution, customer-source feedback, and safe browser/server event
deduplication.

## What it does

- Serves separate online-course and in-person-course confirmation pages.
- Sends Meta Purchase events only when a real `tradeNo` is present.
- Uses the order number as `eventID` so browser events can be deduplicated
  against server-side Conversions API events.
- Prevents repeat browser events after refresh with `localStorage`.
- Captures a one-click attribution survey.
- Prefers `navigator.sendBeacon`, with `fetch` and `keepalive` as a fallback.
- Filters unresolved checkout placeholders before data is submitted.
- Runs as static HTML on GitHub Pages, with no build step or runtime dependency.

## Data flow

```text
Hosted checkout
    |
    | redirects with order parameters
    v
Static thank-you page
    |-- Meta Pixel Purchase event
    |     `-- eventID = tradeNo <--> server-side CAPI deduplication
    |
    `-- one-click attribution survey
          `-- Apps Script endpoint --> Google Sheets
```

## Repository layout

```text
.
├── index.html                 # Online-course purchase confirmation
├── inperson/index.html        # In-person-course confirmation
├── tests/validate-pages.mjs   # Dependency-free regression checks
└── .github/workflows/         # Pull-request and push validation
```

The root pages are the production deployment. Forks should replace the
business-specific copy and configuration described below.

## Configure a fork

Search both HTML files and replace:

| Setting | Purpose |
| --- | --- |
| Meta Pixel ID | Browser analytics destination |
| Purchase value and currency | Revenue attribution |
| `content_ids` | Product-catalog matching |
| `SURVEY_ENDPOINT` | Survey receiver, such as an Apps Script web app |
| Checkout and course URLs | Post-purchase offer links |
| Course copy and contact details | Your customer-facing content |

The Apps Script URL and Pixel ID are public browser configuration, not secrets.
Never embed API keys, access tokens, or server-side credentials in these files.

## Validate changes

Node.js 20 or newer is recommended.

```bash
npm test
```

The test suite checks the two production pages for the attribution and
reliability safeguards that are easiest to break during copy changes. GitHub
Actions runs the same checks for every push and pull request.

## Privacy and security

The survey payload can include URL parameters, referrer, and user-agent data.
Deployers are responsible for obtaining any consent required in their
jurisdiction, minimizing personal data, restricting access to the destination
sheet, and defining a retention policy.

Security reports should follow [SECURITY.md](SECURITY.md).

## Maintenance

This repository is actively maintained for a live education workflow. Changes
are kept deliberately small because purchase-event accuracy affects advertising
optimization and customer attribution. Contributions that improve portability,
testing, accessibility, privacy, or documentation are welcome.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

## License

[MIT](LICENSE)
