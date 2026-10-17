# Hyperliquid Delta-Neutral Arbitrage Strategy Plan — $50k, 24/7 Automated Bot

> **⚠️ Phase 2 revision (see `hyperliquid-phase2-research.md`):** expected gross APR
> revised down to **~4–8%** (the 5–15% range below predates fee/rebate verification);
> maker rebates are confirmed unreachable at $50k; for a Japan-resident operator the
> after-tax figure is roughly **2–5%**. Phase 2 also adds a Layer 8 auto-research
> loop specification. Architecture and failure-mode content below remains current.

> **Research basis:** This plan was produced by a 103-agent deep-research pass (5 search
> angles → 21 sources fetched → 55 claims extracted → 25 adversarially verified with
> 3-vote panels → 21 confirmed, 4 refuted). Every load-bearing number below survived
> verification or is explicitly flagged as an estimate. Sources are listed at the end.

---

## 0. The honest headline first

**There is no "super low risk passive money printer." Anywhere. Ever.** The market
prices that away, and the historical record proves it:

- **October 10, 2025:** >$19B of crypto leverage liquidated in ~24 hours — $3.21B in a
  *single minute* at 21:15 UTC. BTC order-book depth collapsed **98%+** ($103.6M →
  $0.17M visible liquidity) and bid-ask spreads widened **1,321×** (0.02 bps → 26.43 bps).
  "Delta-neutral" hedged accounts were liquidated anyway — through mark-price
  dislocations and collateral depegs, not directional exposure. Hyperliquid itself had
  its first ADL event in 2+ years that day.
- **USDe depeg (same day):** traded at ~$0.65 *on Binance only* while holding ~$1
  everywhere else. Venue-specific collateral markdowns cascaded thousands of hedged
  accounts through maintenance margin. Your stablecoin collateral is a risk position.
- **JELLY incident (March 26, 2025):** an attacker forced Hyperliquid's HLP vault to
  inherit a toxic short; validators resolved it by **force-settling all positions at an
  administratively chosen non-market price**. The venue can and will settle your open
  positions at a price you didn't agree to.

What *does* exist: a genuinely well-understood, structurally-positive-carry,
delta-neutral strategy — **funding-rate harvesting** — that with disciplined risk
layers realistically nets **~5–15% APR on $50k ($2,500–$7,500/yr)** in normal regimes,
with quantified and survivable tail risks. That is the strategy this plan builds.

---

## 1. Strategy comparison — all six candidates, ranked

| # | Strategy | Realistic net APR | Verdict at $50k |
|---|----------|-------------------|-----------------|
| 1 | **Funding-rate harvest** (short HL perp + long hedge), 1–2x | **5–15%** on total capital | ✅ **RECOMMENDED** — structural edge, automatable, survivable failure modes |
| 2 | Cross-exchange dual-perp funding arb (HL vs Binance/Bybit), 2–3x | 10–30% headline (regime-dependent) | ⚠️ Levered extension only — adds second-venue, transfer, and dual-liquidation risk |
| 3 | Spot-perp basis inside Hyperliquid | ~same as #1, minus spot capital drag | ✅ Variant of #1 with lower leg risk, lower yield |
| 4 | HLP vault deposit (passive benchmark) | Historically ~20%/yr trailing, but... | ⚠️ NOT low-risk: absorbs liquidations (JELLY: −$12M unrealized in under an hour, ~5% of vault), governance-intervention risk |
| 5 | Maker-rebate market-making | n/a | ❌ **Infeasible at $50k** — address rate limits scale with lifetime volume (1 request per $1 traded, 10k starting buffer, 1 req/10s when throttled); you'd rate-limit yourself out before earning rebate tier |
| 6 | Triangular/spot arb on HL spot pairs | ~0 after fees | ❌ No verified evidence of persistent exploitable spreads; crowded out by faster players |

**Why funding harvest wins:** it's the only strategy where a *structural* (not
transient) edge exists at retail scale, where $50k is enough capital, where the
Hyperliquid API primitives directly support safe automation, and where the failure
modes are known, monitorable, and hedgeable.

---

## 2. The core edge (verified against official Hyperliquid docs)

Hyperliquid funding mechanics — all confirmed 3-0 against the official GitBook:

- **Paid every hour** (vs 8h on most CEXs) — 24 accrual events/day, smoother P&L.
- **Purely peer-to-peer, zero exchange fee on funding payments.**
- **Formula:** `F = Average Premium Index + clamp(interest_rate − P, −0.0005, +0.0005)`,
  premium sampled every 5 seconds, averaged over the hour; the 8-hour rate is paid at
  1/8 per hour.
- **The structural edge:** the fixed interest component is 0.01% per 8h ≈
  **11.6% APR paid to shorts on perp notional when the perp trades at par**. In bull
  regimes the premium adds on top (Oct 2025 saw BTC/ETH funding hit ~30% annualized —
  four days before the crash, which is exactly the crowding signal, see §5).
- **Important sizing note:** the 11.6% accrues on *perp notional*, not total capital.
  Unlevered (half capital in the hedge leg), that's ~5.8% on the $50k before premium
  and fees — hence the honest 5–15% net range.
- Funding can't be sniped at a timestamp — the bot must model *hour-long premium
  averages*, and funding **can invert within a single hour** on sharp moves.

---

## 3. The layered architecture ("layers and layers" — here they are)

Seven layers, each with a single job, each able to independently halt everything
below it. A failure in any layer degrades to *flat and safe*, never to *unhedged*.

```
┌─────────────────────────────────────────────────────────────┐
│ L6  CAPITAL GOVERNOR    withdrawal sweep, drawdown budget    │
├─────────────────────────────────────────────────────────────┤
│ L5  MONITORING & ALERTS heartbeats, Telegram/PagerDuty, P&L  │
├─────────────────────────────────────────────────────────────┤
│ L4  KILL SWITCHES       dead-man's switch, depeg & flip halt │
├─────────────────────────────────────────────────────────────┤
│ L3  HEDGE INTEGRITY     delta drift, leg-liquidation buffers │
├─────────────────────────────────────────────────────────────┤
│ L2  EXECUTION           ALO-first entries, TWAP legs, retry  │
├─────────────────────────────────────────────────────────────┤
│ L1  SIGNAL              funding forecast, entry/exit rules   │
├─────────────────────────────────────────────────────────────┤
│ L0  DATA                websocket state, REST fallback       │
└─────────────────────────────────────────────────────────────┘
```

### L0 — Data layer
- **Websocket-first** (websockets bypass REST weight limits): subscribe to `allMids`,
  `l2Book`, `bbo`, `userFills`, `userFundings`, `orderUpdates` via the official
  Python SDK (`hyperliquid-python-sdk`, MIT, actively maintained — v0.24.0 June 2026,
  `examples/basic_ws.py` demonstrates every needed subscription).
- REST only for reconciliation, using the cheap **weight-2** endpoints (`l2Book`,
  `allMids`, `clearinghouseState`, `orderStatus`) under the **1200 weight/min IP cap**.
- Staleness rule: if the websocket state is >5s old and REST reconciliation fails,
  L0 declares itself unhealthy → L4 halts new orders.

### L1 — Signal layer
- Track realized hourly funding + predicted funding on **BTC, ETH, SOL, HYPE only**
  (deepest books; thin books are how JELLY happened — never touch small caps).
- **Entry:** enter/scale a short-perp position when trailing 24h–7d average funding
  (interest + premium) exceeds a hurdle (e.g. >10% annualized net of fees).
- **Exit:** funding flip rule — if the trailing 8h average goes negative, begin
  unwinding; if two consecutive hours print materially negative, exit fully. A trade
  earning 20% annualized one week can flip to a 30% annualized *cost* the next
  (verified failure mode).
- **Crowding brake:** funding spiking toward historic highs (~30%+ annualized) with
  record open interest is a *pre-crash signature* (verified: Oct 6→10, 2025). The
  signal layer caps position size as funding gets extreme, instead of maxing out —
  this is the single most counterintuitive and most important rule in the plan.

### L2 — Execution layer
- **ALO (post-only) entries always** — ALO is canceled instead of matching, the only
  TIF guaranteeing maker execution; pay taker only on emergency exits.
- Legs entered in **small TWAP slices** with the hedge leg placed within seconds;
  max tolerated single-leg exposure: 60 seconds or 0.5% adverse move, whichever first
  → immediately flatten the naked leg at market (accept the taker fee; leg risk killed).
- **Rate-limit budget:** address actions earn 1 request per $1 lifetime volume,
  starting buffer 10,000, throttle = 1 req/10s when exhausted. The bot maintains its
  own token-bucket model of this budget and refuses to quote faster than it earns.
  (Mitigation: cancels get extra allowance — `min(limit+100000, limit*2)` — so a
  throttled bot can always still cancel.)

### L3 — Hedge-integrity layer
- Continuous per-leg **liquidation-distance monitor**: both legs must always survive a
  **±30% instantaneous move**. At the recommended 1–2x effective leverage this holds
  by construction; the monitor exists for drift.
- **Delta drift check** every minute: |net delta| > 1% of notional → rebalance;
  > 3% → treat as an incident, flatten to neutral.
- **Margin headroom:** maintain ≥50% free margin on the perp account at all times.
  Oct 10 proof point: books can lose 98% of depth — your exit will cost multiples of
  quoted spread, so the buffer must absorb it *before* the exit, not during.

### L4 — Kill-switch layer
- **Dead-man's switch:** Hyperliquid's native `scheduleCancel` — schedule a
  cancel-all ~60s ahead and **continuously reschedule** it every ~20s while healthy
  (reschedules don't count against the cap; actual *triggers* are capped at 10/day,
  reset 00:00 UTC, min 5s lead). If the bot dies, all resting orders die with it.
- **Depeg halt:** USDC/USDH oracle vs secondary price feeds; >1% divergence → cancel
  all orders, stop entering, alert. (USDe's Binance-only 35% depeg is the verified
  precedent — collateral can be marked down on *one venue* while fine everywhere else.)
- **Funding-flip halt** (from L1), **volatility halt** (1-min realized vol > threshold
  → no new entries), **manual halt** (one command flattens everything).
- Kill switches only ever move the system toward *flat*. No kill path ever opens
  exposure.

### L5 — Monitoring & alerting
- Heartbeat to an external monitor (dead bot = alert within 60s, and the dead-man's
  switch has already cleared orders).
- Alerts (Telegram/PagerDuty): funding flip, delta drift, margin below buffer, depeg
  signal, websocket staleness, rate-limit budget < 20%, daily P&L outside ±2σ.
- Hourly P&L attribution: funding collected vs fees paid vs basis drift — if fees ever
  exceed funding over a trailing week, the bot is trading too much and L1 hurdles
  auto-tighten.

### L6 — Capital governor
- **Max drawdown budget: 5% of capital ($2,500).** Breach → full flatten, bot stops,
  human review required to restart.
- Profit sweep: weekly withdrawal of realized profits above the $50k base — bridge
  risk is real; don't let the stack silently compound on-venue.
- Per-asset concentration cap: ≤40% of notional on any single asset.

---

## 4. Capital deployment ($50,000)

Conservative configuration (recommended for first 3+ months):

| Bucket | Amount | Purpose |
|--------|--------|---------|
| Short perp margin (HL) | $20,000 | Shorts at ≤2x → ≤$40k perp notional across BTC/ETH/SOL/HYPE |
| Long hedge leg | $20,000 | Spot (HL spot or external) or long perp on second venue, matched notional |
| Free margin buffer | $8,000 | Survives ±30% marks + spread blowout on exit |
| Ops float | $2,000 | Fees, slippage budget, gas/bridging |

Expected economics at ~$40k harvested notional: 11.6% structural APR on notional ≈
$4,640/yr baseline, plus positive-premium periods, minus fees, flip periods, and
hedge-leg drag → **~$2,500–$7,500/yr net (5–15% on the $50k)**. The cross-exchange
dual-perp variant at 2–3x can headline 25–30%+ but proportionally tightens both legs'
liquidation buffers and adds venue/transfer risk — only graft it on after months of
clean operation, and never past 3x.

> Note: the frequently cited "15.6% SOL / 15.7% AVAX unlevered" cross-venue benchmarks
> from exchange marketing were **refuted 0-3** in adversarial verification. Do not
> plan around them. Independent 2026 data (Pendle/Boros) puts unlevered HL-vs-Binance
> funding spreads at ~6–11% APR on BTC/ETH — consistent with the 5–15% net range.

---

## 5. Failure-mode ledger (each one verified, each one mapped to a layer)

| Failure mode | Verified precedent | Mitigating layer |
|---|---|---|
| Funding inversion (hourly) | Formula allows intra-hour flips; 20%→−30% swings documented | L1 flip exit |
| Liquidity/spread collapse on exit | Oct 10 2025: 98% depth collapse, 1,321× spread widening | L3 margin headroom sized for stressed exits |
| Leg risk (one leg fills, hedge doesn't) | Structural to all two-leg arb | L2 60s/0.5% naked-leg flattening |
| Collateral depeg (venue-specific) | USDe at $0.65 on Binance only, Oct 10 2025 | L4 depeg halt |
| Venue force-settlement at non-market price | JELLY, Mar 2025: settled at $0.0095 by governance | Majors-only universe (L1); accepted residual tail risk |
| Crowded-trade blow-up | Funding 10%→30% in days before Oct 10 cascade | L1 crowding brake (size *down* as funding spikes) |
| Bot crash with resting orders | — | L4 scheduleCancel dead-man's switch |
| Self-inflicted rate-limit lockout | CCXT #24100, freqtrade #10960 (exact throttle error documented) | L2 rate-budget token bucket |
| API/websocket outage | — | L0 staleness → L4 halt; cancels still allowed when throttled |
| Bridge/venue insolvency | Generic exchange risk | L6 weekly profit sweep |

---

## 6. Implementation roadmap

1. **Phase 0 — Backtest (1–2 weeks).** Pull 12 months of hourly funding via the
   `fundingHistory` API for BTC/ETH/SOL/HYPE; simulate the L1 rules with real fee
   assumptions. Gate: backtested net APR ≥ 8% with max drawdown < 3%.
2. **Phase 1 — Testnet (1–2 weeks).** Full stack against Hyperliquid testnet
   (`constants.TESTNET_API_URL` in the SDK). Chaos-test every kill switch: kill the
   process mid-quote, starve the websocket, inject fake depeg prints.
3. **Phase 2 — Mainnet pilot ($5k, 2–4 weeks).** 10% of capital, 1x only, BTC/ETH
   only. Gate: 2 weeks with zero unhandled incidents and P&L attribution matching
   backtest within tolerance.
4. **Phase 3 — Full deployment ($50k).** Scale per §4. Review monthly; only consider
   the levered cross-venue extension after 3 clean months.
5. **Ops:** run on a VPS (this repo's CI container can't even reach
   `api.hyperliquid.xyz` — verified blocked); redundant region optional; secrets in a
   hardware-backed keystore; the API wallet should be an **agent wallet** with no
   withdrawal rights.

Stack: Python + `hyperliquid-python-sdk` (official, MIT), asyncio, a small state
machine per layer, SQLite for the trade/funding ledger, Prometheus + Telegram for L5.

---

## 7. What this is and isn't

- **Is:** a positive-expected-value, delta-neutral carry harvest with a structural
  basis (the 11.6% interest component paid to shorts), engineered so that every known
  failure mode degrades to *flat*, targeting **5–15% net APR** on $50k.
- **Isn't:** risk-free, fixed-income, or a printer. The tail risks — venue
  intervention, collateral depeg, liquidity collapse — are real, verified, and recent.
  The architecture makes them survivable; nothing makes them zero.
- The single best predictor of blowing up is *reaching for the top of the yield range
  with leverage exactly when funding looks juiciest*. The crowding brake in L1 exists
  because the verified record shows peak funding is a hazard signal, not an
  opportunity signal.

---

## Sources (confirmed claims only)

- Hyperliquid official docs — funding mechanics, rate limits, exchange endpoint
  (`hyperliquid.gitbook.io`: trading/funding, api/rate-limits-and-user-limits,
  api/exchange-endpoint)
- Official Python SDK: `github.com/hyperliquid-dex/hyperliquid-python-sdk` (PyPI-verified)
- FTI Consulting — *Crypto Crash October 2025: Leverage Met Liquidity*
- Amberdata — *How $3.21B Vanished in 60 Seconds* (minute-level tick data)
- CoinDesk / CCN / OAK Research / Hyperliquid community incident page — JELLY
  post-mortems (March 26, 2025)
- Binance support announcement — USDe/BNSOL/WBETH depeg resolution (admission + compensation)
- BitMEX blog (*Harvest Funding Payments on Hyperliquid*) — mechanics only; its APR
  benchmarks were refuted in verification and are excluded
- Boros/Pendle — 2026 cross-venue funding spread data (~6–11% APR BTC/ETH unlevered)
- CCXT issue #24100, freqtrade issue #10960 — real-world rate-limit failures
