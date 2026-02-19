import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const ADDRESS_TO_CHECK = new PublicKey("GL2xbHwX2WHeT6P6uBNzm4s7vxR3feQeUXGuoHuqcxA2");

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    
    console.log("🔍 Investigando dirección:", ADDRESS_TO_CHECK.toBase58());

    const accountInfo = await connection.getAccountInfo(ADDRESS_TO_CHECK);
    if (!accountInfo) {
        console.log("❌ La cuenta no existe en la red.");
        return;
    }

    console.log("📊 Owner del programa:", accountInfo.owner.toBase58());
    console.log("Pb Data length:", accountInfo.data.length);

    if (accountInfo.owner.toBase58() === TOKEN_2022_PROGRAM_ID.toBase58()) {
        console.log("✅ Es una Token Account (Token-2022).");
        try {
            const tokenAccount = await getAccount(connection, ADDRESS_TO_CHECK, undefined, TOKEN_2022_PROGRAM_ID);
            console.log("------------------------------------------------");
            console.log("👤 Dueño (Wallet Real):", tokenAccount.owner.toBase58());
            console.log("Dd Mint:", tokenAccount.mint.toBase58());
            console.log("💰 Saldo de Tokens:", Number(tokenAccount.amount));
            console.log("------------------------------------------------");
        } catch (e) {
            console.log("Error decodificando Token Account:", e);
        }
    } else {
        console.log("ℹ️  NO es una Token Account normal. Podría ser una Wallet o PDA de otro programa.");
    }
}

main().catch(console.error);
