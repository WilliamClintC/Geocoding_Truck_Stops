# Geocoding Truck Stops

**Project completed under Prof. Ron Yang and Sarah Armitage**

## Table of Contents

- [Overview](#overview)
- [Challenges](#challenges)
- [Data Sources and Collection Timeline](#data-sources-and-collection-timeline)
- [Matching Methodology](#matching-methodology)
- [Coordinate Reconciliation](#coordinate-reconciliation)
- [Final Output](#final-output)
- [Project Structure](#project-structure)
- [Pipeline Overview](#pipeline-overview)
- [Running the Pipeline](#running-the-pipeline)
- [Notes](#notes)

## Overview

This study utilizes a truck stop directory dataset (*The Trucker's Friend: National Truck Stop Directory*) containing information about individual truck stops across the years 2006-2016. Notably, the original dataset does not include geographic coordinates (latitude and longitude). The primary objective of this project is to systematically extract and assign accurate geographic coordinates to each of the ~38,000 truck stop entries.

This is accomplished by cross-referencing the OCR-extracted directory records against multiple online data sources ([Truck Stops and Services](output/0_raw/1_truckstops_services_webscraped.csv), [Yelp](output/0_raw/2_yelp_webscraped.csv), [Yellow Pages](output/0_raw/3_yellowpages_webscraped.csv), and [iExit](output/0_raw/4_iexit_webscraped.csv), which was scraped but not integrated into matching due to time constraints), matching entries via phone numbers and hierarchical address criteria, and reconciling coordinates across sources using distance-based validation.

More details on the matching processes and the intermediate/raw files are available in the [Geocoding Documentation](docs/geocoding_documentation.pdf).

**Primary outputs:**

- [data/1_derived/5_geocode_truck_stops/8_final_truck_stops_manual.csv](data/1_derived/5_geocode_truck_stops/8_final_truck_stops_manual.csv): The main processed dataset containing all cleaned and geocoded truck stop records (38,135 rows, 31 columns).
- [data/1_derived/5_geocode_truck_stops/9_supplementary.csv](data/1_derived/5_geocode_truck_stops/9_supplementary.csv): Supplementary file with all matched scraped fields, address standardization, and distance metrics (38,135 rows, 153 columns).

## Challenges

### Inconsistent Addresses

Addresses in the dataset fall into the following categories:

- **Standard addresses**: Include a street number and road name, allowing for straightforward geocoding.
- **Exit-based addresses**: Reference a highway and exit number, but may lack a full street address.
- **Non-standard addresses**: Do not conform to either of the above formats, such as entries that only specify the intersection of two streets or other ambiguous location descriptions.

### Age

A further complication arises from the temporal nature of the dataset. Several locations are historical or no longer in operation.


## Data Sources and Collection Timeline

The project utilized four sources to gather truck stop information and geographic coordinates:

### 1. Truck Stops and Services / RVers and Travellers Website Scraping
**Date Scraped: June 13, 2025**

- **RVers and Travellers**: http://www.rvandtravelers.com/
- **Truck Stops and Services**: https://www.truckstopsandservices.com/

These two websites share similar formatting but with slightly different availability of stop information. RVers and Travellers is geared towards RV users but still contains relevant truck stops, while Truck Stops and Services is specifically geared towards trucks.

![Truck Stops and Services Website](docs/images/Screenshot%202025-07-16%20001757.png)
*Example of Truck Stops and Services website scraped*

![RVers and Travellers Website](docs/images/Screenshot%202025-07-16%20002154.png)
*Example of RVers and Travellers website scraped*

### 2. Yellow Pages Scraping
**Date Scraped: July 6, 2025**

- **Yellow Pages**: https://www.yellowpages.com/

Yellow Pages was scraped to gather additional truck stop business information and was querried through phone numbers. 

![Yellow Pages Search Results](docs/images/Screenshot%202025-07-16%20011959.png)
*Yellow Pages website scraped*

![Yellow Pages Business Listings](docs/images/Screenshot%202025-07-16%20012037.png)
*Yellow Pages website scraped*

### 3. Yelp API Integration
**Date Accessed: June 25, 2025**

- **Yelp API**: https://www.yelp.com/

The Yelp API was utilized to query truck stop phone numbers.

![Yelp API Data](docs/images/Screenshot%202025-07-16%20013928.png)
*Example of Yelp API website*

### 4. iExit Highway Data
**Date Scraped: July 13, 2025**

- **iExit**: https://www.iexit.com/

iExit was scraped to obtain highway exit coordinates, providing a supplementary source for exit-based addresses. The scrape was completed, but matching against the truck stop directory was not integrated before the project concluded.

### Summary

| Source | Output | Records |
|--------|--------|---------|
| TruckStopsAndServices.com + RVAndTravelers.com | [1_truckstops_services_webscraped.csv](output/0_raw/1_truckstops_services_webscraped.csv) | 15,526 |
| Yelp API (phone-based lookup) | [2_yelp_webscraped.csv](output/0_raw/2_yelp_webscraped.csv) | 15,689 |
| YellowPages.com (Puppeteer scraper) | [3_yellowpages_webscraped.csv](output/0_raw/3_yellowpages_webscraped.csv) | 10,533 |
| iExit.com (Node.js batch processor) | [4_iexit_webscraped.csv](output/0_raw/4_iexit_webscraped.csv) | ~107,000 |

These scraped outputs are pre-populated in [output/0_raw/](output/0_raw/) and are not fully replicable (rate limits, site changes, API quotas).

## Matching Methodology

Following data collection, three independent reference datasets were assembled. The next step involved systematically matching these reference datasets to the original truck stop directory to assign geographic coordinates.

### Phone Number Matching

The first approach relies on direct matching of entries based on phone numbers. Phone numbers obtained from Yelp, Yellow Pages, and Truck Stops and Services are matched against the phone numbers in the original directory. This method is straightforward and effective when phone records are consistent.

### Place Name to ZIP Code Matching

The second approach employs a hierarchical matching strategy:

1. First matched by **state or ZIP code**, then
2. narrowed further by **city or highway exit**, then
3. narrowed further by **road name**, then
4. finally matched by **business or place name**

Using these matching methodologies, each entry in the original truck stop directory could be associated with up to four potential matches: three derived from phone number-based matching (utilizing data from Yelp, Yellow Pages, and Truck Stops and Services) and one from the hierarchical place name to ZIP code matching approach.

## Coordinate Reconciliation

A notable challenge was the occurrence of false positives. Inconsistencies in phone number records and documented inaccuracies in latitude and longitude values across all data sources resulted in multiple, or conflicting, geographic coordinates for a single truck stop entry. The following distance-based validation methodology was implemented:

### Case 1: Multiple Matches

When multiple coordinates are available from different sources, we calculate the Haversine distance between all cross-source coordinate pairs (excluding pairs from the same source). The pair with the minimum distance is selected, and if it falls within 200 meters, the midpoint of the two coordinates is used as the final coordinate. If the minimum distance exceeds 200 meters, the entry is flagged for manual review.

### Case 2: Single or No Match

If only one source provides a match, or if no matches are found, the entry is flagged for manual review and correction.

### Case 3: Hierarchical Matching

When multiple matches are available, the reconciliation follows a hierarchical decision rule that prioritizes agreement with Truck Stops and Services (the most reputable source):

1. Prefer coordinate pairs that include the Truck Stops and Services source; among those, select the smallest distance
2. If no Truck Stops and Services pair exists, select the absolute smallest distance across all pairs
3. If the selected pair is within the 200m threshold, use the midpoint as the final coordinate. Otherwise, flag for manual validation

## Final Output

The primary outputs are:

- [data/1_derived/5_geocode_truck_stops/8_final_truck_stops_manual.csv](data/1_derived/5_geocode_truck_stops/8_final_truck_stops_manual.csv): The main processed dataset containing all cleaned and geocoded truck stop records (38,135 rows, 31 columns).
- [data/1_derived/5_geocode_truck_stops/9_supplementary.csv](data/1_derived/5_geocode_truck_stops/9_supplementary.csv): Supplementary file with all matched scraped fields, address standardization, and distance metrics (38,135 rows, 153 columns).

Coordinate completion: **~91.0%** of rows have final coordinates (34,699 / 38,135) addresses.

The following sections describe the fields in the main output file.

| Field | Category | Description |
|---|---|---|
| `clean_line1`, `clean_line2`, `line3` | Original | Raw OCR-read address lines from the directory |
| `label` | Original | Name of the truck stop |
| `city`, `zip_code`, `state`, `major_city` | Original | Location identifiers |
| `phone` | Original | Phone number |
| `year` | Original | Directory year the record was sourced from |
| `chain` | Original | Truck stop chain or franchise affiliation |
| `Address_Type` | Processed | Address category: `Exit`, `Proper`, or `Empty` |
| `Main_Road` | Processed | Primary road or highway name |
| `Secondary_Road` | Processed | Secondary road or intersecting highway |
| `Tertiary_Road` | Processed | Third road when applicable |
| `Exit_Number`, `Exit_Number_2`, `Exit_Number_3` | Processed | Highway exit number(s) |
| `Exit_From_Address`, `Exit_From_Label` | Processed | Exit number extraction source flags |
| `Scraped_phone_match_rate` | Match Rate | Binary: phone matched on RVers & Travellers or Truck Stops and Services |
| `Yelp_phone_match_rate` | Match Rate | Binary: phone matched via Yelp API |
| `Yellowbook_phone_match_rate` | Match Rate | Binary: phone matched on Yellow Pages |
| `place_identifier(year)` | Temporal | Groups the same truck stop across consecutive years |
| `Webscraped_Phone_full_url` | Reference URL | Source URL for phone match from web scraping |
| `Webscraped_PlacedMatched_full_url` | Reference URL | Source URL for place match from web scraping |
| `Yelp_URL` | Reference URL | Yelp listing URL |
| `YellowPages_SEARCH_URL` | Reference URL | Yellow Pages search URL |
| `Match_Comments` | Verification | Notes on manual coordinate verification |
| `Final_Lat`, `Final_Long` | Output | Final geocoordinates |

### Original Data Fields

**`clean_line1`, `clean_line2`, `line3`**
These contain the original OCR-read data from the Truckers Friend truck stop directory. This is the "original" data without geocoordinates.

**`city`, `zip_code`, `label`, `phone`, `year`, `major_city`, `state`, `chain`**
These fields came from the original data as well:

- `label`: Name of the truck stop
- `year`: Year of the truck stop directory where the data was sourced
- `chain`: Truck stop chain (some truck stops are independent while others are nationwide franchises or chains)
- Other fields are self-explanatory

### Processed Data Fields

**`Address_Type`, `Exit_Number`, `Main_Road`, `Secondary_Road`, `Exit_Number_2`, `Exit_Number_3`, `Tertiary_Road`**

- **`Address_Type`**: Categorizes addresses into three types:
  - `Exit`: Address containing only highway and exit number
  - `Proper`: Standard address with number and road name
  - `Empty`: Any other format that doesn't fit the above categories

- **`Main_Road`, `Secondary_Road`**: Extract road information
  - For standard address "1234 Sesame and Elmer Street": `Main_Road` = "Sesame Street", `Secondary_Road` = "Elmer Street"
  - For highway address "I-90 exit 25": `Main_Road` = "I-90", `Exit_Number` = "25"
  - For complex highways "I-90 and I-25 exit 25": `Secondary_Road` = "I-25"

- **`Exit_Number_2/3`**: Additional exit numbers when present
- **`Tertiary_Road`**: Third road when applicable
- **`Exit_From_Address`, `Exit_From_Label`**: Flags indicating whether exit numbers were extracted from the address field or from the label field

### Match Rate Fields

**`Scraped_phone_match_rate`, `Yelp_phone_match_rate`, `Yellowbook_phone_match_rate`**
Binary variables indicating phone number matches in associated sources:

- `Scraped_phone_match_rate`: True if phone number matches in RVers and Travellers or Truck Stops and Services
- `Yelp_phone_match_rate`: True if phone number matches in Yelp API
- `Yellowbook_phone_match_rate`: True if phone number matches in Yellow Pages

### Temporal Consistency Field

**`place_identifier(year)`**
This variable identifies consecutive entries of the same truck stop across different years. For example, if we have data for a truck stop in 2006, 2007, 2008, 2014, 2015, and 2016, this identifier helps handle inconsistencies due to OCR errors, data cleaning errors, or genuine changes.

If geocoordinates are missing for 2007 but available for 2006 and 2008, and the place identifier confirms it's the same truck stop, we can reasonably impute the 2007 coordinates using data from adjacent years.

### Reference URLs

**`Webscraped_Phone_full_url`, `Webscraped_PlacedMatched_full_url`, `Yelp_URL`, `YellowPages_SEARCH_URL`**
These fields contain URLs associated with scraped data and API data, useful for debugging and manually verifying entries to spot discrepancies.

### Manual Verification Field

**`Match_Comments`**
A comment field used for manually matching entries. When manual matching was required due to lack of automated matches, or when problematic entries needed review and correction, this field indicates that coordinates were manually corrected or verified. It contains specific details about how the match was verified and the source of the "correct" geocoordinate match.

### Final Coordinates

**`Final_Lat`, `Final_Long`**
The primary output of this project containing the geocoordinates (latitude and longitude) of each truck stop entry.

### Supplementary Fields

The supplementary file ([9_supplementary.csv](data/1_derived/5_geocode_truck_stops/9_supplementary.csv)) contains 153 columns for all 38,135 rows, including fields not in the pruned final output:

- **`address_standardized_ON_parenthesis`**: A human-readable address containing details useful for a trucker that is lost and needs to find a place. This format is not ideal for database matching or geocoding.
- **`address_standardized_OFF_parenthesis`**: The main address used for matching and geocoding.
- **`Scraped_zipcode_to_label_match_rate`**: Binary variable indicating whether a successful address and business name match was found with the scraping websites.
- **`min_distance_miles`**: Distance between the two closest matched source coordinates.
- **`min_distance_sources`**: Identifies which sources produced the closest coordinate pair.

### Supplementary Scraped Data Fields

The intermediate pipeline files contain additional scraped fields from each source. Full data dictionaries for each source are available in the [Geocoding Documentation](docs/geocoding_documentation.pdf) appendix, including:

- **Webscraped Phone Fields**: Location details, contact information, amenities & services, fuel types from Truck Stops and Services / RVers and Travellers
- **Webscraped Place Match Fields**: Same fields as above, but from the hierarchical place name matching method
- **Yelp Fields**: Business name, rating, review count, closure status, address, coordinates, categories, price level
- **Yellow Pages Fields**: Business name, AKA (alternate names), address, categories, status, JSON-LD structured data, multiple phone numbers
- **iExit Fields**: State, highway, exit ID, exit name/description, coordinates, Google Maps link, travel direction

## Project Structure

```
Geocoding_Truck_Stops/
|
+-- data/                               Data (raw inputs + pipeline outputs)
|   +-- 0_raw/                          Read-only source data
|   |   +-- unbalanced_panel.csv        38,135 OCR truck stop records (primary input)
|   +-- 1_derived/                      Generated artifacts (one folder per pipeline stage)
|       +-- 1_clean_ocr_records/
|       |   +-- 1_clean_ocr_pipeline_outputs/   Sequential CSVs: steps 1-9
|       +-- 2_scrape_truckstops_services/
|       +-- 3_scrape_yelp_truckstops/
|       +-- 4_scrape_yellowpages/
|       +-- 5_geocode_truck_stops/              Final geocoded outputs (steps 1-8)
|
+-- output/                             External data and analysis outputs
|   +-- 0_raw/                          Scraped data from external sources
|   |   +-- 1_truckstops_services_webscraped.csv   15,526 truck stop locations
|   |   +-- 2_yelp_webscraped.csv                  15,689 Yelp business records
|   |   +-- 3_yellowpages_webscraped.csv           10,533 YellowPages records
|   |   +-- 4_iexit_webscraped.csv                 iExit highway data
|   +-- 2_analysis/                     Tables and figures from analysis notebooks
|
+-- source/                             All code (notebooks), organized by stage
|   +-- 0_raw/                          Stage 0: Data ingestion
|   |   +-- 1_clean_ocr_records/        9 sequential notebooks (OCR cleaning pipeline)
|   |   +-- 2_scrape_truckstops_services/   Web scraping (not run by run_all.py)
|   |   +-- 3_scrape_yelp/                  Yelp API scraping (not run by run_all.py)
|   |   +-- 4_scrape_yellowpages/           YellowPages scraping (not run by run_all.py)
|   |   +-- 5_scrape_iexit/                 iExit scraping (not run by run_all.py)
|   +-- 1_derived/                      Stage 1: Merging + geocoding
|   |   +-- 1_merge_truckstops_services/    1 notebook
|   |   +-- 2_merge_yelp/                   5 sequential notebooks
|   |   +-- 3_merge_yellowpages/            2 sequential notebooks
|   |   +-- 4_merge_all/                    8 sequential notebooks (core geocoding)
|   +-- 2_analysis/                     Stage 2: Quality assessment (optional)
|       +-- 1_analyze_truckstops_services/
|       +-- 3_analyze_yellowpages/
|       +-- 4_analyze_merge_all/            11 analysis notebooks
|
+-- docs/                               Supporting documentation
|   +-- geocoding_documentation.pdf     Detailed matching methodology documentation
|   +-- images/                         Screenshot references for data sources
|   +-- document_codebooks/             Website terms of service and reference PDFs
|
+-- run_all.py                          Pipeline runner (skips scraping by default)
+-- requirements.txt                    Python dependencies
+-- .env                                API keys (not committed)
```

## Pipeline Overview

The pipeline has three stages. Within each stage, notebooks run **strictly in order**. Scraping stages (0.2-0.5) are independent of each other but must complete before Stage 1 begins.

```
                    +-- 0.2 Scrape TruckStops & Services --+
                    +-- 0.3 Scrape Yelp -------------------+
unbalanced_panel.csv --> 0.1 OCR Cleaning (1-9) -->        +--> 1.1-1.4 Merge + Geocode --> Final Output
                    +-- 0.4 Scrape YellowPages ------------+
                    +-- 0.5 Scrape iExit ------------------+
```

### Stage 0: Raw Ingestion

#### 0.1 Clean OCR Records (9 notebooks, strict order)

Located in `source/0_raw/1_clean_ocr_records/`. Transforms the raw OCR data through successive cleaning steps:

| # | Notebook | What it does |
|---|----------|-------------|
| 1 | `1_standardize_addresses.ipynb` | Normalize interstate patterns (`1-80` -> `I-80`), drop metadata columns |
| 2 | `2_identify_proper_addresses.ipynb` | Split address into ON/OFF-parenthesis parts, classify as Exit/Proper/empty |
| 3 | `3_clean_exit_addresses.ipynb` | Remove OCR artifacts from Exit-type addresses |
| 4 | `4_extract_road_info.ipynb` | Extract Main_Road and Secondary_Road from address text |
| 5 | `5_normalize_chains.ipynb` | Normalize chain names to canonical forms (e.g. `Exxon` -> `exxon`) |
| 6 | `6_extract_exit_numbers.ipynb` | Extract exit numbers, flag unclear OCR |
| 7 | `7_clean_source_tables.ipynb` | Join with scraped data, drop unnecessary columns, normalize scraped chains |
| 8 | `8_refine_address_parts.ipynb` | Extract secondary/tertiary roads and additional exit numbers from complex addresses |
| 9 | `9_correct_exit_values.ipynb` | Manual corrections for specific exit values, type conversions |

**Dependency**: Step 7 requires `output/0_raw/1_truckstops_services_webscraped.csv` from Stage 0.2.

Each step reads the previous step's output from `data/1_derived/1_clean_ocr_records/1_clean_ocr_pipeline_outputs/` and writes the next CSV in the sequence.

#### 0.2-0.5 Web Scraping (not run by `run_all.py`)

These stages scrape external data sources and are not fully replicable (rate limits, site changes, API quotas). They are also time-intensive to run, so their outputs are pre-populated in `output/0_raw/`. See [Data Sources and Collection Timeline](#data-sources-and-collection-timeline) for details.

### Stage 1: Derived Merging + Geocoding

Takes the cleaned OCR data and scraped data, merges them, computes coordinates.

#### 1.1 Merge Truckstops & Services (1 notebook)

`source/1_derived/1_merge_truckstops_services/` - Multi-criteria matching (phone, ZIP, city, exit, state, road, chain, label) between OCR records and the TruckStops & Services scraped data.

#### 1.2 Merge Yelp (5 notebooks, strict order)

`source/1_derived/2_merge_yelp/` - Phone-based matching against Yelp data, build match-rate flags, assign place identifiers, detect place changes over time.

#### 1.3 Merge YellowPages (2 notebooks, strict order)

`source/1_derived/3_merge_yellowpages/` - Phone-based matching against YellowPages data, build match-rate flags.

#### 1.4 Merge All + Geocode (7 notebooks, strict order)

`source/1_derived/4_merge_all/` - The core geocoding pipeline:

| # | Notebook | What it does |
|---|----------|-------------|
| 1 | `1_join_all_scraped_sources.ipynb` | Join all three scraped sources onto the main dataset |
| 2 | `2_cross_source_distances.ipynb` | Haversine distance between coordinate sources, flag disagreements (>200m) |
| 3 | `3_add_manual_review_columns.ipynb` | Add empty Manual_Match/Manual_Lat/Manual_Long columns |
| 4 | `4_assemble_final_coordinates.ipynb` | Assemble Final_Lat/Long: Manual > Mid-point > Backfill from same place |
| 5 | `5_geocode_proper_addresses.ipynb` | Google Geocoding API for street addresses (**requires API key**) |
| 6 | `6_select_final_columns.ipynb` | Prune to final columns |
| 7 | `7_apply_manual_fixes.ipynb` | Apply 23 manually-reviewed coordinate corrections |
| 8 | `8_build_supplementary.ipynb` | Build 153-column supplementary CSV with all scraped fields |

### Stage 2: Analysis (optional)

`source/2_analysis/` - Quality assessment notebooks that produce tables and figures. These are diagnostic and do not produce data used by later stages.

**RAM requirements**: Some analysis notebooks (particularly `2.4.5 Post-reconciliation maps`) read intermediate CSVs that are ~750 MB and build large interactive plotly maps. These may fail with `Cannot allocate memory` on machines with less than 4 GB of free RAM. The geocoding accuracy notebooks (`2.4.6`-`2.4.9`) additionally require the Google Geocoding API step to have been run first.

**Recommendation**: Running Stage 2 is generally not worth it. Even if your machine meets the 4 GB RAM requirement, the resulting maps and figures are built on ~38,000 records and are too dense to be practically interpretable. Pre-generated outputs are already available in [output/2_analysis/](output/2_analysis/).

## Running the Pipeline

### Prerequisites

```bash
python -m venv .venv
source .venv/bin/activate        # Linux/Mac
# .venv\Scripts\activate         # Windows
pip install -r requirements.txt
```

### Automated execution

```bash
# Run everything except scraping and the Google Geocoding API step:
# Scraping is skipped by default because it is time-intensive (rate limits, API quotas).
# Pre-scraped outputs are already available in output/0_raw/.
python run_all.py

# Run only a specific stage:
python run_all.py --stage 0      # OCR cleaning only
python run_all.py --stage 1      # merging + geocoding only
python run_all.py --stage 2      # analysis only

# Include the geocoding API notebook (requires GOOGLE_MAPS_API_KEY in .env):
python run_all.py --geocode
```

`run_all.py` skips all scraping notebooks by default since scraping is time-intensive (rate limits, API quotas) and their outputs are already pre-populated in `output/0_raw/`. It also skips the Google Geocoding API notebook unless `--geocode` is passed (requires a valid API key). The geocoding accuracy analysis notebooks (`2.4.6`-`2.4.9`) are also skipped unless `--geocode` is used, since they require geocoding API output.

### Manual execution

Notebooks can also be run individually in Jupyter. Follow the numbered order within each folder. The full dependency chain is:

1. Run 0.1 steps 1-6
2. (Scraping outputs must exist in `output/0_raw/`)
3. Run 0.1 steps 7-9
4. Run 1.1
5. Run 1.2 steps 1-5
6. Run 1.3 steps 1-2
7. Run 1.4 steps 1-8
8. (Optional) Run Stage 2 analysis notebooks

## Notes

- `data/0_raw/` is read-only source data. Do not modify.
- `data/1_derived/` and `output/` are code-generated artifacts.
- `temp/` stores intermediate files used by scraping steps.
- All notebook paths are relative to the project root.
- Some Stage 1 intermediate CSVs (`1_joined_all_sources.csv` through `4_final_coordinates.csv`) are ~750 MB because they carry match-row-ID list columns. The final outputs (`7_final_truck_stops.csv`, `8_final_truck_stops_manual.csv`) are pruned to ~28 MB.
- The `2.4.5 Post-reconciliation maps` notebook may fail with `[Errno 12] Cannot allocate memory` on machines with less than 4 GB of free RAM due to large plotly map generation over the 750 MB intermediate files.
