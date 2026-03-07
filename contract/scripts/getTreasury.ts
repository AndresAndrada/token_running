import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const privateKeyBase58 = "ZSub3HTsGPRcz7UJGmG3izwk9NdK3mdUzKYka6raTVTAMwvarc5nAd3Wx6LaB3yzgAoeVY1bLYrsFidajg7zGk1";
const decoded = bs58.decode(privateKeyBase58);
console.log("Tu Array para el .env:");
console.log(JSON.stringify(Array.from(decoded)));