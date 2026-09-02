# Ownership-data policy

## Decision

LyfeOS is a closed-source product. It must not integrate OpenCorporates data
under a free/open-data plan unless the product owner and legal review confirm
that the exact product and database distribution model satisfies its current
licence terms. Until then, OpenCorporates is excluded from LyfeOS production.

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

## Review and privacy boundary

An ownership report is private by default. It enters the review queue only
when its author explicitly opts in at submission. A narrowly authorized
ownership reviewer may see only the submitted brand, barcode, report type,
note, and source URL—not the reporter's pantry, health records, account data,
or other LyfeOS activity. The reviewer must make an explicit publish or reject
decision. Publishing creates an append-only cited revision; it is never an
automatic consequence of a report.

## Free-source stack

| Source | Use | License / access boundary |
| --- | --- | --- |
| Open Food Facts | barcode, ingredient, and nutrition candidates | ODbL attribution and reuse obligations |
| USDA FoodData Central | U.S. nutrition and branded-food candidates | free data.gov-key access |
| openFDA | recall research | free API access, rate limited |
| SEC EDGAR | public-parent and filing research | public API, fair-access limits |
| OpenCorporates | excluded pending a compatible commercial agreement or legal confirmation | do not use the free plan for the closed-source product |

## Closed-source operating path

1. Use official company portfolios, acquisition announcements, and SEC EDGAR
   sources for ownership research.
2. Preserve the source URL, access date, and reviewer decision for every
   published brand profile.
3. Do not scrape retailer sites or company registries contrary to their terms.
4. Reconsider OpenCorporates only if LyfeOS obtains a compatible paid licence
   or qualified legal advice confirms a compliant distribution arrangement.

This document is product policy, not legal advice. Obtain legal review before
shipping a public ownership-data export or making a source-code license choice.
