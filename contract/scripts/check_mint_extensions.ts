import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, ExtensionType, getExtensionData } from "@solana/spl-token";

const MINT_ADDRESS = new PublicKey("5wCQPqCAFgpoJUdSjBCjAiZLGq8EfeBhDZAbzm3fV2Ls");

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    console.log("🔍 Verificando extensiones del Mint:", MINT_ADDRESS.toBase58());

    try {
        const mint = await getMint(connection, MINT_ADDRESS, undefined, new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"));
        
        // Check if TransferHook extension is present
        const extensionData = getExtensionData(ExtensionType.TransferHook, mint.tlvData);
        
        if (extensionData) {
            console.log("✅ El Mint TIENE la extensión TransferHook habilitada.");
        } else {
            console.log("❌ El Mint NO TIENE la extensión TransferHook.");
            console.log("⚠️  Necesitas crear un nuevo Mint habilitando la extensión explícitamente.");
        }
    } catch (e) {
        console.error("Error al obtener el Mint:", e);
    }
}

main().catch(console.error);
