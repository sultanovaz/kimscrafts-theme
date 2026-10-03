# Phase 2 Research — Fees, Japan, and the Karpathy-Style Auto-Research Loop

> **Research basis:** second 106-agent deep-research pass (5 angles → 24 sources →
> 49 claims extracted → 25 adversarially verified: 24 confirmed 3-0 or 2-1, 1 refuted
> 0-3). Builds on `hyperliquid-arbitrage-strategy.md` (Phase 1). Where Phase 2
> contradicts Phase 1, Phase 2 wins — it's newer and better-sourced.

---

## 1. Headline revisions to the Phase 1 plan

| Item | Phase 1 said | Phase 2 verdict |
|---|---|---|
| Expected gross APR | 5–15% net | **Revise down to ~4–8% gross** on majors at 1–2x (see §3) |
| Maker rebates | "unconfirmed" | **Never available at $50k** — rebates require >0.5% of *exchange-wide* maker volume share |
| Fee lever | — | **Stake 10–100 HYPE** (≈$400–$4,000) → 5–10% fee discount; the *only* lever available |
| After-tax (Japan resident) | not analyzed | **~2–5% after tax** — misc income at progressive rates up to 55.945%; DEX gains excluded from the pending 20.315% reform |
| LLM in the loop | "supervisor only" (informal) | **Now evidence-backed**: 4 of 6 frontier LLMs lost real money trading on Hyperliquid itself; the blueprint in §5 is the safe formulation |

---

## 2. Fees — exact numbers (verified against official docs)

- **Tier 0 (where $50k lives forever): 0.045% taker / 0.015% maker.** First break
  (Tier 1: 0.040%/0.012%) requires >$5M in 14-day weighted volume ≈ $357k/day
  turnover — implausible at $50k and blocked by the address rate limit anyway.
- **Maker rebates are share-gated, not volume-gated:** −0.001% at >0.5% of
  exchange-wide 14-day maker volume, −0.002% at >1.5%, −0.003% at >3.0%. That's
  hundreds of millions in maker volume. **Budget zero rebates.**
- **HYPE staking discounts** (multiplicative, 14-day EMA of stake): Wood >10 HYPE = 5%,
  Bronze >100 = 10%, up to Diamond >500k = 40%. Staking 10–100 HYPE cuts Tier-0 taker
  to 0.0428–0.0405% — cheap and worth doing.
- Round-trip cost reality: all-taker across 4 legs ≈ 18 bps; maker-where-possible
  ≈ 6.6 bps. Against a structural 11.6%-on-notional edge, fee discipline (ALO
  entries, minimal churn) is the difference between profit and noise.
- Context: Hyperliquid Tier 0 is still cheaper than Binance (2.0/5.0 bps) and Bybit
  (2.0/5.5 bps) base tiers.

## 3. Expected return — revised down, and why

- The only quantitative 2026 APR claim found ("3–12% on majors, 20–60% long-tail",
  neuralarb.com) was **refuted 0-3** in adversarial verification.
- **No realized fundingHistory backtest data survived verification at all.** Nobody
  reliable has published what this strategy actually earned in 2025–2026.
- Structure-based inference: 11.6% structural component on notional, halved by the
  hedge leg's capital, minus Tier-0 fees, spreads, and negative-funding periods →
  **plan on ~4–8% gross APR** ($2,000–$4,000/yr on $50k) until measured otherwise.
- **Therefore the first task of the build is empirical:** pull 12 months of hourly
  `fundingHistory` for BTC/ETH/SOL/HYPE and run the walk-forward backtest with real
  Tier-0 fees. That number — not any blog's — sets the go/no-go.

## 4. Japan — the biggest economic finding

Verified via March-2026 law-firm alerts (Nagashima Ohno & Tsunematsu), PwC/EY tax
alerts, and June-2026 Diet reporting. **Factual landscape, not tax or legal advice —
confirm with a Japanese tax professional before deploying.**

- **Current regime (governs 2026–2027):** crypto gains — including perp funding-arb
  profits — are **miscellaneous income at progressive rates up to 55.945%**
  (45% national × 1.021 surtax + 10% inhabitant). Not capital gains. Explicitly
  excluded from the 20.315% separate taxation that regulated FX futures enjoy.
  Misc-income losses offset within the year but **cannot carry forward**.
- **The pending reform doesn't help this bot:** the FIEA amendment (passed Lower
  House June 11, 2026, pending Upper House) introduces 20.315% flat taxation — but
  **only for crypto sold through Japanese licensed exchanges**. Overseas exchanges,
  private wallets, and DEXs — which describes Hyperliquid — are expected to remain
  outside the new regime. Derivatives join the 20.315% regime no earlier than
  **January 1, 2028**, and likely only on licensed venues even then.
- **Net effect:** at a moderate marginal rate, whatever the bot grosses is roughly
  halved. 4–8% gross → **~2–5% after tax ≈ $1,000–$2,500/yr on $50k.** That
  materially changes the effort/reward calculus and should be weighed against
  simply staking or T-bill-equivalent yields before committing build time.
- **Unresolved (nothing survived verification):** whether Hyperliquid geo-blocks
  Japanese IPs, the FSA's enforcement posture toward residents using unregistered
  perp DEXs, and the cleanest USDC on-ramp route from Japanese exchanges. Treat
  these as open items to verify yourself before funding the account.

## 5. Layer 8 — the Karpathy-style auto-research loop (the part you asked about)

Three unanimously verified templates combine into the blueprint:

**(a) Karpathy's `autoresearch` repo — the mechanics.** An LLM agent may edit
**exactly one file**; the eval harness and its constants are immutable and
human-controlled; every experiment runs on an identical fixed budget so variants are
directly comparable; one deterministic metric decides keep-via-git-commit or
revert-via-git-reset. The trading analogue: the LLM edits **one strategy-config
file** (hurdle rates, size caps, asset weights, exit thresholds) — never execution
or risk code.

**(b) "The Alpha Illusion" (arXiv 2605.16895, May 2026) — the anti-p-hacking gate.**
Headline Sharpes from LLM trading systems can't be read as deployment evidence: five
confounds (look-ahead contamination, unmodeled frictions, short-window Sharpe
uncertainty, narrative fitting, hidden factor exposures) are inseparable from skill.
Its P1–P6 protocol: **failing any single structural validity test disqualifies
deployment**. Corroborating: "Profit Mirage" (arXiv 2510.07920) measured **51–62%
Sharpe decay** in published LLM-trading systems once look-ahead leakage was
controlled; an audit of 77 LLM-trading studies found **1/19 modeled transaction
costs and 0/19 were reproducible**. The paper's endorsed architecture — LLM as
auditable upstream proposer feeding independent risk/execution modules it never
touches — is exactly the propose-only design.

**(c) nof1 Alpha Arena (Oct 18–Nov 3, 2025, real $10k each, on Hyperliquid itself) —
the cautionary result.** Four of six frontier LLMs lost money: GPT-5 −62.7%,
Gemini 2.5 Pro −$5,671, Grok 4 −$4,531, Claude Sonnet 4.5 −$3,081; only Qwen3 Max
(+22%) and DeepSeek V3.1 (+$489) profited. nof1's own post-mortem: *"PnL was
dominated by trading costs as agents over-traded and took quick, tiny gains that
fees erased"* — the exact failure mode most lethal to a fee-sensitive funding-arb
bot. **The LLM stays out of the execution path. Period.**

### The Layer 8 pipeline

```
LLM proposes diff ──► immutable deterministic harness ──► statistical gates ──► paper ──► live
  (ONE config file)     (fundingHistory + L2 replay,        • P1–P6 pass/fail       (fixed     (git
   on a schedule,        real Tier-0 fees, funding          • walk-forward           length)    promote)
   no keys, no           flips, stress windows)             • deflated Sharpe,
   market access)                                             sized to # of
                                                              variants tried
                                                            • mandatory holdout:
                                                              Oct 10 '25 cascade,
                                                              JELLY, USDe windows
        any gate fails ──► git reset, log the attempt, feed the failure back as context
```

Rules that make it safe:

1. **One-file leash.** The LLM's write access is a single `strategy.toml`. Execution,
   risk, and kill-switch code (Layers 0–7) are read-only to it. It never holds keys.
2. **Immutable eval.** The backtest harness is version-pinned and human-edited only.
   A backtest can be made *fully* deterministic — an improvement over Karpathy's
   noisy GPU template.
3. **Deflated Sharpe sized to the search.** If the LLM proposes 50 variants/week
   against 6–12 months of hourly data, the significance bar rises accordingly
   (Bailey/López-de-Prado). Otherwise Layer 8 is a p-hacking machine with git access.
4. **Stress holdouts are mandatory, not optional.** Any variant that dies in the
   Oct-10-2025 replay window is dead, whatever its bull-regime Sharpe.
5. **Paper before live, git as the ratchet.** Survivors run a fixed paper period;
   only then does a human-reviewed git promotion update the live config. Rollback
   is `git revert`.
6. **Fixed cadence, fixed budget.** Like autoresearch's 5-minute runs: e.g. a nightly
   session proposing ≤3 variants — comfortably within a Claude subscription, zero
   latency pressure, and the deterministic bot never waits on a model.

### Open tooling question (unverified)

Whether vectorbt / freqtrade / hummingbot support deflated Sharpe and purged
walk-forward CV with Hyperliquid data out-of-the-box in 2026 wasn't confirmed —
assume the harness is **custom but small**: fundingHistory puller, fee-aware P&L
replay, gate calculators. A few hundred lines, and it doubles as Phase-0 backtester
from the Phase 1 roadmap.

---

## 6. What Phase 2 could NOT answer (honest gaps)

1. **Realized funding rates 2025–2026** — no verified data; must be measured via
   `fundingHistory` as build task #1.
2. **HLP's current APR and post-JELLY / post-Oct-2025 reforms** — nothing survived
   verification; entirely open.
3. **Japan access practicalities** — geo-blocking, FSA enforcement posture,
   on-ramp routes; only the tax picture was resolved.

## Sources (confirmed claims only)

- Hyperliquid official fee docs (`hyperliquid.gitbook.io/hyperliquid-docs/trading/fees`) — fee tiers, rebate shares, staking discounts (verified verbatim)
- Nagashima Ohno & Tsunematsu client alert (Mar 2026, via Lexology); Finance Magnates; PwC/EY Japan tax alerts — Japan tax regime and FIEA reform status
- `github.com/karpathy/autoresearch` — loop mechanics (README verified point-for-point)
- arXiv 2605.16895 ("The Alpha Illusion"), arXiv 2510.07920 ("Profit Mirage"), arXiv 2605.19337 (77-study audit) — LLM-trading validity gates
- nof1.ai technical post + Protos/SCMP coverage — Alpha Arena results and fee-drag post-mortem
- Datawallet fee guide (independently confirmed against primary docs)
- Refuted and excluded: neuralarb.com "3–12% APR majors / 20–60% long-tail" (0-3)
