const fs = require("fs");
const json = JSON.parse(fs.readFileSync("artifacts/build-info/059cbe54be65cfd9b988e43864942272.json", "utf8"));
fs.writeFileSync("merchant-registry-input.json", JSON.stringify(json.input, null, 2));
console.log("solcVersion:", json.solcVersion);
console.log("solcLongVersion:", json.solcLongVersion);
console.log("optimizer:", JSON.stringify(json.input.settings.optimizer));
console.log("evmVersion:", json.input.settings.evmVersion);
