# scrape_truckstops_services

This folder stores the current named artifacts for truck stop/service website scraping.

## Naming Convention
- Prefix with ordered step number (`01`, `02`) for a cleaner local sequence.
- Use descriptive snake_case names for purpose clarity.

## Files
- `01_webscraping_truckstops_services_seed_urls.csv`
  - Source: reference `2.csv`
  - Role: seed/index table used by later scraping notebooks.
  - Shape: 15,526 rows x 6 columns.
- `02_webscraping_truckstops_services_full_run.ipynb`
  - Latest full scraping notebook version.
- `02_all_states_truckstops_services_raw.csv`
  - Latest full-run CSV output from stage 5.
- `02_all_states_truckstops_services_raw.parquet`
  - Same stage-5 dataset in Parquet format.

## Batch Files
Batch outputs were moved to:
- `temp/batch_scrape_truckstops_services/`

with names like:
- `02_all_states_truckstops_services_batch_01_of_16.csv`

## Important Relationship Notes
- Stage 5 notebook code reads stage 2 seed file (`2.csv` in the original reference workflow).
- `02_all_states_truckstops_services_raw.csv` and `output/0_raw/1_truckstops_services_webscraped.csv` have the same row count and columns, but they are not byte-identical files.


