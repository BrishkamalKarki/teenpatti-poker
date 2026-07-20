// this talks with the wallet and the smart contract on-chain

import { BrowserProvider, Contract, JsonRpcProvider, hexlify, toUtf8Bytes, toUtf8String } from 'ethers';
import { TEEN_PATTI_ABI } from './abi.js';

const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || '').trim();
const FALLBACK_RPC = (import.meta.env.VITE_RPC_URL || '').trim();

const NETWORKS = {
  1: { name: 'Ethereum Mainnet', explorer: 'https://etherscan.io' },
  11155111: { name: 'Sepolia Testnet', explorer: 'https://sepolia.etherscan.io' },
  17000: { name: 'Holesky Testnet', explorer: 'https://holesky.etherscan.io' },
  31337: { name: 'Local Anvil', explorer: null },
  1337: { name: 'Local Node', explorer: null },
};

export function networkInfo(chainId) {
  const id = Number(chainId);
  return NETWORKS[id] || { name: `Chain ${id}`, explorer: null };
}

export function explorerTxUrl(chainId, hash) {
  const { explorer } = networkInfo(chainId);
  return explorer && hash ? `${explorer}/tx/${hash}` : null;
}

export function explorerAddressUrl(chainId, address) {
  const { explorer } = networkInfo(chainId);
  return explorer && address ? `${explorer}/address/${address}` : null;
}

export const contractAddress = CONTRACT_ADDRESS;

export function codeToBytes5(code) {
  const clean = (code || '').trim().toUpperCase();
  if (clean.length !== 5) throw new Error('A room code is exactly 5 characters');
  return hexlify(toUtf8Bytes(clean));
}

export function bytes5ToCode(value) {
  try {
    return toUtf8String(value);
  } catch {
    return '?????';
  }
}


let provider = null;
let signer = null;
let contract = null;
let account = null;
let chainId = null;

export function walletSnapshot() {
  return { account, chainId, connected: Boolean(account) };
}

function requireSetup() {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      'VITE_CONTRACT_ADDRESS is not set. Deploy the contract (see README) and put its address in ' +
        'teenpatti-frontend/.env, then restart the dev server.'
    );
  }
  if (!window.ethereum) {
    throw new Error('No wallet detected. Install MetaMask to play — this game runs on real ETH transactions.');
  }
}

function requireContract() {
  if (!contract) throw new Error('Connect your wallet first');
  return contract;
}

export async function connectWallet() {
  requireSetup();

  provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send('eth_requestAccounts', []);
  if (!accounts?.length) throw new Error('No account was shared by the wallet');

  signer = await provider.getSigner();
  account = (await signer.getAddress()).toLowerCase();
  chainId = Number((await provider.getNetwork()).chainId);
  contract = new Contract(CONTRACT_ADDRESS, TEEN_PATTI_ABI, signer);

  const code = await provider.getCode(CONTRACT_ADDRESS);
  if (!code || code === '0x') {
    const where = networkInfo(chainId).name;
    contract = null;
    throw new Error(
      `No contract found at ${CONTRACT_ADDRESS} on ${where}. Either switch your wallet to the network ` +
        'it was deployed on, or deploy it there and update VITE_CONTRACT_ADDRESS.'
    );
  }

  return walletSnapshot();
}

export function disconnectWallet() {
  provider = null;
  signer = null;
  contract = null;
  account = null;
  chainId = null;
}

export function watchWallet(onChange) {
  if (!window.ethereum?.on) return () => {};

  const onAccounts = async (accounts) => {
    if (!accounts?.length) {
      disconnectWallet();
      onChange(walletSnapshot());
      return;
    }
    try {
      await connectWallet();
    } catch {
      disconnectWallet();
    }
    onChange(walletSnapshot());
  };
  const onChain = () => window.location.reload();

  window.ethereum.on('accountsChanged', onAccounts);
  window.ethereum.on('chainChanged', onChain);
  return () => {
    window.ethereum.removeListener?.('accountsChanged', onAccounts);
    window.ethereum.removeListener?.('chainChanged', onChain);
  };
}


export function readableError(error) {
  if (!error) return 'Something went wrong';
  if (error.code === 'ACTION_REJECTED' || error.code === 4001) return 'You rejected the transaction in your wallet';
  if (error.code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(error.message || '')) {
    return 'Not enough ETH in your wallet for this transaction (remember gas)';
  }
  const name = error.revert?.name || error.errorName;
  if (name) {
    const friendly = {
      CodeAlreadyUsed: 'That room code is already taken — try again',
      WrongEntryFee: 'The entry fee you sent does not match this room',
      GameFull: 'That room is already full (4 players maximum)',
      AlreadyJoined: 'This wallet is already seated in that room',
      GameNotOpen: 'That room has already started or finished',
      GameNotPlaying: 'The hand is not running, so this is not allowed',
      NoSuchGame: 'No room on-chain with that code',
      NotHost: 'Only the host can do that',
      NotAPlayer: 'That wallet is not a player in this game',
      NotEnoughPlayers: 'You need at least 2 players to deal',
      EntryFeeOutOfRange: 'The entry fee must be between 0.0001 and 1 ETH',
    }[name];
    if (friendly) return friendly;
    return `Contract rejected this: ${name}`;
  }
  return error.shortMessage || error.reason || error.message || 'Transaction failed';
}

async function send(promise) {
  const tx = await promise;
  const receipt = await tx.wait();
  return { txHash: receipt.hash, receipt };
}

export async function createGame({ code, entryFeeWei, maxPlayers }) {
  const c = requireContract();
  const { txHash, receipt } = await send(
    c.createGame(codeToBytes5(code), entryFeeWei, maxPlayers, { value: entryFeeWei })
  );

  const created = receipt.logs
    .map((log) => {
      try {
        return c.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === 'GameCreated');

  if (!created) throw new Error('Room was created but the GameCreated event was missing');
  return { txHash, gameId: Number(created.args.gameId) };
}

export async function joinGame({ code, entryFeeWei }) {
  return send(requireContract().joinGame(codeToBytes5(code), { value: entryFeeWei }));
}

export async function startGame(gameId) {
  return send(requireContract().startGame(gameId));
}

export async function placeBet({ gameId, amountWei }) {
  return send(requireContract().bet(gameId, { value: amountWei }));
}

export async function finishGame({ gameId, winners }) {
  return send(requireContract().finishGame(gameId, winners));
}

export async function abortGame(gameId) {
  return send(requireContract().abortGame(gameId));
}

function readProvider() {
  if (provider) return provider;
  if (FALLBACK_RPC) return new JsonRpcProvider(FALLBACK_RPC);
  if (window.ethereum) return new BrowserProvider(window.ethereum);
  return null;
}

function readContract() {
  const rpc = readProvider();
  if (!rpc || !CONTRACT_ADDRESS) return null;
  return new Contract(CONTRACT_ADDRESS, TEEN_PATTI_ABI, rpc);
}

const STATUS_NAMES = ['Open', 'Playing', 'Finished'];

export async function readGame(gameId) {
  const c = readContract();
  if (!c || gameId === null || gameId === undefined) return null;
  try {
    const game = await c.getGame(gameId);
    const [players, amounts] = await c.getStakes(gameId);
    return {
      gameId: Number(game.gameId),
      code: bytes5ToCode(game.code),
      host: game.host.toLowerCase(),
      entryFeeWei: game.entryFee.toString(),
      potWei: game.pot.toString(),
      status: STATUS_NAMES[Number(game.status)],
      playerCount: Number(game.playerCount),
      maxPlayers: Number(game.maxPlayers),
      stakes: players.map((address, i) => ({
        address: address.toLowerCase(),
        stakedWei: amounts[i].toString(),
      })),
    };
  } catch {
    return null;
  }
}

export async function readTransaction(hash) {
  const rpc = readProvider();
  if (!rpc || !hash) return null;
  try {
    const [tx, receipt] = await Promise.all([rpc.getTransaction(hash), rpc.getTransactionReceipt(hash)]);
    if (!tx || !receipt) return null;

    const block = await rpc.getBlock(receipt.blockNumber);
    const gasPrice = receipt.gasPrice ?? tx.gasPrice ?? 0n;
    return {
      hash,
      status: receipt.status === 1 ? 'Success' : 'Failed',
      blockNumber: receipt.blockNumber,
      from: tx.from.toLowerCase(),
      to: (tx.to || '').toLowerCase(),
      valueWei: tx.value.toString(),
      gasUsed: receipt.gasUsed.toString(),
      gasPriceWei: gasPrice.toString(),
      feeWei: (receipt.gasUsed * gasPrice).toString(),
      nonce: tx.nonce,
      timestamp: block?.timestamp ? block.timestamp * 1000 : null,
      confirmations: await tx.confirmations(),
    };
  } catch {
    return null;
  }
}

export async function getEthBalance(address) {
  const rpc = readProvider();
  if (!rpc || !address) return null;
  try {
    return (await rpc.getBalance(address)).toString();
  } catch {
    return null;
  }
}
