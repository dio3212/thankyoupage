# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose
customer data, corrupt purchase attribution, or allow event spoofing.

Email `dio3212@gmail.com` with:

- a concise description of the issue;
- affected page and browser;
- reproduction steps or proof of concept;
- expected impact;
- any suggested mitigation.

You should receive an acknowledgement within 7 days. Confirmed issues will be
prioritized according to their effect on customer privacy, purchase-event
integrity, and availability.

## Supported version

The latest commit on the `main` branch is supported.

## Deployment responsibility

This repository contains browser-side reference code. Deployers must keep
server credentials outside the HTML, secure their survey destination, and
follow the privacy and consent requirements that apply to their users.
