-- Remove deprecated candidate profile photo fields and migrate salary payloads.
update public.candidate_profiles
set payload = jsonb_strip_nulls(
  (payload - 'profilePhotoUrl' - 'profilePhotoUpdatedAt' - 'salaryExpectation')
  || case
    when coalesce(payload->>'expectedSalaryAoa', '') <> '' then '{}'::jsonb
    when regexp_replace(coalesce(payload->>'salaryExpectation', ''), '[^0-9]', '', 'g') <> '' then
      jsonb_build_object(
        'expectedSalaryAoa', (regexp_replace(payload->>'salaryExpectation', '[^0-9]', '', 'g'))::bigint
      )
    else '{}'::jsonb
  end
);
