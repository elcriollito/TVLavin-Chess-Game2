-- PlayV2InviteOnlyFeedbackSensitivePolicy@1.0.1.
-- PostgreSQL classifies the helper canonicalization expressions as STABLE.
begin;

alter function public._play_beta_feedback_contains_prohibited(text,text,text) stable;

commit;
