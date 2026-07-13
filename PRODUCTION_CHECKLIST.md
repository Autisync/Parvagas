# PRODUCTION CHECKLIST

Complete this checklist before deploying Parvagas to production.

---

## PRE-DEPLOYMENT (1-2 weeks before)

### Code Quality
- [ ] Run TypeScript checks: `npm run typecheck`
- [ ] Run linter: `npm run lint`
- [ ] No console.log or debug statements left
- [ ] Remove all TODO/FIXME comments or assign to sprint
- [ ] All tests passing: `npm test`
- [ ] Code coverage > 80% for critical paths
- [ ] No hardcoded secrets or API keys in code

### Secrets & Environment
- [ ] Create `.env.production.example` with placeholders
- [ ] Create `server/.env.production.example` with placeholders
- [ ] All example files use safe placeholder values
- [ ] `.gitignore` protects `.env` files
- [ ] No `.env` files appear in Git history
- [ ] Test `.env` file locally with all required variables

### Database & Supabase
- [ ] Supabase project created (production instance)
- [ ] Database schema migrations applied
- [ ] RLS (Row Level Security) policies configured
- [ ] Backups enabled and tested
- [ ] Connection pooling configured if needed
- [ ] Storage buckets created and accessible
- [ ] `parvagas_cv_builder` database exists and is isolated from `parvagas`
- [ ] CV Builder migrations executed successfully (`cv-builder-migrate`)

### Email Service
- [ ] Email service account set up (SendGrid, Gmail, Mailgun, etc.)
- [ ] App-specific password generated (NOT account password)
- [ ] Email templates configured
- [ ] Test email sends successfully
- [ ] Email sender domain verified (SPF, DKIM, DMARC)
- [ ] Bounce handling configured

### Security
- [ ] JWT_SECRET generated: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] ADMIN_SIGNUP_KEY changed from default
- [ ] All sensitive env vars regenerated for production
- [ ] SUPABASE_SERVICE_ROLE_KEY is current (not old dev key)
- [ ] No shared/generic credentials used
- [ ] CORS_ORIGIN set to production domain(s) only
- [ ] NEXT_PUBLIC_API_URL set to production URL
- [ ] `RESUME_BUILDER_SECRET` and `CV_BUILDER_ENCRYPTION_SECRET` are set and rotated
- [ ] `PARVAGAS_WEBHOOK_SECRET` configured for integration signature validation

### Frontend Build
- [ ] Build completes without errors: `npm run build`
- [ ] TypeScript passes on frontend code
- [ ] Image imports use Next.js `Image` component correctly
- [ ] No external fonts causing build failures
- [ ] Static exports working if deploying to static host
- [ ] Environment variables correctly injected at build time

### Dependencies
- [ ] npm audit passes: `npm audit`
- [ ] No critical vulnerabilities
- [ ] All dependencies up to date (or documented why not)
- [ ] Lock file committed (`package-lock.json`)
- [ ] node_modules not committed to Git

---

## SERVER SETUP (1 week before)

### Infrastructure
- [ ] VPS/server provisioned (2GB+ RAM, 2+ cores)
- [ ] Node.js 18+ installed
- [ ] PM2 or Docker installed
- [ ] SSL certificates obtained (Let's Encrypt)
- [ ] Firewall configured (open only needed ports)
- [ ] Reverse proxy (Nginx/Traefik) installed
- [ ] Server time synced (important for JWT validation)

### Monitoring & Logging
- [ ] Sentry account created and configured (SENTRY_DSN set)
- [ ] Log aggregation set up (Datadog, CloudWatch, etc.)
- [ ] Alert thresholds configured
- [ ] Uptime monitoring configured
- [ ] Error tracking working
- [ ] Logs don't expose sensitive data

### Backups
- [ ] Database backup strategy documented
- [ ] Backup storage location secured
- [ ] Backup restoration tested
- [ ] Upload storage backup plan confirmed
- [ ] Disaster recovery plan documented

### Performance
- [ ] Load testing completed (see LOAD_TESTING.md)
- [ ] Database queries optimized
- [ ] Connection pooling tuned
- [ ] Caching strategy implemented if needed
- [ ] Response times acceptable (< 500ms p95)

---

## VALIDATION (3-5 days before)

### Environment Validation
- [ ] Run validation script: `npm run readiness:production`
- [ ] All checks pass (no FAIL messages)
- [ ] Run service checks: `npm run readiness:production -- --check-services`
- [ ] Database connection verified
- [ ] Email service verified
- [ ] Storage service verified
- [ ] All rate limits configured

### API Testing
- [ ] Health endpoint works: `GET /health` → 200 OK
- [ ] Ready endpoint works: `GET /ready` → 200 OK (all services true)
- [ ] Auth endpoints tested (login, register, forgot-password)
- [ ] CV upload and parsing tested
- [ ] Job application flow tested
- [ ] Error handling returns correct response format
- [ ] Rate limiting working correctly
- [ ] CORS headers correct for production domain
- [ ] CV Builder health check works: `GET /api/health` on `cv.parvagas.pt`
- [ ] Parvagas OAuth discovery reachable and login flow validated
- [ ] CV sync endpoint accepts idempotent retries safely

### Security Testing
- [ ] SQL injection attempts blocked
- [ ] XSS payloads sanitized
- [ ] CSRF protection active
- [ ] Sensitive data not logged (passwords, tokens, keys)
- [ ] JWT validation working
- [ ] Authentication required on protected routes
- [ ] Authorization checks working (role-based)
- [ ] Password reset flow secure and functional

### Data Quality
- [ ] Test data seeded (10+ users, jobs, applications)
- [ ] Fake/test data will be cleaned before go-live
- [ ] PII data cleaned before backup
- [ ] Database does not contain production personal data yet

### Frontend Testing
- [ ] All pages load correctly
- [ ] Forms submit successfully
- [ ] Error messages display properly
- [ ] Loading states work
- [ ] API integration working
- [ ] Responsive design on mobile/tablet
- [ ] Browser compatibility tested (Chrome, Firefox, Safari, Edge)

---

## DEPLOYMENT READINESS (2 days before)

### Documentation
- [ ] Deployment guide written
- [ ] Runbook created for common issues
- [ ] Rollback procedure documented
- [ ] Communication plan for downtime (if needed)
- [ ] Escalation contacts listed
- [ ] Admin contacts/access documented

### Team Preparation
- [ ] Team trained on deployment process
- [ ] Rollback procedures practiced
- [ ] Monitoring dashboard familiarized
- [ ] Support team briefed on known issues
- [ ] Emergency contacts confirmed

### Final Checklist
- [ ] All code merged and tested
- [ ] Production branch created (if using branching)
- [ ] Change log prepared
- [ ] No breaking changes in API
- [ ] Database schema compatible with old app (for smooth transition)
- [ ] Frontend and backend versions compatible

---

## GO-LIVE (Deployment Day)

### Pre-Deployment (1 hour before)
- [ ] Team on standby
- [ ] Monitoring dashboards open
- [ ] Communication channel active (Slack/Teams)
- [ ] Backup of production database taken
- [ ] Backup of current code tagged in Git

### Deployment Steps
1. [ ] Deploy backend to staging first
   ```bash
   npm run readiness:production --check-services
   ```

2. [ ] Test staging environment completely

3. [ ] Deploy frontend

4. [ ] Verify health checks pass
   ```bash
   curl https://api.parvagas.example.com/health
   curl https://api.parvagas.example.com/ready
   ```

5. [ ] Test critical user flows:
   - [ ] Register new account
   - [ ] Login
   - [ ] Upload CV
   - [ ] Apply to job
   - [ ] Password reset

6. [ ] Monitor error rates (should be 0% new errors)

7. [ ] Check database performance

8. [ ] Verify email sending works

### Post-Deployment (first 24 hours)
- [ ] Monitor error logs
- [ ] Monitor performance metrics
- [ ] Monitor user logins
- [ ] Check error alerts (should be minimal)
- [ ] Confirm email notifications sending
- [ ] Test on various devices/browsers
- [ ] Gather team feedback

---

## MONITORING CHECKLIST (Ongoing)

### Daily
- [ ] Check error logs for anomalies
- [ ] Monitor API response times
- [ ] Verify email delivery
- [ ] Check disk space usage
- [ ] Review authentication failures (brute force attempts?)

### Weekly
- [ ] Review error trends
- [ ] Check database performance
- [ ] Verify backups completed
- [ ] Review security logs
- [ ] Update monitoring thresholds if needed

### Monthly
- [ ] Performance audit
- [ ] Security audit
- [ ] Capacity planning
- [ ] Dependency updates
- [ ] Incident post-mortems (if any)

---

## POST-DEPLOYMENT (First 2 weeks)

### Performance Verification
- [ ] Response times stable
- [ ] No memory leaks
- [ ] No database connection issues
- [ ] CPU usage acceptable
- [ ] Disk space usage normal
- [ ] Network bandwidth acceptable

### User Experience
- [ ] No unusual error reports
- [ ] Password resets working
- [ ] CV uploads processing
- [ ] Jobs displaying correctly
- [ ] Applications submitting successfully
- [ ] Email notifications arriving
- [ ] No permission issues

### Security Verification
- [ ] No unauthorized access attempts
- [ ] Rate limiting working
- [ ] CORS restrictions holding
- [ ] SSL certificate valid and renewing properly
- [ ] No failed authentication patterns
- [ ] Sensitive data not exposed

### Business Metrics
- [ ] Job posting rate as expected
- [ ] Application rate as expected
- [ ] User engagement metrics normal
- [ ] Revenue/pricing calculations correct

---

## ROLLBACK PLAN

If critical issues occur, rollback procedure:

1. **Identify Issue**
   - Error rate > 1%
   - Core functionality broken
   - Security issue
   - Data corruption

2. **Decide Rollback**
   - Yes: Proceed to step 3
   - No: Fix issue in production

3. **Prepare Rollback**
   ```bash
   # Check backup status
   git log --oneline (last 5 commits)
   
   # Document current state
   ```

4. **Execute Rollback**
   ```bash
   # Revert to last known good version
   git checkout v1.0.0
   npm install
   npm run build
   
   # Restart server
   pm2 restart parvagas
   ```

5. **Verify Rollback**
   ```bash
   curl https://api.parvagas.example.com/health
   # Should return 200 OK
   ```

6. **Investigate Root Cause**
   - Review logs
   - Check changes deployed
   - Find bug
   - Fix in development

---

## SIGN-OFF

| Role | Name | Date | Approval |
|------|------|------|----------|
| Engineering Lead | __________ | ______ | [ ] |
| DevOps/Infrastructure | __________ | ______ | [ ] |
| Security Lead | __________ | ______ | [ ] |
| Product Lead | __________ | ______ | [ ] |
| Project Manager | __________ | ______ | [ ] |

---

## Related Documentation

- [DEPLOYMENT_SERVER.md](./DEPLOYMENT_SERVER.md) - Server setup guide
- [SECURITY_ROTATION.md](./SECURITY_ROTATION.md) - Secret management
- [CV_PARSING.md](./CV_PARSING.md) - CV parsing documentation
- [PASSWORD_RESET.md](./PASSWORD_RESET.md) - Password reset flow
- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) - Feature summary

---

**Last Updated:** May 2026  
**Next Review:** August 2026
