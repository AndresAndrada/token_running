import * as anchor from "@coral-xyz/anchor";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  TransactionInstruction,
  sendAndConfirmTransaction 
} from "@solana/web3.js";
import { 
  TOKEN_2022_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  ExtensionType, 
  getMintLen, 
  createInitializeMintInstruction, 
  createInitializeTransferHookInstruction, 
  createAssociatedTokenAccountInstruction, 
  getAssociatedTokenAddressSync, 
  mintTo, 
  getMint, 
  getTransferHook 
} from "@solana/spl-token";

// --- CONFIGURACIÓN ---
// ID del programa desplegado en Playground (Devnet)
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");

// --- IDL MINIMALISTA ---
// Definimos manualmente la estructura de la instrucción que necesitamos
// para no depender de si el IDL está subido a la red o no.
const IDL = {
  "version": "0.1.0",
  "name": "list_contract",
  "address": PROGRAM_ID.toBase58(),
  "instructions": [
    {
      "name": "initializeExtraAccountMetaList",
      "discriminator": [92, 197, 174, 197, 41, 124, 19, 3],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "extraAccountMetaList",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ]
};

async function main() {
  // 1. Configurar conexión y wallet
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  // Cargar wallet desde archivo local (mint-authority.json)
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(require("../../mint-authority.json"))
  );
  const wallet = new anchor.Wallet(walletKeypair);
  
  const provider = new anchor.AnchorProvider(
    connection, 
    wallet, 
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Program ID:", PROGRAM_ID.toBase58());

  // 2. Cargar el Programa usando el IDL manual
  // @ts-ignore
  const program = new anchor.Program(IDL, provider);
  console.log("✅ Programa conectado con IDL manual.");

  // 3. Generar nueva Mint
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  console.log("New Mint Address:", mint.toBase58());

  const mintLen = getMintLen([ExtensionType.TransferHook]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  // 4. Crear Mint e inicializar Hook
  const tx = new Transaction().add(
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
      PROGRAM_ID, // El programa Hook es el mismo contrato
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint,
      9, // Decimals
      wallet.publicKey,
      wallet.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );

  console.log("Creating Mint with Hook...");
  await sendAndConfirmTransaction(connection, tx, [walletKeypair, mintKeypair]);

  // 5. Inicializar ExtraAccountMetaList (Llamada al contrato)
  const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    PROGRAM_ID
  );

  console.log("Initializing ExtraAccountMetaList PDA:", extraAccountMetaListPDA.toBase58());
  
  /*
  const ix = await program.methods
    .initializeExtraAccountMetaList()
    .accounts({
      payer: wallet.publicKey,
      extraAccountMetaList: extraAccountMetaListPDA,
      mint: mint,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  */

  // Manually construct the instruction to avoid IDL resolution issues
  const discriminator = Buffer.from([92, 197, 174, 197, 41, 124, 19, 3]);
  
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: discriminator,
  });

  console.log("Instruction keys:");
  ix.keys.forEach((k, i) => {
    console.log(`[${i}] ${k.pubkey.toBase58()} (Mut: ${k.isWritable}, Signer: ${k.isSigner})`);
  });

  const tx2 = new Transaction().add(ix);
  await sendAndConfirmTransaction(connection, tx2, [walletKeypair]);
  console.log("✅ ExtraAccountMetaList initialized!");

  // 6. Crear ATA y Mintear (Prueba final)
  const ata = getAssociatedTokenAddressSync(
    mint,
    wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log("Creating ATA:", ata.toBase58());

  const ataInfo = await connection.getAccountInfo(ata);
  if (!ataInfo) {
    const txAta = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        ata,
        wallet.publicKey,
        mint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(connection, txAta, [walletKeypair]);
  }

  console.log("Minting tokens...");
  await mintTo(
    connection,
    walletKeypair,
    mint,
    ata,
    walletKeypair,
    BigInt(1000) * BigInt(10 ** 9),
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  // 7. Verificación
  const mintInfo = await connection.getAccountInfo(mint, "confirmed");
  const tlvData = mintInfo?.data.slice(82);
  const transferHook = getTransferHook({ address: mint, tlvData } as any);

  console.log("---------------------------------------------------");
  console.log("Resumen:");
  console.log("Mint:", mint.toBase58());
  console.log("Hook Program ID:", transferHook?.programId?.toBase58());
  console.log(
    "Supply:",
    (await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID)).supply.toString()
  );
  console.log("---------------------------------------------------");
}

main().catch(console.error);
