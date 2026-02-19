
import { 
    TOKEN_2022_PROGRAM_ID, 
    getAssociatedTokenAddressSync, 
    createAssociatedTokenAccountInstruction 
} from "@solana/spl-token";
import { 
    PublicKey, 
    SystemProgram, 
    Transaction,
    sendAndConfirmTransaction,
    SYSVAR_INSTRUCTIONS_PUBKEY
} from "@solana/web3.js";

const wallet = pg.wallet;
const connection = pg.connection;
const programId = pg.program.programId;

// Tu Mint Address
const MINT_ADDRESS = new PublicKey("GcKEsQgJAJoVoZeTgdYhRNHJaMKpeEhuhfQ5prEQDPt9");
// El Hook Program ID es el mismo contrato
const HOOK_PROGRAM_ID = programId; 

async function main() {
    console.log("🚀 Iniciando depósito con configuración CORRECTA...");

    const [statePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("state")],
        programId
    );

    const [escrowAuthPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), wallet.publicKey.toBuffer()],
        programId
    );

    const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), MINT_ADDRESS.toBuffer()],
        programId
    );

    console.log("📍 State PDA:", statePDA.toBase58());
    console.log("📍 ExtraMeta PDA:", extraAccountMetaListPDA.toBase58());

    const advertiserATA = getAssociatedTokenAddressSync(
        MINT_ADDRESS,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    const escrowATA = getAssociatedTokenAddressSync(
        MINT_ADDRESS,
        escrowAuthPDA,
        true, 
        TOKEN_2022_PROGRAM_ID
    );

    console.log("👤 Advertiser ATA:", advertiserATA.toBase58());
    console.log("🔒 Escrow ATA:", escrowATA.toBase58());

    const tx = new Transaction();
    
    // Verificar si el Escrow ATA existe, si no, crearlo
    const escrowAccountInfo = await connection.getAccountInfo(escrowATA);
    if (!escrowAccountInfo) {
        console.log("⚠️ Escrow ATA no existe. Creando...");
        tx.add(createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            escrowATA,
            escrowAuthPDA,
            MINT_ADDRESS,
            TOKEN_2022_PROGRAM_ID
        ));
    }

    // Verificar si el Advertiser ATA existe
    const advAccountInfo = await connection.getAccountInfo(advertiserATA);
    if (!advAccountInfo) {
        console.error("❌ Tu ATA no existe. Asegúrate de tener tokens.");
        return;
    }

    // Usar anchor.BN o pg.BN
    const BN = anchor.BN || pg.BN;
    const amount = new BN(50 * 1000000000); // 50 Tokens con 9 decimales

    // IMPORTANTE: Remaining Accounts para Transfer Hook
    // Orden estándar: [ExtraAccountMetaList, HookProgram, InstructionsSysvar]
    // Aunque la lista esté vacía, es buena práctica enviar estos para que el runtime pueda validar si quisiera.
    const remainingAccounts = [
        { pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: false },
        { pubkey: HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ];

    console.log("📦 Enviando transacción...");
    try {
        const depositIx = await pg.program.methods
            .depositToEscrow(amount)
            .accounts({
                state: statePDA,
                advertiser: wallet.publicKey,
                escrowAuth: escrowAuthPDA,
                escrowTokenAccount: escrowATA,
                advertiserTokenAccount: advertiserATA,
                mint: MINT_ADDRESS,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .instruction();

        tx.add(depositIx);

        const sig = await sendAndConfirmTransaction(connection, tx, [wallet.keypair]);
        console.log("✅ Depósito exitoso! Signature:", sig);
    } catch (e) {
        console.error("❌ Falló el depósito:", e);
        if (e.logs) {
            console.log("📜 Logs:", e.logs);
        }
    }
}

main().catch(console.error);
