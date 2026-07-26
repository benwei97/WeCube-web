export const REQUIRED_POLICY_VERSION = "2026-07-26";

export function hasAcceptedCurrentPolicies(user) {
  return (
    user?.acceptedPolicyVersion === REQUIRED_POLICY_VERSION &&
    user?.acceptedTermsVersion === REQUIRED_POLICY_VERSION &&
    user?.acceptedPrivacyVersion === REQUIRED_POLICY_VERSION &&
    Boolean(user?.acceptedPoliciesAt)
  );
}
