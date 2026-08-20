# Investment Security Search Context

This context defines the language for finding and selecting investable securities from multiple market-data sources.

## Search and market data

**Security**:
An investable instrument tracked in a portfolio, such as a stock, ETF, or crypto market pair.
_Avoid_: Asset, when referring to the persisted portfolio instrument

**Provider listing**:
A provider-specific representation of a Security returned by a market-data source, including the provider's native identifier and exchange metadata.
_Avoid_: Duplicate, when two listings describe the same ticker from different providers

**Market pair**:
A crypto Security formed by a base asset and a quote currency, such as BTC/USD; the quote currency is the denomination of its price.
_Avoid_: Crypto asset, when the quote side matters

**Provider catalog**:
The searchable set of provider listings available from an external market-data source.
_Avoid_: Ticker list, when the entries include exchange, quote, and provider identity

**Provider-grouped search**:
A search result presentation that keeps provider listings in separate sections so users can compare source-specific symbols and metadata.
_Avoid_: Deduplicated search, because cross-provider matches remain visible
