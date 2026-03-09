
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Declare pg for Solana Playground compatibility
declare const pg: any;

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

const MINT_ADDRESS = new PublicKey(
  'EXURUSEXwt17izMpL4b9o4eRAjDx3nYUGKGeVwHWNaSi'
);

const META_DATA = {
  name: 'Listi Token',
  symbol: 'LIST',
  uri: 'https://raw.githubusercontent.com/listi-app/listi-token/main/metadata.json',
};

async function updateMetadata() {
  console.log('Updating metadata for:', MINT_ADDRESS.toBase58());

  // Derive Metadata PDA
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      MINT_ADDRESS.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  console.log('Metadata PDA:', metadataPDA.toBase58());

  // In Solana Playground (Solpg), pg.wallet and pg.connection are available
  // If running locally, you'd need to load a keypair and create a connection manually.
  // This script assumes Solpg environment.

  if (typeof pg !== 'undefined') {
      const tx = await pg.program.methods
        .updateMetadataAccountV2({
          data: {
            name: META_DATA.name,
            symbol: META_DATA.symbol,
            uri: META_DATA.uri,
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null,
          },
          isMutable: true,
          updateAuthority: pg.wallet.publicKey,
          primarySaleHappened: null,
        })
        .accounts({
          metadata: metadataPDA,
          updateAuthority: pg.wallet.publicKey,
        })
        .transaction();
    
      const txHash = await pg.connection.sendTransaction(tx, [pg.wallet.keypair]);
      console.log('Transaction sent:', txHash);
      await pg.connection.confirmTransaction(txHash);
      console.log('Metadata updated successfully!');
  } else {
      console.log("This script is designed to run in Solana Playground (Solpg). 'pg' object not found.");
  }
}

updateMetadata().catch(console.error);
