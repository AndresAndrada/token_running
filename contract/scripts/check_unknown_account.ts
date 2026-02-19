
import { Connection, PublicKey } from "@solana/web3.js";

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const pubkey = new PublicKey("4uQeVj6o1XrYuFKBqNn14eJ85SrPxm8suiVparnaCki");
    
    const info = await connection.getAccountInfo(pubkey);
    console.log("Account:", pubkey.toBase58());
    if (info) {
        console.log("Owner:", info.owner.toBase58());
        console.log("Executable:", info.executable);
        console.log("Data Len:", info.data.length);
    } else {
        console.log("Account not found.");
    }
}

main();
