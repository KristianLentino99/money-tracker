# Preserve provider-specific security listings in search

Security search fans out to Yahoo Finance and every configured stock/ETF provider, plus the Kraken and CoinGecko crypto catalogs, and groups the returned listings by provider in the UI. Cross-provider matches remain selectable because exchange coverage, native identifiers, and price availability can differ; only duplicate rows from the same provider are removed. Crypto rows retain provider-bound price routing; stock/ETF rows keep the existing composite Yahoo/region fallback strategy.
