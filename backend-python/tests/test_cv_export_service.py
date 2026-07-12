"""Tests for cv_export_service.to_json_resume()'s JSON Resume v1 output shape.

Extended for the CV builder pre-fill integration (Phase 2 of the SSO
integration): the empty awards/volunteer/publications/interests/references/
projects arrays exist so importers expecting the full JSON Resume v1 shape
(e.g. Reactive Resume) don't choke on missing keys, and basics.location now
includes postalCode when available — but NOT fabricated city/region/
countryCode, since CandidateProfile only has one free-text location field.
"""
from app.services.cv_export_service import to_json_resume

_FULL_PROFILE = {
    "fullName": "Ana Sousa",
    "jobTitle": "Engenheira de Software",
    "email": "ana@example.com",
    "phone": "+244 900 000 000",
    "professionalSummary": "Engenheira com 5 anos de experiência.",
    "location": "Luanda, Angola",
    "postcode": "1000",
    "linkedinUrl": "https://linkedin.com/in/ana",
    "githubUrl": "https://github.com/ana",
    "portfolioUrl": "https://ana.dev",
    "workExperience": [
        {"company": "Acme", "jobTitle": "Dev", "location": "Luanda", "startDate": "2020", "endDate": "2023", "description": "Built things."},
    ],
    "education": [
        {"institution": "UAN", "fieldOfStudy": "Informática", "degree": "Licenciatura", "startDate": "2015", "endDate": "2019"},
    ],
    "hardSkills": ["Python", "SQL"],
    "techniques": ["Scrum"],
    "tools": ["Docker"],
    "languages": ["Português", "Inglês"],
    "certifications": ["AWS Certified"],
}


def test_full_profile_produces_expected_json_resume_shape():
    result = to_json_resume(_FULL_PROFILE)
    assert result["$schema"].endswith("schema.json")
    assert result["basics"]["name"] == "Ana Sousa"
    assert result["basics"]["email"] == "ana@example.com"
    assert {"network": "LinkedIn", "url": "https://linkedin.com/in/ana"} in result["basics"]["profiles"]
    assert result["work"][0]["name"] == "Acme"
    assert result["education"][0]["institution"] == "UAN"
    assert result["languages"] == [{"language": "Português", "fluency": ""}, {"language": "Inglês", "fluency": ""}]
    assert result["certificates"] == [{"name": "AWS Certified"}]


def test_location_includes_postal_code_when_present():
    result = to_json_resume(_FULL_PROFILE)
    assert result["basics"]["location"]["address"] == "Luanda, Angola"
    assert result["basics"]["location"]["postalCode"] == "1000"


def test_location_omits_postal_code_when_absent():
    profile = dict(_FULL_PROFILE)
    profile.pop("postcode")
    result = to_json_resume(profile)
    assert "postalCode" not in result["basics"]["location"]


def test_location_never_fabricates_city_region_or_country():
    result = to_json_resume(_FULL_PROFILE)
    location = result["basics"]["location"]
    assert "city" not in location
    assert "region" not in location
    assert "countryCode" not in location


def test_schema_completeness_sections_present_and_empty():
    result = to_json_resume(_FULL_PROFILE)
    for section in ("awards", "volunteer", "publications", "interests", "references", "projects"):
        assert result[section] == []


def test_empty_profile_still_produces_valid_shape():
    result = to_json_resume({})
    assert result["basics"]["name"] == ""
    assert result["basics"]["location"] == {"address": ""}
    assert result["work"] == []
    assert result["education"] == []
    assert result["skills"] == []
    for section in ("awards", "volunteer", "publications", "interests", "references", "projects"):
        assert result[section] == []
