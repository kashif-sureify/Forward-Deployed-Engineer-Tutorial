"""Page CSS and colours. All colours work on both light and dark themes."""

from __future__ import annotations

import streamlit as st

# US EPA air-quality index → colour (green → yellow → orange → red → purple → maroon)
AQI_COLORS: dict[str, str] = {
    "1": "#22c55e",
    "2": "#eab308",
    "3": "#f97316",
    "4": "#ef4444",
    "5": "#a855f7",
    "6": "#9f1239",
}
UNKNOWN_AQI_COLOR = "#6b7280"

CSS = """
<style>
.block-container { max-width: 880px; padding-top: 3.6rem; }

.hero {
  padding: 1.5rem 1.6rem 1.2rem; margin-bottom: 1.2rem; border-radius: 18px;
  background: linear-gradient(135deg, rgba(99,102,241,.16), rgba(6,182,212,.12));
  border: 1px solid rgba(99,102,241,.28);
}
.hero-title, .mini-title {
  font-weight: 800; letter-spacing: -.02em; line-height: 1.15;
  background: linear-gradient(90deg, #6366f1, #06b6d4);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hero-title { font-size: 2.1rem; }
.mini-title { font-size: 1.35rem; margin-bottom: .6rem; }
.hero-sub { margin: .45rem 0 .9rem; opacity: .8; font-size: 1.02rem; }
.chips span {
  display: inline-block; margin: .15rem .35rem .15rem 0; padding: .22rem .7rem;
  border-radius: 999px; font-size: .82rem;
  background: rgba(127,127,127,.12); border: 1px solid rgba(127,127,127,.22);
}
.section-label {
  font-size: .78rem; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; opacity: .6; margin: .4rem 0 .5rem;
}

.wx {
  margin: .7rem 0; padding: 1rem 1.1rem; border-radius: 16px;
  border: 1px solid rgba(127,127,127,.25);
  background: linear-gradient(135deg, rgba(99,102,241,.07), rgba(6,182,212,.05));
}
.wx-head { display: flex; align-items: center; gap: .9rem; }
.wx-emoji { font-size: 2.6rem; line-height: 1; }
.wx-city { font-weight: 700; font-size: 1.15rem; }
.wx-sub { opacity: .65; font-size: .85rem; }
.wx-temp { margin-left: auto; font-size: 2.5rem; font-weight: 300; line-height: 1; white-space: nowrap; }
.wx-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; margin: .9rem 0 .5rem; }
.wx-stat { padding: .45rem .65rem; border-radius: 10px; background: rgba(127,127,127,.09); }
.wx-stat .k { font-size: .74rem; opacity: .65; }
.wx-stat .v { font-size: 1.05rem; font-weight: 600; }
@media (max-width: 640px) {
  .wx-grid { grid-template-columns: repeat(2, 1fr); }
  .wx-temp { font-size: 2rem; }
  .wx-emoji { font-size: 2.1rem; }
}

.aqi {
  margin-top: .35rem; padding: .65rem .85rem; border-radius: 12px;
  border-left: 5px solid var(--aqi);
  background: color-mix(in srgb, var(--aqi) 13%, transparent);
}
.aqi-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .3rem .8rem; font-size: .93rem; }
.aqi-pm { opacity: .8; }
.aqi-scale { display: flex; gap: 4px; margin-top: .55rem; }
.aqi-scale span { flex: 1; height: 7px; border-radius: 4px; opacity: .22; }
.aqi-scale span.on { opacity: 1; transform: scaleY(1.45); }
.aqi-ends { display: flex; justify-content: space-between; font-size: .7rem; opacity: .55; margin-top: .2rem; }

.src { font-size: .9rem; margin: .1rem 0; }
.src-domain { opacity: .55; font-size: .8rem; margin-left: .35rem; }
.muted { opacity: .6; font-size: .82rem; }
</style>
"""


def inject_css() -> None:
    st.markdown(CSS, unsafe_allow_html=True)
