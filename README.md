# @elizaos/plugin-orkid

ElizaOS plugin for the [Orkid](https://orkidlabs.com) gasless swap engine. Quote, execute, dry-run, confirm, and track swaps on Base, Ethereum, Arbitrum, and Polygon via `@orkid-labs/sdk`.

## Installation

```bash
elizaos plugins add @elizaos/plugin-orkid
```

Or with bun:

```bash
bun add @elizaos/plugin-orkid
```

## Configuration

Add the following environment variables to your `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `ORKID_API_KEY` | Yes | 40-character hex Orkid API key. Required for partner volume tracking and rebates. |
| `ORKID_API_URL` | No | Orkid API base URL. Default: `https://orkidlabs.xyz`. Use `sandbox` for sandbox mode (quotes only, no execution). |
| `ORKID_USER_ADDRESS` | No | Default user wallet address for swaps. |

## Actions

| Action | Description | Billable? |
|--------|-------------|-----------|
| `ORKID_GET_QUOTE` | Get an executable swap quote via `/api/v1/route` | No |
| `ORKID_EXECUTE_SWAP` | Execute a live gasless swap via `/api/v1/solve`. Requires explicit confirmation and a signed Permit2 permit. | Yes |
| `ORKID_DRY_RUN_SWAP` | Simulate a swap without executing. Returns calldata and expected output. | No |
| `ORKID_LIST_TOKENS` | List or search tokens available on a chain. | No |
| `ORKID_GET_USAGE` | Fetch partner account usage, volume, and rebate status. | No |
| `ORKID_CONFIRM_TX` | Confirm a user-submitted transaction so it counts as a real solve (rebate-eligible). | Yes |

## Provider

**`ORKID_MARKET_DATA`** — Provides context about supported chains, API status, and minimum notional requirements.

## Service

**`OrkidService`** — Manages the `OrkidClient` lifecycle. Reads configuration from runtime settings and exposes a shared client instance.

## Route vs Solve Semantics

- **Route** (`/api/v1/route`) = quote only. Non-billable. Does not count as volume.
- **Solve** (`/api/v1/solve`) = execution. Billable. Counts as rebate-eligible volume.
- **Dry-run** = solve with `dryRun: true`. Non-billable. Returns calldata without submitting.

## Usage Examples

### Get a Quote

```
User: quote 25 USDC to WETH on base
Agent: Quote: 25 USDC → 0.0102 WETH on Aerodrome. Rate: 0.000408 WETH/USDC.
       Price impact: 0.02 bps. Gasless eligible: yes.
       This is a quote only — no trade executed.
```

### Execute a Swap

```
User: execute 25 USDC to WETH on base — confirmed
Agent: Swap executed: 25 USDC → 0.0102 WETH. Tx: 0xabc123...
       This counts as billable volume.
```

### Dry Run

```
User: dry run 100 USDC to WETH on arbitrum
Agent: Dry run complete: 100 USDC → 0.0408 WETH. Gasless eligible: yes.
       No transaction submitted.
```

### Check Usage

```
User: what's my orkid volume this month?
Agent: Your Orkid volume this month: $45,200.00. Rebate: $13.56 (accrued).
```

## Supported Chains

- Base (chain id 8453)
- Ethereum (chain id 1)
- Arbitrum (chain id 42161)
- Polygon (chain id 137)

## Permit2 Signing

Live execution requires a signed Permit2 permit. Use the Orkid SDK's signing helpers:

- `OrkidViemPermitSigner` — for viem wallets
- `OrkidEthersPermitSigner` — for ethers.js wallets

The permit must be signed by the user's wallet and passed to the `ORKID_EXECUTE_SWAP` action via the `options` parameter.

## License

MIT
