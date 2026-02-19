import { 
    Connection, 
    Keypair, 
    PublicKey, 
    clusterApiUrl,
    Transaction,
    sendAndConfirmTransaction
} from "@solana/web3.js";
import { 
    createMintToInstruction, 
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// CONFIGURATION
const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq");
// Esta dirección la obtuvo el usuario de los logs de Playground
const PLAYGROUND_ATA = new PublicKey("GL2xbHwX2WHeT6P6uBNzm4s7vxR3feQeUXGuoHuqcxA2");

// PATH TO KEYPAIR
// Ajustamos la ruta relativa para que funcione desde 'contract/scripts/' hacia '../../keypairs/'
const KEYPAIR_PATH = path.resolve(__dirname, "../../keypairs/mint-authority.json");

async function main() {
    console.log("Conectando a Devnet...");
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    if (!fs.existsSync(KEYPAIR_PATH)) {
        console.error(`❌ No se encontró el archivo de clave en: ${KEYPAIR_PATH}`);
        return;
    }

    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8")));
    const payer = Keypair.fromSecretKey(secretKey);

    console.log(`🔑 Wallet local cargada: ${payer.publicKey.toBase58()}`);
    console.log(`🎯 Mint Address: ${MINT_ADDRESS.toBase58()}`);
    console.log(`📬 Destino (Playground ATA): ${PLAYGROUND_ATA.toBase58()}`);

    // Check payer balance (SOL)
    const balance = await connection.getBalance(payer.publicKey);
    console.log(`💰 Saldo SOL (Local Wallet): ${balance / 1e9}`);

    if (balance < 0.001 * 1e9) {
        console.error("❌ Saldo SOL insuficiente en la wallet local para pagar la transacción.");
        console.log("👉 Debes fondear esta wallet local con SOL primero.");
        return;
    }

    // Check if ATA exists
    const ataInfo = await connection.getAccountInfo(PLAYGROUND_ATA);
    if (!ataInfo) {
        console.log("⚠️ La cuenta ATA de destino no existe en la red. Asegúrate de haber ejecutado el script de creación en Playground.");
        // Si no existe, podríamos intentar crearla, pero el usuario ya dijo que la creó.
    } else {
        console.log("✅ La cuenta ATA de destino existe.");
    }

    // MINT TO
    console.log("🚀 Enviando 1000 tokens...");
    try {
        const transaction = new Transaction().add(
            createMintToInstruction(
                MINT_ADDRESS,
                PLAYGROUND_ATA,
                payer.publicKey, // Authority
                BigInt(1000 * 1e9), // Amount (1000 tokens)
                [],
                TOKEN_2022_PROGRAM_ID
            )
        );

        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [payer]
        );

        console.log("✅✅✅ ÉXITO! Tokens enviados a Playground.");
        console.log(`🔗 Ver en Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    } catch (e) {
        console.error("❌ Error al enviar tokens:", e);
    }
}

main().catch(console.error);
