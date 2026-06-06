import crypto from 'crypto';
import { Contract, JsonRpcProvider, Wallet, ethers } from 'ethers';
import { getDb } from '../utils/db.js';

const AUDIT_ABI = [
  'function anchor(string recordType, string recordId, bytes32 dataHash) external',
  'function verify(string recordId, bytes32 dataHash) external view returns (bool)',
  'function records(uint256) external view returns (string recordType, string recordId, bytes32 dataHash, uint256 timestamp, address submittedBy)'
];

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }

  return value;
}

export function canonicalizeData(data) {
  return JSON.stringify(sortKeysDeep(data));
}

export function hashCanonicalData(data) {
  return `0x${crypto.createHash('sha256').update(canonicalizeData(data), 'utf8').digest('hex')}`;
}

export function verifyBlockchainRecordHash(data, expectedHash) {
  return hashCanonicalData(data) === expectedHash;
}

export function isBlockchainEnabled(env = process.env) {
  return String(env.BLOCKCHAIN_ENABLED || 'false').toLowerCase() === 'true';
}

export function isBlockchainConfigured(env = process.env) {
  return Boolean(
    isBlockchainEnabled(env) &&
    env.BLOCKCHAIN_MNEMONIC &&
    env.BLOCKCHAIN_NETWORK_URL &&
    env.CONTRACT_ADDRESS
  );
}

export function generateMnemonicPhrase() {
  const wallet = Wallet.createRandom();
  return wallet.mnemonic?.phrase || '';
}

export function getWalletFromMnemonic(mnemonic, rpcUrl) {
  const provider = new JsonRpcProvider(rpcUrl);
  return Wallet.fromPhrase(mnemonic).connect(provider);
}

export async function getBlockchainWalletDetails(env = process.env) {
  const enabled = isBlockchainEnabled(env);
  const configured = isBlockchainConfigured(env);
  if (!enabled) {
    return {
      enabled: false,
      configured: false,
      network: env.BLOCKCHAIN_NETWORK_NAME || 'disabled',
      address: null,
      balance: null,
      totalRecordsAnchored: 0
    };
  }

  if (!configured) {
    return {
      enabled: true,
      configured: false,
      network: env.BLOCKCHAIN_NETWORK_NAME || 'unconfigured',
      address: null,
      balance: null,
      totalRecordsAnchored: 0
    };
  }

  const wallet = getWalletFromMnemonic(env.BLOCKCHAIN_MNEMONIC, env.BLOCKCHAIN_NETWORK_URL);
  const [network, balanceWei] = await Promise.all([
    wallet.provider.getNetwork(),
    wallet.provider.getBalance(wallet.address)
  ]);
  const db = await getDb();
  const totalRow = await db.get(`SELECT COUNT(*) AS total FROM blockchain_records WHERE status = 'SUCCESS'`);

  return {
    enabled: true,
    configured: true,
    network: env.BLOCKCHAIN_NETWORK_NAME || network.name,
    address: wallet.address,
    balance: ethers.formatEther(balanceWei),
    totalRecordsAnchored: Number(totalRow?.total || 0)
  };
}

async function persistBlockchainRecord({
  recordType,
  recordId,
  dataHash,
  txHash = null,
  blockNumber = null,
  status = 'PENDING',
  skipPersistence = false
}) {
  if (skipPersistence) {
    return;
  }
  const db = await getDb();
  await db.run(
    `INSERT INTO blockchain_records (record_type, record_id, data_hash, tx_hash, block_number, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (record_id)
     DO UPDATE SET
       record_type = EXCLUDED.record_type,
       data_hash = EXCLUDED.data_hash,
       tx_hash = EXCLUDED.tx_hash,
       block_number = EXCLUDED.block_number,
       status = EXCLUDED.status,
       updated_at = CURRENT_TIMESTAMP`,
    [recordType, recordId, dataHash, txHash, blockNumber, status]
  );
}

async function getContract(env = process.env) {
  const wallet = getWalletFromMnemonic(env.BLOCKCHAIN_MNEMONIC, env.BLOCKCHAIN_NETWORK_URL);
  return new Contract(env.CONTRACT_ADDRESS, AUDIT_ABI, wallet);
}

export async function anchorRecord(recordType, recordId, canonicalData, options = {}) {
  const dataHash = hashCanonicalData(canonicalData);
  const env = options.env || process.env;
  const enabled = isBlockchainEnabled(env);
  const configured = isBlockchainConfigured(env);
  const skipPersistence = Boolean(options.skipPersistence);

  if (!enabled) {
    await persistBlockchainRecord({
      recordType,
      recordId,
      dataHash,
      status: 'DISABLED',
      skipPersistence
    });
    return {
      success: false,
      queued: false,
      recordType,
      recordId,
      dataHash,
      message: 'Blockchain is disabled for this deployment.'
    };
  }

  if (!configured) {
    await persistBlockchainRecord({
      recordType,
      recordId,
      dataHash,
      status: 'PENDING',
      skipPersistence
    });
    return {
      success: false,
      queued: false,
      recordType,
      recordId,
      dataHash,
      message: 'Blockchain is not configured.'
    };
  }

  const contract = await getContract(env);
  const tx = await contract.anchor(recordType, recordId, dataHash);
  const receipt = await tx.wait();
  await persistBlockchainRecord({
    recordType,
    recordId,
    dataHash,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
    status: 'SUCCESS',
    skipPersistence
  });

  return {
    success: true,
    queued: false,
    recordType,
    recordId,
    dataHash,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null
  };
}

export async function anchorRecordSafely(recordType, recordId, canonicalData, options = {}) {
  try {
    return await anchorRecord(recordType, recordId, canonicalData, options);
  } catch (error) {
    console.error('Blockchain anchor failed', { recordType, recordId, error });
    return {
      success: false,
      queued: false,
      recordType,
      recordId,
      dataHash: hashCanonicalData(canonicalData),
      message: 'Blockchain anchor failed.'
    };
  }
}

export async function verifyAnchoredRecord(recordId, canonicalData, env = process.env) {
  const dataHash = hashCanonicalData(canonicalData);
  if (!isBlockchainConfigured(env)) {
    return {
      success: false,
      verified: false,
      dataHash,
      message: 'Blockchain is not configured.'
    };
  }

  const contract = await getContract(env);
  const verified = await contract.verify(recordId, dataHash);
  return {
    success: true,
    verified,
    dataHash
  };
}
