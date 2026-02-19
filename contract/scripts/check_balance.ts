
import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";

const WALLET_PATH = "c:\\Users\\Pc\\Desktop\\list-token\\contract\\phantom-admin.json";
const data = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
const wallet = Keypair.fromSecretKey(new Uint8Array(data));

console.log("Wallet Public Key:", wallet.publicKey.toString());

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
connection.getBalance(wallet.publicKey).then(balance => {
    console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");
});
