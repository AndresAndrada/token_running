import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  const keypair = (provider.wallet as any).payer;

  console.log("---------------------------------------------------------");
  console.log("DIRECCIÓN:", keypair.publicKey.toBase58());
  console.log("ARRAY PARA .ENV:");
  console.log(JSON.stringify(Array.from(keypair.secretKey)));
  console.log("---------------------------------------------------------");
}

main().catch(console.error);