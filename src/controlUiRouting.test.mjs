import test from "node:test";
import assert from "node:assert/strict";

import { rewriteControlUiBootstrapPath } from "./controlUiRouting.js";

test("rewriteControlUiBootstrapPath leaves unrelated paths untouched", () => {
  assert.equal(rewriteControlUiBootstrapPath("/openclaw/chat", "/openclaw/chat?session=main"), null);
  assert.equal(rewriteControlUiBootstrapPath("/__openclaw/control-ui-config.json", "/__openclaw/control-ui-config.json"), null);
});

test("rewriteControlUiBootstrapPath strips the hosted /openclaw prefix for control-ui bootstrap requests", () => {
  assert.equal(
    rewriteControlUiBootstrapPath(
      "/openclaw/__openclaw/control-ui-config.json",
      "/openclaw/__openclaw/control-ui-config.json"
    ),
    "/__openclaw/control-ui-config.json"
  );

  assert.equal(
    rewriteControlUiBootstrapPath(
      "/openclaw/__openclaw/control-ui-config.json",
      "/openclaw/__openclaw/control-ui-config.json?session=main&token=abc123"
    ),
    "/__openclaw/control-ui-config.json?session=main&token=abc123"
  );
});
