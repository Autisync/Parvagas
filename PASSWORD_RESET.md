# PASSWORD RESET & RECOVERY

## Overview

Parvagas implements a production-grade password reset flow that prioritizes security and user experience. The system uses time-limited JWT tokens sent via email, with rate limiting and password strength requirements.

---

## Security Features

✅ **Secure tokens:** Time-limited JWT with 20-minute expiry  
✅ **Rate limiting:** Prevents brute force attacks  
✅ **Email verification:** Sent only to registered emails  
✅ **No info leakage:** Doesn't reveal if email exists  
✅ **Password strength:** Enforced requirements (8+ chars, uppercase, lowercase, number, symbol)  
✅ **Session invalidation:** Old tokens cannot be reused  
✅ **HTTPS only:** Tokens in URLs should only work over HTTPS  

---

## User Flow

### Step 1: Forgot Password Request

**User Action:**
- Clicks "Forgot Password" on login page
- Enters email address

**Request:**
```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response (Always Generic Success):**
```json
{
  "message": "If an account exists with this email, you will receive password reset instructions."
}
```

**Why Generic Response?**
- Security best practice: Never reveal if email exists in system
- Prevents account enumeration attacks
- Users must check their email inbox

### Step 2: Email Delivery

**Backend Actions:**
1. ✅ Find user by email
2. ✅ Generate reset token (JWT with 20-minute expiry)
3. ✅ Send email with reset link
4. ✅ Log action for audit trail

**Email Template:**
```
Subject: Parvagas | Password Recovery

Body:
---
Hello,

We received a request to reset the password for your account.

If you made this request, click the link below to reset your password:

[Reset Password Link]

This link expires in 20 minutes.

If you didn't request a password reset, you can safely ignore this email.

---

Security Note:
- Never share this email or link with others
- We will never ask for your password via email
- If you didn't request this, change your password immediately
```

**Reset Link Format:**
```
https://parvagas.example.com/reset-password?token=<JWT_TOKEN>
```

### Step 3: Reset Page

**User Action:**
- Receives email
- Clicks reset link
- Lands on password reset page

**Page Components:**
```
┌─────────────────────────────────────┐
│     Password Reset                  │
├─────────────────────────────────────┤
│ New Password:      [_______________]│
│ Confirm Password:  [_______________]│
├─────────────────────────────────────┤
│ Password Requirements:              │
│ ✓ Minimum 8 characters             │
│ ✓ At least 1 uppercase letter      │
│ ✓ At least 1 lowercase letter      │
│ ✓ At least 1 number                │
│ ✓ At least 1 special character     │
│                                     │
│         [ Reset Password ]          │
└─────────────────────────────────────┘
```

**Frontend Validation:**
```javascript
const isPasswordStrong = (password) => {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&      // Uppercase
    /[a-z]/.test(password) &&      // Lowercase
    /[0-9]/.test(password) &&      // Number
    /[^A-Za-z0-9]/.test(password)  // Special character
  );
};
```

### Step 4: Submit Reset

**User Action:**
- Enters new password
- Confirms new password
- Clicks "Reset Password"

**Request:**
```http
POST /auth/reset-password
Content-Type: application/json

{
  "resetToken": "eyJhbGciOiJIUzI1NiIs...",
  "newPassword": "SecureP@ssw0rd2026"
}
```

**Backend Validation:**
1. ✓ Validate token format
2. ✓ Verify JWT signature
3. ✓ Check token hasn't expired
4. ✓ Verify token purpose is "password-reset"
5. ✓ Find associated user
6. ✓ Validate new password strength
7. ✓ Ensure new password ≠ old password
8. ✓ Hash new password with bcrypt
9. ✓ Update user in database
10. ✓ Invalidate token (mark as used)

**Response:**
```json
{
  "message": "Password reset successfully. You can now log in with your new password.",
  "success": true
}
```

### Step 5: Confirmation

**User Action:**
- Sees success message
- Navigates to login page
- Logs in with new password

---

## API Endpoints

### POST /auth/forgot-password

Request a password reset email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`
```json
{
  "message": "If an account exists with this email, you will receive password reset instructions."
}
```

**Error Cases:**

| Status | Code | Message |
|--------|------|---------|
| 400 | VALIDATION_ERROR | Invalid email format |
| 429 | RATE_LIMITED | Too many requests (max 5 per 15 minutes) |
| 500 | EMAIL_SEND_FAILED | Email service error |

### POST /auth/reset-password

Reset password with valid token.

**Request:**
```json
{
  "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "newPassword": "NewSecureP@ssw0rd"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password reset successfully.",
  "success": true
}
```

**Error Cases:**

| Status | Code | Message |
|--------|------|---------|
| 400 | PASSWORD_RESET_TOKEN_INVALID | Token is invalid or malformed |
| 400 | PASSWORD_RESET_TOKEN_EXPIRED | Token has expired (>20 min old) |
| 400 | PASSWORD_WEAK | Password doesn't meet requirements |
| 400 | VALIDATION_ERROR | New password same as old password |
| 429 | RATE_LIMITED | Too many reset attempts |
| 500 | PASSWORD_RESET_FAILED | Database error |

---

## Configuration

### Environment Variables

```bash
# Required
JWT_SECRET=your-strong-secret-key-32-chars-minimum
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=noreply@example.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@example.com

# Optional
PASSWORD_RESET_TOKEN_EXPIRY=20m
PASSWORD_RESET_RATE_LIMIT=5/15m  # 5 requests per 15 minutes
```

### Rate Limiting

```bash
# Per email address
Forgot password: 5 requests / 15 minutes
Reset password:  3 requests / 15 minutes
```

Prevents:
- Spam reset requests
- Account lockouts via email bombing
- Brute force attempts

---

## Error Scenarios & Handling

### Scenario 1: Expired Token

**User:** Waits 25 minutes to click reset link

**What Happens:**
1. Frontend sends token to backend
2. Backend verifies JWT signature
3. Backend detects `exp` claim is in past
4. Returns `PASSWORD_RESET_TOKEN_EXPIRED`

**User Experience:**
```
❌ "Password reset link has expired.
   Please request a new one."
   
   [Request New Link]
```

**Code Example:**
```javascript
try {
  const decoded = jwt.verify(token, JWT_SECRET);
  // If we get here, token is valid and not expired
} catch (error) {
  if (error.name === 'TokenExpiredError') {
    // Token expired
    return AppErrors.passwordResetTokenExpired();
  }
  // Invalid signature or format
  return AppErrors.passwordResetTokenInvalid();
}
```

### Scenario 2: Weak Password

**User:** Enters "password123"

**What Happens:**
1. Frontend validates (should catch this)
2. Backend validates again
3. Password missing special character
4. Returns `PASSWORD_WEAK`

**User Experience:**
```
❌ "Password must include at least 1 special character (!@#$%^&*)"

Requirements:
✓ Minimum 8 characters
✓ At least 1 uppercase letter
✓ At least 1 lowercase letter
✓ At least 1 number
✗ At least 1 special character
```

### Scenario 3: Rate Limited

**User:** Clicks "Send Reset Email" 10 times

**What Happens:**
1. Request #1-5: Success
2. Request #6+: Returns 429 (Too Many Requests)

**User Experience:**
```
❌ "Too many reset requests. Please try again in 15 minutes."
```

### Scenario 4: Email Not Found (Generic Response)

**User:** Enters "nonexistent@example.com"

**What Happens:**
1. Backend searches for user
2. User not found
3. Still returns success (no info leak)

**User Experience:**
```
✓ "If an account exists with this email, you will receive 
   password reset instructions."
   
   (No email is sent, but user doesn't know)
```

---

## Security Best Practices

### For Administrators

1. **Secure JWT Secret**
   - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Store in `server/.env`, NEVER commit
   - Rotate every 6-12 months
   - Minimum 32 characters

2. **Monitor Suspicious Activity**
   - Watch for password reset spam
   - Track failed reset attempts
   - Alert on rate limit exceeded

3. **Email Service Security**
   - Use app-specific passwords (not account password)
   - Enable SPF, DKIM, DMARC
   - Verify sender domain

### For Users

1. **Click Immediately**
   - Reset links expire in 20 minutes
   - Don't delay clicking the link

2. **Verify URL**
   - Make sure URL is `https://parvagas.example.com`
   - Don't click links from suspicious emails
   - Beware of phishing attempts

3. **Protect Reset Email**
   - Don't share reset links
   - Clear email after password reset
   - Check "Forgot Password?" is legitimate

4. **Strong New Password**
   - Use unique password (not reused elsewhere)
   - Consider using password manager
   - Avoid common patterns

---

## Implementation Details

### Token Generation

```javascript
const resetToken = jwt.sign(
  {
    userId: user._id,
    purpose: "password-reset",
    type: "reset-token-v1"
  },
  process.env.JWT_SECRET,
  { expiresIn: "20m" }  // Expires in 20 minutes
);
```

### Token Validation

```javascript
try {
  const decoded = jwt.verify(resetToken, JWT_SECRET);
  
  // Additional validation
  if (decoded.purpose !== "password-reset") {
    throw new Error("Invalid token purpose");
  }
  
  // Find user
  const user = await User.findById(decoded.userId);
  if (!user) {
    throw new Error("User not found");
  }
  
  // Proceed with password reset
} catch (error) {
  // Handle various errors
  if (error.name === "TokenExpiredError") {
    return AppErrors.passwordResetTokenExpired();
  }
  return AppErrors.passwordResetTokenInvalid();
}
```

### Password Hashing

```javascript
const validatePasswordStrength = (password) => {
  if (String(password || "").length < 8) 
    return "Minimum 8 characters";
  if (!/[A-Z]/.test(password)) 
    return "At least 1 uppercase letter";
  if (!/[a-z]/.test(password)) 
    return "At least 1 lowercase letter";
  if (!/[0-9]/.test(password)) 
    return "At least 1 number";
  if (!/[^A-Za-z0-9]/.test(password)) 
    return "At least 1 special character";
  return "";
};

// Hash new password
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(newPassword, salt);
user.password = hashedPassword;
await user.save();
```

---

## Testing

### Unit Tests

```javascript
describe('Password Reset', () => {
  it('should validate password strength', () => {
    expect(validatePasswordStrength("weak")).toBe(false);
    expect(validatePasswordStrength("SecureP@ssw0rd")).toBe(true);
  });

  it('should detect weak passwords', () => {
    const cases = [
      { password: "short", issue: "too short" },
      { password: "noupppercase123!", issue: "no uppercase" },
      { password: "NOLOWERCASE123!", issue: "no lowercase" },
      { password: "NoNumbers!", issue: "no numbers" },
      { password: "NoSymbols123", issue: "no symbols" }
    ];
    
    cases.forEach(({ password, issue }) => {
      expect(validatePasswordStrength(password)).toBeTruthy();
    });
  });
});
```

### Integration Tests

```javascript
describe('POST /auth/forgot-password', () => {
  it('should return generic success', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'existing@example.com' });
    
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If an account exists');
  });

  it('should not reveal if email exists', async () => {
    const res1 = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'existing@example.com' });
    
    const res2 = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' });
    
    expect(res1.body).toEqual(res2.body);
  });

  it('should respect rate limits', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'user@example.com' });
      expect(res.status).toBe(200);
    }
    
    // 6th request should be rate limited
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'user@example.com' });
    expect(res.status).toBe(429);
  });
});

describe('POST /auth/reset-password', () => {
  it('should reset password with valid token', async () => {
    // Generate valid token
    const token = jwt.sign(
      { userId: user._id, purpose: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '20m' }
    );
    
    const res = await request(app)
      .post('/auth/reset-password')
      .send({
        resetToken: token,
        newPassword: 'NewSecureP@ssw0rd'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject expired tokens', async () => {
    // Generate expired token
    const token = jwt.sign(
      { userId: user._id, purpose: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '-1h' }  // Already expired
    );
    
    const res = await request(app)
      .post('/auth/reset-password')
      .send({
        resetToken: token,
        newPassword: 'NewSecureP@ssw0rd'
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PASSWORD_RESET_TOKEN_EXPIRED');
  });

  it('should reject weak passwords', async () => {
    const token = jwt.sign(
      { userId: user._id, purpose: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '20m' }
    );
    
    const res = await request(app)
      .post('/auth/reset-password')
      .send({
        resetToken: token,
        newPassword: 'weak'  // Too weak
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PASSWORD_WEAK');
  });
});
```

---

## Troubleshooting

### User Never Receives Reset Email

**Symptoms:** User clicks "Forgot Password", doesn't get email

**Check:**
1. Email service is configured (`EMAIL_HOST`, `EMAIL_USER`, etc.)
2. Email provider allows sending (check app password vs account password)
3. Verify endpoint logs: `npm run server 2>&1 | grep email`
4. Test email manually: Check Sentry for errors

**Fix:**
```bash
# Test email configuration
node -e "
  require('dotenv').config({ path: 'server/.env' });
  const nm = require('nodemailer');
  const t = nm.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  t.verify((e, ok) => console.log(e || 'Email OK'));
"
```

### Reset Link Shows "Token Expired"

**Symptoms:** User clicks link in email, gets token expired error

**Causes:**
- Email delayed >20 minutes
- System time is incorrect
- JWT_SECRET was rotated

**Fix:**
1. Increase token expiry in code (if needed for your use case)
2. Sync server time: `ntpdate -s time.nist.gov`
3. Request new password reset link

### User Gets "Token Invalid"

**Symptoms:** Correct URL but "token invalid" error

**Causes:**
- Email client modified URL
- Token was tampered with
- JWT_SECRET mismatch (if server restarted with new secret)

**Fix:**
1. Request new reset email
2. Copy link carefully (no spaces/line breaks)
3. Verify URL isn't truncated in email client

---

## Summary

| Aspect | Details |
|--------|---------|
| **Token Expiry** | 20 minutes |
| **Rate Limits** | 5 requests per 15 minutes per email |
| **Password Min Length** | 8 characters |
| **Password Requirements** | Uppercase, lowercase, number, special char |
| **Email Service** | Required, configurable |
| **Security** | JWT, bcrypt hashing, rate limiting |
| **User Experience** | Email link, generic success responses |

### Key Security Properties

✓ Time-limited tokens  
✓ One-time use (tokens validated on use)  
✓ Rate limited (prevents brute force)  
✓ Generic responses (prevents account enumeration)  
✓ Strong password requirements  
✓ Email verification required  
✓ Secure hashing (bcrypt)  

For environment setup, see [DEPLOYMENT_SERVER.md](./DEPLOYMENT_SERVER.md).  
For security details, see [SECURITY_ROTATION.md](./SECURITY_ROTATION.md).
