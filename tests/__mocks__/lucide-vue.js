// Mock lucide-vue-next so SFCs that import named icons (PascalCase) don't fail in jsdom.
// Returns a generic <svg /> stub component for any name accessed off the proxy.

import { defineComponent, h } from "vue";

const stub = defineComponent({
  name: "LucideStub",
  props: ["size", "strokeWidth"],
  render() {
    return h("svg", {
      width: this.size || 16, height: this.size || 16,
      viewBox: "0 0 24 24", "aria-hidden": "true",
      "data-test": "lucide-icon",
    });
  },
});

export default new Proxy({}, {
  get(_, key) {
    if (key === "__esModule" || key === "default" || typeof key !== "string") return undefined;
    return stub;
  },
});
