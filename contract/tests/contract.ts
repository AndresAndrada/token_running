import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ListContract } from "../target/types/list_contract";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMint,
  getAccount,
} from "@solana/spl-token";
import assert from "assert";

describe("list_contract (new)", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.ListContract as Program<ListContract>;

  let admin: Keypair;
  let buyer: Keypair;
  let treasury: Keypair;
  let mint: PublicKey;
  let statePda: PublicKey;

  const DECIMALS = 6;

  before(async () => {
    admin = Keypair.generate();
    buyer = Keypair.generate();
    treasury = Keypair.generate();

    for (const kp of [admin, buyer, treasury]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        5_000_000_000
      );
      await provider.connection.confirmTransaction(sig, "finalized");
    }

    [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("state_v2")],
      program.programId
    );

    mint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      DECIMALS
    );
  });

  // ─────────────────────────────────────────────
  // 1. initialize
  // ─────────────────────────────────────────────
  it("initialize: creates state with decimals", async () => {
    await program.methods
      .initialize(DECIMALS)
      .accounts({
        state: statePda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const state = await program.account.state.fetch(statePda);
    assert.ok(state.admin.equals(admin.publicKey));
    assert.strictEqual(state.priceUsdCents, 1.0);
    assert.strictEqual(state.decimals, DECIMALS);
  });

  it("initialize: fails if called twice", async () => {
    try {
      await program.methods
        .initialize(DECIMALS)
        .accounts({
          state: statePda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      assert.fail("Initialize should fail if already initialized");
    } catch (err) {
      assert.ok(err.toString().includes("already in use"));
    }
  });

  // ─────────────────────────────────────────────
  // 2. update_price
  // ─────────────────────────────────────────────
  it("update_price: only admin", async () => {
    await program.methods
      .updatePrice(2.5)
      .accounts({
        state: statePda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const state = await program.account.state.fetch(statePda);
    assert.strictEqual(state.priceUsdCents, 2.5);
  });

  it("update_price: fails if not admin", async () => {
    try {
      await program.methods
        .updatePrice(3.0)
        .accounts({
          state: statePda,
          admin: buyer.publicKey,
        })
        .signers([buyer])
        .rpc();

      assert.fail("Non-admin should not update price");
    } catch (err) {
      assert.ok(err.toString().includes("Unauthorized"));
    }
  });

  // ─────────────────────────────────────────────
  // 3. buy_tokens
  // ─────────────────────────────────────────────
  it("buy_tokens: debits SOL and mints tokens", async () => {
    const solAmount = 100_000_000; // 0.1 SOL
    const buyerAta = getAssociatedTokenAddressSync(mint, buyer.publicKey);

    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountInstruction(
          buyer.publicKey,
          buyerAta,
          buyer.publicKey,
          mint
        )
      ),
      [buyer]
    );

    const beforeSol = await provider.connection.getBalance(buyer.publicKey);
    const beforeToken = (await getAccount(provider.connection, buyerAta)).amount;

    await program.methods
      .buyTokens(new anchor.BN(solAmount))
      .accounts({
        state: statePda,
        buyer: buyer.publicKey,
        treasury: treasury.publicKey,
        mint,
        buyerTokenAccount: buyerAta,
        mintAuthority: admin.publicKey,
        oracleAccount: SystemProgram.programId, // Dummy account for fallback logic
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer, admin])
      .rpc();

    const afterSol = await provider.connection.getBalance(buyer.publicKey);
    const afterToken = (await getAccount(provider.connection, buyerAta)).amount;

    const expectedUiTokens = 400;
    const expectedBase = BigInt(expectedUiTokens) * 1_000_000n;

    assert.ok(beforeSol - afterSol >= solAmount);
    assert.strictEqual(afterToken - beforeToken, expectedBase);
  });

  it("buy_tokens: fails with zero SOL amount", async () => {
    try {
      await program.methods
        .buyTokens(new anchor.BN(0))
        .accounts({
          state: statePda,
          buyer: buyer.publicKey,
          treasury: treasury.publicKey,
          mint,
          buyerTokenAccount: buyer.publicKey, // dummy
          mintAuthority: admin.publicKey,
          oracleAccount: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer, admin])
        .rpc();

      assert.fail("buy_tokens should fail with zero amount");
    } catch (err) {
      assert.ok(err.toString().includes("InvalidAmount"));
    }
  });

  it("buy_tokens: fails if amount too small", async () => {
    try {
      await program.methods
        .buyTokens(new anchor.BN(1)) // 1 lamport
        .accounts({
          state: statePda,
          buyer: buyer.publicKey,
          treasury: treasury.publicKey,
          mint,
          buyerTokenAccount: buyer.publicKey, // dummy
          mintAuthority: admin.publicKey,
          oracleAccount: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer, admin])
        .rpc();

      assert.fail("buy_tokens should fail for very small amount");
    } catch (err) {
      assert.ok(err.toString().includes("AmountTooSmall"));
    }
  });
});
