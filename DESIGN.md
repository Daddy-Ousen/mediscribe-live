# Design System: MediScribe Live

## 1. Visual Theme & Atmosphere
A restrained, high-density clinical cockpit interface that feels like high-precision medical hardware (e.g., modern Draeger or Philips hospital telemetry systems) merged with a refined Swiss typographic print editorial. 
- **Density:** Cockpit Dense (Level 8) — data-rich, legible at a glance, calibrated for clinical urgency.
- **Variance:** Offset Asymmetric (Level 7) — 60/40 operational split, strict grid lines, zero generic centered containers.
- **Motion:** Restrained & Physical (Level 5) — hardware-accelerated transforms, crisp 150ms spring transitions, perpetual audio meter tick, zero linear bouncing.
- **Tone:** Professional, serious, reassuring. Zero AI gimmicks, zero emojis, zero cartoonish illustrations.

## 2. Color Palette & Roles
Strictly restrained, high-contrast palette calibrated for surgical clarity.

- **Obsidian Canvas** (`#090C10`) — Master background, deepest surface depth.
- **Console Surface** (`#0F141C`) — Elevated hardware panels, ledger containers.
- **Hairline Border** (`#1E2633`) — 1px structural grid dividers and card bounds.
- **Crisp Primary** (`#F1F5F9`) — High-visibility clinical text, primary headings.
- **Muted Slate** (`#64748B`) — Operational metadata, units of measure, secondary labels.
- **Clinical Emerald Accent** (`#10B981`) — Functional accent for active streams, verified safe states, and primary actions (Saturation 68%, zero outer glow).
- **Critical Crimson Alert** (`#EF4444`) — Reserved exclusively for clinical contraindications, ESI-1/2 triage warnings, and high-risk alerts.
- **Warning Amber** (`#F59E0B`) — Moderate pharmacology precautions and pending states.

*(Strictly BANNED: Neon purple/blue glows, gradient text fills, oversaturated backgrounds, and pure `#000000`)*.

## 3. Typography Architecture
- **Display & Section Headers:** Swiss Grotesk / Modern Sans (`system-ui, -apple-system, sans-serif`), tightly tracked (`letter-spacing: -0.025em`), uppercase kickers with wide tracking (`letter-spacing: 0.12em`).
- **Body & Clinical Prose:** Clean, legible sans-serif with relaxed line height (`line-height: 1.6`), max line-length 65ch.
- **Data & Telemetry Numbers (Mandatory Monospace):** Monospace (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`) for all vitals, timestamps, dosages, ICD-10 codes, WebSocket telemetry, and audio decibel readouts.
- **Banned:** `Inter` font, generic serifs (`Times`, `Georgia`), decorative handwritten fonts, and bouncy cursive scripts.

## 4. Component Stylings
- **Action Buttons:** Tactile flat hardware buttons. Subtle 1px inner highlight, crisp active press state (`transform: translateY(1px)`). No neon dropshadows or radial glows.
- **Panels & Dividers:** Thin 1px solid structural borders (`border-slate-800`). Structural hierarchy established through padding, hairline dividers, and monospaced metadata rather than stacked rounded cards.
- **Hardware VU Meter:** Monochrome and clinical emerald segmented vertical bars with calibrated dB levels (-36dB to 0dB), replacing generic rainbow soundbars.
- **Clinical Event Ledger:** Timestamped, audit-trail style logs for voice agent tool calls (`check_drug_interaction`, `flag_critical_vital`) with exact parameter schemas and contraindication disclosures.
- **Empty & Idle States:** Technical grid layout with diagnostic checklist and operational instructions — not vague illustrations or empty whitespace.

## 5. Layout Principles
- **Cockpit Grid:** Asymmetric two-column split screen (62% live operational canvas / 38% clinical decision support & triage gauge).
- **Zero Overlapping:** Every element occupies an explicit, non-overlapping spatial zone.
- **No 3-Column Equal Cards:** Layout uses asymmetrical telemetry sidebars, full-width diagnostic ledgers, and tabular clinical data grids.
- **Responsive Collapse:** Mobile views cleanly collapse to single-column order with persistent status bar and sticky action controls.

## 6. Motion & Interaction
- **Hardware Springs:** Interactive transitions use `cubic-bezier(0.16, 1, 0.3, 1)` for snappy, mechanical responsiveness.
- **Perpetual Telemetry:** Subtly pulsating green heartbeat on WebSocket edge connections and live decibel audio metering.
- **Barge-In Flush:** Instant 0ms audio buffer termination when patient or physician speaks.

## 7. Anti-Patterns (Banned AI Clichés)
- **NO emojis anywhere** (no 🩺, 💊, ⚡, 🚨, etc.). Replaced with precise, monochrome SVG status symbols.
- **NO AI copywriting clichés** ("Elevate", "Seamless", "Supercharge", "Next-Gen", "Revolutionary"). Replaced with direct clinical terminology ("Bedside Triage Protocol", "Pharmacology Interaction Engine", "HL7 FHIR v4 Document").
- **NO neon outer glows or gradient borders**.
- **NO generic 3-card marketing rows**.
- **NO cartoonish avatars or placeholder stock photos**.
