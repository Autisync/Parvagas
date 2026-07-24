"""publish_invalidate() is fire-and-forget: it must publish the right
payload shape when Redis is reachable, and never raise (nor block the
caller) when it isn't."""
import json
from unittest.mock import MagicMock

import app.services.live_update_service as live_update_service


def _reset_client_cache():
    live_update_service._client = None
    live_update_service._client_failed = False


def test_publish_invalidate_sends_expected_payload():
    _reset_client_cache()
    fake_client = MagicMock()
    live_update_service._client = fake_client

    live_update_service.publish_invalidate("applications", entity="message", action="created", path="/x")

    assert fake_client.publish.call_count == 1
    channel, raw_payload = fake_client.publish.call_args[0]
    assert channel == live_update_service.LIVE_UPDATE_CHANNEL
    payload = json.loads(raw_payload)
    assert payload["scope"] == "applications"
    assert payload["entity"] == "message"
    assert payload["action"] == "created"
    assert payload["path"] == "/x"
    assert payload["ts"]

    _reset_client_cache()


def test_publish_invalidate_never_raises_on_publish_failure():
    _reset_client_cache()
    fake_client = MagicMock()
    fake_client.publish.side_effect = ConnectionError("redis down")
    live_update_service._client = fake_client

    live_update_service.publish_invalidate("applications")  # must not raise

    _reset_client_cache()


def test_publish_invalidate_never_raises_when_client_unavailable():
    _reset_client_cache()
    live_update_service._client_failed = True

    live_update_service.publish_invalidate("applications")  # must not raise

    _reset_client_cache()
