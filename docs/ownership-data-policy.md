# Ownership-data policy

## Decision

LyfeOS will keep its consumer-brand ownership registry available as open data
under the Open Database License 1.0 (ODbL), with source attribution and
share-alike obligations preserved for any OpenCorporates-derived data.

LyfeOS application source code is licensed separately. Choosing ODbL for the
ownership dataset does not by itself select a source-code license.

## Evidence standard

An external company-record result is research material, not a brand-ownership
conclusion. LyfeOS may publish a brand profile only after a human reviewer has
linked the brand to the relevant legal entity and added cited, date-stamped
evidence. Missing evidence must remain `unknown`.

Every published profile must retain:

- the queried brand and legal-entity identity;
- the original source URL and access date;
- any required OpenCorporates attribution and ODbL notice;
- the reviewer decision and correction history;
- a clear distinction between company statements, regulatory filings, and
  acquisition announcements.

## Free-source stack

| Source | Use | License / access boundary |
| --- | --- | --- |
| Open Food Facts | barcode, ingredient, and nutrition candidates | ODbL attribution and reuse obligations |
| USDA FoodData Central | U.S. nutrition and branded-food candidates | free data.gov-key access |
| openFDA | recall research | free API access, rate limited |
| SEC EDGAR | public-parent and filing research | public API, fair-access limits |
| OpenCorporates | legal-entity research candidates | free only for compatible open-data use; API token required |

## OpenCorporates activation checklist

1. Create a free API account under the organization that will operate LyfeOS.
2. Read and accept the current OpenCorporates attribution and share-alike
   requirements.
3. Store the token only in the production secret manager as
   `OPEN_CORPORATES_API_TOKEN`; never place it in source control or chat.
4. Enable the research adapter only after the public ownership-data notice and
   attribution view are available.
5. Treat every lookup as candidate research until a human reviewer publishes
   cited evidence.

This document is product policy, not legal advice. Obtain legal review before
shipping a public ownership-data export or making a source-code license choice.
