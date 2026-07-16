import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const RPC = "https://solana-mainnet.g.alchemy.com/v2/olUaug5e7HLKLIeYPBlUH";
const MINT_ADDR = "3f6cL1rZV1vG7Ffkaes3361diBkFN38bT7mPbu4wGKGz";
const PROGRAM_ID = new PublicKey("D6J4e2nQDFupaitnirnp7HerHw5zdpGwNyRvJUrVu7ji");

async function main() {
    const connection = new Connection(RPC, "confirmed");
    const mintPubkey = new PublicKey(MINT_ADDR);

    console.log("🔍 Consultando el Mint en MAINNET:", MINT_ADDR);
    
    try {
        const mintInfo = await getMint(connection, mintPubkey, "confirmed", TOKEN_2022_PROGRAM_ID);
        console.log("\n📊 Información del Mint:");
        console.log("- Autoridad de Mint (mintAuthority):", mintInfo.mintAuthority?.toBase58() || "Ninguna");
        console.log("- Autoridad de Congelamiento (freezeAuthority):", mintInfo.freezeAuthority?.toBase58() || "Ninguna");
        console.log("- Supply Actual:", mintInfo.supply.toString());
        console.log("- Decimales:", mintInfo.decimals);

        // Calculate expected PDA for mint_auth from the program
        const [expectedMintAuthPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("mint_auth")],
            PROGRAM_ID
        );
        console.log("\n🔑 PDA de mint_auth esperado del Programa:", expectedMintAuthPDA.toBase58());

        if (mintInfo.mintAuthority?.toBase58() === expectedMintAuthPDA.toBase58()) {
            console.log("\n✅ ¡SÍ! La autoridad de este mint (mintAuthority) es el PDA de tu Program ID.");
        } else {
            console.log("\n❌ No, la autoridad de este mint NO coincide con el PDA de tu Program ID.");
        }

    } catch (err: any) {
        console.error("\n❌ Error al consultar el mint:", err.message);
        console.log("Asegúrate de que es un Token 2022 y que la dirección es correcta.");
    }
}

main();