"""Tests for public-URL resolution of stored images (pure, no DB/S3 calls)."""
from app.services.storage_service import StorageService
from app.api.v1.admin import _resolve_ad_image_update


# ---- StorageService.resolve_public_url ----

def test_passes_through_absolute_and_relative_urls():
    assert StorageService.resolve_public_url("https://example.com/x.png") == "https://example.com/x.png"
    assert StorageService.resolve_public_url("http://example.com/x.png") == "http://example.com/x.png"
    assert StorageService.resolve_public_url("/logo.png") == "/logo.png"
    assert StorageService.resolve_public_url("data:image/png;base64,AAA") == "data:image/png;base64,AAA"


def test_returns_none_for_blank_or_unrecognised_values():
    assert StorageService.resolve_public_url(None) is None
    assert StorageService.resolve_public_url("") is None
    # A bare local filesystem path (local-disk fallback) isn't publicly
    # browsable — better to show nothing than a broken <img> src.
    assert StorageService.resolve_public_url("/app/uploads/x.png".lstrip("/")) is None


def test_signs_server_and_supabase_refs(monkeypatch):
    calls = []

    def fake_signed_url(file_path, expires_in=3600):
        calls.append((file_path, expires_in))
        return "https://signed.example.com/x.png?sig=abc"

    monkeypatch.setattr(StorageService, "signed_url", staticmethod(fake_signed_url))

    assert StorageService.resolve_public_url("server:ad-image-1.png") == "https://signed.example.com/x.png?sig=abc"
    assert calls[0] == ("server:ad-image-1.png", 86400)

    assert StorageService.resolve_public_url("supabase:ad-image-2.png") == "https://signed.example.com/x.png?sig=abc"


# ---- admin._resolve_ad_image_update (edit round-trip corruption guard) ----

def test_fresh_upload_ref_is_stored_as_is():
    assert _resolve_ad_image_update("server:old.png", "server:new.png") == "server:new.png"


def test_blank_value_clears_the_image():
    assert _resolve_ad_image_update("server:old.png", "") is None
    assert _resolve_ad_image_update("server:old.png", None) is None


def test_echoed_back_resolved_url_does_not_overwrite_stable_ref(monkeypatch):
    monkeypatch.setattr(
        StorageService, "resolve_public_url",
        staticmethod(lambda ref, expires_in=86400: "https://signed.example.com/x.png?sig=abc" if ref else None),
    )
    # The admin form round-trips the resolved (signed) URL unchanged — must
    # NOT overwrite the durable "server:<key>" ref with the expiring one.
    result = _resolve_ad_image_update("server:old.png", "https://signed.example.com/x.png?sig=abc")
    assert result == "server:old.png"


def test_genuinely_different_external_url_is_stored(monkeypatch):
    monkeypatch.setattr(
        StorageService, "resolve_public_url",
        staticmethod(lambda ref, expires_in=86400: "https://signed.example.com/x.png?sig=abc" if ref else None),
    )
    result = _resolve_ad_image_update("server:old.png", "https://cdn.example.com/new-banner.png")
    assert result == "https://cdn.example.com/new-banner.png"
