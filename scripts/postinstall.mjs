import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, "..");

// INIT_CWD is set by npm to the dir where the user ran `npm install`
// Fallback: node_modules/opencode-provider-proxy/ -> opencode config root
const opencodeDir = process.env.INIT_CWD
  || path.resolve(packageDir, "../..");

const opencodeJson   = path.join(opencodeDir, "opencode.json");
const proxyConfigPath = path.join(opencodeDir, "provider-proxy.json");
const pluginName = "opencode-provider-proxy";

let modified = false;

// ── 1. Auto-register in opencode.json ──
if (fs.existsSync(opencodeJson)) {
  try {
    const raw = fs.readFileSync(opencodeJson, "utf-8");
    const config = JSON.parse(raw);
    const plugins = config.plugin || [];

    if (typeof plugins === "string") {
      // support: `"plugin": "oh-my-openagent"`
      if (plugins !== pluginName) {
        config.plugin = [plugins, pluginName];
        modified = true;
      }
    } else if (Array.isArray(plugins)) {
      if (!plugins.includes(pluginName)) {
        plugins.push(pluginName);
        config.plugin = plugins;
        modified = true;
      }
    } else {
      config.plugin = [pluginName];
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(opencodeJson, JSON.stringify(config, null, 2) + "\n");
      console.log(`  [opencode-provider-proxy] ✓ Registered in opencode.json`);
    }
  } catch (e) {
    console.error(`  [opencode-provider-proxy] ⚠ Could not update opencode.json: ${e.message}`);
  }
} else {
  console.log(`  [opencode-provider-proxy] ⚠ opencode.json not found at ${opencodeJson}`);
  console.log(`  [opencode-provider-proxy]   → Add "${pluginName}" to the "plugin" array manually`);
}

// ── 2. Auto-create default provider-proxy.json if missing ──
if (!fs.existsSync(proxyConfigPath)) {
  try {
    fs.writeFileSync(proxyConfigPath, "{}\n");
    console.log(`  [opencode-provider-proxy] ✓ Created default proxy config: provider-proxy.json`);
    console.log(`  [opencode-provider-proxy]   → Edit the file to add proxy mappings, e.g.:`);
    console.log(`  [opencode-provider-proxy]     { "deepseek": "http://127.0.0.1:7890" }`);
    console.log(`  [opencode-provider-proxy]   → Or set OPENCODE_PROVIDER_PROXY env var`);
    modified = true;
  } catch (e) {
    console.error(`  [opencode-provider-proxy] ⚠ Could not create provider-proxy.json: ${e.message}`);
  }
}

if (!modified) {
  console.log(`  [opencode-provider-proxy] ✓ Already configured`);
}
