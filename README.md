<div align="center">

<img src="packages/landing/public/img/logo.svg" width="72" alt="MoneyMatter logo">

# MoneyMatter

**Open-source personal finance. Your finances, your server, your rules.**

Accounts, budgets, investments, loans and net worth in one place.<br>
Self-host it for free, or use the cloud.

[Website](https://moneymatter.app) · [Docs](https://docs.moneymatter.app) · [Self-host](self-hosting/README.md) · [Cloud](https://moneymatter.app/sign-up) · [Roadmap](https://moneymatter.featurebase.app/dashboard/roadmap) · [Changelog](https://github.com/letehaha/moneymatter/releases)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
A personal finance application. Track balances and transactions with bank connections or manual entry, organize and analyze expenses and income, and plan spending in one place.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="packages/docs/public/screenshots/getting-started/app-overview.dark.png">
  <img src="packages/docs/public/screenshots/getting-started/app-overview.png" alt="The MoneyMatter dashboard: balance trend, cash flow, expenses structure, latest transactions and a categories watchlist, with accounts, portfolios, vehicles and loans grouped in the sidebar.">
</picture>

<details>
<summary><b>More screenshots</b></summary>
<br>

<table>
  <tr>
    <td width="50%">
      <img src="packages/landing/public/img/landing/screenshots/net-worth@2x.webp" alt="Net worth history chart stacked by cash, investments, vehicles and ventures">
      <br><sub>Net worth history</sub>
    </td>
    <td width="50%">
      <img src="packages/landing/public/img/landing/screenshots/money-flow@2x.webp" alt="Money flow diagram from income through expenses and savings to categories">
      <br><sub>Money flow</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="packages/landing/public/img/landing/screenshots/investments@2x.webp" alt="Investment portfolio with total value, total return and gains per holding">
      <br><sub>Investments</sub>
    </td>
    <td width="50%">
      <img src="packages/landing/public/img/landing/screenshots/transactions@2x.webp" alt="Transactions list with categories, accounts and payee logos">
      <br><sub>Transactions</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="packages/landing/public/img/landing/screenshots/bank-providers@2x.webp" alt="Bank provider picker listing LunchFlow, SimpleFIN, Monobank, Enable Banking and Walutomat">
      <br><sub>Bank connections</sub>
    </td>
    <td width="50%">
      <img src="packages/landing/public/img/landing/screenshots/import-sources@2x.webp" alt="Import options: any text source, CSV, OFX, YNAB, Wallet and Microsoft Money">
      <br><sub>Import sources</sub>
    </td>
  </tr>
</table>

Every feature is explained, with screenshots, in the [help center](https://docs.moneymatter.app).

</details>

The app ships in English, Ukrainian, Spanish and Indonesian. Translation files are maintained directly in the repository under `packages/frontend/src/i18n/locales` and `packages/backend/src/i18n/locales`.

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

- ✅ Free to use, study, modify, and self-host
- ✅ Free to redistribute under the same license
- ✅ Commercial use permitted (sell hosting, support, custom builds, etc.)
- 🔄 Modifications must be released under AGPL-3.0
- 🌐 If you run a modified version as a network service, you must publish your modifications

See [LICENSE](LICENSE) for full details. The project was previously licensed under CC BY-NC-SA 4.0; that license still applies to versions of the codebase prior to the AGPL-3.0 relicensing commit.
