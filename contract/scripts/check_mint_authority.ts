import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq");

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    console.log("🔍 Consultando Mint:", MINT_ADDRESS.toBase58());

    try {
        const mintInfo = await getMint(
            connection,
            MINT_ADDRESS,
            undefined,
            TOKEN_2022_PROGRAM_ID
        );

        console.log("---------------------------------------------------");
        console.log("🔑 Mint Authority:", mintInfo.mintAuthority ? mintInfo.mintAuthority.toBase58() : "❌ REVOCADA (null)");
        console.log("❄️  Freeze Authority:", mintInfo.freezeAuthority ? mintInfo.freezeAuthority.toBase58() : "❌ REVOCADA (null)");
        console.log("📦 Supply:", Number(mintInfo.supply) / 10**mintInfo.decimals);
        console.log("---------------------------------------------------");

    } catch (e) {
        console.error("❌ Error al obtener información del Mint:", e);
    }
}

main().catch(console.error);
