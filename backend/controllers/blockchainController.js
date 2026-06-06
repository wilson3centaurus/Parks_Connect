import {
  generateMnemonicPhrase,
  getBlockchainWalletDetails,
  verifyAnchoredRecord
} from '../services/blockchainService.js';

export async function generateMnemonic(req, res) {
  try {
    const mnemonic = generateMnemonicPhrase();
    return res.json({
      success: true,
      message: 'Write this down - it cannot be recovered.',
      data: { mnemonic }
    });
  } catch (error) {
    console.error('Failed to generate mnemonic', error);
    return res.status(500).json({ success: false, message: 'Failed to generate mnemonic', errors: null });
  }
}

export async function getWalletInfo(_req, res) {
  try {
    const data = await getBlockchainWalletDetails();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Failed to load wallet info', error);
    return res.status(500).json({ success: false, message: 'Failed to load wallet info', errors: null });
  }
}

export async function verifyRecord(req, res) {
  try {
    const { recordId } = req.params;
    const result = await verifyAnchoredRecord(recordId, req.body?.canonicalData || {});
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Failed to verify blockchain record', error);
    return res.status(500).json({ success: false, message: 'Failed to verify blockchain record', errors: null });
  }
}
