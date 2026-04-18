export const ONBOARDING_TOUR_START_EVENT = "completecrm:onboarding-tour-start";

export function triggerOnboardingMainTour(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_TOUR_START_EVENT));
}
