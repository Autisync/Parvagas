# CV PARSING & AUTO-FILL

## Overview

The Parvagas platform supports intelligent CV parsing with auto-fill capabilities. When a candidate uploads their CV, the backend extracts structured information and returns confidence scores, allowing candidates to review and approve the parsed data before saving their profile.

---

## Supported File Formats

| Format | MIME Type | Status |
|--------|-----------|--------|
| PDF | `application/pdf` | ✅ Supported |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | ✅ Supported |
| DOC | `application/msword` | ✅ Supported |
| TXT | `text/plain` | ✅ Supported |

### File Constraints

- **Maximum size:** 10 MB
- **Minimum size:** 1 KB
- **Invalid files** are rejected with clear error messages

---

## CV Upload Flow

### 1. User Uploads CV

```
POST /candidates/cv/parse
Content-Type: multipart/form-data

[File: resume.pdf]
```

### 2. Backend Processing

```
1. Validate file type & size
2. Extract text from PDF/DOCX/TXT
3. Parse text using configured parser
4. Calculate confidence scores
5. Store file temporarily in Supabase
6. Return profile draft
```

### 3. Response Format

```json
{
  "parseRunId": "60d5ec49c1234567890abcde",
  "documentId": null,
  "aiProvider": "skima",
  "profileDraft": {
    "fullName": "John Smith",
    "email": "john@example.com",
    "phone": "+244912345678",
    "location": "Luanda, Angola",
    "professionalTitle": "Senior Software Engineer",
    "summary": "Experienced software engineer with 8+ years of expertise...",
    "skills": ["JavaScript", "React", "Node.js", "MongoDB"],
    "experience": [
      {
        "jobTitle": "Senior Engineer",
        "company": "Tech Company",
        "location": "Remote",
        "startDate": "2020-01",
        "endDate": "Present",
        "current": true,
        "description": "Led team of 5 engineers..."
      }
    ],
    "education": [
      {
        "degree": "Bachelor of Science",
        "institution": "University of X",
        "location": "City, Country",
        "startDate": "2012",
        "endDate": "2016",
        "description": "Computer Science"
      }
    ],
    "languages": ["Portuguese", "English"],
    "certifications": ["AWS Solutions Architect", "Kubernetes CKA"],
    "completionScore": 82
  },
  "confidence": {
    "overall": 78,
    "byField": {
      "fullName": 0.95,
      "email": 0.98,
      "phone": 0.88,
      "location": 0.75,
      "professionalTitle": 0.85,
      "summary": 0.82,
      "skills": 0.9,
      "experience": 0.78,
      "education": 0.72,
      "languages": 0.85,
      "certifications": 0.68
    },
    "report": {
      "overallConfidence": 0.78,
      "flaggedFields": [
        {
          "field": "location",
          "confidence": 75,
          "message": "Low confidence on location - please review"
        }
      ],
      "warnings": []
    }
  },
  "missingFields": [],
  "requiresCandidateApproval": true,
  "fallbackUsed": false
}
```

### 4. Candidate Reviews & Approves

```
POST /candidates/profile/approve
Content-Type: application/json

{
  "profileDraft": { ...edited profile data... },
  "parseRunId": "60d5ec49c1234567890abcde",
  "consentGiven": true
}
```

### 5. Profile Saved

Profile is now stored in the database and candidate can edit it anytime.

---

## Parsed Data Structure

### Field Definitions

| Field | Type | Max Length | Notes |
|-------|------|-----------|-------|
| `fullName` | string | 100 | Candidate's full name |
| `email` | string | 100 | Email address (validated format) |
| `phone` | string | 20 | Phone number with country code |
| `location` | string | 100 | City, Country or similar |
| `professionalTitle` | string | 80 | Current or desired job title |
| `summary` | string | 2000 | Professional summary/about |
| `skills` | array[string] | 40 per skill | Technical & soft skills |
| `experience` | array[object] | - | Work history |
| `education` | array[object] | - | Educational background |
| `languages` | array[string] | 30 per language | Languages spoken |
| `certifications` | array[string] | 80 per cert | Licenses & certifications |
| `expectedSalaryAoa` | number | - | Salary expectation (Kwanza) |
| `availability` | string | - | When available to start |
| `preferredJobType` | string | - | Full-time, part-time, contract, etc. |

### Experience Item

```json
{
  "jobTitle": "string",
  "company": "string",
  "location": "string",
  "startDate": "YYYY-MM",
  "endDate": "YYYY-MM or 'Present'",
  "current": boolean,
  "description": "string (optional)"
}
```

### Education Item

```json
{
  "degree": "string",
  "institution": "string",
  "location": "string",
  "startDate": "YYYY",
  "endDate": "YYYY",
  "description": "string (optional)"
}
```

---

## Confidence Scoring

### How Confidence Works

Each field receives a confidence score (0-100%) based on:
- **Extraction quality** — how clearly the parser found the data
- **Field format validity** — does it match expected patterns?
- **Completeness** — is required information present?

### Field-Specific Confidence Logic

#### Email (typically 95-98%)
- Validated email regex match
- Present and non-empty
- **Low confidence:** Malformed email address

#### Phone (typically 80-90%)
- Valid phone number format (7-15 digits)
- Presence of digits
- **Low confidence:** Ambiguous format or missing country code

#### Name (typically 85-95%)
- 2-5 words, reasonable length
- No numbers
- **Low confidence:** Too short, too long, or contains numbers

#### Location (typically 60-85%)
- Presence of location information
- **Low confidence:** Single-word location (could be incomplete)
- **High confidence:** "City, Country" format

#### Skills (typically 70-95%)
- 3+ skills detected
- **Low confidence:** <3 skills or >50 skills
- **High confidence:** 5-20 relevant skills

#### Experience (typically 70-90%)
- Complete fields: jobTitle, company, startDate, endDate
- **Low confidence:** Missing dates or company information

#### Education (typically 60-85%)
- Complete fields: degree, institution, startDate, endDate
- **Low confidence:** Missing institution or dates

---

## Parser Providers

### 1. SKIMA (Default, External API)

**Status:** Premium AI-based parsing

```bash
# Enable
RESUME_PARSER_PROVIDER=skima
SKIMA_API_KEY=your-api-key
```

**Pros:**
- High accuracy (85-95% confidence)
- Handles complex CVs
- Extracts nuanced information

**Cons:**
- Requires API key & subscription
- Slightly slower (1-3 seconds)
- Depends on external service

**Expected Confidence:** 80-90%

### 2. APYHUB (Alternative External API)

**Status:** Alternative premium parser

```bash
# Enable
RESUME_PARSER_PROVIDER=apyhub
APYHUB_API_KEY=your-api-key
```

**Pros:**
- Good accuracy
- Fast processing
- Good error handling

**Cons:**
- Requires API subscription
- Slightly less accurate than SKIMA

**Expected Confidence:** 75-85%

### 3. Manual Fallback (Local, Regex-Based)

**Status:** Always available, no API needed

```bash
# Enable (fallback is automatic)
RESUME_PARSER_PROVIDER=fallback
```

**Pros:**
- No API key required
- Fast (instant)
- Always works

**Cons:**
- Lower accuracy (60-75%)
- Heuristic-based parsing
- Limited field extraction

**Expected Confidence:** 50-70%

### 4. Automatic Failover

If the configured provider fails, the system automatically:

1. **Try configured provider** (SKIMA / APYHUB)
2. **Fall back to manual parser** if external fails
3. **Never block upload** — always return result

```
SKIMA → Fail → APYHUB → Fail → Manual Parser → Success
```

---

## Configuration

### Environment Variables

```bash
# Primary parser (skima, apyhub, or fallback)
RESUME_PARSER_PROVIDER=skima

# SKIMA API credentials
SKIMA_API_KEY=your-skima-key

# APYHUB API credentials
APYHUB_API_KEY=your-apyhub-key

# AI provider for fallback (for text extraction)
AI_PROVIDER=fallback
```

### Switching Providers

To change parser, update `server/.env`:

```bash
# Before (SKIMA)
RESUME_PARSER_PROVIDER=skima

# After (APYHUB)
RESUME_PARSER_PROVIDER=apyhub

# Restart server
pm2 restart parvagas
```

---

## Frontend Auto-Fill

### CV Upload Component

```jsx
import { useState } from 'react';

export function CvUploadForm() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [error, setError] = useState(null);

  const handleUpload = async (e) => {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/candidates/cv/parse', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to parse CV');
      }

      const result = await res.json();
      setParseResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (parseResult) {
    return (
      <CvReviewForm
        profileDraft={parseResult.profileDraft}
        confidence={parseResult.confidence}
        parseRunId={parseResult.parseRunId}
      />
    );
  }

  return (
    <div>
      <input
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        onChange={(e) => setFile(e.target.files[0])}
      />
      <button onClick={handleUpload} disabled={!file || loading}>
        {loading ? 'Uploading...' : 'Upload CV'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

### Review & Edit Component

```jsx
export function CvReviewForm({ profileDraft, confidence, parseRunId }) {
  const [formData, setFormData] = useState(profileDraft);

  const getLowConfidenceClass = (fieldConfidence) => {
    if (fieldConfidence < 0.5) return 'confidence-low';
    if (fieldConfidence < 0.7) return 'confidence-medium';
    return 'confidence-high';
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="review-header">
        <h2>Review Your CV Parsing Results</h2>
        <p>
          {Math.round(confidence.overall)}% of your data was extracted with confidence
        </p>
      </div>

      {confidence.report.flaggedFields.length > 0 && (
        <div className="warning-box">
          <h3>⚠️ Please Review These Fields</h3>
          {confidence.report.flaggedFields.map((flag) => (
            <p key={flag.field}>
              {flag.field}: {flag.confidence}% confidence - {flag.message}
            </p>
          ))}
        </div>
      )}

      <div className="form-fields">
        {/* For each field, highlight if low confidence */}
        <FieldInput
          label="Full Name"
          value={formData.fullName}
          confidence={confidence.byField.fullName}
          onChange={(value) => setFormData({ ...formData, fullName: value })}
          className={getLowConfidenceClass(confidence.byField.fullName)}
        />

        <FieldInput
          label="Email"
          value={formData.email}
          confidence={confidence.byField.email}
          onChange={(value) => setFormData({ ...formData, email: value })}
          className={getLowConfidenceClass(confidence.byField.email)}
        />

        {/* ... more fields ... */}
      </div>

      <button type="submit">Save Profile</button>
    </form>
  );
}
```

### Confidence Display Component

```jsx
function ConfidenceIndicator({ score, label }) {
  return (
    <div className="confidence-indicator">
      <label>{label}</label>
      <div className="confidence-bar">
        <div
          className="confidence-fill"
          style={{
            width: `${score * 100}%`,
            backgroundColor: score > 0.8 ? '#4caf50' : score > 0.6 ? '#ff9800' : '#f44336',
          }}
        />
      </div>
      <span>{Math.round(score * 100)}%</span>
    </div>
  );
}
```

---

## Error Handling

### Common Errors

| Error | Status | Cause | Solution |
|-------|--------|-------|----------|
| CV_UNSUPPORTED_FILE_TYPE | 400 | Wrong file type | Use PDF, DOCX, or DOC |
| CV_UPLOAD_TOO_LARGE | 413 | File > 10MB | Compress or split CV |
| CV_PARSE_FAILED | 400 | Parser error | Try again or enter manually |
| CV_STORAGE_FAILED | 500 | Storage error | Try again later |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "CV_PARSE_FAILED",
    "message": "We could not fully read this CV. Please review the fields manually.",
    "requestId": "uuid",
    "timestamp": "2026-05-10T12:34:56Z"
  }
}
```

### Fallback Behavior

If external parser fails:
- **Still returns profile draft** with fallback parser results
- **Confidence scores are lower** (60-70%)
- **User can edit manually** before saving

---

## Best Practices

### For Candidates

1. **Upload clear, well-formatted CVs**
   - Use standard sections (Summary, Experience, Education)
   - Keep formatting consistent
   - Avoid unusual fonts or colors

2. **Review confidence-flagged fields carefully**
   - Low confidence = parser was uncertain
   - Edit manually if needed
   - Don't save invalid data

3. **Complete missing fields**
   - Parser may not extract everything
   - Fill in gaps before saving

### For Developers

1. **Test with various CV formats**
   - Different templates
   - Multiple languages
   - Edge cases (unusual dates, missing sections)

2. **Handle parser failures gracefully**
   - Never crash on parse error
   - Return meaningful messages
   - Offer manual entry option

3. **Validate parsed data**
   - Check emails, phones, dates
   - Sanitize text fields
   - Enforce field constraints

---

## Testing

### Unit Tests

```javascript
import { calculateFieldConfidence } from '../services/confidenceScorer.js';

describe('Confidence Scoring', () => {
  it('should give high confidence to valid email', () => {
    const confidence = calculateFieldConfidence('email', 'john@example.com');
    expect(confidence).toBeGreaterThan(0.95);
  });

  it('should give low confidence to short name', () => {
    const confidence = calculateFieldConfidence('fullName', 'Jo');
    expect(confidence).toBeLessThan(0.5);
  });
});
```

### Integration Tests

```javascript
describe('CV Upload & Parse', () => {
  it('should parse PDF CV correctly', async () => {
    const res = await request(app)
      .post('/candidates/cv/parse')
      .attach('file', 'test-cv.pdf');

    expect(res.status).toBe(200);
    expect(res.body.profileDraft.fullName).toBeDefined();
    expect(res.body.confidence.overall).toBeGreaterThan(0);
  });

  it('should reject unsupported file types', async () => {
    const res = await request(app)
      .post('/candidates/cv/parse')
      .attach('file', 'test.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CV_UNSUPPORTED_FILE_TYPE');
  });
});
```

---

## Troubleshooting

### Parser Always Returns Low Confidence

**Symptoms:** All confidence scores < 60%

**Solutions:**
1. Check parser provider is configured correctly
2. Test with different CV formats
3. Try manual parser as baseline
4. Review test CVs for unusual formatting

### Parser Fails Silently

**Symptoms:** No error, but empty profile returned

**Solutions:**
1. Check API keys (SKIMA_API_KEY, APYHUB_API_KEY)
2. Verify network connectivity to parser service
3. Check CV file is readable (not corrupted)
4. Review server logs for errors

### Confidence Scores Seem Wrong

**Symptoms:** Email has low confidence despite looking valid

**Solutions:**
1. Review confidence calculation logic in `confidenceScorer.js`
2. Test with edge cases (unusual emails, special characters)
3. Adjust scoring thresholds if needed
4. Add custom rules for your CV formats

---

## Summary

- **Supported upload formats in Parvagas:** PDF, DOCX (max 10MB)
- **Parsers:** SKIMA (recommended) → APYHUB → Manual Fallback
- **Confidence scores:** 0-100% per field, helps flag uncertain extractions
- **Auto-fill:** Candidates review parsed data before saving
- **Always available:** Fallback parser ensures CVs can always be processed
- **Production ready:** Error handling, validation, and rate limiting included

For API documentation, see the [API Reference](./docs/api-reference.md).
For security considerations, see [SECURITY_ROTATION.md](./SECURITY_ROTATION.md).
