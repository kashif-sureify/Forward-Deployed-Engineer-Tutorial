"""UI tests: run main.py with Streamlit's AppTest against a scripted FakeAgent."""

from __future__ import annotations

from streamlit.testing.v1 import AppTest

from core import config as core_config

from tests.conftest import APP_FILE


def markdown_html(at: AppTest) -> list[str]:
    return [m.value for m in at.markdown]


def has(at: AppTest, snippet: str) -> bool:
    return any(snippet in value for value in markdown_html(at))


def theme_scripts(at: AppTest) -> list[str]:
    return [str(e.proto) for e in at.main if "stActiveTheme" in str(getattr(e, "proto", ""))]


def test_empty_state(app):
    assert not app.exception
    assert has(app, 'class="hero-title"')
    assert len([b for b in app.button if (b.key or "").startswith("example-")]) == 4
    assert app.button_group(key="theme_mode").value == "system"
    assert any("fake-model" in m.value for m in app.sidebar.markdown)
    assert len(app.chat_input) == 1
    assert app.query_params["thread"] == app.session_state["thread_id"]
    assert len(app.session_state["thread_id"]) == 32


def test_weather_question_renders_card(app):
    app.chat_input[0].set_value("What's the weather in Islamabad?").run()
    assert not app.exception
    history = app.session_state["history"]
    assert [h["role"] for h in history] == ["user", "assistant"]
    assert history[1]["steps"][0]["artifact"]["city"] == "Islamabad"
    assert has(app, 'class="wx"') and has(app, "Islamabad")
    assert has(app, 'class="aqi"')
    assert has(app, 'class="mini-title"') and not has(app, 'class="hero-title"')
    assert any("1 question" in m.value for m in app.sidebar.markdown)


def test_example_button_search_renders_deduplicated_safe_sources(app):
    app.button(key="example-3").click().run()  # "Latest LangChain news"
    assert not app.exception
    sources = [v for v in markdown_html(app) if 'class="src"' in v]
    assert len(sources) == 1  # duplicate URL and javascript: link dropped
    assert "LangChain &lt;1.0&gt; release" in sources[0]


def test_reload_restores_chat_from_agent_memory(app):
    app.chat_input[0].set_value("What's the weather in Islamabad?").run()
    thread = app.session_state["thread_id"]

    reloaded = AppTest.from_file(APP_FILE, default_timeout=30)
    reloaded.query_params["thread"] = thread
    reloaded.run()
    assert not reloaded.exception
    assert reloaded.session_state["thread_id"] == thread
    assert [h["role"] for h in reloaded.session_state["history"]] == ["user", "assistant"]
    assert has(reloaded, 'class="wx"')
    assert len(reloaded.expander) == 1  # the tool steps of the restored turn


def test_invalid_thread_in_url_is_ignored(fake_agent):
    at = AppTest.from_file(APP_FILE, default_timeout=30)
    at.query_params["thread"] = "../not-a-thread"
    at.run()
    assert at.session_state["thread_id"] != "../not-a-thread"
    assert at.session_state["history"] == []


def test_new_chat_starts_fresh_thread(app):
    app.chat_input[0].set_value("hello").run()
    old_thread = app.session_state["thread_id"]
    app.button(key="new-chat").click().run()
    assert app.session_state["thread_id"] != old_thread
    assert app.session_state["history"] == []
    assert has(app, 'class="hero-title"')


def test_theme_choice_emits_reload_script_once(app):
    app.button_group(key="theme_mode").set_value("dark").run()
    scripts = theme_scripts(app)
    assert len(scripts) == 1 and "Dark" in scripts[0]
    app.run()
    assert theme_scripts(app) == []  # no reload loop


def test_agent_error_is_shown_in_chat(app, fake_agent):
    fake_agent.error = RuntimeError("429 quota exceeded")
    app.chat_input[0].set_value("hello").run()
    assert not app.exception
    assert has(app, "429 quota exceeded")
    assert app.session_state["history"][-1]["content"].startswith("⚠️ **Error:**")


def test_missing_config_shows_error(fake_agent, monkeypatch):
    def missing(*args, **kwargs):
        raise RuntimeError("Missing in .env: GEMINI_API_KEY")

    monkeypatch.setattr(core_config, "load_config", missing)
    at = AppTest.from_file(APP_FILE, default_timeout=30).run()
    assert not at.exception
    assert "GEMINI_API_KEY" in at.error[0].value
    assert len(at.chat_input) == 0
