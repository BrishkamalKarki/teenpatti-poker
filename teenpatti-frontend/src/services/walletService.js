/**
 * walletService.js — the ONLY file that knows about wallets or the TeenPattiRoom contract.
 *
 * Talks to MetaMask (or any window.ethereum wallet) via ethers.js, pointed at your
 * Anvil node. Every bet the socket backend/teenPattiEngine.js says is required gets
 * mirrored here as a real on-chain transaction, so the frontend and the chain never
 * disagree about who paid what.
 *
 * Env vars (set in .env, see .env.example):
 *   VITE_TEENPATTI_CONTRACT_ADDRESS — address TeenPattiRoom.sol was deployed to on Anvil
 *   VITE_CHAIN_RPC_URL              — defaults to Anvil's default, http://127.0.0.1:8545
 *   VITE_CHAIN_ID                   — defaults to Anvil's default, 31337
 */
import { BrowserProvider, Contract, formatEther, parseEther, isAddress, getAddress } from 'ethers';
import { TEENPATTI_ROOM_ABI, ROOM_STATE } from '../utils/teenPattiRoomAbi.js';

const RAW_CONTRACT_ADDRESS = (import.meta.env.VITE_TEENPATTI_CONTRACT_ADDRESS || '').trim();
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 31337); // Anvil default
const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
const RPC_URL = import.meta.env.VITE_CHAIN_RPC_URL || 'http://127.0.0.1:8545';

let provider = null;
let signer = null;
let contract = null;
let cachedAddress = null;

function assertConfigured() {
  if (!RAW_CONTRACT_ADDRESS) {
    throw new Error('VITE_TEENPATTI_CONTRACT_ADDRESS is not set — deploy TeenPattiRoom.sol and add it to .env');
  }
  // Fail loudly and specifically here instead of letting ethers silently treat a
  // malformed address as an ENS name later (which produces a confusing
  // "network does not support ENS" error on chains like Anvil that have no ENS).
  if (!isAddress(RAW_CONTRACT_ADDRESS)) {
    throw new Error(
      `VITE_TEENPATTI_CONTRACT_ADDRESS is not a valid address: "${RAW_CONTRACT_ADDRESS}" ` +
        `(got ${RAW_CONTRACT_ADDRESS.length} chars, expected 42 — check .env for a stray character, ` +
        'extra quote, or trailing space, and restart the dev server after fixing it)'
    );
  }
  if (!window.ethereum) {
    throw new Error('No wallet found — install MetaMask (or point it at your Anvil node) to play with real ETH');
  }
}

const CONTRACT_ADDRESS = isAddress(RAW_CONTRACT_ADDRESS) ? getAddress(RAW_CONTRACT_ADDRESS) : RAW_CONTRACT_ADDRESS;

/** Adds/switches MetaMask to the local Anvil chain if it isn't already there. */
async function ensureAnvilNetwork() {
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (switchError) {
    // 4902 = chain not added to the wallet yet
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: 'Anvil Local',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: [RPC_URL],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export const walletService = {
  isConnected: false,

  async connect() {
    assertConfigured();
    await ensureAnvilNetwork();

    provider = new BrowserProvider(window.ethereum);
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    signer = await provider.getSigner();
    contract = new Contract(CONTRACT_ADDRESS, TEENPATTI_ROOM_ABI, signer);

    cachedAddress = await signer.getAddress();
    this.isConnected = true;
    return { address: cachedAddress };
  },

  async disconnect() {
    provider = null;
    signer = null;
    contract = null;
    cachedAddress = null;
    this.isConnected = false;
  },

  getAddress() {
    return cachedAddress;
  },

  /**
   * Switching accounts *inside* MetaMask does NOT automatically notify an
   * already-connected page — without this, the app keeps signing with
   * whatever address was active at the last connect() call, which silently
   * breaks the moment you switch to a different account in the extension.
   * Call this once (e.g. in a top-level effect) to keep the app in sync;
   * `onChange` fires with the new address, or null if the wallet disconnected
   * all accounts. Returns an unsubscribe function.
   */
  onAccountsChanged(onChange) {
    if (!window.ethereum?.on) return () => {};

    const handler = async (accounts) => {
      if (!accounts || accounts.length === 0) {
        await this.disconnect();
        onChange(null);
        return;
      }
      // Re-derive the signer/contract for whichever account is now active,
      // instead of trusting the stale one from the previous connect().
      provider = new BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      contract = new Contract(CONTRACT_ADDRESS, TEENPATTI_ROOM_ABI, signer);
      cachedAddress = await signer.getAddress();
      this.isConnected = true;
      onChange(cachedAddress);
    };

    window.ethereum.on('accountsChanged', handler);
    return () => window.ethereum.removeListener?.('accountsChanged', handler);
  },

  async getEthBalance(address = cachedAddress) {
    if (!provider || !address) return { balance: 0, currency: 'ETH' };
    const raw = await provider.getBalance(address);
    return { balance: Number(formatEther(raw)), currency: 'ETH' };
  },

  // --- Room lifecycle -----------------------------------------------------

  /** Host creates a room on-chain and pays their own boot. bootAmountEth is a string like "0.01". */
  async createRoomOnChain({ maxPlayers, bootAmountEth }) {
    if (!contract) throw new Error('Wallet not connected');
    const bootWei = parseEther(String(bootAmountEth));
    const tx = await contract.createRoom(maxPlayers, bootWei, { value: bootWei });
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === 'RoomCreated');
    return { txHash: receipt.hash, roomId: event ? event.args.roomId.toString() : null };
  },

  /** A joining player pays the room's boot amount. */
  async joinRoomOnChain({ roomId, bootAmountEth }) {
    if (!contract) throw new Error('Wallet not connected');
    const bootWei = parseEther(String(bootAmountEth));
    const tx = await contract.joinRoom(roomId, { value: bootWei });
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  /** Host flips the room to Playing right before teenPattiEngine.js starts the round. */
  async startRoundOnChain({ roomId }) {
    if (!contract) throw new Error('Wallet not connected');
    const tx = await contract.startRound(roomId);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  /**
   * Places one round's bet as a real transaction. amountEth should be whatever
   * teenPattiEngine.js's applyAction() computed as the required wager (blind
   * stake, 2x for seen, or a raise amount).
   */
  async placeBetOnChain({ roomId, amountEth }) {
    if (!contract) throw new Error('Wallet not connected');
    const wei = parseEther(String(amountEth));
    const tx = await contract.placeBet(roomId, { value: wei });
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  /**
   * Host-only: reports the round result from teenPattiEngine.js's `winners` array
   * and pays them out. winnerAddresses/amountsEth must sum to exactly the room's on-chain pot.
   */
  async settleRoundOnChain({ roomId, winnerAddresses, amountsEth }) {
    if (!contract) throw new Error('Wallet not connected');
    const amountsWei = amountsEth.map((a) => parseEther(String(a)));
    const tx = await contract.settleRound(roomId, winnerAddresses, amountsWei);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  /** Any player pulls their accumulated winnings across all rooms. */
  async withdrawOnChain() {
    if (!contract) throw new Error('Wallet not connected');
    const tx = await contract.withdraw();
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async closeRoomOnChain({ roomId }) {
    if (!contract) throw new Error('Wallet not connected');
    const tx = await contract.closeRoom(roomId);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  // --- Reads ---------------------------------------------------------------

  async getPendingWithdrawals(address = cachedAddress) {
    if (!contract || !address) return 0;
    const wei = await contract.pendingWithdrawals(address);
    return Number(formatEther(wei));
  },

  async getRoomOnChain(roomId) {
    if (!contract) throw new Error('Wallet not connected');
    const room = await contract.rooms(roomId);
    return {
      host: room.host,
      maxPlayers: Number(room.maxPlayers),
      playerCount: Number(room.playerCount),
      bootAmountEth: formatEther(room.bootAmount),
      potEth: formatEther(room.pot),
      state: ROOM_STATE[Number(room.state)],
    };
  },

  async getPlayersOnChain(roomId) {
    if (!contract) throw new Error('Wallet not connected');
    return contract.getPlayers(roomId);
  },

  /** Subscribes to a contract event for live UI updates. Returns an unsubscribe fn. */
  onContractEvent(eventName, callback) {
    if (!contract) return () => {};
    contract.on(eventName, callback);
    return () => contract.off(eventName, callback);
  },
};