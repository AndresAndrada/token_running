
import { 
    Connection, 
    Keypair, 
    PublicKey, 
    Transaction, 
    sendAndConfirmTransaction 
} from "@solana/web3.js";
import { 
    createTransferCheckedInstruction, 
    getAssociatedTokenAddress, 
    createAssociatedTokenAccountInstruction, 
    TOKEN_2022_PROGRAM_ID 
} from "@solana/spl-token";

// --- CONFIGURACIÓN ---
const CONNECTION_URL = "https://api.devnet.solana.com";
const MINT = new PublicKey("Fe2XHjzSKo9qTZmhj4hUpHCaqh4i4t73YUa2T81X2UfB");

// La Treasury Wallet es la misma que el Mint Authority en este caso
// Si tienes la Private Key, puedes firmar la transacción de retiro.
const TREASURY_SECRET_KEY = Uint8Array.from([
    35,93,34,119,201,192,113,204,69,34,38,59,13,41,76,113,26,133,228,68,95,88,77,5,66,183,212,132,117,63,151,97,63,71,82,18,13,178,183,47,154,220,46,131,156,166,244,31,106,111,13,187,103,166,43,216,126,1,32,130,121,78,118,64
]);

// ⚠️ REEMPLAZAR CON TU WALLET DE DESTINO REAL (Phantom, Solflare, etc.)
// Por defecto usaré una wallet de ejemplo, ¡CÁMBIALA!
const DESTINATION_WALLET = new PublicKey("8d3RZNCmRQtNeq4wiYTS8jRuSjs4CKo4G1S8X8qrYgiM"); 

async function withdraw() {
    const connection = new Connection(CONNECTION_URL, "confirmed");
    const treasuryKeypair = Keypair.fromSecretKey(TREASURY_SECRET_KEY);
    const treasuryWallet = treasuryKeypair.publicKey;

    console.log(`🏦 Treasury Wallet: ${treasuryWallet.toBase58()}`);
    console.log(`👉 Enviando a: ${DESTINATION_WALLET.toBase58()}`);

    // 1. Obtener ATA del Treasury (Origen)
    const sourceATA = await getAssociatedTokenAddress(
        MINT,
        treasuryWallet,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    // 2. Obtener ATA del Destino
    const destATA = await getAssociatedTokenAddress(
        MINT,
        DESTINATION_WALLET,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    // 3. Verificar saldo
    const balance = await connection.getTokenAccountBalance(sourceATA);
    console.log(`💰 Saldo actual en Treasury: ${balance.value.uiAmount} LIST`);

    if (!balance.value.uiAmount || balance.value.uiAmount <= 0) {
        console.log("❌ No hay fondos para retirar.");
        return;
    }

    const amountToWithdraw = balance.value.uiAmount; // Retirar TODO
    // O puedes poner una cantidad fija: const amountToWithdraw = 1000;
    
    console.log(`🔄 Retirando ${amountToWithdraw} LIST...`);

    const transaction = new Transaction();

    // 4. Crear ATA de destino si no existe
    const destAccountInfo = await connection.getAccountInfo(destATA);
    if (!destAccountInfo) {
        console.log("⚠️ Creando ATA para el destino...");
        transaction.add(
            createAssociatedTokenAccountInstruction(
                treasuryWallet, // Payer (Treasury paga el fee)
                destATA,
                DESTINATION_WALLET,
                MINT,
                TOKEN_2022_PROGRAM_ID
            )
        );
    }

    // 5. Instrucción de Transferencia
    transaction.add(
        createTransferCheckedInstruction(
            sourceATA, // Origen
            MINT, // Mint
            destATA, // Destino
            treasuryWallet, // Owner del Origen (Signer)
            BigInt(Math.round(amountToWithdraw * 10**9)), // Amount (9 decimales)
            9, // Decimals
            [],
            TOKEN_2022_PROGRAM_ID
        )
    );

    // 6. Enviar Transacción
    const txSig = await sendAndConfirmTransaction(connection, transaction, [treasuryKeypair]);
    
    console.log(`✅ Retiro Exitoso!`);
    console.log(`🔗 Tx: https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
}

withdraw().catch(console.error);
