import { beforeEach, describe, expect, it } from "vitest";
import { router } from "@/router";
import { useLifeos } from "@/stores/lifeos-native";

describe("native Glass router", () => {
  beforeEach(async () => {
    useLifeos().resetUiState();
    await router.push("/workspace/ai");
  });

  it("redirects the root path to the AI workspace", async () => {
    await router.push("/");
    expect(router.currentRoute.value.path).toBe("/workspace/ai");
    expect(useLifeos().activeId).toBe("ai");
  });

  it("decodes workspace sections and synchronizes native store state", async () => {
    await router.push("/workspace/work/Legal%20%26%20Finance");
    expect(router.currentRoute.value.name).toBe("workspace");
    expect(router.currentRoute.value.params.id).toBe("work");
    expect(router.currentRoute.value.params.section).toBe("Legal & Finance");
    expect(useLifeos().activeId).toBe("work");
    expect(useLifeos().currentSection).toBe("Legal & Finance");
  });

  it("supports the settings route without a Vue router instance", async () => {
    await router.push("/settings/Secrets%20%26%20Keys");
    expect(router.currentRoute.value.name).toBe("settings");
    expect(router.currentRoute.value.params.section).toBe("Secrets & Keys");
    expect(useLifeos().activeId).toBe("settings");
    expect(useLifeos().currentSection).toBe("Secrets & Keys");
  });
});
