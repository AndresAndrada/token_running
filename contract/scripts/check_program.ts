
import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const info = await connection.getAccountInfo(PROGRAM_ID);
    console.log("Program:", PROGRAM_ID.toBase58());
    if (info) {
        console.log("Executable:", info.executable);
        console.log("Data Len:", info.data.length);
        console.log("Owner:", info.owner.toBase58());
    } else {
        console.log("Program NOT FOUND.");
    }
}

main();
