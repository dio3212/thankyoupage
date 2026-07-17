# Contributing

Thank you for helping improve Thank-you Page Attribution.

## Before opening a change

- Open an issue for behavior changes or new integrations.
- Keep customer-specific details out of examples and tests.
- Do not commit API keys, access tokens, or server-side credentials.
- Preserve browser/server purchase-event deduplication.
- Preserve the survey delivery fallback unless the replacement is tested.

## Development

1. Fork the repository and create a focused branch.
2. Make the smallest change that solves the issue.
3. Run `npm test`.
4. Test the affected page at mobile and desktop widths.
5. Open a pull request that explains the user-facing effect and verification.

## Pull-request checklist

- [ ] Both production pages still load as static HTML.
- [ ] Purchase events require a valid `tradeNo`.
- [ ] `eventID` remains aligned with server-side CAPI deduplication.
- [ ] Survey submission retains a background-safe delivery path.
- [ ] No secrets or unnecessary personal data were added.
- [ ] `npm test` passes.

By contributing, you agree that your contribution is licensed under the MIT
License.
