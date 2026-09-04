/**
 * Deploys PropertyRegistry, keeps the frontend ABI in step with what was deployed, and
 * records the deployment so there is an auditable trail of what lives at which address.
 *
 *   npm run deploy:amoy     # Polygon Amoy testnet (chainId 80002)
 *   npm run deploy:local    # in-process Hardhat network, for a smoke test
 */
const fs = require('fs');
const path = require('path');
const { ethers, network, artifacts } = require('hardhat');

const FRONTEND_CONTRACTS_DIR = path.resolve(__dirname, '../../frontend/src/contracts');
const DEPLOYMENTS_DIR = path.resolve(__dirname, '../deployments');

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      `No signer available for network "${network.name}". Set PRIVATE_KEY in contracts/.env`
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network   : ${network.name} (chainId ${network.config.chainId})`);
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Balance   : ${ethers.formatEther(balance)} POL`);

  if (balance === 0n) {
    throw new Error('Deployer has a zero balance. Fund it at https://faucet.polygon.technology/');
  }

  const registry = await ethers.deployContract('PropertyRegistry');
  console.log(`\nDeploying... tx ${registry.deploymentTransaction().hash}`);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const receipt = await registry.deploymentTransaction().wait();

  console.log(`\nPropertyRegistry deployed to: ${address}`);
  console.log(`Block                      : ${receipt.blockNumber}`);
  console.log(`Gas used                   : ${receipt.gasUsed.toString()}`);

  if (Number(network.config.chainId) === 80002) {
    console.log(`Explorer                   : https://amoy.polygonscan.com/address/${address}`);
  }

  syncAbiToFrontend();
  recordDeployment({ address, txHash: receipt.hash, blockNumber: receipt.blockNumber });

  console.log('\nAdd this to frontend/.env:');
  console.log(`VITE_PROPERTY_REGISTRY_ADDRESS=${address}`);
}

/** Keeps the ABI the React app imports in step with the contract that was just deployed. */
function syncAbiToFrontend() {
  const { abi } = artifacts.readArtifactSync('PropertyRegistry');
  const target = path.join(FRONTEND_CONTRACTS_DIR, 'PropertyRegistry.abi.json');

  fs.mkdirSync(FRONTEND_CONTRACTS_DIR, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(abi, null, 2) + '\n');

  console.log(`\nSynced ABI to ${path.relative(process.cwd(), target)}`);
}

/** Leaves an auditable record of what was deployed, and where. */
function recordDeployment({ address, txHash, blockNumber }) {
  const target = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);

  const record = {
    contract: 'PropertyRegistry',
    network: network.name,
    chainId: Number(network.config.chainId),
    address,
    txHash,
    blockNumber,
    deployedAt: new Date().toISOString(),
  };

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(record, null, 2) + '\n');

  console.log(`Recorded deployment in ${path.relative(process.cwd(), target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
