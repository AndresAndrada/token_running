import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import crypto from 'crypto';

const PROGRAM_ID_STR =
  process.env.PROGRAM_ID ||
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
  'D6J4e2nQDFupaitnirnp7HerHw5zdpGwNyRvJUrVu7ji';

async function main() {
  const programId = new PublicKey(PROGRAM_ID_STR);
  const rpc =
    process.env.SOLANA_RPC_URL ||
    process.env.ANCHOR_PROVIDER_URL ||
    'https://api.devnet.solana.com';
  const connection = new Connection(rpc, 'confirmed');

  console.log('Programa:', programId.toBase58());
  console.log('RPC:', rpc);

  const mints = new Set<string>();

  try {
    const escrowDisc = crypto
      .createHash('sha256')
      .update('account:EscrowAuth')
      .digest()
      .slice(0, 8);
    const escrowAccounts = await connection.getProgramAccounts(programId, {
      commitment: 'confirmed',
      filters: [{ memcmp: { offset: 0, bytes: bs58.encode(escrowDisc) } }],
    });
    for (const acc of escrowAccounts) {
      const data = acc.account.data;
      const mintBytes = data.slice(8 + 32, 8 + 32 + 32);
      const mintPk = new PublicKey(mintBytes);
      mints.add(mintPk.toBase58());
    }
  } catch (_) {}

  try {
    const campaignDisc = crypto
      .createHash('sha256')
      .update('account:CampaignEscrowAuth')
      .digest()
      .slice(0, 8);
    const campaignAccounts = await connection.getProgramAccounts(programId, {
      commitment: 'confirmed',
      filters: [{ memcmp: { offset: 0, bytes: bs58.encode(campaignDisc) } }],
    });
    for (const acc of campaignAccounts) {
      const data = acc.account.data;
      const mintBytes = data.slice(8 + 32 + 32, 8 + 32 + 32 + 32);
      const mintPk = new PublicKey(mintBytes);
      mints.add(mintPk.toBase58());
    }
  } catch (_) {}

  console.log('Resultados:');
  if (mints.size === 0) {
    console.log('No se encontraron mints asociados al contrato en devnet mediante cuentas del programa.');
    return;
  }
  for (const mint of Array.from(mints)) {
    console.log(`Mint: ${mint}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
