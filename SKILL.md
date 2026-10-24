---
name: plugin-orkid
description: Integrate gasless MEV-protected crypto swaps into an ElizaOS agent via the @orkid-labs/plugin-orkid plugin — quote, execute, dry-run, confirm, and track token swaps on Base, Ethereum, Arbitrum, and Polygon. Use when building a trading or DeFi agent that needs to swap tokens, check prices, or execute gasless swaps without the user holding native gas tokens.
license: MIT
metadata:
  author: orkid-labs
  version: "2.1.3"
  npm: "@orkid-labs/plugin-orkid"
  mcp-endpoint: https://orkidlabs.xyz/api/mcp
---

# Orkid Swap Plugin for ElizaOS

`@orkid-labs/plugin-orkid` adds swap actions to an ElizaOS agent:
quote, execute, dry-run, confirm, and track swaps via the Orkid gasless
swap engine (Tycho + RFQ liquidity, MEV-protected, Permit2 gasless
execution).

## Install

```bash
bun add @orkid-labs/plugin-orkid
# or: npm install @orkid-labs/plugin-orkid
```

Register in the agent character file:

```json
{ "plugins": ["@orkid-labs/plugin-orkid"] }
```

Direct npm install is the distribution path — elizaOS retired the
community plugin registry, so plugins wire via `plugins[]` in the
character file.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ORKID_API_KEY` | Yes | 40-char hex Orkid API key — partner volume tracking and rebates |
| `ORKID_API_URL` | No | API base URL. Default `https://orkidlabs.xyz`; `sandbox` for quotes-only mode |
| `ORKID_USER_ADDRESS` | No | Default user wallet address for swaps |

Free API key: `https://orkidlabs.xyz/partner`.

## Actions

The plugin registers swap actions the agent invokes from natural
language: quote a pair ("price of X", "how much Y for N X"), execute,
dry-run, confirm, and track pending swaps. Supported chains: Base,
Ethereum, Arbitrum, Polygon.

## Lighter-weight alternative

If the agent only needs quotes + deep links (no execute/track lifecycle),
the `orkid-swap-mcp` MCP server exposes `orkid_quote`, `orkid_swap_link`,
`orkid_bridge_quote`, and `orkid_chains` over Streamable HTTP or x402
pay-per-call — no plugin install required:

- Endpoint: `https://orkidlabs.xyz/api/mcp`
- stdio: `npx -y orkid-swap-mcp`

## Links

- npm: `@orkid-labs/plugin-orkid`
- SDK: `@orkid-labs/sdk`
- Site: https://orkidlabs.xyz
- Docs: https://docs.orkidlabs.xyz
