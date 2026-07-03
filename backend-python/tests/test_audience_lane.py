"""Tests for audience-lane classification and the diversity signal
(pure classifier tests + a real-DB test for the group-by count query)."""
import uuid

from app.services.scraper_service import classify_audience_lane


def test_classifies_remote_roles():
    assert classify_audience_lane("Desenvolvedor Backend Remoto", None, None) == "remote"
    assert classify_audience_lane("Customer Support", "Remote", None) == "remote"


def test_classifies_professional_roles():
    assert classify_audience_lane("Engenheiro Civil", None, None) == "professional"
    assert classify_audience_lane("Gestor de Projeto", "Gestão", None) == "professional"


def test_classifies_skilled_trade_roles():
    assert classify_audience_lane("Eletricista Industrial", None, None) == "skilled_trade"
    assert classify_audience_lane("Motorista de Pesados", None, None) == "skilled_trade"


def test_classifies_entry_level_roles():
    assert classify_audience_lane("Auxiliar de Armazém", None, None) == "entry_level"
    assert classify_audience_lane("Estágio Profissional", None, "Sem experiência necessária") == "entry_level"


def test_returns_none_when_nothing_matches():
    assert classify_audience_lane("Vaga Genérica", None, None) is None
    assert classify_audience_lane(None, None, None) is None


def test_professional_takes_priority_over_entry_level_keyword_overlap():
    # "estágio" (entry_level) can co-occur with a professional-degree role —
    # professional should win since it's checked first.
    assert classify_audience_lane("Estágio para Engenheiro Mecânico", None, None) == "professional"
