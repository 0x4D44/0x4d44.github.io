# Research and validation audit

Edition checked: **15 September 2026**. This is an editorial audit trail, not independent clinical sign-off. The reader-facing bibliography and access limitations are in `index.html#sources`.

## Findings cross-checked at final review

| Item | What the guide preserves | Primary or official record |
| --- | --- | --- |
| EULAR recommendations | The title says **2025**, but online publication was **21 July 2026**. Recommendations were checked at abstract level, not as an independently extracted complete guideline. | [PubMed 42481270](https://pubmed.ncbi.nlm.nih.gov/42481270/) and the linked author-institution abstract |
| Methotrexate trial | Online **21 December 2025**, April 2026 issue. The common steroid-taper protocol lasted 24 weeks. The week-52 endpoint required PMR-AS below 10 and no glucocorticoid use; the primary statistical test was one-sided. The distinction between 64 recruited and 58 analysed remains explicit. | [PubMed 41423373](https://pubmed.ncbi.nlm.nih.gov/41423373/) |
| REPLENISH | Online **3 June 2026**, August issue. Trial success is separated from a licence or reimbursement decision. Abstract/indexed-record extraction is disclosed. | [PubMed 42234540](https://pubmed.ncbi.nlm.nih.gov/42234540/) |
| Sarilumab | UK PMR indication is distinguished from Scotland's **12 May 2025 SMC2810 non-submission advice**. A non-submission is not a completed negative efficacy appraisal. | [UK SmPC](https://www.medicines.org.uk/emc/product/15436/smpc), [SMC2810](https://scottishmedicines.org.uk/medicines-advice/sarilumab-kevzara-nonsub-smc2810/) |
| SAPHYR and PMR-SPARE | Different study populations, endpoints and steroid tapers are visible; the page does not rank drugs by comparing their headline percentages across studies. | Sources 12, 13 and 16 in the guide |
| Norwegian mortality cohort | A **38-year study period** is not described as 38 years of follow-up for every participant. Reassuring overall mortality is not equated with absence of morbidity. | [Original cohort report](https://link.springer.com/article/10.1186/s13075-025-03613-9) |
| Long-term glucocorticoid use | Pooled time-point estimates are not presented as a single cohort's survival curve or an individual prognosis. | [Original meta-analysis](https://link.springer.com/article/10.1007/s10067-021-05819-z) |

All source links were chosen to identify the underlying document, not merely a news report. Some papers were available only through abstracts/indexed records; the guide does not claim full-text access to them. Current product labels and local funding advice should be rechecked before any clinical use.

## Visual and interaction boundaries

Anatomy, daily-rhythm curves, arterial geometry, signal diagrams and the disease/adrenal sequence are explicitly illustrative. The medication-reduction figure performs arithmetic only. It is not a taper generator. Trial bars and pooled treatment-duration percentages use the stated source values. No interface accepts personal clinical inputs or generates a diagnosis, prescription or forecast.

The urgent GCA warning, weekly-methotrexate warning, and instruction not to abruptly stop prolonged steroid treatment are plain HTML and remain available without JavaScript. Numbered citations have descriptive accessible names.

## Browser-test correction

An early regression test incorrectly flagged ordinary in-flow citations after they scrolled behind the opaque sticky masthead. That is normal scrolling, not a permanently inaccessible control. The revised test checks **all controls at the top of the page**, checks **fixed/sticky controls at multiple scroll positions**, and independently uses browser hit-testing to confirm the visible masthead links and buttons receive pointer events. Horizontal-overflow checks remain in place at 320, 390, 768, 1440 and 1920 pixels.

The committed suite also covers every interactive figure, trial values, internal anchors, no-JavaScript reading, keyboard activation, reduced motion, print-state restoration and Almanac integration. An optional axe-core audit can report WCAG A/AA findings and retain screenshots. Automated accessibility checks do not establish full accessibility conformance; software tests do not validate medical advice.

## Publication boundary

The site and PR are a researched educational draft for maintainer review. They have **not been independently clinically reviewed**. Clinical review remains important before representing the material as clinically endorsed patient information. Merge and deployment are maintainer operations, not part of this guide.
