# 27 — Regional Fact Sheet (one per region)

Purpose: the six region pages (Central Coast, Newcastle, Dubbo, Orange, Tamworth, Gunnedah) are currently short templates, and the build warns that they are 81 to 100 percent alike. They become genuinely useful, and stop looking like duplicate pages to search engines, only when each one carries real local facts. This sheet is what operations supplies. Copy it once per region and return it to the engineer. Nothing on it is published until the compliance reviewer approves it.

**Rules for whoever fills it in**

1. Write only what is true today and that you can show evidence for. Leave a field blank rather than guess.
2. Do not include street addresses, phone numbers or email addresses for people or premises. Whether a premises may be published is a separate owner decision (questions C-1 and C-2 in `22`).
3. Do not name a participant, a family or a staff member. Do not describe anyone's health or circumstances.
4. Do not use "best", "leading", "most trusted", "approved by the NDIS", or promises about results or response times.
5. List an organisation only if it has agreed, in writing, to be named. Keep that written permission somewhere safe outside this repository and write its reference below.
6. The person named under "Checked by" is responsible for the facts. It must be a person, not a tool.

**Sheet**

| Field | What to write | Limit | Your answer |
|---|---|---|---|
| Region | One of: Central Coast, Newcastle, Dubbo, Orange, Tamworth, Gunnedah | | |
| Does AblePoint support people in this region today? | Yes or no. If no, the page will not be published | | |
| Towns and suburbs supported from here | A list, for example the towns where staff actually provide supports | 1 to 60 characters each | |
| About support here (up to 3 short paragraphs) | Original, factual context: what kinds of supports are offered here and how they are organised. No eligibility statements and no outcomes | 40 to 500 characters each | |
| Services available here | Tick each one that is genuinely available now: core support, supported independent living, specialist disability accommodation, short term accommodation, support coordination, community access | | |
| Capacity statement | Internal only. For example whether new referrals can be taken. Never published | | |
| Local organisations we work with | Name, type (hospital, council, health district, community organisation, other), website, and the reference to the written permission to be named | https links only | |
| Getting around | Transport and community access notes that help a family plan | 40 to 500 characters | |
| Checked by (name) | A real person at AblePoint | | |
| Date checked | Day, month, year | | |

**What happens next**

1. The engineer enters the answers into the region's `facts` record. The build rejects a fact sheet that contains a street address, a phone number, an email, banned wording, an AI-looking verifier, a partner without a permission reference or a non-https link (`apps/web/src/lib/region-facts.ts`, tested).
2. The page then shows only the sections you filled in, plus "Local details last checked" with the date. The checker's name and the permission references are never shown on the website or in the API.
3. The compliance reviewer approves the region page. Until then it stays a draft and is hidden from the production site.
4. Review again every six months, or sooner if anything changes.
