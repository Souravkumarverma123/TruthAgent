// Runs once at server start. In replay mode, hands the Engine's default world the demo
// Scenarios, so the dev server answers the demo Claims at $0 without Engine code importing test data.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.OUTSIDE_WORLD_MODE === "live") return;
  const [{ setDemoScenarios }, { DEMO_SCENARIOS }] = await Promise.all([
    import("./lib/engine/boundary.ts"),
    import("./lib/engine/scenarios.ts"),
  ]);
  setDemoScenarios(DEMO_SCENARIOS);
}
