// this shows the blockchain details

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, CopyText, Modal, Panel } from '../ui.jsx';
import { useWallet } from '../Wallet.jsx';
import { contractAddress, explorerAddressUrl, explorerTxUrl, readGame, readTransaction } from '../../lib/contract.js';
import { ethLabel, shortAddress, shortHash } from '../../lib/format.js';

const KIND_LABELS = {
  create: ['Room created', 'gold', 'createGame() — host paid the entry fee and the room code was registered on-chain'],
  join: ['Player joined', 'gold', 'joinGame() — entry fee paid into the pot'],
  start: ['Cards dealt', 'blue', 'startGame() — the player list is locked, betting is open'],
  bet: ['Bet', 'green', 'bet() — chaal or raise, ETH straight into the pot'],
  show: ['Show', 'blue', 'bet() — paid for a show, then the hands were compared'],
  payout: ['Pot paid out', 'gold', 'finishGame() — the whole pot went to the winner and the room closed'],
};

export default function BlockchainPanel({ state, onClose }) {
  const { chainId, network } = useWallet();
  const [onChain, setOnChain] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setOnChain(await readGame(state.gameId));
    setLoading(false);
  }, [state.gameId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const potsMatch = onChain && BigInt(onChain.potWei) === BigInt(state.potWei);

  return (
    <Modal
      title="Blockchain details"
      subtitle={`Room ${state.roomCode} · game #${state.gameId} · ${network?.name ?? 'unknown network'}`}
      onClose={onClose}
    >
      <Panel
        title="The contract"
        action={
          <Button variant="ghost" size="sm" onClick={refresh} busy={loading}>
            Refresh
          </Button>
        }
      >
        <div className="kv">
          <span className="kv__key">Address</span>
          <span className="kv__value mono">
            <CopyText value={contractAddress} display={shortAddress(contractAddress)} />
            {explorerAddressUrl(chainId, contractAddress) && (
              <>
                {' · '}
                <a href={explorerAddressUrl(chainId, contractAddress)} target="_blank" rel="noreferrer">
                  explorer ↗
                </a>
              </>
            )}
          </span>

          <span className="kv__key">Network</span>
          <span className="kv__value">
            {network?.name} <span className="muted">(chain id {chainId ?? '—'})</span>
          </span>

          <span className="kv__key">Status</span>
          <span className="kv__value">{onChain ? onChain.status : '—'}</span>
        </div>
      </Panel>

      <Panel title="Pot: chain vs. game server">
        <div className="compare">
          <div className="compare__col">
            <p className="eyebrow">On-chain (the truth)</p>
            <p className="compare__big">{onChain ? ethLabel(onChain.potWei) : '…'}</p>
            <p className="muted">Held by the contract right now</p>
          </div>
          <div className="compare__col">
            <p className="eyebrow">Game server</p>
            <p className="compare__big">{ethLabel(state.potWei)}</p>
            <p className="muted">What the table is showing</p>
          </div>
        </div>
        {onChain && (
          <p className={`compare__verdict ${potsMatch ? 'is-ok' : 'is-bad'}`}>
            {potsMatch
              ? '✓ They match to the wei — every bet on the table is really in the contract.'
              : '⚠ They differ. A transaction may still be confirming; hit Refresh in a moment.'}
          </p>
        )}
      </Panel>

      {onChain && (
        <Panel title="What each player has put in">
          <div className="kv">
            {onChain.stakes.map((stake) => {
              const seat = state.seats.find((s) => s && s.playerId === stake.address);
              return (
                <StakeRow key={stake.address} name={seat?.name} address={stake.address} wei={stake.stakedWei} />
              );
            })}
          </div>
          <p className="muted" style={{ marginTop: 'var(--s3)' }}>
            Read straight from <span className="mono">getStakes({state.gameId})</span>. The winner receives the
            sum of this column.
          </p>
        </Panel>
      )}

      <Panel title={`Transactions (${state.txs.length})`}>
        {state.txs.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <ul className="txs">
            {state.txs.map((tx) => (
              <TxRow key={tx.hash} tx={tx} chainId={chainId} />
            ))}
          </ul>
        )}
      </Panel>

      <p className="muted">
        Cards, turns and who has the better hand are decided by the game server — that part is free and instant.
        The contract only ever handles money: it takes entry fees and bets, and it pays the winner. It is the one
        thing here that cannot be talked out of paying you.
      </p>
    </Modal>
  );
}

function StakeRow({ name, address, wei }) {
  return (
    <>
      <span className="kv__key">{name || 'Player'}</span>
      <span className="kv__value">
        <span className="mono">{shortAddress(address)}</span> — {ethLabel(wei)}
      </span>
    </>
  );
}

function TxRow({ tx, chainId }) {
  const [details, setDetails] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [label, tone, explanation] = KIND_LABELS[tx.kind] || [tx.kind, undefined, ''];
  const url = explorerTxUrl(chainId, tx.hash);

  async function toggle() {
    setOpen((v) => !v);
    if (details || open) return;
    setLoading(true);
    setDetails(await readTransaction(tx.hash));
    setLoading(false);
  }

  return (
    <li className="tx">
      <button type="button" className="tx__head" onClick={toggle} aria-expanded={open}>
        <Badge tone={tone}>{label}</Badge>
        <span className="tx__who">{tx.name}</span>
        <span className="tx__amount">{BigInt(tx.amountWei) > 0n ? ethLabel(tx.amountWei) : '—'}</span>
        <span className="tx__chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="tx__body">
          <p className="muted">{explanation}</p>

          <div className="kv">
            <span className="kv__key">Hash</span>
            <span className="kv__value mono">
              <CopyText value={tx.hash} display={shortHash(tx.hash)} />
              {url && (
                <>
                  {' · '}
                  <a href={url} target="_blank" rel="noreferrer">
                    explorer ↗
                  </a>
                </>
              )}
            </span>

            <span className="kv__key">From</span>
            <span className="kv__value mono">{shortAddress(tx.address)}</span>

            {loading && (
              <>
                <span className="kv__key">Receipt</span>
                <span className="kv__value muted">Reading from the chain…</span>
              </>
            )}

            {details && (
              <>
                <span className="kv__key">Status</span>
                <span className="kv__value">
                  <Badge tone={details.status === 'Success' ? 'green' : 'red'}>{details.status}</Badge>
                </span>

                <span className="kv__key">Block</span>
                <span className="kv__value mono">#{details.blockNumber}</span>

                <span className="kv__key">Value sent</span>
                <span className="kv__value">{ethLabel(details.valueWei)}</span>

                <span className="kv__key">Gas used</span>
                <span className="kv__value mono">{Number(details.gasUsed).toLocaleString()}</span>

                <span className="kv__key">Fee paid</span>
                <span className="kv__value">{ethLabel(details.feeWei, 8)}</span>

                <span className="kv__key">Confirmations</span>
                <span className="kv__value mono">{details.confirmations}</span>

                {details.timestamp && (
                  <>
                    <span className="kv__key">Mined at</span>
                    <span className="kv__value">{new Date(details.timestamp).toLocaleString()}</span>
                  </>
                )}
              </>
            )}

            {!loading && !details && open && (
              <>
                <span className="kv__key">Receipt</span>
                <span className="kv__value muted">
                  Could not read this transaction — connect your wallet, or set VITE_RPC_URL.
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
