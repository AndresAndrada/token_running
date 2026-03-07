const fs = require("fs");

const keypairPath = "/mnt/c/Users/Pc/Desktop/list-token/keypairs/mint-authority.json";
const keypair = JSON.parse(fs.readFileSync(keypairPath, "utf8"));

console.log("Private key of mint_authority:", keypair);