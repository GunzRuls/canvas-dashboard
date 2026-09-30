// For the setup walkthrough (/setup?tour=1). The walkthrough runs on sample data only
// (TOUR_SAMPLE in lib/tour.js, filled in by Onboarding), so this reads nothing: no Canvas call and
// no saved settings, and none of your real details end up on the page.
export async function tourProps() {
  return { sample: true };
}
