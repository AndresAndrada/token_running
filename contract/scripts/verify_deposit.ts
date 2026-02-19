
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
    ExtensionType,
    createInitializeMintInstruction,
    createInitializeTransferHookInstruction,
    createInitializeMetadataPointerInstruction,
    getMintLen,
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
} from "@solana/spl-token";
import fs from "fs";
import { sha256 } from "@noble/hashes/sha256";

// --- CONFIGURACIÓN ---
const WALLET_PATH = "c:\\Users\\Pc\\Desktop\\list-token\\contract\\phantom-admin.json";
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");
const DECIMALS = 6;
const MINT_AMOUNT = 1000 * 10 ** DECIMALS;
const DEPOSIT_AMOUNT = 100 * 10 ** DECIMALS;

// --- UTILS ---
function loadWallet(path: string): Keypair {
    const data = JSON.parse(fs.readFileSync(path, "utf-8"));
    return Keypair.fromSecretKey(new Uint8Array(data));
}

// Helper to calculate discriminator
function getDiscriminator(name: string): Buffer {
    const preimage = `global:${name}`;
    const hash = sha256(new TextEncoder().encode(preimage));
    return Buffer.from(hash.slice(0, 8));
}

async function main() {
    console.log("🚀 Iniciando Script de Verificación de Depósito (Manual Mode)...");

    // 1. Setup
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const wallet = loadWallet(WALLET_PATH);
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
        commitment: "confirmed",
    });
    anchor.setProvider(provider);

    // 2. Crear Nuevo Mint con Transfer Hook
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    console.log("🆕 Nuevo Mint:", mint.toString());

    // PDAs
    const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), mint.toBuffer()],
        PROGRAM_ID
    );
    const [escrowAuthPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), wallet.publicKey.toBuffer()],
        PROGRAM_ID
    );
    const [statePDA] = PublicKey.findProgramAddressSync([Buffer.from("state")], PROGRAM_ID);

    // ATAs
    const userATA = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const escrowATA = getAssociatedTokenAddressSync(mint, escrowAuthPDA, true, TOKEN_2022_PROGRAM_ID);

    // Instrucciones para crear Mint
    const extensions = [ExtensionType.TransferHook, ExtensionType.MetadataPointer];
    const mintLen = getMintLen(extensions);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const transaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: mint,
            space: mintLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeTransferHookInstruction(
            mint,
            wallet.publicKey,
            PROGRAM_ID, // Transfer Hook Program ID
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMetadataPointerInstruction(
            mint,
            wallet.publicKey,
            mint, // Metadata address (self)
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(
            mint,
            DECIMALS,
            wallet.publicKey,
            null,
            TOKEN_2022_PROGRAM_ID
        )
    );

    try {
        await sendAndConfirmTransaction(connection, transaction, [wallet, mintKeypair]);
        console.log("✅ Mint creado exitosamente.");
    } catch (e) {
        console.error("❌ Error creando Mint:", e);
        return;
    }

    // 3. Inicializar ExtraAccountMetaList (On-Chain)
    console.log("⚙️ Inicializando ExtraAccountMetaList...");
    
    // Manual Instruction for initializeExtraAccountMetaList
    const initMetaDiscriminator = getDiscriminator("initialize_extra_account_meta_list");
    const initMetaIx = new TransactionInstruction({
        keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: initMetaDiscriminator,
    });

    try {
        const tx = new Transaction().add(initMetaIx);
        await sendAndConfirmTransaction(connection, tx, [wallet]);
        console.log("✅ ExtraAccountMetaList inicializada.");
    } catch (e) {
        console.error("❌ Error inicializando ExtraAccountMetaList:", e);
        return;
    }

    // 4. Crear User ATA y Mintear Tokens
    console.log("💰 Minteando tokens al usuario...");
    try {
        const tx = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                userATA,
                wallet.publicKey,
                mint,
                TOKEN_2022_PROGRAM_ID
            ),
            createMintToInstruction(
                mint,
                userATA,
                wallet.publicKey,
                MINT_AMOUNT,
                [],
                TOKEN_2022_PROGRAM_ID
            )
        );
        await sendAndConfirmTransaction(connection, tx, [wallet]);
        console.log("✅ Tokens minteados.");
    } catch (e) {
        console.error("❌ Error minteando tokens:", e);
        return;
    }

    // 5. Crear Escrow ATA
    console.log("🏦 Verificando/Creando Escrow ATA...");
    const escrowAccountInfo = await connection.getAccountInfo(escrowATA);
    if (!escrowAccountInfo) {
        try {
            const tx = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    wallet.publicKey,
                    escrowATA,
                    escrowAuthPDA,
                    mint,
                    TOKEN_2022_PROGRAM_ID
                )
            );
            await sendAndConfirmTransaction(connection, tx, [wallet]);
            console.log("✅ Escrow ATA creada:", escrowATA.toString());
        } catch (e) {
            console.error("❌ Error creando Escrow ATA:", e);
            return;
        }
    } else {
        console.log("ℹ️ Escrow ATA ya existe.");
    }

    // 6. DEPOSIT TO ESCROW (Prueba de Éxito)
    console.log("🔄 Ejecutando depositToEscrow (Debería FUNCIONAR)...");

    // Verificar State (Initialize if needed)
    const stateInfo = await connection.getAccountInfo(statePDA);
    if (!stateInfo) {
        console.log("⚠️ State no inicializado. Inicializando...");
        const initDiscriminator = getDiscriminator("initialize");
        const decimalsBuffer = Buffer.alloc(1);
        decimalsBuffer.writeUInt8(DECIMALS, 0);
        const initData = Buffer.concat([initDiscriminator, decimalsBuffer]);
        
        const initIx = new TransactionInstruction({
            keys: [
                { pubkey: statePDA, isSigner: false, isWritable: true },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: PROGRAM_ID,
            data: initData,
        });

        await sendAndConfirmTransaction(connection, new Transaction().add(initIx), [wallet]);
        console.log("✅ State inicializado.");
    }

    // Construct Deposit Instruction
    const depositDiscriminator = getDiscriminator("deposit_to_escrow");
    const amountBuffer = new BN(DEPOSIT_AMOUNT).toArrayLike(Buffer, "le", 8);
    const depositData = Buffer.concat([depositDiscriminator, amountBuffer]);

    const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

    // Keys expected by DepositToEscrow
    const keys = [
        { pubkey: statePDA, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // advertiser
        { pubkey: escrowAuthPDA, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: userATA, isSigner: false, isWritable: true }, // advertiser_token_account
        { pubkey: escrowATA, isSigner: false, isWritable: true }, // escrow_token_account
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        
        // REMAINING ACCOUNTS
        { pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: false },
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ];

    const depositIx = new TransactionInstruction({
        keys: keys,
        programId: PROGRAM_ID,
        data: depositData,
    });

    try {
        const tx = await sendAndConfirmTransaction(connection, new Transaction().add(depositIx), [wallet]);
        console.log("✅ Depósito Exitoso! TX:", tx);
    } catch (e: any) {
        console.error("❌ FALLÓ depositToEscrow:", e);
        if (e.logs) {
            console.log("Logs:", e.logs);
        }
    }
}

main().catch(console.error);
