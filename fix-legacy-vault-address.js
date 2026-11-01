// One-time data fix. Read + WRITE.
// Re-keys every 'legacy-unknown-pre-v9' row (subscriptions + payments) to its
// own verified real on-chain vault_address. All in ONE transaction: if
// anything is inconsistent, nothing is committed.
//
// Ground truth for every value below came from a direct on-chain lookup
// (eth_getTransactionReceipt) of that row's own tx_hash against Base Sepolia,
// not from inference or guessing.

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in this shell. Set it first, then re-run.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// [tx_hash, real vault_address]
const subscriptionFixes = [
  ['0x7bfef5ae576377031d8230a19e98ee7a12b0593c0bd25e21b85aa1dc4f35f800', '0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d'],
  ['0x1f4ab8408535431090a7bafffeae2289afcbfb045fb0565114ff906cd4809a4d', '0xDd41E5C83d000ff63d3e9E8cBBD79609b7029d3C'],
  ['0x439a369b39abee0835c35d55656367fb68c1a6c948df924104156d5f1ddf3df1', '0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d'],
  ['0x3890819fca998f882817820cf30a12d83dd0419d525f73e50454e3416cb65670', '0xDd41E5C83d000ff63d3e9E8cBBD79609b7029d3C'],
  ['0xbf380ba076f4528ca4e09cae88ec33ce7f2803cbd308404cbe7ebbe2250f045f', '0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d'],
  ['0x2842bc539e1a1cc67859b3e5437143e5336d2119b54d1845706e55f9fd8b4d6d', '0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d'],
  ['0x60bfc90889116b495e67c401c6df8a3a09f0a6805376bcb0ec2f2f2651109292', '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3'],
  ['0x619220bab590c989032b216e513b47bb0f1a73e57e29b77ef635eafc2b7c8c9f', '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3'],
  ['0x6a9278c7d373de82499723f8ae614bbd3826445c269be439356339adc1a93e60', '0xeb068B47731261F7B4A5ae8535686D67D7f72321'],
  ['0x68a50e5375bb90b651d83395dedc75578d018d88a26d1bbe93293ce37949a8fd', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x2d5251919d8c0ced03ca075977d2dbbfb28bb7773d555bb6547a8d10261530f6', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x66418c22da01365d402f2f108bec76f664725fe3ddc0b0acf1327dd5f14e4b3e', '0xeb068B47731261F7B4A5ae8535686D67D7f72321'],
  ['0xa243c9014c9a28cfecb3496dfd70d9600bbd3d2083dc255e2897a871a0b73b61', '0xeb068B47731261F7B4A5ae8535686D67D7f72321'],
  ['0xfdd5db4c0f65f412bb42eaf344180ef922499303ad1861559e31702f869ae67e', '0xeb068B47731261F7B4A5ae8535686D67D7f72321'],
];

const paymentFixes = [
  ['0x273fdb00e242de7886862bd3b34ef24f589a37313250ad2a8500bcf529138aa0', '0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d'],
  ['0xd176761331cd6ed216225537de00138cf280af95f907f449cc64711cc99301ee', '0xd6377Fa4809C4b745F5F1801193e5a90cD4AAE26'],
  ['0xaa9e8b1a92a6d11e370a32fa83c6317976bffc3208da91cc59a847d4a32d37cb', '0xDd41E5C83d000ff63d3e9E8cBBD79609b7029d3C'],
  ['0xff34952548f3aed91be9225edf740f243aa5a9568f62555b6749ca9418e90d55', '0xDd41E5C83d000ff63d3e9E8cBBD79609b7029d3C'],
  ['0x50da7feea7af2c5c8b7fda66ec7e2fc134e0bebde947191983a681601b4b8d66', '0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d'],
  ['0x4ea3ff748bab881a3a80472e908c4077e3ddf479ac57ec2594ad7676ad125378', '0x483f59367b2e5BEbbF33a6A110B1F1C42C706564'],
  ['0x083382b113b93d81489e3f288ce0b8b065ab1a09bf6db120a66f3044ba277769', '0xDd41E5C83d000ff63d3e9E8cBBD79609b7029d3C'],
  ['0x7233f5eb4c5830805d97317582509c62fc3888a3bff1ea5c0e3a9ab272065a1f', '0xDd41E5C83d000ff63d3e9E8cBBD79609b7029d3C'],
  ['0xa57c6bc5a2e004cf501ee99d037661da5d013cffb7ad0a2be51fe3e4868a389f', '0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d'],
  ['0xa94759258ee6190785cb2207a194311460b2b770bf885aa3f2e2e7c3f798e852', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0xebde9ba9fddd2dd4ff8b409e60cdbc3da208aacfe59a645dd969ef07c310660e', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0xcbddad75daa4a36b2f9f7b0808d736f4452e8dcd5d3d7125cd713aa9d42ea85c', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0xc496a2497df1085cee8025e3e7a8fe3aacbdcf06021436c85168d795463a1d66', '0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d'],
  ['0xac3dec5ff2bf4b5570ff3fd0ccd6002296c973cfd3db3c65b929d3030d849586', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x90b190b764d7b0eb1be5ea93ce6621f6ac1f0ccffd9a88a7390e6091b6760981', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x603c61fd182e13b015e12615202264554c7ddb8be3b0eaa56204bec8932405c2', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0xfae84c4a9b7c30c073dbabd7bdf073a9667c6487b076f135fbabe96340e3f45d', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x8f62f336e675326dc2cf14ff529c7c746f389dad7ffa3d114810eb392cd6e39a', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x3a1a8981ed738d476950614483c28805949f252cfe4c15d6924d79027b03f1b4', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x9f8e14f94f8726d9780d84921fb7f95c42faba6852760947281874d1540492c6', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0xecb088969850a2ae3d881e9e52c18c2fff51e6aa235163ec3e19b15b1347fb2e', '0xeb068B47731261F7B4A5ae8535686D67D7f72321'],
  ['0x22df1f718e1966c80aa3301e355c7a5bff302cd09601e0190d48727ac76e1621', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x3a7fb029449fd7a9d55ac691fd86e8620b480aaa915096779fc1321e3f62e816', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x2f7fb2c1c178fa3da0442efc2a4492b570a0182ee3f715a3acac19211cba9ea2', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0xd8285a960c404cfd0e0b3fade8634a65c66192efef962d28a772cfd5b4524227', '0xeb068B47731261F7B4A5ae8535686D67D7f72321'],
  ['0x6aa7b952426804d5b17252e703420411fe78c5e43814be9e694bb34ebc8051d5', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0x88d3cbf0c632877160adf11bae4d0916ad7c329f4ff1c5a440527f922243202a', '0xeb068B47731261F7B4A5ae8535686D67D7f72321'],
  ['0x463ba650e4ef5aa81b7844b97b0113920bbe4c4ca0ee1d3876b0d855a43499af', '0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d'],
  ['0xe3534ee4c4f1d03f8c88f7d6c8ba744bf70126ba099984af52bc6cae3357ac12', '0xeb068B47731261F7B4A5ae8535686D67D7f72321'],
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let subCount = 0;
    for (const [tx, vault] of subscriptionFixes) {
      const r = await client.query(
        `UPDATE subscriptions SET vault_address = $1 WHERE tx_hash = $2 AND vault_address = 'legacy-unknown-pre-v9'`,
        [vault, tx]
      );
      if (r.rowCount !== 1) throw new Error(`subscriptions tx_hash ${tx}: expected 1 row updated, got ${r.rowCount}`);
      subCount += r.rowCount;
    }

    let payCount = 0;
    for (const [tx, vault] of paymentFixes) {
      const r = await client.query(
        `UPDATE payments SET vault_address = $1 WHERE tx_hash = $2 AND vault_address = 'legacy-unknown-pre-v9'`,
        [vault, tx]
      );
      if (r.rowCount !== 1) throw new Error(`payments tx_hash ${tx}: expected 1 row updated, got ${r.rowCount}`);
      payCount += r.rowCount;
    }

    // Verify no legacy-tagged rows remain
    const remainingSubs = await client.query(`SELECT COUNT(*)::int AS n FROM subscriptions WHERE vault_address = 'legacy-unknown-pre-v9'`);
    const remainingPays = await client.query(`SELECT COUNT(*)::int AS n FROM payments WHERE vault_address = 'legacy-unknown-pre-v9'`);
    if (remainingSubs.rows[0].n !== 0) throw new Error(`${remainingSubs.rows[0].n} subscriptions rows still tagged legacy-unknown-pre-v9`);
    if (remainingPays.rows[0].n !== 0) throw new Error(`${remainingPays.rows[0].n} payments rows still tagged legacy-unknown-pre-v9`);

    // Verify no duplicate (id, vault_address) pairs remain in subscriptions
    const dupes = await client.query(`
      SELECT id, vault_address, COUNT(*)::int AS n FROM subscriptions
      GROUP BY id, vault_address HAVING COUNT(*) > 1
    `);
    if (dupes.rows.length > 0) throw new Error(`Duplicates still exist: ${JSON.stringify(dupes.rows)}`);

    // Verify the composite primary key can now actually be (re)built
    await client.query(`ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_pkey`);
    await client.query(`ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id, vault_address)`);

    await client.query('COMMIT');
    console.log(JSON.stringify({
      status: 'SUCCESS',
      subscriptions_updated: subCount,
      payments_updated: payCount,
      message: 'All legacy rows re-keyed to real vault addresses. subscriptions_pkey rebuilt successfully. Committed.',
    }, null, 2));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(JSON.stringify({ status: 'FAILED', error: e.message, message: 'Rolled back. No data was changed.' }, null, 2));
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
